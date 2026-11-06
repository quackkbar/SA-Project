import { PrismaClient, sales_order_status, quotation_status, prototype_status, print_job_status, delivery_status } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding (Phase 1 MVP) ---');

  // Clean up in reverse dependency order
  console.log('Cleaning up existing data...');
  await prisma.uC13IdempotencyLog.deleteMany();
  await prisma.uC12IdempotencyLog.deleteMany();
  await prisma.uC11IdempotencyLog.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.qCRecord.deleteMany();
  await prisma.productionRecord.deleteMany();
  await prisma.productionBatch.deleteMany();
  await prisma.printJob.deleteMany();
  await prisma.quotationDetail.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.orderDetail.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.customer.deleteMany();

  // 1. Seed Customers (SA Report p.165)
  console.log('Seeding Customers...');
  const customers = [
    {
      Customer_ID: 'CUS00001',
      Customer_Name: 'บริษัท สยามการพิมพ์และบรรจุภัณฑ์ จำกัด',
      Customer_Address: '123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
      Customer_Phone: '081-234-5678',
    },
    {
      Customer_ID: 'CUS00002',
      Customer_Name: 'ห้างหุ้นส่วนจำกัด นครพนมการค้าและพัฒนา',
      Customer_Address: '45/9 ถนนชยางกูร ตำบลในเมือง อำเภอเมือง จังหวัดนครพนม 48000',
      Customer_Phone: '089-876-5432',
    },
    {
      Customer_ID: 'CUS00003',
      Customer_Name: 'โรงเรียนกุหลาบวิทยากร',
      Customer_Address: '88 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร 10400',
      Customer_Phone: '02-345-6789',
    },
    {
      Customer_ID: 'CUS00004',
      Customer_Name: 'บริษัท บีเจซี ฟู๊ด คอร์ปอเรชั่น จำกัด',
      Customer_Address: '999 ถนนพระราม 3 แขวงบางโพงพาง เขตยานนาวา กรุงเทพมหานคร 10120',
      Customer_Phone: '086-555-4321',
    },
    {
      Customer_ID: 'CUS00005',
      Customer_Name: 'คุณวิภาดา มงคลสุข',
      Customer_Address: '56/7 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
      Customer_Phone: '084-111-2233',
    },
  ];

  for (const c of customers) {
    await prisma.customer.create({ data: c });
  }

  // 2. Seed Sales Orders in different stages of workflow (SA Report p.166-178)
  console.log('Seeding Sales Orders & Workflows...');

  // --------------------------------------------------------------------------
  // ORDER 1: SO00001 - New Order (Waiting for Quotation - UC2)
  // --------------------------------------------------------------------------
  await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00001',
      Customer_ID: 'CUS00001',
      Order_Date: new Date('2026-11-01'),
      Total_Amount: 0.00,
      Order_Status: sales_order_status.Quotation_Not_Started,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00001',
            Product_Name: 'โบรชัวร์แนะนำบริษัท 4 สี ขนาด A4 (พับครึ่ง)',
            Quantity: 2000,
            Product_Format: 'กระดาษอาร์ตการ์ด 260 แกรม เคลือบด้าน',
          },
        ],
      },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER 2: SO00002 - Quotation Created & Pending Review (UC3/UC4)
  // --------------------------------------------------------------------------
  await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00002',
      Customer_ID: 'CUS00002',
      Order_Date: new Date('2026-11-02'),
      Total_Amount: 18000.00,
      Order_Status: sales_order_status.Quotation_Pending,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00002',
            Product_Name: 'กล่องบรรจุภัณฑ์ลูกฟูกพิมพ์ลาย 2 สี',
            Quantity: 1000,
            Product_Format: 'กระดาษลูกฟูกลอน E หนา 1.5 มม.',
          },
        ],
      },
      quotation: {
        create: {
          Quotation_ID: 'QT00001',
          Quotation_Date: new Date('2026-11-02'),
          Total_Amount: 18000.00,
          Quotation_Status: quotation_status.Pending,
          quotationDetails: {
            create: [
              {
                Quotation_Detail_ID: 'QD00001',
                Product_ID: 'PRD00002',
                Unit_Price: 18.00,
                Quantity: 1000,
                Total_Price: 18000.00,
              },
            ],
          },
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER 3: SO00003 - Prototype In Progress (UC7-UC10)
  // --------------------------------------------------------------------------
  await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00003',
      Customer_ID: 'CUS00003',
      Order_Date: new Date('2026-11-02'),
      Total_Amount: 35000.00,
      Order_Status: sales_order_status.Prototype_In_Progress,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00003',
            Product_Name: 'หนังสือรุ่นและรายงานประจำปี 48 หน้า ขนาด A4',
            Quantity: 500,
            Product_Format: 'เข้าเล่มไสกาว ปกเคลือบสปอตยูวี เนื้อในอาร์ตมัน 130 แกรม',
            printJob: {
              create: {
                Print_Job_ID: 'PJ00001',
                Prototype_Status: prototype_status.In_Progress,
                Print_Job_Status: print_job_status.In_Design,
                Plate_ID: 'PLT-BK-001',
              },
            },
          },
        ],
      },
      quotation: {
        create: {
          Quotation_ID: 'QT00002',
          Quotation_Date: new Date('2026-11-02'),
          Total_Amount: 35000.00,
          Quotation_Status: quotation_status.Completed,
          quotationDetails: {
            create: [
              {
                Quotation_Detail_ID: 'QD00002',
                Product_ID: 'PRD00003',
                Unit_Price: 70.00,
                Quantity: 500,
                Total_Price: 35000.00,
              },
            ],
          },
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER 4: SO00004 - In Production (Ready for UC11 Record / UC12 QC)
  // --------------------------------------------------------------------------
  const order4 = await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00004',
      Customer_ID: 'CUS00004',
      Order_Date: new Date('2026-11-03'),
      Total_Amount: 15000.00,
      Order_Status: sales_order_status.Print_Job_In_Production,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00004',
            Product_Name: 'แผ่นพับประชาสัมพันธ์โปรโมชั่น 3 พับ 6 หน้า',
            Quantity: 3000,
            Product_Format: 'กระดาษอาร์ตมัน 160 แกรม พับสำเร็จ',
            printJob: {
              create: {
                Print_Job_ID: 'PJ00002',
                Prototype_Status: prototype_status.Completed,
                Prototype_Approved_Date: new Date('2026-11-03'),
                Print_Job_Status: print_job_status.In_Production,
                Plate_ID: 'PLT-PR-002',
                productionBatches: {
                  create: [
                    {
                      Batch_ID: 'PB00001',
                      Batch_Cycle: 1,
                      Batch_Status: 'Open',
                      Target_Quantity: 3000,
                      Produced_Quantity: 1500,
                      productionRecords: {
                        create: [
                          {
                            Production_Record_ID: 'PR00001',
                            Production_Date: new Date('2026-11-04'),
                            Quantity_Produced: 1500,
                            qcRecords: {
                              create: [
                                {
                                  QC_Record_ID: 'QC00001',
                                  QC_Date: new Date('2026-11-04'),
                                  Quantity_Passed: 1400,
                                  Quantity_Failed: 100,
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      quotation: {
        create: {
          Quotation_ID: 'QT00003',
          Quotation_Date: new Date('2026-11-03'),
          Total_Amount: 15000.00,
          Quotation_Status: quotation_status.Completed,
          quotationDetails: {
            create: [
              {
                Quotation_Detail_ID: 'QD00003',
                Product_ID: 'PRD00004',
                Unit_Price: 5.00,
                Quantity: 3000,
                Total_Price: 15000.00,
              },
            ],
          },
        },
      },
      delivery: {
        create: {
          Delivery_ID: 'DL00001',
          Delivery_Status: delivery_status.Producing,
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER 5: SO00005 - Completed Production (Ready for UC14 Shipping)
  // --------------------------------------------------------------------------
  await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00005',
      Customer_ID: 'CUS00005',
      Order_Date: new Date('2026-11-03'),
      Total_Amount: 24000.00,
      Order_Status: sales_order_status.Delivery_Preparing,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00005',
            Product_Name: 'การ์ดแต่งงานพรีเมียม ปั๊มฟอยล์ทอง พร้อมซองพิเศษ',
            Quantity: 800,
            Product_Format: 'กระดาษคอตตอนนำเข้า 350 แกรม ขอบทอง',
            printJob: {
              create: {
                Print_Job_ID: 'PJ00003',
                Prototype_Status: prototype_status.Completed,
                Prototype_Approved_Date: new Date('2026-11-03'),
                Print_Job_Status: print_job_status.Completed,
                Plate_ID: 'PLT-CD-003',
                productionBatches: {
                  create: [
                    {
                      Batch_ID: 'PB00002',
                      Batch_Cycle: 1,
                      Batch_Status: 'Closed',
                      Close_Type: 'Fulfilled',
                      Target_Quantity: 800,
                      Produced_Quantity: 800,
                      Closed_At: new Date('2026-11-04T10:00:00Z'),
                      productionRecords: {
                        create: [
                          {
                            Production_Record_ID: 'PR00002',
                            Production_Date: new Date('2026-11-04'),
                            Quantity_Produced: 800,
                            qcRecords: {
                              create: [
                                {
                                  QC_Record_ID: 'QC00002',
                                  QC_Date: new Date('2026-11-04'),
                                  Quantity_Passed: 800,
                                  Quantity_Failed: 0,
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      quotation: {
        create: {
          Quotation_ID: 'QT00004',
          Quotation_Date: new Date('2026-11-03'),
          Total_Amount: 24000.00,
          Quotation_Status: quotation_status.Completed,
          quotationDetails: {
            create: [
              {
                Quotation_Detail_ID: 'QD00004',
                Product_ID: 'PRD00005',
                Unit_Price: 30.00,
                Quantity: 800,
                Total_Price: 24000.00,
              },
            ],
          },
        },
      },
      delivery: {
        create: {
          Delivery_ID: 'DL00002',
          Delivery_Status: delivery_status.Preparing,
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER 6: SO00006 - Delivered & Billed (UC15 Receipt / UC16 Payment)
  // --------------------------------------------------------------------------
  await prisma.salesOrder.create({
    data: {
      Sales_Order_ID: 'SO00006',
      Customer_ID: 'CUS00001',
      Order_Date: new Date('2026-11-01'),
      Total_Amount: 12500.00,
      Order_Status: sales_order_status.Delivery_Delivered,
      orderDetails: {
        create: [
          {
            Product_ID: 'PRD00006',
            Product_Name: 'สติ๊กเกอร์โลโก้กันน้ำ ไดคัทวงกลม ขนาด 4x4 ซม.',
            Quantity: 5000,
            Product_Format: 'สติ๊กเกอร์พีพีขาวเงา เคลือบเงา ไดคัทแยกดวง',
            printJob: {
              create: {
                Print_Job_ID: 'PJ00004',
                Prototype_Status: prototype_status.Completed,
                Prototype_Approved_Date: new Date('2026-11-01'),
                Print_Job_Status: print_job_status.Completed,
                Plate_ID: 'PLT-ST-004',
                productionBatches: {
                  create: [
                    {
                      Batch_ID: 'PB00003',
                      Batch_Cycle: 1,
                      Batch_Status: 'Closed',
                      Close_Type: 'Fulfilled',
                      Target_Quantity: 5000,
                      Produced_Quantity: 5000,
                      Closed_At: new Date('2026-11-02T16:00:00Z'),
                      productionRecords: {
                        create: [
                          {
                            Production_Record_ID: 'PR00003',
                            Production_Date: new Date('2026-11-02'),
                            Quantity_Produced: 5000,
                            qcRecords: {
                              create: [
                                {
                                  QC_Record_ID: 'QC00003',
                                  QC_Date: new Date('2026-11-02'),
                                  Quantity_Passed: 5000,
                                  Quantity_Failed: 0,
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      quotation: {
        create: {
          Quotation_ID: 'QT00005',
          Quotation_Date: new Date('2026-11-01'),
          Total_Amount: 12500.00,
          Quotation_Status: quotation_status.Completed,
          quotationDetails: {
            create: [
              {
                Quotation_Detail_ID: 'QD00005',
                Product_ID: 'PRD00006',
                Unit_Price: 2.50,
                Quantity: 5000,
                Total_Price: 12500.00,
              },
            ],
          },
        },
      },
      delivery: {
        create: {
          Delivery_ID: 'DL00003',
          Delivery_Status: delivery_status.Delivered,
          Delivery_Date: new Date('2026-11-04'),
          Deliver: 'นายสมบัติ เดินทางด่วน (ฝ่ายจัดส่ง)',
        },
      },
      receipt: {
        create: {
          Receipt_ID: 'RC00001',
          Receipt_Date: new Date('2026-11-05'),
          Payment_Receiver: 'นางสาวสมศรี การเงินดี (แคชเชียร์)',
        },
      },
    },
  });

  console.log('--- Database Seeding Completed Successfully! ---');
  console.log('Sample Data Summary:');
  console.log('  - Customers: 5 records (CUS00001 - CUS00005)');
  console.log('  - Sales Orders: 6 records (SO00001 - SO00006)');
  console.log('  - Order Details & Products: 6 records (PRD00001 - PRD00006)');
  console.log('  - Quotations: 5 records (QT00001 - QT00005)');
  console.log('  - Print Jobs: 4 records (PJ00001 - PJ00004)');
  console.log('  - Batches: 3 records (PB00001 - PB00003)');
  console.log('  - Deliveries: 3 records (DL00001 - DL00003)');
  console.log('  - Receipts: 1 record (RC00001)');
}

main()
  .catch((e) => {
    console.error('Seeding Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
