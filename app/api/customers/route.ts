import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getNextId } from '@/lib/id-generator';

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { Customer_ID: 'asc' },
    });
    return NextResponse.json(customers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerName, customerAddress, customerPhone } = body;

    if (!customerName || !customerPhone) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อและเบอร์โทรศัพท์ลูกค้า' }, { status: 400 });
    }

    const customerId = await getNextId('seq_customer_id', 'CUS');

    const customer = await prisma.customer.create({
      data: {
        Customer_ID: customerId,
        Customer_Name: customerName.trim(),
        Customer_Address: (customerAddress || '').trim(),
        Customer_Phone: customerPhone.trim(),
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
