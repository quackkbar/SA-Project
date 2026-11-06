import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await prisma.printJob.findMany({
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
        productionBatches: {
          orderBy: { Batch_Cycle: 'asc' },
          include: {
            productionRecords: {
              orderBy: { Production_Date: 'desc' },
            },
            qcRecords: {
              orderBy: { QC_Date: 'desc' },
            },
          },
        },
      },
      orderBy: { Print_Job_ID: 'desc' },
    });

    // Compute progress metrics for each print job
    const enrichedJobs = jobs.map((job) => {
      const orderQty = job.orderDetail.Quantity;
      let totalProduced = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let activeBatch = null;

      for (const batch of job.productionBatches) {
        totalProduced += batch.Produced_Quantity;
        if (batch.Batch_Status === 'Open') {
          activeBatch = batch;
        }
        for (const qc of batch.qcRecords) {
          totalPassed += qc.Quantity_Passed;
          totalFailed += qc.Quantity_Failed;
        }
      }

      const pendingQC = Math.max(0, totalProduced - (totalPassed + totalFailed));
      const deficit = Math.max(0, orderQty - totalPassed);
      const canReorder =
        job.Print_Job_Status !== 'Completed' &&
        !activeBatch &&
        pendingQC === 0 &&
        deficit > 0 &&
        job.productionBatches.length > 0;

      return {
        ...job,
        metrics: {
          orderQty,
          totalProduced,
          totalPassed,
          totalFailed,
          pendingQC,
          deficit,
          canReorder,
          activeBatch,
          completionPercent: Math.min(100, Math.round((totalPassed / orderQty) * 100)),
        },
      };
    });

    return NextResponse.json(enrichedJobs);
  } catch (error: any) {
    console.error('GET /api/production/jobs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { printJobId, action, plateId } = body;

    if (!printJobId || !action) {
      return NextResponse.json({ error: 'กรุณาระบุ printJobId และ action' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Fetch PrintJob with OrderDetail
      const job = await tx.printJob.findUnique({
        where: { Print_Job_ID: printJobId },
        include: {
          orderDetail: true,
          productionBatches: true,
        },
      });

      if (!job) {
        throw new Error(`ไม่พบใบสั่งผลิต ${printJobId}`);
      }

      const salesOrderId = job.orderDetail.Sales_Order_ID;

      // 2. Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      let targetPrototypeStatus = job.Prototype_Status;
      let targetJobStatus = job.Print_Job_Status;
      let approvedDate = job.Prototype_Approved_Date;
      let targetPlateId = plateId || job.Plate_ID;

      switch (action) {
        case 'start': // UC7: เริ่มทำแบบพิมพ์ / เริ่มแก้ไข
          if (job.Prototype_Status === 'Completed') {
            throw new Error('แบบพิมพ์ได้รับการอนุมัติเสร็จสิ้นแล้ว ไม่สามารถเริ่มทำซ้ำได้');
          }
          targetPrototypeStatus = 'In_Progress';
          break;

        case 'update_plate': // UC8: บันทึกข้อมูลแบบพิมพ์ / เพลท
          targetPlateId = plateId;
          break;

        case 'submit': // UC9: ออกแบบเสร็จสิ้น / ส่งตรวจ
          if (job.Prototype_Status !== 'In_Progress') {
            throw new Error('ต้องอยู่ในสถานะ "กำลังทำแบบพิมพ์" จึงจะส่งตรวจได้');
          }
          targetPrototypeStatus = 'Pending';
          break;

        case 'request_revision': // UC10: ขอแก้ไขแบบพิมพ์
          if (job.Prototype_Status !== 'Pending') {
            throw new Error('แบบพิมพ์ต้องอยู่ในสถานะ "รอตรวจแบบพิมพ์" เพื่อขอแก้ไข');
          }
          targetPrototypeStatus = 'Under_Revision';
          break;

        case 'approve': // UC10: อนุมัติแบบพิมพ์ และออก Batch ผลิตรอบแรก (Cycle 1)
          if (job.Prototype_Status !== 'Pending' && job.Prototype_Status !== 'In_Progress') {
            throw new Error('แบบพิมพ์ต้องอยู่ในสถานะพร้อมตรวจหรือกำลังทำเพื่อทำการอนุมัติ');
          }
          targetPrototypeStatus = 'Completed';
          approvedDate = new Date();
          targetJobStatus = 'In_Production';

          // Atomic invariant: Create Batch 1 if no batch exists yet
          if (job.productionBatches.length === 0) {
            const batchId = await getNextId('seq_production_batch_id', 'PB', tx);
            await tx.productionBatch.create({
              data: {
                Batch_ID: batchId,
                Print_Job_ID: printJobId,
                Batch_Cycle: 1,
                Batch_Status: 'Open',
                Target_Quantity: job.orderDetail.Quantity,
                Produced_Quantity: 0,
              },
            });
          }
          break;

        default:
          throw new Error(`ไม่รองรับ action '${action}'`);
      }

      // Update Print Job
      const result = await tx.printJob.update({
        where: { Print_Job_ID: printJobId },
        data: {
          Prototype_Status: targetPrototypeStatus,
          Print_Job_Status: targetJobStatus,
          Prototype_Approved_Date: approvedDate,
          Plate_ID: targetPlateId,
        },
      });

      // Recalculate Centralized R1 status
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return result;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/production/jobs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
