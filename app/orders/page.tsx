'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeftCircle,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  Eye,
  X,
  FileCheck,
  FileText,
  Printer,
  Calendar,
} from 'lucide-react';
import { MOCK_ORDERS } from '@/lib/mockReportData';
import {
  getStoredOrders,
  saveStoredOrders,
  getStoredCustomers,
  saveStoredCustomers,
  getStoredPrintJobs,
  saveStoredPrintJobs,
  StorageOrderRecord,
  StorageCustomerRecord,
  StoragePrintJobRecord,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, getMonthFromDate, isoDateForInput } from '@/lib/dateUtils';

interface CustomerRecord {
  id: string;
  company: string;
  name: string;
  phone: string;
  address: string;
}

interface ProductItem {
  id: string;
  name: string;
  printType: string;
  quantity: string;
  unit: string;
  paperType: string;
  paperSize: string;
  paperColor: string;
  description: string;
  imageUrl: string;
}

interface OrderRecord {
  Sales_Order_ID: string;
  Company_Name: string;
  Customer_Name: string;
  Customer_Phone: string;
  Customer_Address: string;
  Order_Date: string;
  Order_Status: string;
  items: ProductItem[];
}

const INITIAL_CUSTOMERS: CustomerRecord[] = [];

const INITIAL_ORDERS: OrderRecord[] = [];

