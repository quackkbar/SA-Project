import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch production records that either need QC or have QC history
    const records = await prisma.productionRecord.findMany({
      include: {
        productionBatch: {
          include: {
            printJob: {
              include: {
                orderDetail: {
                  include: {
                    salesOrder: {
                      include: {
                        customer: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        qcRecords: {
          orderBy: { QC_Date: 'desc' },
        },
      },
      orderBy: { Production_Date: 'desc' },
    });

    const enrichedRecords = records.map((rec) => {
      let passedSum = 0;
      let failedSum = 0;
      for (const qc of rec.qcRecords) {
        passedSum += qc.Quantity_Passed;
        failedSum += qc.Quantity_Failed;
      }
      const pendingQC = rec.Quantity_Produced - (passedSum + failedSum);

      return {
        ...rec,
        summary: {
          totalPassed: passedSum,
          totalFailed: failedSum,
          pendingQC,
          isFullyInspected: pendingQC === 0,
        },
      };
    });

    return NextResponse.json(enrichedRecords);
  } catch (error: any) {
    console.error('GET /api/warehouse/qc error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const { batchId, productionRecordId, quantityPassed, quantityFailed, qcDate, idempotencyKey } =
      rawBody;

    const passed = Number(quantityPassed || 0);
    const failed = Number(quantityFailed || 0);

    if (!batchId || !productionRecordId) {
      return NextResponse.json(
        { error: 'กรุณาระบุ batchId และ productionRecordId' },
        { status: 400 }
      );
    }

    if (passed < 0 || failed < 0 || passed + failed <= 0) {
      return NextResponse.json(
        { error: 'ยอดตรวจ QC (ผ่าน + เสีย) ต้องมากกว่า 0 และไม่เป็นค่าลบ' },
        { status: 400 }
      );
    }

    const effectiveDate = qcDate ? new Date(qcDate) : new Date();
    const normalizedKey =
      idempotencyKey ||
      `uc12-${productionRecordId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const payloadHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          batchId,
          productionRecordId,
          quantityPassed: passed,
          quantityFailed: failed,
          qcDate: effectiveDate.toISOString().slice(0, 10),
        })
      )
      .digest('hex');

    // 1. Check UC12 Idempotency Log
    const existingLog = await prisma.uC12IdempotencyLog.findUnique({
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

    // 2. Perform Atomic QC Insertion inside Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find production record and verify integrity
      const prodRecord = await tx.productionRecord.findUnique({
        where: { Production_Record_ID: productionRecordId },
        include: {
          qcRecords: true,
          productionBatch: {
            include: {
              printJob: {
                include: {
                  orderDetail: true,
                },
              },
            },
          },
        },
      });

      if (!prodRecord) {
        throw new Error(`ไม่พบรายการผลิต ${productionRecordId}`);
      }

      if (prodRecord.Batch_ID !== batchId) {
        throw new Error(`Batch ID ${batchId} ไม่ตรงกับรายการผลิต ${prodRecord.Batch_ID}`);
      }

      // Check remaining inspectable quantity
      const existingInspected = prodRecord.qcRecords.reduce(
        (sum, q) => sum + q.Quantity_Passed + q.Quantity_Failed,
        0
      );
      const remainingToInspect = prodRecord.Quantity_Produced - existingInspected;

      if (passed + failed > remainingToInspect) {
        throw new Error(
          `ยอดตรวจรวม (${passed + failed}) เกินจำนวนคงเหลือที่รอตรวจ (${remainingToInspect}) ของรายการผลิต ${productionRecordId}`
        );
      }

      const salesOrderId = prodRecord.productionBatch.printJob.orderDetail.Sales_Order_ID;
      const printJobId = prodRecord.productionBatch.Print_Job_ID;

      // Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      // Generate QC Record ID
      const qcId = await getNextId('seq_qc_record_id', 'QC', tx);

      // Insert QC_RECORD
      // Database Trigger 'trg_complete_print_job_after_qc' auto updates Print_Job_Status to 'Completed'
      // if all batches closed, pending QC is 0, and total passed >= order target.
      const qcRecord = await tx.qCRecord.create({
        data: {
          QC_Record_ID: qcId,
          Batch_ID: batchId,
          Production_Record_ID: productionRecordId,
          Quantity_Passed: passed,
          Quantity_Failed: failed,
          QC_Date: effectiveDate,
        },
      });

      const responsePayload = {
        message: 'บันทึกผลการตรวจสอบ QC สำเร็จ',
        qcRecordId: qcId,
        batchId,
        productionRecordId,
        quantityPassed: passed,
        quantityFailed: failed,
        qcDate: effectiveDate.toISOString().slice(0, 10),
      };

      // Write to UC12 Idempotency Log
      await tx.uC12IdempotencyLog.create({
        data: {
          Idempotency_Key: normalizedKey,
          Sales_Order_ID: salesOrderId,
          Print_Job_ID: printJobId,
          Batch_ID: batchId,
          Production_Record_ID: productionRecordId,
          QC_Record_ID: qcId,
          Quantity_Passed: passed,
          Quantity_Failed: failed,
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
    console.error('POST /api/warehouse/qc error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
