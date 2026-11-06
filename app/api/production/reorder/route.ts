import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const { printJobId, reason = 'Deficit from QC defects / scrap', idempotencyKey } = rawBody;

    if (!printJobId) {
      return NextResponse.json({ error: 'กรุณาระบุ printJobId' }, { status: 400 });
    }

    const normalizedKey =
      idempotencyKey ||
      `uc13-${printJobId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ printJobId, reason }))
      .digest('hex');

    // 1. Check UC13 Idempotency Log
    const existingLog = await prisma.uC13IdempotencyLog.findUnique({
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

    // 2. Perform Atomic Reorder inside Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Fetch PrintJob with OrderDetail, ProductionBatches, and QC
      const job = await tx.printJob.findUnique({
        where: { Print_Job_ID: printJobId },
        include: {
          orderDetail: true,
          productionBatches: {
            orderBy: { Batch_Cycle: 'asc' },
            include: {
              productionRecords: true,
              qcRecords: true,
            },
          },
        },
      });

      if (!job) {
        throw new Error(`ไม่พบใบสั่งผลิต ${printJobId}`);
      }

      const salesOrderId = job.orderDetail.Sales_Order_ID;
      const productId = job.Product_ID;
      const orderQty = job.orderDetail.Quantity;

      // Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      // Validation 1: No open batches allowed
      const openBatch = job.productionBatches.find((b) => b.Batch_Status === 'Open');
      if (openBatch) {
        throw new Error(`ยังมี Batch ${openBatch.Batch_ID} กำลังเปิดดำเนินการอยู่ ไม่สามารถสั่งผลิตรอบใหม่ได้`);
      }

      // Validation 2: Calculate cumulative totals
      let totalProduced = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let maxCycle = 0;

      for (const batch of job.productionBatches) {
        totalProduced += batch.Produced_Quantity;
        if (batch.Batch_Cycle > maxCycle) {
          maxCycle = batch.Batch_Cycle;
        }
        for (const qc of batch.qcRecords) {
          totalPassed += qc.Quantity_Passed;
          totalFailed += qc.Quantity_Failed;
        }
      }

      // Validation 3: Pending QC must be 0
      const pendingQC = totalProduced - (totalPassed + totalFailed);
      if (pendingQC !== 0) {
        throw new Error(`ยังมียอดผลิตที่ค้างตรวจ QC อยู่ ${pendingQC} ชิ้น ต้องตรวจ QC ให้ครบก่อนสั่งผลิตรอบใหม่`);
      }

      // Validation 4: Deficit check
      const deficit = orderQty - totalPassed;
      if (deficit <= 0) {
        throw new Error(`ยอดสินค้าผ่าน QC ครบตามเป้าหมายแล้ว (${totalPassed}/${orderQty}) ไม่จำเป็นต้องสั่งผลิตเพิ่ม`);
      }

      // Generate new Batch ID
      const newBatchId = await getNextId('seq_production_batch_id', 'PB', tx);
      const newCycle = maxCycle + 1;

      // Create new PRODUCTION_BATCH
      const newBatch = await tx.productionBatch.create({
        data: {
          Batch_ID: newBatchId,
          Print_Job_ID: printJobId,
          Batch_Cycle: newCycle,
          Batch_Status: 'Open',
          Target_Quantity: deficit,
          Produced_Quantity: 0,
        },
      });

      // Update Print Job back to 'In_Production'
      await tx.printJob.update({
        where: { Print_Job_ID: printJobId },
        data: {
          Print_Job_Status: 'In_Production',
        },
      });

      const responsePayload = {
        message: `เปิดสั่งผลิตรอบใหม่ Cycle ${newCycle} สำเร็จ`,
        printJobId,
        newBatchId,
        newBatchCycle: newCycle,
        targetQuantity: deficit,
        reason,
      };

      // Write to UC13 Idempotency Log
      await tx.uC13IdempotencyLog.create({
        data: {
          Idempotency_Key: normalizedKey,
          Sales_Order_ID: salesOrderId,
          Print_Job_ID: printJobId,
          Product_ID: productId,
          Batch_ID: newBatchId,
          Production_Batch_Cycle: newCycle,
          Reorder_Quantity: deficit,
          Reason: reason,
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
    console.error('POST /api/production/reorder error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
