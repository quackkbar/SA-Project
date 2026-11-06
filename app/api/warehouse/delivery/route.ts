import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const deliveries = await prisma.delivery.findMany({
      include: {
        salesOrder: {
          include: {
            customer: true,
            orderDetails: {
              include: {
                printJob: {
                  include: {
                    productionBatches: {
                      include: {
                        qcRecords: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { Delivery_ID: 'desc' },
    });

    const enrichedDeliveries = deliveries.map((d) => {
      const order = d.salesOrder;
      let totalOrderQty = 0;
      let allJobsCompleted = true;
      let totalPassedQC = 0;

      for (const item of order.orderDetails) {
        totalOrderQty += item.Quantity;
        if (!item.printJob || item.printJob.Print_Job_Status !== 'Completed') {
          allJobsCompleted = false;
        }
        if (item.printJob) {
          for (const batch of item.printJob.productionBatches) {
            for (const qc of batch.qcRecords) {
              totalPassedQC += qc.Quantity_Passed;
            }
          }
        }
      }

      return {
        ...d,
        metrics: {
          totalOrderQty,
          totalPassedQC,
          allJobsCompleted,
          canPrepare: d.Delivery_Status === 'Producing' && allJobsCompleted && totalPassedQC >= totalOrderQty,
        },
      };
    });

    return NextResponse.json(enrichedDeliveries);
  } catch (error: any) {
    console.error('GET /api/warehouse/delivery error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { deliveryId, nextStatus, deliver, deliveryDate } = body;

    if (!deliveryId || !nextStatus) {
      return NextResponse.json(
        { error: 'กรุณาระบุ deliveryId และ nextStatus' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { Delivery_ID: deliveryId },
      });

      if (!delivery) {
        throw new Error(`ไม่พบรายการจัดส่ง ${deliveryId}`);
      }

      const salesOrderId = delivery.Sales_Order_ID;

      // Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      let updateData: any = {
        Delivery_Status: nextStatus,
      };

      if (nextStatus === 'Shipping') {
        if (!deliver || !deliver.trim()) {
          throw new Error('กรุณาระบุชื่อพนักงานขนส่ง / ผู้จัดส่ง (Deliverer)');
        }
        updateData.Deliver = deliver.trim();
        updateData.Delivery_Date = deliveryDate ? new Date(deliveryDate) : new Date();
      } else if (nextStatus === 'Delivered') {
        if (!delivery.Deliver && (!deliver || !deliver.trim())) {
          throw new Error('ต้องมีชื่อผู้จัดส่งก่อนบันทึกส่งมอบสำเร็จ');
        }
        if (deliver && deliver.trim()) {
          updateData.Deliver = deliver.trim();
        }
        updateData.Delivery_Date = deliveryDate ? new Date(deliveryDate) : delivery.Delivery_Date || new Date();
      }

      // Update Delivery
      // PostgreSQL trigger 'trg_guard_delivery_transition' enforces anti-join guards,
      // non-backward state rules, and non-skip requirements.
      const res = await tx.delivery.update({
        where: { Delivery_ID: deliveryId },
        data: updateData,
      });

      // Recalculate Centralized R1 status
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return res;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/warehouse/delivery error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