export default function OrdersPage() {
  // Navigation views: 'list' | 'order_detail' | 'select_customer' | 'create_order'
  const [currentView, setCurrentView] = useState<'list' | 'order_detail' | 'select_customer' | 'create_order'>('list');
  const [orders, setOrders] = useState<OrderRecord[]>(INITIAL_ORDERS);
  const [customers, setCustomers] = useState<CustomerRecord[]>(INITIAL_CUSTOMERS);
  const [printJobs, setPrintJobs] = useState<StoragePrintJobRecord[]>([]);

  // Detail View State
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  // Create Order Form State
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');

  // Order Info State
  const [orderId, setOrderId] = useState('');
  const [orderDate, setOrderDate] = useState('');

  // Products State (supports multiple items)
  const [products, setProducts] = useState<ProductItem[]>([]);

  // Modal for Viewing Image
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Modal for Monthly Orders Report (A4 Printable)
  const [showReportModal, setShowReportModal] = useState(false);

  // Hidden file inputs mapping
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Load persisted orders, customers, and print jobs from localStorage
    const savedOrders = getStoredOrders();
    setOrders((savedOrders || []) as OrderRecord[]);
    const savedCustomers = getStoredCustomers();
    setCustomers(savedCustomers || []);
    const savedJobs = getStoredPrintJobs();
    setPrintJobs(savedJobs || []);
  }, []);

  // Reload latest data whenever returning to list view
  useEffect(() => {
    if (currentView === 'list') {
      const savedOrders = getStoredOrders();
      setOrders((savedOrders || []) as OrderRecord[]);
      const savedCustomers = getStoredCustomers();
      setCustomers(savedCustomers || []);
      const savedJobs = getStoredPrintJobs();
      setPrintJobs(savedJobs || []);
    }
  }, [currentView]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Entity Unique ID Generators
  const generateUniqueOrderId = () => {
    let newId = '';
    do {
      newId = `SO${Math.floor(100 + Math.random() * 900)}`;
    } while (orders.some((o) => o.Sales_Order_ID.toLowerCase() === newId.toLowerCase()));
    return newId;
  };

  const generateUniqueCustomerId = () => {
    let newId = '';
    do {
      newId = `C0A${Math.floor(10 + Math.random() * 90)}`;
    } while (customers.some((c) => c.id.toLowerCase() === newId.toLowerCase()));
    return newId;
  };

  const generateUniqueProductId = (currentList: ProductItem[] = []) => {
    const allExisting = new Set<string>();
    orders.forEach((o) => o.items.forEach((it) => it.id && allExisting.add(it.id.toLowerCase())));
    currentList.forEach((p) => p.id && allExisting.add(p.id.toLowerCase()));
    let newId = '';
    do {
      newId = `302P${Math.floor(100 + Math.random() * 900)}`;
    } while (allExisting.has(newId.toLowerCase()));
    return newId;
  };

  const MONTH_NAMES = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  // Baseline report: reset to empty so all months accurately reflect user's created mock data
  const BASELINE_REPORT: { [monthNum: number]: { orders: number; items: number } } = {};

  // Requirement:
  // การรายงานยอดในแต่ละเดือนคือ
  // - จำนวนคำสั่งซื้อ : นับจากจำนวนคำสั่งซื้อในเดือนนั้นๆ
  // - จำนวนรายการสินค้า : นับจากจำนวนยอดการผลิตสินค้าในเดือนนั้นๆ
  // แล้วจึงนำสองข้อมูลมาทำเป็นตาราง
  const getCalculatedMonthlyReport = () => {
    const currentOrders = getStoredOrders();
    const currentPrintJobs = getStoredPrintJobs();

    return MONTH_NAMES.map((monthName, idx) => {
      const monthNum = idx + 1;

      // 1. จำนวนคำสั่งซื้อ : นับจากจำนวนคำสั่งซื้อในเดือนนั้นๆ
      const ordersInMonth = currentOrders.filter(
        (o) => getMonthFromDate(o.Order_Date) === monthNum
      );
      const dynamicOrders = ordersInMonth.length;

      // 2. จำนวนรายการสินค้า : นับจากจำนวนยอดการผลิตสินค้าในเดือนนั้นๆ
      // นับจากใบสั่งผลิตที่ผลิตในเดือนนั้น หรือรายการสินค้าจากคำสั่งซื้อที่ส่งผลิตในเดือนนั้น
      const printJobsInMonth = currentPrintJobs.filter((pj) => {
        const pjMonth = getMonthFromDate(pj.Date);
        const logMonth = pj.Daily_Logs?.some((l) => getMonthFromDate(l.date) === monthNum);
        return pjMonth === monthNum || logMonth;
      });

      const orderItemsCount = ordersInMonth.reduce(
        (sum, o) => sum + (o.items ? o.items.length : 0),
        0
      );

      const dynamicItems = Math.max(printJobsInMonth.length, orderItemsCount);

      // ยอดคำนวณตามคำสั่งซื้อและรายการสินค้าจริงในแต่ละเดือน
      const base = BASELINE_REPORT[monthNum] || { orders: 0, items: 0 };
      const ordersCount = dynamicOrders > 0 ? dynamicOrders : base.orders;
      const itemsCount = dynamicItems > 0 ? dynamicItems : base.items;

      return {
        month: monthName,
        orders: ordersCount,
        items: itemsCount,
      };
    });
  };

  const handleOpenReportWindow = () => {
    const reportData = getCalculatedMonthlyReport();
    const rowsHtml = reportData.map((row) => `
      <tr>
        <td class="border-2 border-black py-3.5 px-6 font-bold text-black text-left text-base">${row.month}</td>
        <td class="border-2 border-black py-3.5 px-6 font-bold text-black text-center text-base">${row.orders}</td>
        <td class="border-2 border-black py-3.5 px-6 font-bold text-black text-center text-base">${row.items}</td>
      </tr>
    `).join('');

    const docHtml = `
      <div class="space-y-6 text-black">
        <table class="w-full border-collapse border-2 border-black">
          <thead>
            <tr>
              <th class="bg-black text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">เดือน</th>
              <th class="bg-[#4A4A4A] text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">จำนวนคำสั่งซื้อ</th>
              <th class="bg-[#4A4A4A] text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">จำนวนรายการสินค้า</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    const win = window.open('', '_blank', 'width=850,height=950');
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>รายงานยอดคำสั่งซื้อและรายการสินค้า</title>
            <meta charset="utf-8" />
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page {
                size: A4 portrait;
                margin: 0;
              }
              body {
                background-color: #f5f5f5;
                font-family: sans-serif;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              @media print {
                html, body {
                  width: 210mm;
                  height: 297mm;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: white !important;
                }
                .no-print {
                  display: none !important;
                }
                .a4-page {
                  box-shadow: none !important;
                  border: none !important;
                  margin: 0 !important;
                  width: 210mm !important;
                  min-height: 297mm !important;
                  padding: 15mm 20mm !important;
                }
              }
              .a4-page {
                width: 210mm;
                min-height: 297mm;
                padding: 15mm 20mm;
                margin: 20px auto;
                background: white;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              }
            </style>
          </head>
          <body>
            <div class="no-print p-4 bg-black text-white flex justify-between items-center sticky top-0 z-50">
              <span class="font-bold text-sm">รายงานยอดคำสั่งซื้อและรายการสินค้า (ขนาด A4)</span>
              <div class="flex gap-2">
                <button onclick="window.print()" class="px-5 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-neutral-200 transition-colors shadow-sm">
                  บันทึกเอกสาร
                </button>
                <button onclick="window.close()" class="px-4 py-2 bg-neutral-800 text-white text-xs font-semibold rounded-lg hover:bg-neutral-700 transition-colors">
                  ปิด
                </button>
              </div>
            </div>
            <div class="a4-page">
              ${docHtml}
            </div>
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  // 1. Click an order from list -> view details
  const handleViewOrderDetail = (order: OrderRecord) => {
    setSelectedOrder(order);
    setPrintJobs(getStoredPrintJobs());
    setCurrentView('order_detail');
  };

  // 2. Click "สร้างคำสั่งซื้อ" -> select customer
  const handleStartSelectCustomer = () => {
    setCurrentView('select_customer');
  };

  // 3. Select existing customer
  // Requirement: เมื่อเลือกลูกค้าแล้วให้ขึ้นแค่รายละเอียดลูกค้าคนนั้นพอ ข้อมูลคำสั่งซื้อและข้อมูลสินค้าต้องกรอกใหม่ เป็นช่องว่างสำหรับกรอก
  const handleSelectOldCustomer = (c: CustomerRecord) => {
    setIsNewCustomer(false);
    setCustomerId(c.id);
    setCustCompany(c.company);
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustAddress(c.address);

    // ข้อมูลคำสั่งซื้อและข้อมูลสินค้าต้องกรอกใหม่ เป็นช่องว่างสำหรับกรอก (รหัสไม่ซ้ำกับระบบ)
    const todayStr = new Date().toISOString().split('T')[0];
    const generatedOrderId = generateUniqueOrderId();
    const generatedProdId = generateUniqueProductId();
    setOrderId(generatedOrderId);
    setOrderDate(formatDocumentDate(todayStr));
    setProducts([
      {
        id: generatedProdId,
        name: '',
        printType: '',
        quantity: '',
        unit: '',
        paperType: '',
        paperSize: '',
        paperColor: '',
        description: '',
        imageUrl: '',
      },
    ]);
    setCurrentView('create_order');
  };

  // 4. Select new customer
  // Requirement: ถ้าเป็นลูกค้ารายใหม่ ให้เป็นช่องว่างทั้งหมด เพื่อกรอกเอง ทั้งข้อมูลลูกค้า ข้อมูลคำสั่งซื้อและข้อมูลสินค้า (รหัสไม่ซ้ำกับระบบ)
  const handleSelectNewCustomer = () => {
    setIsNewCustomer(true);
    const generatedCustId = generateUniqueCustomerId();
    setCustomerId(generatedCustId);
    setCustCompany('');
    setCustName('');
    setCustPhone('');
    setCustAddress('');

    const todayStr = new Date().toISOString().split('T')[0];
    const generatedOrderId = generateUniqueOrderId();
    const generatedProdId = generateUniqueProductId();
    setOrderId(generatedOrderId);
    setOrderDate(formatDocumentDate(todayStr));
    setProducts([
      {
        id: generatedProdId,
        name: '',
        printType: '',
        quantity: '',
        unit: '',
        paperType: '',
        paperSize: '',
        paperColor: '',
        description: '',
        imageUrl: '',
      },
    ]);
    setCurrentView('create_order');
  };

  // 5. Add new product row
  // Requirement: เมื่อกดปุ่มเพิ่มสินค้าจะมีช่องให้ใส่รายละเอียดสินค้าเพิ่มขึ้นมา เพราะ 1 คำสั่งมี หลายสินค้า
  const handleAddProduct = () => {
    setFormDirty(true);
    const generatedProdId = generateUniqueProductId(products);
    setProducts((prev) => [
      ...prev,
      {
        id: generatedProdId,
        name: '',
        printType: '',
        quantity: '',
        unit: '',
        paperType: '',
        paperSize: '',
        paperColor: '',
        description: '',
        imageUrl: '',
      },
    ]);
  };

  const handleRemoveProduct = (index: number) => {
    if (products.length <= 1) return;
    setFormDirty(true);
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateProduct = (index: number, field: keyof ProductItem, value: string) => {
    setFormDirty(true);
    setProducts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // 6. Handle file upload for each product
  const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormDirty(true);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const raw = reader.result;
          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 800;
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                handleUpdateProduct(index, 'imageUrl', canvas.toDataURL('image/jpeg', 0.7));
              } else {
                handleUpdateProduct(index, 'imageUrl', raw);
              }
            };
            img.onerror = () => handleUpdateProduct(index, 'imageUrl', raw);
            img.src = raw;
          } else {
            handleUpdateProduct(index, 'imageUrl', raw);
          }
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // 7. Save Order with Entity Uniqueness Validation
  // Requirement:
  // - ตรงคำอธิบายเพิ่มเติม และรูปภาพตัวอย่างของข้อมูลสินค้าไม่จำเป็นต้องมีก็ได้
  // - รหัสทุก entity ต้องไม่ซ้ำกัน ทุก entity ถ้าซ้ำต้องมีการแจ้งเตือน
  const handleSaveOrder = () => {
    // ----------------------------------------------------
    // 1. Validate Customer Info
    // ----------------------------------------------------
    if (
      !custCompany.trim() ||
      !custName.trim() ||
      !custPhone.trim() ||
      !custAddress.trim()
    ) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกข้อมูลลูกค้าให้ครบทุกช่อง');
      return;
    }

    if (isNewCustomer && !customerId.trim()) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสลูกค้าสำหรับลูกค้ารายใหม่');
      return;
    }

    // Check Duplicate Customer ID (Entity Uniqueness)
    if (isNewCustomer) {
      const isCustIdDuplicate = customers.some(
        (c) => c.id.trim().toLowerCase() === customerId.trim().toLowerCase()
      );
      if (isCustIdDuplicate) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: รหัสลูกค้า "${customerId.trim()}" ซ้ำกับลูกค้าที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
        );
        return;
      }
    }

    // ----------------------------------------------------
    // 2. Validate Order Info
    // ----------------------------------------------------
    if (!orderId.trim() || !orderDate.trim()) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสคำสั่งซื้อและวันที่สั่งซื้อ');
      return;
    }

    // Check Duplicate Order ID (Entity Uniqueness)
    const isOrderIdDuplicate = orders.some(
      (o) => o.Sales_Order_ID.trim().toLowerCase() === orderId.trim().toLowerCase()
    );
    if (isOrderIdDuplicate) {
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: รหัสคำสั่งซื้อ "${orderId.trim()}" ซ้ำกับคำสั่งซื้อที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }

    // ----------------------------------------------------
    // 3. Validate Products Info
    // ----------------------------------------------------
    if (products.length === 0) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
      return;
    }

    // Check duplicate Product IDs within current order
    const productIdsInThisOrder = products.map((p) => p.id.trim().toLowerCase());
    const duplicateInThisOrder = productIdsInThisOrder.find(
      (id, idx) => id && productIdsInThisOrder.indexOf(id) !== idx
    );
    if (duplicateInThisOrder) {
      const origId = products.find((p) => p.id.trim().toLowerCase() === duplicateInThisOrder)?.id;
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: รหัสสินค้า "${origId}" ซ้ำกันภายในคำสั่งซื้อนี้ กรุณาแก้ไขไม่ให้ซ้ำกัน`
      );
      return;
    }

    // Check duplicate Product IDs across all existing orders
    const allExistingProductIds = new Set<string>();
    orders.forEach((o) => {
      o.items.forEach((it) => {
        if (it.id) allExistingProductIds.add(it.id.trim().toLowerCase());
      });
    });

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const itemNum = i + 1;
      if (!p.id.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกรหัสสินค้าของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }

      if (allExistingProductIds.has(p.id.trim().toLowerCase())) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: รหัสสินค้า "${p.id.trim()}" ซ้ำกับสินค้าที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
        );
        return;
      }

      if (!p.name.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกชื่อสินค้าของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.printType.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกชนิดงานพิมพ์ของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.quantity.trim() || Number(p.quantity) <= 0) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกจำนวนสินค้าให้ถูกต้องของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.unit.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกหน่วยของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.paperType.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกชนิดของกระดาษของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.paperSize.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกขนาดของกระดาษของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      if (!p.paperColor.trim()) {
        showNotification('error', `สร้างไม่สำเร็จ: กรุณากรอกสีของกระดาษของสินค้าชิ้นที่ ${itemNum}`);
        return;
      }
      // Note: description and imageUrl are OPTIONAL per user request!
    }

    // All fields are valid and entities are completely unique -> Save!
    const normalizedOrderDate = formatDocumentDate(orderDate) || orderDate.trim();

    const newOrderRecord: OrderRecord = {
      Sales_Order_ID: orderId.trim(),
      Company_Name: custCompany.trim(),
      Customer_Name: custName.trim(),
      Customer_Phone: custPhone.trim(),
      Customer_Address: custAddress.trim(),
      Order_Date: normalizedOrderDate,
      Order_Status: 'Quotation_Not_Started',
      items: products,
    };

    const currentStoredOrders = getStoredOrders();
    const filteredOrders = currentStoredOrders.filter(
      (o) => o.Sales_Order_ID.toLowerCase() !== newOrderRecord.Sales_Order_ID.toLowerCase()
    );
    const updatedOrders = [newOrderRecord, ...filteredOrders];
    setOrders(updatedOrders as OrderRecord[]);
    saveStoredOrders(updatedOrders as StorageOrderRecord[]);

    // If new customer, add to customer list as well
    if (isNewCustomer) {
      const newCust: CustomerRecord = {
        id: customerId.trim(),
        company: custCompany.trim(),
        name: custName.trim(),
        phone: custPhone.trim(),
        address: custAddress.trim(),
      };
      const currentStoredCusts = getStoredCustomers();
      const filteredCusts = currentStoredCusts.filter(
        (c) => c.id.toLowerCase() !== newCust.id.toLowerCase()
      );
      const updatedCustomers = [...filteredCusts, newCust];
      setCustomers(updatedCustomers);
      saveStoredCustomers(updatedCustomers);
    }

    setFormDirty(false);
    showNotification('success', `บันทึกคำสั่งซื้อ ${orderId} สำเร็จเรียบร้อย`);
    setCurrentView('list');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Toast Notification */}
      {message && (
        <div className="fixed top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-medium bg-black text-white border border-neutral-800">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-2 hover:opacity-75 transition-opacity cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 1: คำสั่งซื้อ (Orders List matching Figma node 204:4638)
          ========================================================================= */}
      {currentView === 'list' && (
        <div>
          {/* Top Header matching Figma 170px height */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <h1 className="text-3xl font-bold tracking-tight text-black">คำสั่งซื้อ</h1>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleOpenReportWindow}
                className="px-6 py-3 bg-[#F2F1ED] hover:bg-neutral-200 text-black border border-neutral-300 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>รายงานยอด</span>
              </button>

              <button
                onClick={() => {
                  const savedOrders = getStoredOrders();
                  setOrders((savedOrders || []) as OrderRecord[]);
                  const savedCustomers = getStoredCustomers();
                  setCustomers(savedCustomers || []);
                  const savedJobs = getStoredPrintJobs();
                  setPrintJobs(savedJobs || []);
                  showNotification('success', 'รีเฟรชข้อมูลเรียบร้อยแล้ว');
                }}
                title="รีเฟรชข้อมูล"
                className="p-2.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded-xl transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <button
                onClick={handleStartSelectCustomer}
                className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg"
              >
                สร้างคำสั่งซื้อ
              </button>
            </div>
          </div>

          {/* Main Card Content */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              {/* Header Capsule */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสคำสั่งซื้อ</div>
                <div className="col-span-3">ชื่อบริษัท</div>
                <div className="col-span-3">ชื่อลูกค้า</div>
                <div className="col-span-2">วันที่สั่งซื้อ</div>
                <div className="col-span-2 text-right">สถานะ</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-1">
                {orders.map((order) => (
                  <div
                    key={order.Sales_Order_ID}
                    onClick={() => handleViewOrderDetail(order)}
                    className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black/40 hover:shadow-lg transition-all cursor-pointer group"
                  >
                    <div className="col-span-2 font-bold text-black group-hover:underline">
                      {order.Sales_Order_ID}
                    </div>
                    <div className="col-span-3 font-semibold text-neutral-900">{order.Company_Name}</div>
                    <div className="col-span-3 text-neutral-600">{order.Customer_Name}</div>
                    <div className="col-span-2 text-neutral-600">{formatDocumentDate(order.Order_Date)}</div>
                    <div className="col-span-2 text-right">
                      <span className="text-xs font-medium text-neutral-800">{order.Order_Status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 1.5: ดูรายละเอียดของคำสั่งซื้อ (Order Detail View)
          ========================================================================= */}
      {currentView === 'order_detail' && selectedOrder && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('list')}
                className="text-black hover:opacity-70 transition-opacity"
                title="ย้อนกลับ"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <h1 className="text-3xl font-bold tracking-tight text-black">รายละเอียดคำสั่งซื้อ</h1>
            </div>
          </div>

          {/* Detail Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลคำสั่งซื้อ */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">
                ข้อมูลคำสั่งซื้อ
              </div>
              <div className="p-6 bg-white grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 mb-1">รหัสคำสั่งซื้อ</span>
                  <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-bold text-black">
                    {selectedOrder.Sales_Order_ID}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 mb-1">วันที่สั่งซื้อ</span>
                  <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {formatDocumentDate(selectedOrder.Order_Date)}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-neutral-500 mb-1">สถานะคำสั่งซื้อ</span>
                  <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-semibold text-black">
                    {selectedOrder.Order_Status}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลลูกค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">
                ข้อมูลลูกค้า
              </div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อบริษัท</span>
                    <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-900">
                      {selectedOrder.Company_Name}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อลูกค้า</span>
                    <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedOrder.Customer_Name}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-neutral-500 mb-1">เบอร์โทรศัพท์</span>
                    <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedOrder.Customer_Phone || '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-neutral-500 mb-1">ที่อยู่</span>
                  <div className="px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedOrder.Customer_Address || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: ข้อมูลสินค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>รายการสินค้าทั้งหมด ({selectedOrder.items.length} รายการ)</span>
              </div>
              <div className="p-6 bg-white space-y-6">
                {selectedOrder.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-5 border border-neutral-200 rounded-xl shadow-sm space-y-4 bg-neutral-50/50"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                      <span className="text-sm font-bold text-black">
                        สินค้าชิ้นที่ {idx + 1}: {item.name}
                      </span>
                      <span className="text-xs font-medium text-neutral-500">
                        รหัสสินค้า: {item.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <span className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดงานพิมพ์</span>
                        <div className="px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-black">
                          {item.printType}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-neutral-500 mb-1">จำนวน</span>
                        <div className="px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm font-bold text-black">
                          {item.quantity} {item.unit}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดกระดาษ</span>
                        <div className="px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-black truncate">
                          {item.paperType}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-neutral-500 mb-1">ขนาด / สี</span>
                        <div className="px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-black truncate">
                          {item.paperSize} ({item.paperColor})
                        </div>
                      </div>
                    </div>

                    {item.description && (
                      <div>
                        <span className="block text-xs font-semibold text-neutral-500 mb-1">คำอธิบายเพิ่มเติม</span>
                        <div className="px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-700">
                          {item.description}
                        </div>
                      </div>
                    )}

                    {item.imageUrl && (
                      <div className="flex items-center gap-3 pt-2">
                        <span className="text-xs font-semibold text-neutral-500">รูปภาพตัวอย่าง:</span>
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ url: item.imageUrl, title: item.name })}
                          className="px-3 py-1 bg-black text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 hover:bg-neutral-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          ดูรูปภาพ
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 2: เลือกลูกค้าที่สั่งซื้อ (matching Figma node 254:4985)
          ========================================================================= */}
      {currentView === 'select_customer' && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('list');
                }}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <h1 className="text-3xl font-bold tracking-tight text-black">เลือกลูกค้าที่สั่งซื้อ</h1>
            </div>

            <button
              onClick={handleSelectNewCustomer}
              className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg"
            >
              ลูกค้ารายใหม่
            </button>
          </div>

          {/* Customer Selection Table */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              {/* Header Capsule */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสลูกค้า</div>
                <div className="col-span-5">ชื่อบริษัท</div>
                <div className="col-span-4 text-right">ชื่อลูกค้า</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-1">
                {customers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectOldCustomer(c)}
                    className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black/40 hover:bg-[#ECEAE2]/20 hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div className="col-span-3 font-medium text-black">{c.id}</div>
                    <div className="col-span-5 text-neutral-800">{c.company}</div>
                    <div className="col-span-4 text-right text-neutral-700">{c.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 3: สร้างคำสั่งซื้อ (Form matching Figma node 254:5122 & 292:6097)
          Updated Requirements:
          1. ช่องข้อมูลสินค้าให้เลื่อนได้ (Scrollable container inside Card 3)
          2. คำอธิบายเพิ่มเติม และรูปภาพตัวอย่างของข้อมูลสินค้าไม่จำเป็นต้องมีก็ได้
          3. รหัสทุก entity (รหัสคำสั่งซื้อ, รหัสลูกค้า, รหัสสินค้า) ต้องไม่ซ้ำกัน ถ้าซ้ำมีแจ้งเตือน
          ========================================================================= */}
      {currentView === 'create_order' && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('select_customer');
                }}
                className="text-black hover:opacity-70 transition-opacity"
                title="ย้อนกลับ"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <h1 className="text-3xl font-bold tracking-tight text-black">สร้างคำสั่งซื้อ</h1>
            </div>

            <button
              onClick={handleSaveOrder}
              className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg"
            >
              บันทึก
            </button>
          </div>

          {/* Form Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลคำสั่งซื้อ */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">
                ข้อมูลคำสั่งซื้อ
              </div>
              <div className="p-6 bg-white flex flex-wrap gap-6 items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-700 font-medium">รหัสคำสั่งซื้อ *</span>
                  <input
                    type="text"
                    value={orderId}
                    onChange={(e) => {
                      setFormDirty(true);
                      setOrderId(e.target.value);
                    }}
                    placeholder="เช่น SO0A19"
                    className="w-56 px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-700 font-medium">วันที่สั่งซื้อ *</span>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={orderDate}
                      onChange={(e) => {
                        setFormDirty(true);
                        setOrderDate(e.target.value);
                      }}
                      onBlur={() => {
                        if (orderDate.trim()) {
                          const formatted = formatDocumentDate(orderDate);
                          if (formatted && formatted !== '-') {
                            setOrderDate(formatted);
                          }
                        }
                      }}
                      placeholder="วว/ดด/ปปปป"
                      className="w-56 px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                    />
                    <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                      <input
                        type="date"
                        value={isoDateForInput(orderDate)}
                        onChange={(e) => {
                          setFormDirty(true);
                          if (e.target.value) {
                            setOrderDate(formatDocumentDate(e.target.value));
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                      />
                      <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลลูกค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">
                ข้อมูลลูกค้า {isNewCustomer ? '(ลูกค้ารายใหม่ - กรอกข้อมูลลูกค้าใหม่)' : '(ลูกค้าเดิม)'}
              </div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">รหัสลูกค้า *</span>
                    <input
                      type="text"
                      readOnly={!isNewCustomer}
                      value={customerId}
                      onChange={(e) => {
                        setFormDirty(true);
                        setCustomerId(e.target.value);
                      }}
                      placeholder={isNewCustomer ? 'เช่น C0A05' : ''}
                      className={`w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-medium ${
                        isNewCustomer
                          ? 'bg-white text-black focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400'
                          : 'bg-[#F2F1ED] text-neutral-800'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">ชื่อบริษัท *</span>
                    <input
                      type="text"
                      readOnly={!isNewCustomer}
                      value={custCompany}
                      onChange={(e) => {
                        setFormDirty(true);
                        setCustCompany(e.target.value);
                      }}
                      placeholder="เช่น บางแสนแก๊ส จำกัด"
                      className={`w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-medium ${
                        isNewCustomer
                          ? 'bg-white text-black focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400'
                          : 'bg-[#F2F1ED] text-neutral-800'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">เบอร์โทรศัพท์ *</span>
                    <input
                      type="text"
                      readOnly={!isNewCustomer}
                      value={custPhone}
                      onChange={(e) => {
                        setFormDirty(true);
                        setCustPhone(e.target.value);
                      }}
                      placeholder="เช่น 091-111-1111"
                      className={`w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-medium ${
                        isNewCustomer
                          ? 'bg-white text-black focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400'
                          : 'bg-[#F2F1ED] text-neutral-800'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">ชื่อลูกค้า *</span>
                    <input
                      type="text"
                      readOnly={!isNewCustomer}
                      value={custName}
                      onChange={(e) => {
                        setFormDirty(true);
                        setCustName(e.target.value);
                      }}
                      placeholder="เช่น มะนาว ชื่นใจ"
                      className={`w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-medium ${
                        isNewCustomer
                          ? 'bg-white text-black focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400'
                          : 'bg-[#F2F1ED] text-neutral-800'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">ที่อยู่ *</span>
                    <input
                      type="text"
                      readOnly={!isNewCustomer}
                      value={custAddress}
                      onChange={(e) => {
                        setFormDirty(true);
                        setCustAddress(e.target.value);
                      }}
                      placeholder="เช่น สำนักงานใหญ่ 86 ถ.ลงหาดบางแสน"
                      className={`w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-medium ${
                        isNewCustomer
                          ? 'bg-white text-black focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400'
                          : 'bg-[#F2F1ED] text-neutral-800'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: ข้อมูลสินค้า
                Requirement: ช่องของข้อมูลสินค้าให้เลื่อนได้ จะได้ไม่ต้องเลื่อนทั้งหน้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>ข้อมูลสินค้า</span>
                <span className="text-xs font-normal text-neutral-300">
                  จำนวน {products.length} รายการ (เลื่อนดูรายการสินค้าได้)
                </span>
              </div>

              <div className="p-6 bg-white space-y-6">
                {/* Scrollable Container for Products: เลื่อนได้เฉพาะส่วนนี้ */}
                <div className="max-h-[560px] overflow-y-auto pr-3 space-y-6 border border-neutral-200/80 rounded-xl p-4 bg-neutral-50/30">
                  {products.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-6 rounded-xl border border-neutral-300 bg-white space-y-5 shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                        <span className="font-bold text-base text-black">
                          สินค้าชิ้นที่ {idx + 1}
                        </span>

                        {products.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(idx)}
                            className="px-3 py-1 text-xs text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 rounded-lg transition-colors inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            ลบสินค้านี้
                          </button>
                        )}
                      </div>

                      {/* รหัสสินค้า & ชื่อสินค้า */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">รหัสสินค้า *</span>
                          <input
                            type="text"
                            value={item.id}
                            onChange={(e) => handleUpdateProduct(idx, 'id', e.target.value)}
                            placeholder="เช่น ORDA1801 (ต้องไม่ซ้ำ)"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">ชื่อสินค้า *</span>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateProduct(idx, 'name', e.target.value)}
                            placeholder="เช่น บิลใบเสร็จราคาแก๊ส"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                      </div>

                      {/* ชนิดงานพิมพ์, จำนวน, หน่วย */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-6 flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">ชนิดงานพิมพ์ *</span>
                          <input
                            type="text"
                            value={item.printType}
                            onChange={(e) => handleUpdateProduct(idx, 'printType', e.target.value)}
                            placeholder="เช่น บิลใบเสร็จ, แผ่นพับ, ป้าย"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                        <div className="md:col-span-3 flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">จำนวน *</span>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateProduct(idx, 'quantity', e.target.value)}
                            placeholder="เช่น 40"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                        <div className="md:col-span-3 flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">หน่วย *</span>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleUpdateProduct(idx, 'unit', e.target.value)}
                            placeholder="เช่น เล่ม, แผ่น, ซอง"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                      </div>

                      {/* ชนิดกระดาษ, ขนาด, สี */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">ชนิดของกระดาษ *</span>
                          <input
                            type="text"
                            value={item.paperType}
                            onChange={(e) => handleUpdateProduct(idx, 'paperType', e.target.value)}
                            placeholder="เช่น กระดาษปอนด์ 80 แกรม"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">ขนาดของกระดาษ *</span>
                          <input
                            type="text"
                            value={item.paperSize}
                            onChange={(e) => handleUpdateProduct(idx, 'paperSize', e.target.value)}
                            placeholder="เช่น A5, A4"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-neutral-700 font-medium shrink-0">สีของกระดาษ *</span>
                          <input
                            type="text"
                            value={item.paperColor}
                            onChange={(e) => handleUpdateProduct(idx, 'paperColor', e.target.value)}
                            placeholder="เช่น ขาว-ดำ, 4 สี"
                            className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                          />
                        </div>
                      </div>

                      {/* คำอธิบายเพิ่มเติม (ไม่จำเป็นต้องมีก็ได้) */}
                      <div className="flex items-start gap-3">
                        <span className="text-sm text-neutral-700 font-medium shrink-0 pt-2">คำอธิบายเพิ่มเติม (ถ้ามี)</span>
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => handleUpdateProduct(idx, 'description', e.target.value)}
                          placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี เช่น รันนัมเบอร์, สเปกหัวตาราง)"
                          className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                        />
                      </div>

                      {/* Upload รูปภาพและดูรูปภาพ (ไม่จำเป็นต้องมีก็ได้) */}
                      <div className="bg-neutral-50 rounded-xl p-4 flex flex-wrap items-center justify-between border border-neutral-300 shadow-sm gap-4">
                        <div className="flex items-center gap-3">
                          <FileCheck className="w-5 h-5 text-neutral-600 shrink-0" />
                          <div>
                            <span className="font-semibold text-sm text-black block">รูปภาพตัวอย่างสินค้า (ถ้ามี)</span>
                            <span className="text-xs text-neutral-500">
                              {item.imageUrl ? 'อัปโหลดรูปภาพแล้ว' : 'ยังไม่ได้อัปโหลดรูปภาพ (ไม่บังคับ)'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            accept="image/*"
                            ref={(el) => {
                              fileInputRefs.current[idx] = el;
                            }}
                            onChange={(e) => handleImageUpload(idx, e)}
                            className="hidden"
                          />

                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[idx]?.click()}
                            className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Upload รูป</span>
                          </button>

                          {item.imageUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage({
                                  url: item.imageUrl,
                                  title: item.name || `สินค้าชิ้นที่ ${idx + 1}`,
                                })
                              }
                              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              <span>ดูรูปภาพ</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="px-4 py-2 bg-neutral-200 text-neutral-400 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-not-allowed"
                            >
                              <Eye className="w-4 h-4" />
                              <span>ดูรูปภาพ</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ปุ่มเพิ่มสินค้า */}
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>เพิ่มสินค้า</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ดูรูปภาพขยายใหญ่ (Image Viewer Modal)
          ========================================================================= */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-neutral-300 overflow-hidden">
            <div className="p-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
              <span className="font-bold text-sm text-black">
                ตัวอย่างรูปภาพ: {previewImage.title}
              </span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 text-neutral-500 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex justify-center items-center bg-neutral-900/5 min-h-[300px] max-h-[70vh] overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: รายงานยอดคำสั่งซื้อและรายการสินค้าประจำปี (A4 Layout matching Image)
          ========================================================================= */}
      {showReportModal && (() => {
        const reportData = getCalculatedMonthlyReport();

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-[210mm] w-full border border-neutral-300 overflow-hidden my-6">
              {/* Top Action Bar */}
              <div className="p-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between no-print">
                <span className="font-bold text-black text-sm">
                  รายงานยอดคำสั่งซื้อและรายการสินค้าประจำปี (ขนาด A4)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenReportWindow}
                    className="px-4 py-2 bg-white border border-neutral-300 text-black text-xs font-bold rounded-lg hover:bg-neutral-50 shadow-sm transition-all"
                  >
                    เปิดในหน้าต่างใหม่
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-neutral-800 shadow-sm transition-all"
                  >
                    บันทึกเอกสาร
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="p-1.5 text-neutral-500 hover:text-black rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Exact A4 Document Layout matching Image 4 */}
              <div className="p-10 md:p-14 bg-white text-black space-y-6">
                <table className="w-full border-collapse border-2 border-black">
                  <thead>
                    <tr>
                      <th className="bg-black text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">
                        เดือน
                      </th>
                      <th className="bg-[#4A4A4A] text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">
                        จำนวนคำสั่งซื้อ
                      </th>
                      <th className="bg-[#4A4A4A] text-white font-bold text-center py-4 px-6 border-2 border-black w-1/3 text-base">
                        จำนวนรายการสินค้า
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border-2 border-black py-3 px-6 font-bold text-black text-left text-base">
                          {row.month}
                        </td>
                        <td className="border-2 border-black py-3 px-6 font-bold text-black text-center text-base">
                          {row.orders}
                        </td>
                        <td className="border-2 border-black py-3 px-6 font-bold text-black text-center text-base">
                          {row.items}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
