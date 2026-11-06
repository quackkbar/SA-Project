import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';

export async function GET() {
  try {
    const orders = await prisma.salesOrder.findMany({
      include: {
        customer: true,
        orderDetails: {
          include: {
            quotationDetail: true,
            printJob: true,
          },
        },
        quotation: {
          include: {
            quotationDetails: true,
          },
        },
        delivery: true,
      },
      orderBy: { Sales_Order_ID: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerId, items } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'กรุณาเลือกลูกค้า' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Sales Order ID
      const salesOrderId = await getNextId('seq_sales_order_id', 'SO', tx);

      // 2. Create SALES_ORDER
      const order = await tx.salesOrder.create({
        data: {
          Sales_Order_ID: salesOrderId,
          Customer_ID: customerId,
          Order_Date: new Date(),
          Total_Amount: 0.0,
          Order_Status: 'Quotation_Not_Started',
        },
      });

      // 3. Create ORDER_DETAIL items
      const createdItems = [];
      for (const item of items) {
        const productId = await getNextId('seq_product_id', 'PRD', tx);
        const orderDetail = await tx.orderDetail.create({
          data: {
            Product_ID: productId,
            Sales_Order_ID: salesOrderId,
            Product_Name: item.productName.trim(),
            Quantity: Number(item.quantity),
            Product_Format: (item.productFormat || 'พิมพ์ 4 สี มาตรฐาน').trim(),
          },
        });
        createdItems.push(orderDetail);
      }

      // 4. Recalculate status via Centralized R1
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return { order, items: createdItems };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('UC1 Create Order Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
