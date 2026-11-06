'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeftCircle,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  Printer,
  Edit3,
  Calendar,
} from 'lucide-react';
import {
  getStoredReceipts,
  saveStoredReceipts,
  getStoredQuotations,
  StorageReceiptRecord,
  StorageReceiptItem,
  StorageQuotationRecord,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, isoDateForInput } from '@/lib/dateUtils';

export default function ReceiptsPage() {
  // Navigation views: 'list' | 'select_quotation' | 'create' | 'detail'
  const [view, setView] = useState<'list' | 'select_quotation' | 'create' | 'detail'>('list');
  const [receipts, setReceipts] = useState<StorageReceiptRecord[]>([]);
  const [quotations, setQuotations] = useState<StorageQuotationRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<StorageReceiptRecord | null>(null);
  const [selectedQuotationForReceipt, setSelectedQuotationForReceipt] = useState<StorageQuotationRecord | null>(null);

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pop-up Modal State for Creating Receipt (Input Receipt ID)
  const [showCreateIdModal, setShowCreateIdModal] = useState(false);
  const [inputReceiptId, setInputReceiptId] = useState('');

  // Pop-up Modal State for Updating Payment (Payment Date & Receiver)
  const [showUpdatePaymentModal, setShowUpdatePaymentModal] = useState(false);
  const [inputPaymentDate, setInputPaymentDate] = useState('');
  const [inputPaymentReceiver, setInputPaymentReceiver] = useState('');

  // Print Modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [view]);

  const loadData = () => {
    const storedReceipts = getStoredReceipts();
    setReceipts(storedReceipts);
    const storedQuotations = getStoredQuotations();
    setQuotations(storedQuotations);
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Helper to generate unique candidate Receipt ID
  const generateUniqueReceiptId = () => {
    let candidate = '';
    let counter = 1;
    do {
      candidate = `R0${counter < 10 ? '0' : ''}${counter}A`;
      counter++;
    } while (receipts.some((r) => r.Receipt_ID.toLowerCase() === candidate.toLowerCase()));
    return candidate;
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 1: เมื่อกดปุ่มสร้างใบเสร็จ
  // ขึ้นให้เลือกใบเสนอราคาที่ยังไม่มีใบเสร็จและมีสถานะใบเสนอราคาเป็น Completed
  // -------------------------------------------------------------------------
  const handleOpenSelectQuotation = () => {
    loadData();
    setView('select_quotation');
  };

  const eligibleQuotations = quotations.filter((q) => {
    const isCompleted = q.Quotation_Status?.toLowerCase() === 'completed';
    const hasReceipt = receipts.some(
      (r) =>
        (r.Quotation_ID && r.Quotation_ID.trim().toLowerCase() === q.Quotation_ID.trim().toLowerCase()) ||
        (r.Sales_Order_ID &&
          q.Sales_Order_ID &&
          r.Sales_Order_ID.trim().toLowerCase() === q.Sales_Order_ID.trim().toLowerCase())
    );
    return isCompleted && !hasReceipt;
  });

  const handleSelectQuotationForCreate = (q: StorageQuotationRecord) => {
    setSelectedQuotationForReceipt(q);
    setView('create');
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 2: หน้าสร้างใบเสร็จ -> กดยืนยันมี pop-up กรอกรหัสใบเสร็จ
  // เมื่อสร้างใบเสร็จจะยังไม่มีวันที่รับเงิน และผู้รับเงิน
  // -------------------------------------------------------------------------
  const handleOpenCreateIdModal = () => {
    const autoId = generateUniqueReceiptId();
    setInputReceiptId(autoId);
    setShowCreateIdModal(true);
  };

  const handleConfirmCreateReceipt = () => {
    const trimmedId = inputReceiptId.trim();
    if (!trimmedId) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสใบเสร็จ');
      return;
    }

    const isDuplicate = receipts.some(
      (r) => r.Receipt_ID.trim().toLowerCase() === trimmedId.toLowerCase()
    );
    if (isDuplicate) {
      showNotification('error', `สร้างไม่สำเร็จ: รหัสใบเสร็จ "${trimmedId}" ซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`);
      return;
    }

    if (!selectedQuotationForReceipt) return;

    const receiptItems: StorageReceiptItem[] = (selectedQuotationForReceipt.items || []).map((it) => ({
      id: it.id,
      name: it.name,
      qty: Math.max(0, it.quantity),
      unit: it.unit || 'ชิ้น',
      unitPrice: Math.max(0, it.unitPrice),
      total: Math.max(0, it.quantity * it.unitPrice),
    }));

    const calculatedTotal =
      selectedQuotationForReceipt.Total_Amount ||
      receiptItems.reduce((acc, it) => acc + it.total, 0);

    const newReceipt: StorageReceiptRecord = {
      Receipt_ID: trimmedId,
      Sales_Order_ID: selectedQuotationForReceipt.Sales_Order_ID || '-',
      Quotation_ID: selectedQuotationForReceipt.Quotation_ID,
      Company_Name: selectedQuotationForReceipt.Company_Name || '-',
      Customer_Name: selectedQuotationForReceipt.Customer_Name || '-',
      Customer_Phone: selectedQuotationForReceipt.Customer_Phone || '-',
      Customer_Address: selectedQuotationForReceipt.Customer_Address || '-',
      Receipt_Date: '-',      // ยังไม่มีวันที่รับเงิน
      Payment_Receiver: '-',  // และผู้รับเงิน
      Total_Amount: calculatedTotal,
      items: receiptItems,
    };

    const currentStoredReceipts = getStoredReceipts();
    const otherReceipts = currentStoredReceipts.filter(
      (r) => r.Receipt_ID.trim().toLowerCase() !== newReceipt.Receipt_ID.trim().toLowerCase()
    );
    const updated = [newReceipt, ...otherReceipts];
    setReceipts(updated);
    saveStoredReceipts(updated);

    setShowCreateIdModal(false);
    setFormDirty(false);
    setSearchTerm('');
    showNotification('success', `สร้างใบเสร็จ ${newReceipt.Receipt_ID} สำเร็จเรียบร้อย`);
    loadData();
    setView('list');
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 3: หน้ารายละเอียดใบเสร็จ
  // เมื่อเลือกใบเสร็จที่ยังไม่มีผู้รับเงินจะมีปุ่มอัปเดต เมื่อกดปุ่มแล้วจะมี pop up ขึ้นมาให้ใส่วันที่และผู้รับเงิน
  // ถ้าใบเสร็จมีชื่อผู้รับเงินและวันที่รับเงินแล้วจะไม่มีปุ่มอัปเดต
  // -------------------------------------------------------------------------
  const handleOpenDetail = (r: StorageReceiptRecord) => {
    setSelectedReceipt(r);
    setView('detail');
  };

  const handleOpenUpdatePaymentModal = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setInputPaymentDate(formatDocumentDate(`${yyyy}-${mm}-${dd}`));
    setInputPaymentReceiver('วันชัย แซ่ตั้ง');
    setShowUpdatePaymentModal(true);
  };

  const handleConfirmUpdatePayment = () => {
    const trimmedDate = inputPaymentDate.trim();
    const trimmedReceiver = inputPaymentReceiver.trim();

    if (!trimmedDate) {
      showNotification('error', 'กรุณาระบุวันที่รับเงิน');
      return;
    }
    if (!trimmedReceiver) {
      showNotification('error', 'กรุณากรอกชื่อผู้รับเงิน');
      return;
    }

    if (!selectedReceipt) return;

    const formattedDate = formatDocumentDate(trimmedDate) || trimmedDate;

    const updated: StorageReceiptRecord = {
      ...selectedReceipt,
      Receipt_Date: formattedDate,
      Payment_Receiver: trimmedReceiver,
    };

    setSelectedReceipt(updated);

    const currentStored = getStoredReceipts();
    const updatedList = currentStored.map((r) =>
      r.Receipt_ID === updated.Receipt_ID ? updated : r
    );
    setReceipts(updatedList);
    saveStoredReceipts(updatedList);

    setShowUpdatePaymentModal(false);
    showNotification('success', `อัปเดตข้อมูลการรับเงินสำหรับใบเสร็จ ${updated.Receipt_ID} เรียบร้อยแล้ว`);
  };

  // Check if receipt already has payment receiver and date
  const hasPayment =
    Boolean(selectedReceipt?.Payment_Receiver) &&
    selectedReceipt?.Payment_Receiver !== '-' &&
    Boolean(selectedReceipt?.Receipt_Date) &&
    selectedReceipt?.Receipt_Date !== '-';

  // Search filter in list view
  const filteredReceipts = receipts.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.Receipt_ID.toLowerCase().includes(term) ||
      r.Sales_Order_ID.toLowerCase().includes(term) ||
      r.Company_Name.toLowerCase().includes(term) ||
      (r.Customer_Name && r.Customer_Name.toLowerCase().includes(term)) ||
      (r.Payment_Receiver && r.Payment_Receiver.toLowerCase().includes(term))
    );
  });

  const handleOpenReceiptWindow = (receipt: StorageReceiptRecord | null) => {
    if (!receipt) return;
    const defaultItems = [
      { id: '302CNN001', name: 'ป้ายหน้าห้องสีขาว ขนาดสั้น', qty: 10, unit: 'ห่อ', unitPrice: 80, total: 800 },
      { id: '302UMD001', name: 'ใบรายงานการรักษาผู้ป่วยนอก', qty: 200, unit: 'เล่ม', unitPrice: 40, total: 8000 },
      { id: '302OPD001', name: 'ใบรับรองแพทย์', qty: 1000, unit: 'เล่ม', unitPrice: 120, total: 120000 },
      { id: '302CMN010', name: 'บัตรนัดผู้ป่วยสีฟ้า', qty: 30, unit: 'ห่อ', unitPrice: 125, total: 3750 },
      { id: '301AFN010', name: 'ซองสีน้ำตาล', qty: 1000, unit: 'ซอง', unitPrice: 4, total: 4000 },
      { id: '301AFN008', name: 'ซองสีน้ำตาลขนาดข้าง', qty: 1000, unit: 'ซอง', unitPrice: 8, total: 8000 },
      { id: '301AFN001', name: 'ซองสีขาว', qty: 20, unit: 'กล่อง', unitPrice: 400, total: 8000 },
      { id: '303AMD009', name: 'กระดาษหัวจดหมายโรงพยาบาลเอกชล', qty: 30, unit: 'ห่อ', unitPrice: 100, total: 3000 },
      { id: '302BTN001', name: 'แบบฟอร์มวัดปรอทผู้ใหญ่', qty: 40, unit: 'เล่ม', unitPrice: 80, total: 3200 },
      { id: '302BIN002', name: 'INTAKE OUT PUT', qty: 30, unit: 'เล่ม', unitPrice: 70, total: 2100 },
      { id: '302BDN001', name: 'DOCTOR VISIT', qty: 100, unit: 'เล่ม', unitPrice: 50, total: 5000 },
      { id: '302BDN002', name: 'DOCTOR ORDER SHEET', qty: 100, unit: 'เล่ม', unitPrice: 50, total: 5000 },
      { id: '302BBK001', name: 'BLOOD BANK GROUP AB', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
      { id: '302BBK002', name: 'BLOOD BANK GROUP O', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
      { id: '302BBK003', name: 'BLOOD BANK GROUP B', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
      { id: '302BBK004', name: 'BLOOD BANK GROUP A', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
    ];

    const receiptItems = (receipt.items && receipt.items.length > 0)
      ? receipt.items
      : defaultItems;

    const calculatedTotal =
      receipt.Total_Amount ||
      receiptItems.reduce((acc, it) => acc + (it.total || it.qty * it.unitPrice), 0);

    const receiptDate = (receipt.Receipt_Date && receipt.Receipt_Date !== '-')
      ? receipt.Receipt_Date
      : '23/9/2025';

    const customerCompany = receipt.Company_Name && receipt.Company_Name !== '-'
      ? receipt.Company_Name
      : 'โรงพยาบาลเอกชล';

    const customerAddress = receipt.Customer_Address && receipt.Customer_Address !== '-'
      ? receipt.Customer_Address
      : 'สำนักงานใหญ่ 86 ถ.ลงหาดบางแสน ต.แสนสุข ชลบุรี';

    const receiverName = (receipt.Payment_Receiver && receipt.Payment_Receiver !== '-')
      ? receipt.Payment_Receiver
      : 'เปรมภัสสร แซ่ตั้ง';

    const rowsHtml = receiptItems.map((item, idx) => `
      <tr class="border-b border-neutral-200">
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${idx + 1}.</td>
        <td class="py-2.5 px-3 text-left border-r border-neutral-200 font-medium">${item.id}</td>
        <td class="py-2.5 px-3 text-left border-r border-neutral-200">${item.name}</td>
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${item.qty.toLocaleString()}</td>
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${item.unit}</td>
        <td class="py-2.5 px-3 text-right border-r border-neutral-200">${item.unitPrice.toLocaleString()}.-</td>
        <td class="py-2.5 px-3 text-right font-medium">${(item.total || item.qty * item.unitPrice).toLocaleString()}.-</td>
      </tr>
    `).join('');

    const docHtml = `
      <div class="space-y-6 text-sm text-black">
        <div class="flex justify-between items-start">
          <div>
            <h1 class="text-4xl font-extrabold tracking-tight">ใบเสร็จรับเงิน</h1>
            <p class="text-xs font-bold text-neutral-800 mt-3">รหัสใบเสร็จ: ${receipt.Receipt_ID}</p>
            <p class="text-xs font-bold text-neutral-800 mt-1">วันที่รับเงิน: ${formatDocumentDate(receiptDate)}</p>
          </div>
          <div class="text-right text-xs leading-relaxed text-neutral-800">
            <div class="font-bold text-sm">ร้านวันชัยการพิมพ์</div>
            <div>20 ม.5 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000</div>
            <div>โทร: 089-9354059, 080-6378246</div>
            <div>อีเมล: siripen122512@gmail.com</div>
          </div>
        </div>

        <div class="border-t border-b border-neutral-400 py-3 space-y-1">
          <div class="font-bold text-xs text-neutral-900">นามลูกค้า: ${customerCompany}</div>
          <div class="font-bold text-xs text-neutral-900">ที่อยู่ลูกค้า : ${customerAddress}</div>
        </div>

        <table class="w-full text-xs border border-neutral-300 border-collapse">
          <thead>
            <tr class="bg-black text-white font-bold">
              <th class="py-2.5 px-3 text-center w-12 border-r border-neutral-700">ลำดับ</th>
              <th class="py-2.5 px-3 text-left w-28 border-r border-neutral-700">รหัสสินค้า</th>
              <th class="py-2.5 px-3 text-left border-r border-neutral-700">รายการ</th>
              <th class="py-2.5 px-3 text-center w-20 border-r border-neutral-700">จำนวน</th>
              <th class="py-2.5 px-3 text-center w-16 border-r border-neutral-700">หน่วย</th>
              <th class="py-2.5 px-3 text-right w-24 border-r border-neutral-700">ราคา/หน่วย</th>
              <th class="py-2.5 px-3 text-right w-28">ราคารวม</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="flex justify-end pt-3">
          <div class="flex items-center gap-4">
            <span class="font-bold text-xs text-neutral-900">จำนวนที่ต้องชำระทั้งสิ้น:</span>
            <div class="bg-[#E0E0E0] px-8 py-2 font-bold text-sm text-black">
              ${calculatedTotal.toLocaleString()}.-
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-12 pr-6">
          <div class="text-center w-48 space-y-2">
            <div class="h-16"></div>
            <div class="border-b border-neutral-500 w-full"></div>
            <p class="font-bold text-xs text-black pt-1">${receiverName}</p>
            <p class="text-[11px] text-neutral-600">ผู้รับเงิน</p>
          </div>
        </div>
      </div>
    `;

    const win = window.open('', '_blank', 'width=900,height=1000');
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>ใบเสร็จรับเงิน - ${receipt.Receipt_ID}</title>
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
              <span class="font-bold text-sm">ใบเสร็จรับเงิน: ${receipt.Receipt_ID}</span>
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

      {/* ============================================================ */}
      {/* VIEW 1: รายการใบเสร็จ (List Screen matching Figma Node 304:8922) */}
      {/* ============================================================ */}
      {view === 'list' && (
        <div>
          {/* Header Bar matching Figma (170px height) */}
          <div className="min-h-[140px] px-12 flex items-end pb-8 border-b border-neutral-200">
            <div className="w-full flex items-center justify-between">
              <h1 className="text-3xl font-bold tracking-tight text-black">
                รายการใบเสร็จ
              </h1>

              <div className="flex items-center gap-4">
                <button
                  onClick={loadData}
                  title="รีเฟรชข้อมูล"
                  className="p-3 text-neutral-500 hover:text-black hover:bg-[#F2F1ED] rounded-xl transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={handleOpenSelectQuotation}
                  className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                >
                  สร้างใบเสร็จ
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-12 max-w-6xl mx-auto space-y-6">
            {/* Search Input */}
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัสใบเสร็จ หรือชื่อบริษัท..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-[#F2F1ED] border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400"
              />
            </div>

            {/* Elevated Table Container */}
            <div className="bg-white border-2 border-neutral-200/90 rounded-2xl shadow-sm p-6 space-y-3">
              {/* Table Header Bar */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-semibold grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบเสร็จ</div>
                <div className="col-span-3">รหัสคำสั่งซื้อ</div>
                <div className="col-span-3">ชื่อบริษัท</div>
                <div className="col-span-2">วันที่</div>
                <div className="col-span-2 text-right">ผู้รับเงิน</div>
              </div>

              {/* Rows matching Figma Node 309:9266 */}
              <div className="space-y-3 pt-2">
                {filteredReceipts.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ไม่พบรายการใบเสร็จ
                  </div>
                ) : (
                  filteredReceipts.map((r, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenDetail(r)}
                      className="bg-white border border-[#E6E2D7] rounded-xl py-4 px-8 text-sm text-neutral-900 grid grid-cols-12 items-center shadow-sm hover:border-black/50 hover:shadow-md cursor-pointer transition-all"
                    >
                      <div className="col-span-2 font-bold text-black text-base">
                        {r.Receipt_ID}
                      </div>
                      <div className="col-span-3 text-neutral-600 font-medium font-mono text-xs">
                        {r.Sales_Order_ID}
                      </div>
                      <div className="col-span-3 font-semibold text-neutral-900">
                        {r.Company_Name}
                      </div>
                      <div className="col-span-2 text-neutral-700">
                        {formatDocumentDate(r.Receipt_Date)}
                      </div>
                      <div className="col-span-2 text-right">
                        <span
                          className={`text-sm font-semibold ${
                            r.Payment_Receiver === '-'
                              ? 'text-neutral-400'
                              : 'text-neutral-900'
                          }`}
                        >
                          {r.Payment_Receiver}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: หน้าเลือกใบเสนอราคาสำหรับสร้างใบเสร็จ (Requirement) */}
      {/* ขึ้นให้เลือกใบเสนอราคาที่ยังไม่มีใบเสร็จและมีสถานะเป็น Completed */}
      {/* ============================================================ */}
      {view === 'select_quotation' && (
        <div>
          {/* Header Bar matching Figma (170px height) */}
          <div className="min-h-[140px] px-12 flex items-end pb-8 border-b border-neutral-200">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setView('list')}
                  className="p-1 hover:opacity-75 transition-opacity text-black"
                  title="ย้อนกลับ"
                >
                  <ArrowLeftCircle className="w-9 h-9" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-black">
                    เลือกใบเสนอราคาสำหรับสร้างใบเสร็จ
                  </h1>
                  <p className="text-xs text-neutral-500 mt-1">
                    แสดงเฉพาะใบเสนอราคาที่มีสถานะ Completed และยังไม่มีการออกใบเสร็จ
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-12 max-w-6xl mx-auto space-y-6">
            <div className="bg-white border-2 border-neutral-200/90 rounded-2xl shadow-sm p-6 space-y-3">
              {/* Table Header Bar */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-semibold grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบเสนอราคา</div>
                <div className="col-span-2">รหัสคำสั่งซื้อ</div>
                <div className="col-span-4">ชื่อบริษัท</div>
                <div className="col-span-2 text-right">ยอดราคารวม</div>
                <div className="col-span-2 text-right">สถานะ</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-2">
                {eligibleQuotations.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500 space-y-2">
                    <p className="font-semibold text-neutral-700">
                      ไม่พบใบเสนอราคาที่พร้อมออกใบเสร็จ
                    </p>
                    <p className="text-xs text-neutral-400">
                      (ต้องเป็นใบเสนอราคาที่มีสถานะ Completed และยังไม่มีใบเสร็จในระบบ)
                    </p>
                  </div>
                ) : (
                  eligibleQuotations.map((q) => (
                    <div
                      key={q.Quotation_ID}
                      onClick={() => handleSelectQuotationForCreate(q)}
                      className="bg-white border border-[#E6E2D7] rounded-xl py-4 px-8 text-sm text-neutral-900 grid grid-cols-12 items-center shadow-sm hover:border-black/50 hover:shadow-md cursor-pointer transition-all group"
                    >
                      <div className="col-span-2 font-bold text-black text-base group-hover:text-neutral-700 transition-colors">
                        {q.Quotation_ID}
                      </div>
                      <div className="col-span-2 text-neutral-600 font-mono text-xs">
                        {q.Sales_Order_ID || '-'}
                      </div>
                      <div className="col-span-4 font-semibold text-neutral-900">
                        {q.Company_Name}
                      </div>
                      <div className="col-span-2 text-right font-bold text-black">
                        {(q.Total_Amount || 0).toLocaleString()} บาท
                      </div>
                      <div className="col-span-2 text-right text-sm font-medium text-neutral-800">
                        {q.Quotation_Status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 3: หน้าสร้างใบเสร็จ (Create Screen matching Figma & Uploaded Image) */}
      {/* ============================================================ */}
      {view === 'create' && (
        <div>
          {/* Header Bar matching Figma (170px height) */}
          <div className="min-h-[140px] px-12 flex items-end pb-8 border-b border-neutral-200">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (confirmDiscardChanges()) {
                      setView('select_quotation');
                    }
                  }}
                  className="p-1 hover:opacity-75 transition-opacity text-black"
                  title="ย้อนกลับ"
                >
                  <ArrowLeftCircle className="w-9 h-9" />
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  สร้างใบเสร็จ
                </h1>
              </div>
            </div>
          </div>

          {/* Content Area matching uploaded image */}
          <div className="p-12 max-w-5xl mx-auto space-y-8">
            {/* Card 1: ข้อมูล */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                ข้อมูล
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-neutral-800 mb-2">
                    รหัสใบเสนอราคา
                  </label>
                  <div className="w-full px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black">
                    {selectedQuotationForReceipt?.Quotation_ID || 'QU001A'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                      ชื่อบริษัท
                    </label>
                    <div className="px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base text-neutral-900 font-semibold">
                      {selectedQuotationForReceipt?.Company_Name || 'โรงพยาบาลเอกชล'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                      วันที่ออกใบเสนอราคา
                    </label>
                    <div className="px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base text-neutral-900 font-medium">
                      {formatDocumentDate(selectedQuotationForReceipt?.Quotation_Date)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: รายการสินค้า matching Figma & uploaded image */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                รายการสินค้า
              </div>
              <div className="p-8 space-y-4">
                {(selectedQuotationForReceipt?.items || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#E6E2D7] rounded-xl p-5 shadow-sm grid grid-cols-12 gap-4 items-center"
                  >
                    <div className="col-span-3">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1">
                        รหัสสินค้า
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-4 py-2 text-sm font-semibold text-black">
                        {item.id}
                      </div>
                    </div>

                    <div className="col-span-3">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1">
                        ชื่อสินค้า
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-4 py-2 text-sm text-neutral-900 font-medium truncate">
                        {item.name}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-center">
                        จำนวน
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-2 py-2 text-sm text-center font-medium">
                        {item.quantity}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-center">
                        หน่วย
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-2 py-2 text-sm text-center font-medium">
                        {item.unit}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-right">
                        ราคาต่อหน่วย
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-3 py-2 text-sm text-right font-medium">
                        {item.unitPrice.toLocaleString()}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-right">
                        เป็นเงิน
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-3 py-2 text-sm text-right font-bold text-black">
                        {(item.quantity * item.unitPrice).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: ข้อมูลสรุป matching uploaded image */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                ข้อมูล
              </div>
              <div className="p-8 grid grid-cols-2 gap-8 items-center">
                <div>
                  <label className="block text-sm font-semibold text-neutral-800 mb-2">
                    ยอดราคารวม
                  </label>
                  <div className="px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black">
                    {(
                      selectedQuotationForReceipt?.Total_Amount ||
                      (selectedQuotationForReceipt?.items || []).reduce(
                        (acc, it) => acc + it.quantity * it.unitPrice,
                        0
                      )
                    ).toLocaleString()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-800 mb-2">
                    สถานะใบเสนอราคา
                  </label>
                  <div className="px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-semibold text-black">
                    {selectedQuotationForReceipt?.Quotation_Status || 'Complete'}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Button matching Figma & uploaded image: ยืนยัน */}
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={handleOpenCreateIdModal}
                className="w-48 py-3.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-base font-bold shadow-md transition-all"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* POP-UP MODAL: กรอกรหัสใบเสร็จ (เมื่อกดปุ่มยืนยัน) */}
      {/* Requirement: เมื่อกดปุ่มยืนยันจะมีให้กรอกรหัสใบเสร็จ */}
      {/* (ถ้าเป็นรหัสต้องไม่ซ้ำ และต้องไม่เป็นค่าว่าง (ไม่ต้องโชว์)) */}
      {/* ============================================================ */}
      {showCreateIdModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-neutral-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">กรอกรหัสใบเสร็จ</h3>
              <button
                onClick={() => setShowCreateIdModal(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-neutral-800 block mb-2">
                  รหัสใบเสร็จ *
                </label>
                <input
                  type="text"
                  value={inputReceiptId}
                  onChange={(e) => {
                    setFormDirty(true);
                    setInputReceiptId(e.target.value);
                  }}
                  placeholder="เช่น R001A"
                  className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowCreateIdModal(false)}
                  className="px-5 py-2.5 bg-[#F2F1ED] hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-semibold transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCreateReceipt}
                  className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 4: หน้าแสดงรายละเอียดใบเสร็จ (matching Figma Node 387:7010) */}
      {/* Requirement: เมื่อเลือกใบเสร็จที่ยังไม่มีผู้รับเงินจะมีปุ่มอัปเดต */}
      {/* ถ้าใบเสร็จมีชื่อผู้รับเงินและวันที่รับเงินแล้วจะไม่มีปุ่มอัปเดต */}
      {/* ============================================================ */}
      {view === 'detail' && selectedReceipt && (
        <div>
          {/* Header Bar matching Figma (170px height) */}
          <div className="min-h-[140px] px-12 flex items-end pb-8 border-b border-neutral-200">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setView('list')}
                  className="p-1 hover:opacity-75 transition-opacity text-black"
                  title="ย้อนกลับ"
                >
                  <ArrowLeftCircle className="w-9 h-9" />
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  รายละเอียดใบเสร็จ
                </h1>
              </div>

              <div className="flex items-center gap-3">
                {/* Requirement: เมื่อเลือกใบเสร็จที่ยังไม่มีผู้รับเงินจะมีปุ่มอัปเดต */}
                {/* ถ้าใบเสร็จมีชื่อผู้รับเงินและวันที่รับเงินแล้วจะไม่มีปุ่มอัปเดต */}
                {!hasPayment && (
                  <button
                    type="button"
                    onClick={handleOpenUpdatePaymentModal}
                    className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>อัปเดต</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenReceiptWindow(selectedReceipt)}
                  className="px-6 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-black border border-neutral-300 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>ดูใบเสร็จ</span>
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-12 max-w-5xl mx-auto space-y-8">
            {/* Card 1: ข้อมูลลูกค้าและใบเสร็จ */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                ข้อมูล
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-12 gap-6 items-center">
                  <div className="col-span-3">
                    <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                      รหัสใบเสร็จ
                    </label>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black">
                      {selectedReceipt.Receipt_ID}
                    </div>
                  </div>

                  <div className="col-span-4">
                    <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                      ชื่อลูกค้า
                    </label>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-medium text-neutral-900">
                      {selectedReceipt.Customer_Name || '-'}
                    </div>
                  </div>

                  <div className="col-span-5">
                    <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                      ชื่อบริษัท
                    </label>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-semibold text-black truncate">
                      {selectedReceipt.Company_Name}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-6 items-center">
                  <div className="col-span-8">
                    <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                      ที่อยู่
                    </label>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-900">
                      {selectedReceipt.Customer_Address || '-'}
                    </div>
                  </div>

                  <div className="col-span-4">
                    <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                      เบอร์โทร
                    </label>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-medium text-neutral-900">
                      {selectedReceipt.Customer_Phone || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: รายการสินค้า matching Figma Node 387:7034 */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                รายการสินค้า
              </div>
              <div className="p-8 space-y-4">
                {(selectedReceipt.items && selectedReceipt.items.length > 0
                  ? selectedReceipt.items
                  : [
                      {
                        id: '302CNN001',
                        name: 'ป้ายหน้าห้องสีขาว ขนาดสั้น',
                        qty: 10,
                        unit: 'ห่อ',
                        unitPrice: 80,
                        total: 800,
                      },
                      {
                        id: '302UMD001',
                        name: 'ใบรายงานการรักษาผู้ป่วยนอก',
                        qty: 200,
                        unit: 'เล่ม',
                        unitPrice: 40,
                        total: 8000,
                      },
                      {
                        id: '302OPD001',
                        name: 'ใบรับรองแพทย์',
                        qty: 1000,
                        unit: 'เล่ม',
                        unitPrice: 120,
                        total: 120000,
                      },
                    ]
                ).map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#E6E2D7] rounded-xl p-5 shadow-sm grid grid-cols-12 gap-4 items-center"
                  >
                    <div className="col-span-3">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1">
                        รหัสสินค้า
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-4 py-2 text-sm font-semibold text-black">
                        {item.id}
                      </div>
                    </div>

                    <div className="col-span-3">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1">
                        ชื่อสินค้า
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-4 py-2 text-sm text-neutral-900 font-medium truncate">
                        {item.name}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-center">
                        จำนวน
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-2 py-2 text-sm text-center font-medium">
                        {item.qty}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-center">
                        หน่วย
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-2 py-2 text-sm text-center font-medium">
                        {item.unit}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-right">
                        ราคาต่อหน่วย
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-3 py-2 text-sm text-right font-medium">
                        {item.unitPrice.toLocaleString()}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-xs font-semibold text-neutral-500 mb-1 text-right">
                        เป็นเงิน
                      </span>
                      <div className="bg-[#F2F1ED] border border-neutral-300 rounded-xl px-3 py-2 text-sm text-right font-bold text-black">
                        {item.total.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: ข้อมูลการชำระเงิน matching Figma Node 387:7120 */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-base">
                ข้อมูล
              </div>
              <div className="p-8 grid grid-cols-12 gap-6 items-center">
                <div className="col-span-4">
                  <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                    ยอดราคารวม
                  </label>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black">
                    {(selectedReceipt.Total_Amount || 172850).toLocaleString()} บาท
                  </div>
                </div>

                <div className="col-span-4">
                  <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                    วันที่รับเงิน
                  </label>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-semibold text-black">
                    {formatDocumentDate(selectedReceipt.Receipt_Date)}
                  </div>
                </div>

                <div className="col-span-4">
                  <label className="block text-sm font-semibold text-neutral-800 mb-1.5">
                    ผู้รับเงิน
                  </label>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-semibold text-black">
                    {selectedReceipt.Payment_Receiver || '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* POP-UP MODAL: อัปเดตข้อมูลการรับเงิน (วันที่ และ ผู้รับเงิน) */}
      {/* Requirement: เมื่อเลือกใบเสร็จที่ยังไม่มีผู้รับเงินจะมีปุ่มอัปเดต */}
      {/* เมื่อกดปุ่มแล้วจะมี pop up ขี้นมาให้ใส่วันที่และผู้รับเงิน */}
      {/* (ไม่ต้องโชว์ข้อความเงื่อนไข) */}
      {/* ============================================================ */}
      {showUpdatePaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-neutral-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">อัปเดตข้อมูลการรับเงิน</h3>
              <button
                onClick={() => setShowUpdatePaymentModal(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-neutral-800 block mb-2">
                  วันที่รับเงิน *
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={inputPaymentDate}
                    onChange={(e) => setInputPaymentDate(e.target.value)}
                    onBlur={() => {
                      if (inputPaymentDate.trim()) {
                        const formatted = formatDocumentDate(inputPaymentDate);
                        if (formatted && formatted !== '-') {
                          setInputPaymentDate(formatted);
                        }
                      }
                    }}
                    placeholder="วว/ดด/ปปปป"
                    className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                  />
                  <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                    <input
                      type="date"
                      value={isoDateForInput(inputPaymentDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setInputPaymentDate(formatDocumentDate(e.target.value));
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                    />
                    <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-neutral-800 block mb-2">
                  ผู้รับเงิน *
                </label>
                <input
                  type="text"
                  value={inputPaymentReceiver}
                  onChange={(e) => setInputPaymentReceiver(e.target.value)}
                  placeholder="เช่น วันชัย แซ่ตั้ง"
                  className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowUpdatePaymentModal(false)}
                  className="px-5 py-2.5 bg-[#F2F1ED] hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-semibold transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpdatePayment}
                  className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ดูใบเสร็จรับเงิน (Official A4 Layout matching Image) */}
      {/* ============================================================ */}
      {showPrintModal && selectedReceipt && (() => {
        const defaultItems = [
          { id: '302CNN001', name: 'ป้ายหน้าห้องสีขาว ขนาดสั้น', qty: 10, unit: 'ห่อ', unitPrice: 80, total: 800 },
          { id: '302UMD001', name: 'ใบรายงานการรักษาผู้ป่วยนอก', qty: 200, unit: 'เล่ม', unitPrice: 40, total: 8000 },
          { id: '302OPD001', name: 'ใบรับรองแพทย์', qty: 1000, unit: 'เล่ม', unitPrice: 120, total: 120000 },
          { id: '302CMN010', name: 'บัตรนัดผู้ป่วยสีฟ้า', qty: 30, unit: 'ห่อ', unitPrice: 125, total: 3750 },
          { id: '301AFN010', name: 'ซองสีน้ำตาล', qty: 1000, unit: 'ซอง', unitPrice: 4, total: 4000 },
          { id: '301AFN008', name: 'ซองสีน้ำตาลขนาดข้าง', qty: 1000, unit: 'ซอง', unitPrice: 8, total: 8000 },
          { id: '301AFN001', name: 'ซองสีขาว', qty: 20, unit: 'กล่อง', unitPrice: 400, total: 8000 },
          { id: '303AMD009', name: 'กระดาษหัวจดหมายโรงพยาบาลเอกชล', qty: 30, unit: 'ห่อ', unitPrice: 100, total: 3000 },
          { id: '302BTN001', name: 'แบบฟอร์มวัดปรอทผู้ใหญ่', qty: 40, unit: 'เล่ม', unitPrice: 80, total: 3200 },
          { id: '302BIN002', name: 'INTAKE OUT PUT', qty: 30, unit: 'เล่ม', unitPrice: 70, total: 2100 },
          { id: '302BDN001', name: 'DOCTOR VISIT', qty: 100, unit: 'เล่ม', unitPrice: 50, total: 5000 },
          { id: '302BDN002', name: 'DOCTOR ORDER SHEET', qty: 100, unit: 'เล่ม', unitPrice: 50, total: 5000 },
          { id: '302BBK001', name: 'BLOOD BANK GROUP AB', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
          { id: '302BBK002', name: 'BLOOD BANK GROUP O', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
          { id: '302BBK003', name: 'BLOOD BANK GROUP B', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
          { id: '302BBK004', name: 'BLOOD BANK GROUP A', qty: 5, unit: 'ห่อ', unitPrice: 120, total: 600 },
        ];

        const receiptItems = (selectedReceipt.items && selectedReceipt.items.length > 0)
          ? selectedReceipt.items
          : defaultItems;

        const calculatedTotal =
          selectedReceipt.Total_Amount ||
          receiptItems.reduce((acc, it) => acc + (it.total || it.qty * it.unitPrice), 0);

        const receiptDate = (selectedReceipt.Receipt_Date && selectedReceipt.Receipt_Date !== '-')
          ? selectedReceipt.Receipt_Date
          : '23/9/2025';

        const customerCompany = selectedReceipt.Company_Name && selectedReceipt.Company_Name !== '-'
          ? selectedReceipt.Company_Name
          : 'โรงพยาบาลเอกชล';

        const customerAddress = selectedReceipt.Customer_Address && selectedReceipt.Customer_Address !== '-'
          ? selectedReceipt.Customer_Address
          : 'สำนักงานใหญ่ 86 ถ.ลงหาดบางแสน ต.แสนสุข ชลบุรี';

        const receiverName = (selectedReceipt.Payment_Receiver && selectedReceipt.Payment_Receiver !== '-')
          ? selectedReceipt.Payment_Receiver
          : 'เปรมภัสสร แซ่ตั้ง';

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-[220mm] w-full border border-neutral-300 overflow-hidden my-6">
              {/* Top Action Bar */}
              <div className="p-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between no-print">
                <span className="font-bold text-black text-sm">
                  ใบเสร็จรับเงิน (ขนาด A4) - {selectedReceipt.Receipt_ID}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenReceiptWindow(selectedReceipt)}
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
                    onClick={() => setShowPrintModal(false)}
                    className="p-1.5 text-neutral-500 hover:text-black rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Exact A4 Document Layout matching Image 3 */}
              <div className="p-10 md:p-14 bg-white text-black space-y-6">
                {/* Header: Title and Shop info */}
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">ใบเสร็จรับเงิน</h1>
                    <p className="text-xs font-bold text-neutral-800 mt-3">รหัสใบเสร็จ: {selectedReceipt.Receipt_ID}</p>
                    <p className="text-xs font-bold text-neutral-800 mt-1">วันที่รับเงิน: {formatDocumentDate(receiptDate)}</p>
                  </div>
                  <div className="text-right text-xs leading-relaxed text-neutral-800">
                    <div className="font-bold text-sm">ร้านวันชัยการพิมพ์</div>
                    <div>20 ม.5 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000</div>
                    <div>โทร: 089-9354059, 080-6378246</div>
                    <div>อีเมล: siripen122512@gmail.com</div>
                  </div>
                </div>

                {/* Customer Section with divider lines */}
                <div className="border-t border-b border-neutral-400 py-3 space-y-1">
                  <div className="font-bold text-xs text-neutral-900">นามลูกค้า: {customerCompany}</div>
                  <div className="font-bold text-xs text-neutral-900">ที่อยู่ลูกค้า : {customerAddress}</div>
                </div>

                {/* Items Table */}
                <table className="w-full text-xs border border-neutral-300 border-collapse">
                  <thead>
                    <tr className="bg-black text-white font-bold">
                      <th className="py-2.5 px-3 text-center w-12 border-r border-neutral-700">ลำดับ</th>
                      <th className="py-2.5 px-3 text-left w-28 border-r border-neutral-700">รหัสสินค้า</th>
                      <th className="py-2.5 px-3 text-left border-r border-neutral-700">รายการ</th>
                      <th className="py-2.5 px-3 text-center w-20 border-r border-neutral-700">จำนวน</th>
                      <th className="py-2.5 px-3 text-center w-16 border-r border-neutral-700">หน่วย</th>
                      <th className="py-2.5 px-3 text-right w-24 border-r border-neutral-700">ราคา/หน่วย</th>
                      <th className="py-2.5 px-3 text-right w-28">ราคารวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-neutral-200">
                        <td className="py-2.5 px-3 text-center border-r border-neutral-200">{idx + 1}.</td>
                        <td className="py-2.5 px-3 text-left border-r border-neutral-200 font-medium">{item.id}</td>
                        <td className="py-2.5 px-3 text-left border-r border-neutral-200">{item.name}</td>
                        <td className="py-2.5 px-3 text-center border-r border-neutral-200">{item.qty.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center border-r border-neutral-200">{item.unit}</td>
                        <td className="py-2.5 px-3 text-right border-r border-neutral-200">{item.unitPrice.toLocaleString()}.-</td>
                        <td className="py-2.5 px-3 text-right font-medium">{(item.total || item.qty * item.unitPrice).toLocaleString()}.-</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Total Section */}
                <div className="flex justify-end pt-3">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-xs text-neutral-900">จำนวนที่ต้องชำระทั้งสิ้น:</span>
                    <div className="bg-[#E0E0E0] px-8 py-2 font-bold text-sm text-black">
                      {calculatedTotal.toLocaleString()}.-
                    </div>
                  </div>
                </div>

                {/* Signature Section: ไม่ต้องมีลายเซ็น ให้เว้นไว้ */}
                <div className="flex justify-end pt-12 pr-6">
                  <div className="text-center w-48 space-y-2">
                    <div className="h-16"></div>
                    <div className="border-b border-neutral-500 w-full"></div>
                    <p className="font-bold text-xs text-black pt-1">{receiverName}</p>
                    <p className="text-[11px] text-neutral-600">ผู้รับเงิน</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
