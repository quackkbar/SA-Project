import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const { batchId, quantityProduced, productionDate, idempotencyKey } = rawBody;

    if (!batchId || !quantityProduced || quantityProduced <= 0) {
      return NextResponse.json(
        { error: 'กรุณาระบุ batchId และ quantityProduced ที่มากกว่า 0' },
        { status: 400 }
      );
    }

    const effectiveDate = productionDate ? new Date(productionDate) : new Date();
    const normalizedKey =
      idempotencyKey ||
      `uc11-${batchId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Calculate SHA-256 hash of payload
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ batchId, quantityProduced, productionDate: effectiveDate.toISOString().slice(0, 10) }))
      .digest('hex');

    // 1. Check UC11 Idempotency Log for existing transaction
    const existingLog = await prisma.uC11IdempotencyLog.findUnique({
      where: { Idempotency_Key: normalizedKey },
    });

    if (existingLog) {
      if (existingLog.Request_Payload_Hash !== payloadHash) {
        return NextResponse.json(
          { error: 'IDEMPOTENCY_CONFLICT: Key was used with different payload', code: '409_CONFLICT' },
          { status: 409 }
        );
      }
      return NextResponse.json(existingLog.Response_Payload as any, { status: 200 });
    }

    // 2. Perform Atomic Insertion inside Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find batch with related print job and order
      const batch = await tx.productionBatch.findUnique({
        where: { Batch_ID: batchId },
        include: {
          printJob: {
            include: {
              orderDetail: true,
            },
          },
        },
      });

      if (!batch) {
        throw new Error(`ไม่พบ Batch การผลิต ${batchId}`);
      }

      if (batch.Batch_Status !== 'Open') {
        throw new Error(`Batch ${batchId} ถูกปิดไปแล้ว (สถานะ: ${batch.Batch_Status}) ไม่สามารถบันทึกยอดเพิ่มได้`);
      }

      const salesOrderId = batch.printJob.orderDetail.Sales_Order_ID;
      const printJobId = batch.Print_Job_ID;

      // Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      // Generate Production Record ID
      const recordId = await getNextId('seq_production_record_id', 'PR', tx);

      // Insert PRODUCTION_RECORD
      // Database Trigger 'trg_apply_production_record_to_batch' automatically updates
      // PRODUCTION_BATCH.Produced_Quantity and sets Batch to Closed / Job to QC_Pending if target reached.
      const record = await tx.productionRecord.create({
        data: {
          Production_Record_ID: recordId,
          Batch_ID: batchId,
          Quantity_Produced: Number(quantityProduced),
          Production_Date: effectiveDate,
        },
      });

      const responsePayload = {
        message: 'บันทึกยอดผลิตประจำวันสำเร็จ',
        productionRecordId: recordId,
        batchId,
        quantityProduced: Number(quantityProduced),
        productionDate: effectiveDate.toISOString().slice(0, 10),
      };

      // Write to UC11 Idempotency Log
      await tx.uC11IdempotencyLog.create({
        data: {
          Idempotency_Key: normalizedKey,
          Sales_Order_ID: salesOrderId,
          Print_Job_ID: printJobId,
          Batch_ID: batchId,
          Production_Record_ID: recordId,
          Quantity_Produced: Number(quantityProduced),
          Request_Payload_Hash: payloadHash,
          Response_Status_Code: 201,
          Response_Payload: responsePayload,
        },
      });

      // Recalculate Centralized R1 status
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return responsePayload;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/production/record error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
