import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';
import { recalculateSalesOrderStatus } from '@/lib/recalculate-status';

export async function GET() {
  try {
    const quotations = await prisma.quotation.findMany({
      include: {
        salesOrder: {
          include: {
            customer: true,
            orderDetails: true,
          },
        },
        quotationDetails: {
          include: {
            orderDetail: true,
          },
        },
      },
      orderBy: { Quotation_ID: 'desc' },
    });
    return NextResponse.json(quotations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// UC2: Create Quotation
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { salesOrderId, items } = body;

    if (!salesOrderId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน: ต้องระบุ Sales_Order_ID และรายการราคา' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Root Parent Lock
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER" 
        WHERE "Sales_Order_ID" = ${salesOrderId} 
        FOR UPDATE;
      `;

      // 2. Check if Quotation already exists
      const existing = await tx.quotation.findUnique({
        where: { Sales_Order_ID: salesOrderId },
      });
      if (existing) {
        throw new Error(`คำสั่งซื้อ ${salesOrderId} มีใบเสนอราคา ${existing.Quotation_ID} อยู่แล้ว`);
      }

      // 3. Fetch order items to get quantities
      const orderDetails = await tx.orderDetail.findMany({
        where: { Sales_Order_ID: salesOrderId },
      });

      if (orderDetails.length === 0) {
        throw new Error(`ไม่พบรายการสินค้าในคำสั่งซื้อ ${salesOrderId}`);
      }

      // 4. Calculate prices
      let grandTotal = 0;
      const detailInserts = [];

      for (const item of items) {
        const orderItem = orderDetails.find((od) => od.Product_ID === item.productId);
        if (!orderItem) continue;

        const unitPrice = Number(item.unitPrice);
        const qty = orderItem.Quantity;
        const lineTotal = unitPrice * qty;
        grandTotal += lineTotal;

        const qdId = await getNextId('seq_quotation_detail_id', 'QD', tx);
        detailInserts.push({
          Quotation_Detail_ID: qdId,
          Product_ID: item.productId,
          Unit_Price: unitPrice,
          Quantity: qty,
          Total_Price: lineTotal,
        });
      }

      // 5. Generate Quotation ID and Create QUOTATION
      const quotationId = await getNextId('seq_quotation_id', 'QT', tx);
      const quotation = await tx.quotation.create({
        data: {
          Quotation_ID: quotationId,
          Sales_Order_ID: salesOrderId,
          Quotation_Date: new Date(),
          Total_Amount: grandTotal,
          Quotation_Status: 'Pending',
          quotationDetails: {
            create: detailInserts,
          },
        },
        include: { quotationDetails: true },
      });

      // 6. Update Total_Amount on Sales Order
      await tx.salesOrder.update({
        where: { Sales_Order_ID: salesOrderId },
        data: { Total_Amount: grandTotal },
      });

      // 7. Recalculate R1 status (transitions to 'Quotation_Pending')
      await recalculateSalesOrderStatus(salesOrderId, tx);

      return quotation;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('UC2 Create Quotation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// UC3 & UC4: Update Quotation Status / Edit Quotation
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { quotationId, action, items } = body;

    if (!quotationId) {
      return NextResponse.json({ error: 'กรุณาระบุ Quotation_ID' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch Quotation and Sales Order ID
      const quote = await tx.quotation.findUnique({
        where: { Quotation_ID: quotationId },
        include: { quotationDetails: true },
      });

      if (!quote) {
        throw new Error(`ไม่พบใบเสนอราคา ${quotationId}`);
      }

      // 2. Root Parent Lock
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER" 
        WHERE "Sales_Order_ID" = ${quote.Sales_Order_ID} 
        FOR UPDATE;
      `;

      // ----------------------------------------------------------------------
      // Action 1: UC3 Status Transition (approve, reject, request_revision)
      // ----------------------------------------------------------------------
      if (action === 'approve') {
        await tx.quotation.update({
          where: { Quotation_ID: quotationId },
          data: { Quotation_Status: 'Completed' },
        });
      } else if (action === 'reject') {
        await tx.quotation.update({
          where: { Quotation_ID: quotationId },
          data: { Quotation_Status: 'Rejected' },
        });
      } else if (action === 'request_revision') {
        await tx.quotation.update({
          where: { Quotation_ID: quotationId },
          data: { Quotation_Status: 'Under_Revision' },
        });
      }

      // ----------------------------------------------------------------------
      // Action 2: UC4 Edit Quotation Details (when Under_Revision)
      // ----------------------------------------------------------------------
      else if (action === 'edit' && Array.isArray(items)) {
        let newTotalAmount = 0;

        for (const item of items) {
          const unitPrice = Number(item.unitPrice);
          const existingDetail = quote.quotationDetails.find((d) => d.Product_ID === item.productId);
          if (existingDetail) {
            const lineTotal = unitPrice * existingDetail.Quantity;
            newTotalAmount += lineTotal;

            await tx.quotationDetail.update({
              where: { Quotation_Detail_ID: existingDetail.Quotation_Detail_ID },
              data: {
                Unit_Price: unitPrice,
                Total_Price: lineTotal,
              },
            });
          }
        }

        // Update Quotation Total and return status to 'Pending'
        await tx.quotation.update({
          where: { Quotation_ID: quotationId },
          data: {
            Total_Amount: newTotalAmount,
            Quotation_Status: 'Pending',
          },
        });

        // Update Sales Order Total_Amount
        await tx.salesOrder.update({
          where: { Sales_Order_ID: quote.Sales_Order_ID },
          data: { Total_Amount: newTotalAmount },
        });
      } else {
        throw new Error(`ไม่รู้จักคำสั่ง action: ${action}`);
      }

      // 3. Recalculate Centralized R1
      await recalculateSalesOrderStatus(quote.Sales_Order_ID, tx);

      return await tx.quotation.findUnique({
        where: { Quotation_ID: quotationId },
        include: { quotationDetails: true },
      });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('UC3/UC4 Quotation Action Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
