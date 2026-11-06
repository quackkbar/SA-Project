import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { salesOrderId } = body;

    if (!salesOrderId) {
      return NextResponse.json({ error: 'กรุณาระบุ Sales_Order_ID' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Root Parent Lock
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER" 
        WHERE "Sales_Order_ID" = ${salesOrderId} 
        FOR UPDATE;
      `;

      // 2. Fetch Order and Quotation
      const order = await tx.salesOrder.findUnique({
        where: { Sales_Order_ID: salesOrderId },
        include: {
          quotation: true,
          orderDetails: {
            include: { printJob: true },
          },
          delivery: true,
        },
      });

      if (!order) {
        throw new Error(`ไม่พบคำสั่งซื้อ ${salesOrderId}`);
      }

      if (!order.quotation || order.quotation.Quotation_Status !== 'Completed') {
        throw new Error(`คำสั่งซื้อ ${salesOrderId} ยังไม่ได้รับการอนุมัติใบเสนอราคา (Quotation ต้องเป็น Completed)`);
      }

      if (order.orderDetails.length === 0) {
        throw new Error(`คำสั่งซื้อ ${salesOrderId} ไม่มีรายการสินค้า`);
      }

      // 3. Create PRINT_JOB for each order item
      const createdJobs = [];
      for (const item of order.orderDetails) {
        if (!item.printJob) {
          const pjId = await getNextId('seq_print_job_id', 'PJ', tx);
          const job = await tx.printJob.create({
            data: {
              Print_Job_ID: pjId,
              Product_ID: item.Product_ID,
              Prototype_Status: 'Not_Started',
              Print_Job_Status: 'In_Design',
            },
          });
          createdJobs.push(job);
        } else {
          createdJobs.push(item.printJob);
        }
      }

      // 4. Create initial DELIVERY record if not exists
      let delivery = order.delivery;
      if (!delivery) {
        const dlId = await getNextId('seq_delivery_id', 'DL', tx);
        delivery = await tx.delivery.create({
          data: {
            Delivery_ID: dlId,
            Sales_Order_ID: salesOrderId,
            Delivery_Status: 'Producing',
          },
        });
      }

      // 5. Recalculate Centralized R1 (transitions to 'Prototype_Not_Started')
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return {
        salesOrderId,
        printJobs: createdJobs,
        delivery,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('UC5 Issue Print Job Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
