import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch sales orders where quotation is approved and no receipt exists yet (UC15 candidates)
    const ordersWithoutReceipt = await prisma.salesOrder.findMany({
      where: {
        quotation: {
          Quotation_Status: 'Completed',
        },
        receipt: null,
      },
      include: {
        customer: true,
        quotation: true,
        orderDetails: {
          include: {
            quotationDetail: true,
            printJob: true,
          },
        },
        delivery: true,
      },
      orderBy: { Sales_Order_ID: 'desc' },
    });

    // 2. Fetch all issued receipts (UC16 records)
    const receipts = await prisma.receipt.findMany({
      include: {
        salesOrder: {
          include: {
            customer: true,
            quotation: true,
            orderDetails: {
              include: {
                quotationDetail: true,
                printJob: true,
              },
            },
            delivery: true,
          },
        },
      },
      orderBy: { Receipt_ID: 'desc' },
    });

    return NextResponse.json({
      ordersWithoutReceipt,
      receipts,
    });
  } catch (error: any) {
    console.error('GET /api/finance/receipts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { salesOrderId } = body;

    if (!salesOrderId) {
      return NextResponse.json({ error: 'กรุณาระบุ salesOrderId' }, { status: 400 });
    }

    const receipt = await prisma.$transaction(async (tx) => {
      // 1. Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${salesOrderId}
        FOR UPDATE;
      `;

      // 2. Check Order & Quotation Status
      const order = await tx.salesOrder.findUnique({
        where: { Sales_Order_ID: salesOrderId },
        include: {
          quotation: true,
          receipt: true,
        },
      });

      if (!order) {
        throw new Error(`ไม่พบคำสั่งซื้อ ${salesOrderId}`);
      }

      if (!order.quotation || order.quotation.Quotation_Status !== 'Completed') {
        throw new Error(`คำสั่งซื้อ ${salesOrderId} ยังไม่ได้รับการอนุมัติใบเสนอราคา (Quotation ต้องเป็น Completed)`);
      }

      if (order.receipt) {
        throw new Error(`คำสั่งซื้อ ${salesOrderId} ได้ออกใบเสร็จไปแล้ว (${order.receipt.Receipt_ID})`);
      }

      // 3. Generate Receipt ID via Sequence (RC + 5 digits)
      const receiptId = await getNextId('seq_receipt_id', 'RC', tx);

      // 4. Insert RECEIPT (Receipt_Date = null and Payment_Receiver = null for UC15)
      // Satisfies DDL Check Constraint: chk_receipt_payment_fields
      const newReceipt = await tx.receipt.create({
        data: {
          Receipt_ID: receiptId,
          Sales_Order_ID: salesOrderId,
          Receipt_Date: null,
          Payment_Receiver: null,
        },
        include: {
          salesOrder: {
            include: {
              customer: true,
              orderDetails: true,
            },
          },
        },
      });

      return newReceipt;
    });

    return NextResponse.json(receipt, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/finance/receipts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { receiptId, paymentReceiver, receiptDate } = body;

    if (!receiptId) {
      return NextResponse.json({ error: 'กรุณาระบุ receiptId' }, { status: 400 });
    }

    if (!paymentReceiver || !paymentReceiver.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่อผู้รับเงิน (Payment_Receiver)' },
        { status: 400 }
      );
    }

    const effectiveDate = receiptDate ? new Date(receiptDate) : new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Fetch Receipt
      const receipt = await tx.receipt.findUnique({
        where: { Receipt_ID: receiptId },
      });

      if (!receipt) {
        throw new Error(`ไม่พบใบเสร็จรับเงิน ${receiptId}`);
      }

      // 2. Root Parent Lock on SALES_ORDER
      await tx.$queryRaw`
        SELECT "Sales_Order_ID" FROM public."SALES_ORDER"
        WHERE "Sales_Order_ID" = ${receipt.Sales_Order_ID}
        FOR UPDATE;
      `;

      // 3. Update RECEIPT with Payment Details (UC16)
      // Satisfies DDL Check Constraint: chk_receipt_payment_fields (both populated)
      const result = await tx.receipt.update({
        where: { Receipt_ID: receiptId },
        data: {
          Receipt_Date: effectiveDate,
          Payment_Receiver: paymentReceiver.trim(),
        },
        include: {
          salesOrder: {
            include: {
              customer: true,
              orderDetails: true,
            },
          },
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/finance/receipts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
