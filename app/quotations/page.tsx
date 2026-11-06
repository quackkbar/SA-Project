'use client';

import React, { useState, useEffect, Suspense } from 'react';
import {
  ArrowLeftCircle,
  Printer,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Search,
  FileText,
  X,
  XCircle,
  Edit3,
  Calendar,
} from 'lucide-react';
import {
  getStoredOrders,
  saveStoredOrders,
  getStoredQuotations,
  saveStoredQuotations,
  StorageOrderRecord,
  StorageQuotationRecord,
  StorageQuotationItem,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, isoDateForInput } from '@/lib/dateUtils';

interface QuoteCreateItem {
  id: string; // Quotation detail ID
  productId?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  printType?: string;
  paperType?: string;
  paperSize?: string;
  paperColor?: string;
  description?: string;
}

function QuotationsContent() {
  // Navigation views:
  // 'list'              : Main quotations list
  // 'view_detail'       : Quotation detail (read-only info, change status via 3 buttons, back to 'list')
  // 'select_order'      : Select unquoted order
  // 'create_quotation'  : Create quotation (starts at Pending, single save button at bottom)
  // 'edit_list'         : List of quotations with status 'Under Revision' only
  // 'edit_form'         : Edit quotation (only price, quantity, unit, name editable -> status becomes Pending)
  // 'print'             : A4 Print preview
  const [currentView, setCurrentView] = useState<
    'list' | 'view_detail' | 'select_order' | 'create_quotation' | 'edit_list' | 'edit_form' | 'print'
  >('list');

  // Stored Data
  const [quotations, setQuotations] = useState<StorageQuotationRecord[]>([]);
  const [orders, setOrders] = useState<StorageOrderRecord[]>([]);

  // Selected Quotation for View Detail or Edit Form
  const [selectedQuotation, setSelectedQuotation] = useState<StorageQuotationRecord | null>(null);

  // Create Quotation State
  const [selectedOrderForQuote, setSelectedOrderForQuote] = useState<StorageOrderRecord | null>(null);
  const [newQuoteId, setNewQuoteId] = useState('');
  const [newQuoteDate, setNewQuoteDate] = useState('');
  const [newQuoteItems, setNewQuoteItems] = useState<QuoteCreateItem[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Edit Quotation State (only unitPrice, quantity, unit, name are editable)
  const [editLineItems, setEditLineItems] = useState<StorageQuotationItem[]>([]);

  // Search in Select Order view
  const [orderSearchText, setOrderSearchText] = useState('');

  // Notification Toast
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load from localStorage on mount and when view changes
  useEffect(() => {
    loadData();
  }, [currentView]);

  const loadData = () => {
    const storedQuotes = getStoredQuotations();
    setQuotations(storedQuotes);
    const storedOrd = getStoredOrders();
    setOrders(storedOrd);
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ----------------------------------------------------
  // WORKFLOW 1: View Quotation Details (from main list)
  // ----------------------------------------------------
  // Requirement:
  // เมื่อเลือกใบเสนอราคาแสดงรายละเอียดใบเสนอราคา เปลี่ยนได้แค่สถานะซึ่งเป็นปุ่ม:
  // - "ปฏิเสธ" (สภานะของใบเสนอราคา=Rejected, สถานะคำสั่งซื้อ=Quotation_Rejected)
  // - "ต้องการแก้ไข" (สภานะของใบเสนอราคา=Under Revision, สถานะคำสั่งซื้อ=Quotation_Under_Revision)
  // - "อนุมัติ" (สภานะของใบเสนอราคา=Completed, สถานะคำสั่งซื้อ=Quotation_Completed)
  // ไม่มีการเปลี่ยนราคาสินค้าและวันที่
  // เมื่อกดปุ่มย้อนกลับหรือลูกศรให้กลับมาที่หน้าใบเสนอราคาเลย ไม่ไปหน้าแก้ไขใบเสนอราคา
  const handleSelectQuotationForView = (q: StorageQuotationRecord) => {
    setSelectedQuotation(q);
    setCurrentView('view_detail');
  };

  const handleUpdateQuotationStatus = (
    newQuoteStatus: 'Rejected' | 'Under Revision' | 'Completed',
    newOrderStatus: 'Quotation_Rejected' | 'Quotation_Under_Revision' | 'Quotation_Completed',
    actionLabel: string
  ) => {
    if (!selectedQuotation) return;

    const updatedQuotations = quotations.map((q) =>
      q.Quotation_ID === selectedQuotation.Quotation_ID
        ? { ...q, Quotation_Status: newQuoteStatus }
        : q
    );
    setQuotations(updatedQuotations);
    saveStoredQuotations(updatedQuotations);

    if (selectedQuotation.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedQuotation.Sales_Order_ID
          ? { ...o, Order_Status: newOrderStatus }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    // Update local selected state
    setSelectedQuotation({ ...selectedQuotation, Quotation_Status: newQuoteStatus });

    showNotification(
      'success',
      `เปลี่ยนสถานะใบเสนอราคา ${selectedQuotation.Quotation_ID} เป็น "${actionLabel}" เรียบร้อยแล้ว`
    );
    // Return directly to quotation list
    setCurrentView('list');
  };

  // ----------------------------------------------------
  // WORKFLOW 2: Create Quotation from Existing Unquoted Order
  // ----------------------------------------------------
  // Filter orders that do not have a quotation yet
  const quotedOrderIds = new Set(quotations.map((q) => q.Sales_Order_ID).filter(Boolean));
  const unquotedOrders = orders.filter(
    (o) => !quotedOrderIds.has(o.Sales_Order_ID) && o.Order_Status !== 'Quotation_Completed'
  );

  const filteredUnquotedOrders = unquotedOrders.filter((o) => {
    if (!orderSearchText.trim()) return true;
    const term = orderSearchText.toLowerCase();
    return (
      o.Sales_Order_ID.toLowerCase().includes(term) ||
      o.Company_Name.toLowerCase().includes(term) ||
      o.Customer_Name.toLowerCase().includes(term)
    );
  });

  const handleStartCreateQuotation = () => {
    loadData();
    setOrderSearchText('');
    setCurrentView('select_order');
  };

  const handleSelectOrderForQuotation = (order: StorageOrderRecord) => {
    setSelectedOrderForQuote(order);
    // Auto-generate suggested unique quotation ID (user can still edit it)
    let generatedQuoteId = '';
    do {
      generatedQuoteId = `QU${Math.floor(100 + Math.random() * 900)}A`;
    } while (quotations.some((q) => q.Quotation_ID.toLowerCase() === generatedQuoteId.toLowerCase()));
    setNewQuoteId(generatedQuoteId);
    setNewQuoteDate(formatDocumentDate(order.Order_Date) || order.Order_Date);

    // Gather existing quotation detail IDs to avoid duplicates
    const existingDetailIds = new Set<string>();
    quotations.forEach((q) =>
      (q.items || []).forEach((it) => it.id && existingDetailIds.add(it.id.trim().toLowerCase()))
    );

    // Populate line items from the order with auto-generated unique detail IDs (matching QDA0001, QDA0002...)
    const itemsToQuote: QuoteCreateItem[] = (order.items || []).map((it, idx) => {
      let detailId = `QDA${String(idx + 1).padStart(4, '0')}`;
      if (existingDetailIds.has(detailId.toLowerCase())) {
        let counter = idx + 1;
        do {
          counter++;
          detailId = `QDA${String(counter).padStart(4, '0')}`;
        } while (existingDetailIds.has(detailId.toLowerCase()));
      }
      existingDetailIds.add(detailId.toLowerCase());

      return {
        id: detailId,
        productId: it.id,
        name: it.name || 'งานพิมพ์',
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'ชิ้น',
        unitPrice: it.unitPrice || 0,
        printType: it.printType,
        paperType: it.paperType,
        paperSize: it.paperSize,
        paperColor: it.paperColor,
        description: it.description,
      };
    });
    setNewQuoteItems(itemsToQuote);
    setFormDirty(false); // Clean initial state
    setShowConfirmModal(false);
    setCurrentView('create_quotation');
  };

  const handleNewItemIdChange = (index: number, val: string) => {
    setFormDirty(true);
    setNewQuoteItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, id: val } : item))
    );
  };

  const handleNewItemPriceChange = (index: number, val: string) => {
    setFormDirty(true);
    const num = parseFloat(val);
    setNewQuoteItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, unitPrice: isNaN(num) ? 0 : num } : item))
    );
  };

  const calculateCreateTotal = () => {
    return newQuoteItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0), 0);
  };

  // Requirement:
  // - หน้าสร้างใบเสนอราคาให้มีปุ่มยืนยันตรงกลาง
  // - เมื่อกดยืนยันค่อยให้กรอกรหัสใบเสนอราคา และเลือกวันที่ ใน Modal
  // - วันที่เช็คแค่ไม่เกินวันสั่งคำสั่งซื้อพอ
  // - เช็ครหัสห้ามซ้ำ และข้อมูลห้ามว่าง
  // - จากนั้นค่อยไปหน้ารายละเอียดของใบเสนอราคานั้น ๆ
  const handleStartConfirmQuotation = () => {
    if (newQuoteItems.length === 0) {
      showNotification('error', 'สร้างไม่สำเร็จ: คำสั่งซื้อนี้ไม่มีรายการสินค้า');
      return;
    }

    const allExistingDetailIds = new Set<string>();
    quotations.forEach((q) =>
      (q.items || []).forEach((item) => item.id && allExistingDetailIds.add(item.id.trim().toLowerCase()))
    );

    const usedInCurrent = new Set<string>();
    for (let i = 0; i < newQuoteItems.length; i++) {
      const it = newQuoteItems[i];
      const trimmedDetailId = (it.id || '').trim();
      if (!trimmedDetailId) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: กรุณากรอกรหัสรายการใบเสนอราคาของสินค้า "${it.name}" (ลำดับที่ ${i + 1})`
        );
        return;
      }
      if (usedInCurrent.has(trimmedDetailId.toLowerCase())) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: รหัสรายการใบเสนอราคา "${trimmedDetailId}" ซ้ำกับรายการอื่นในใบเสนอราคานี้`
        );
        return;
      }
      if (allExistingDetailIds.has(trimmedDetailId.toLowerCase())) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: รหัสรายการใบเสนอราคา "${trimmedDetailId}" ซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
        );
        return;
      }
      usedInCurrent.add(trimmedDetailId.toLowerCase());

      // Requirement: ราคาของสินค้าต้องมีค่ามากกว่า 0
      if (!it.unitPrice || it.unitPrice <= 0) {
        showNotification(
          'error',
          `สร้างไม่สำเร็จ: กรุณากรอกราคาต่อหน่วยของสินค้า "${it.name}" (ลำดับที่ ${i + 1}) ให้ถูกต้อง (มากกว่า 0)`
        );
        return;
      }
    }

    // Ensure quotation ID and date are prefilled
    if (!newQuoteId.trim()) {
      let generatedQuoteId = '';
      do {
        generatedQuoteId = `QU${Math.floor(100 + Math.random() * 900)}A`;
      } while (quotations.some((q) => q.Quotation_ID.toLowerCase() === generatedQuoteId.toLowerCase()));
      setNewQuoteId(generatedQuoteId);
    }
    if (!newQuoteDate.trim() && selectedOrderForQuote) {
      setNewQuoteDate(formatDocumentDate(selectedOrderForQuote.Order_Date));
    } else if (newQuoteDate.trim()) {
      setNewQuoteDate(formatDocumentDate(newQuoteDate));
    }

    setShowConfirmModal(true);
  };

  const handleSaveNewQuotation = () => {
    if (!selectedOrderForQuote) return;

    const trimmedQuoteId = newQuoteId.trim();
    if (!trimmedQuoteId) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสใบเสนอราคา');
      return;
    }

    // Entity uniqueness check for Quotation_ID
    const isDuplicate = quotations.some(
      (q) => q.Quotation_ID.trim().toLowerCase() === trimmedQuoteId.toLowerCase()
    );
    if (isDuplicate) {
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: รหัสใบเสนอราคา "${trimmedQuoteId}" ซ้ำกับใบเสนอราคาที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }

    if (!newQuoteDate.trim()) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณาระบุวันที่ออกใบเสนอราคา');
      return;
    }

    const isoQuote = isoDateForInput(newQuoteDate);
    const isoOrder = isoDateForInput(selectedOrderForQuote.Order_Date);
    if (!isoQuote) {
      showNotification(
        'error',
        'สร้างไม่สำเร็จ: รูปแบบวันที่ออกใบเสนอราคาไม่ถูกต้อง กรุณาระบุในรูปแบบ วว/ดด/ปปปป (เช่น 15/06/2569)'
      );
      return;
    }

    // Requirement: ไม่เอาวันที่ที่เก่ากว่าคำสั่งซื้อ ไม่ใช่ใหม่กว่า
    // วันที่ออกใบเสนอราคาต้องไม่เก่ากว่าวันที่สั่งซื้อ (isoQuote >= isoOrder)
    if (isoQuote && isoOrder && isoQuote < isoOrder) {
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: วันที่ออกใบเสนอราคา (${formatDocumentDate(newQuoteDate)}) ต้องไม่เก่ากว่าวันที่สั่งซื้อ (${formatDocumentDate(selectedOrderForQuote.Order_Date)})`
      );
      return;
    }

    const grandTotal = calculateCreateTotal();
    const formattedQuoteDate = formatDocumentDate(newQuoteDate) || newQuoteDate.trim();

    // Requirement: สถานะใบเสนอราคาต้องเริ่มที่ Pending
    const newRecord: StorageQuotationRecord = {
      Quotation_ID: trimmedQuoteId,
      Sales_Order_ID: selectedOrderForQuote.Sales_Order_ID,
      Company_Name: selectedOrderForQuote.Company_Name,
      Customer_Name: selectedOrderForQuote.Customer_Name,
      Customer_Phone: selectedOrderForQuote.Customer_Phone,
      Customer_Address: selectedOrderForQuote.Customer_Address,
      Quotation_Date: formattedQuoteDate,
      Quotation_Status: 'Pending',
      items: newQuoteItems.map((it) => ({
        id: it.id.trim(),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
      })),
      Total_Amount: grandTotal,
    };

    const updatedQuotations = [newRecord, ...quotations];
    setQuotations(updatedQuotations);
    saveStoredQuotations(updatedQuotations);

    // Update order status to Quotation_Pending
    const currentOrders = getStoredOrders();
    const updatedOrders = currentOrders.map((o) =>
      o.Sales_Order_ID === selectedOrderForQuote.Sales_Order_ID
        ? { ...o, Order_Status: 'Quotation_Pending' }
        : o
    );
    setOrders(updatedOrders);
    saveStoredOrders(updatedOrders);

    setShowConfirmModal(false);
    setFormDirty(false);
    showNotification(
      'success',
      `บันทึกใบเสนอราคา ${newRecord.Quotation_ID} สำเร็จเรียบร้อย (สถานะ: Pending)`
    );

    // Requirement: จากนั้นค่อยไปหน้ารายละเอียดของใบเสนอราคานั้น ๆ
    setSelectedQuotation(newRecord);
    setCurrentView('view_detail');
  };

  // ----------------------------------------------------
  // WORKFLOW 3: Edit Quotation (Only for Under_Revision status)
  // ----------------------------------------------------
  // Requirement:
  // - เมื่อกดปุ่ม"แก้ไขใบเสนอราคา" ต้องแสดงใบเสนอราคาที่มีสถานะ "Under_Revision" (หรือ "Under Revision") เท่านั้น
  const underRevisionQuotations = quotations.filter(
    (q) => q.Quotation_Status === 'Under Revision' || q.Quotation_Status === 'Under_Revision'
  );

  const handleStartEditList = () => {
    loadData();
    setCurrentView('edit_list');
  };

  const handleSelectQuotationForEditForm = (q: StorageQuotationRecord) => {
    setSelectedQuotation(q);
    // Populate items: only unitPrice, quantity, unit, name are editable
    const clonedItems: StorageQuotationItem[] = (q.items && q.items.length > 0
      ? q.items
      : [{ id: 'QDX0001', name: 'งานพิมพ์', quantity: 100, unit: 'ชิ้น', unitPrice: 50 }]
    ).map((it) => ({
      id: it.id,
      name: it.name,
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'ชิ้น',
      unitPrice: Number(it.unitPrice) || 0,
    }));
    setEditLineItems(clonedItems);
    setCurrentView('edit_form');
  };

  const handleEditItemField = (
    index: number,
    field: 'name' | 'quantity' | 'unit' | 'unitPrice',
    val: string
  ) => {
    setFormDirty(true);
    setEditLineItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (field === 'quantity') {
          const num = parseInt(val, 10);
          return { ...item, quantity: isNaN(num) ? 0 : num };
        }
        if (field === 'unitPrice') {
          const num = parseFloat(val);
          return { ...item, unitPrice: isNaN(num) ? 0 : num };
        }
        return { ...item, [field]: val };
      })
    );
  };

  const calculateEditFormTotal = () => {
    return editLineItems.reduce((acc, item) => acc + (item.quantity || 0) * (item.unitPrice || 0), 0);
  };

  // Requirement:
  // - เมื่อเข้ามาแก้ไขใบเสนอราคา แก้ไขได้่แค่ราคาต่อหน่วย, จำนวนสินค้า, หน่วยและชื่อสินค้า
  // - เมื่อกดบันทึก ตรวจสอบข้อมูลไม่มีช่องไหนว่าง จึงเปลี่ยนสถานะเป็น pending
  // - ราคาของสินค้าต้องมีค่ามากกว่า 0
  const handleSaveEditedQuotationForm = () => {
    if (!selectedQuotation) return;

    if (editLineItems.length === 0) {
      showNotification('error', 'ไม่มีรายการสินค้าในใบเสนอราคา');
      return;
    }

    // Validation: no empty fields, price > 0, quantity > 0
    for (let i = 0; i < editLineItems.length; i++) {
      const it = editLineItems[i];
      const itemNum = i + 1;
      if (!it.name || !it.name.trim()) {
        showNotification('error', `กรุณากรอกชื่อสินค้าของรายการที่ ${itemNum} ให้ครบถ้วน`);
        return;
      }
      if (!it.quantity || it.quantity <= 0) {
        showNotification('error', `จำนวนสินค้าของรายการที่ ${itemNum} ต้องมีค่ามากกว่า 0`);
        return;
      }
      if (!it.unit || !it.unit.trim()) {
        showNotification('error', `กรุณากรอกหน่วยของสินค้าของรายการที่ ${itemNum} ให้ครบถ้วน`);
        return;
      }
      if (!it.unitPrice || it.unitPrice <= 0) {
        showNotification('error', `ราคาต่อหน่วยของรายการที่ ${itemNum} ต้องมีค่ามากกว่า 0`);
        return;
      }
    }

    const newTotal = calculateEditFormTotal();
    // Requirement: จึงเปลี่ยนสถานะเป็น pending
    const updatedQuotations = quotations.map((q) =>
      q.Quotation_ID === selectedQuotation.Quotation_ID
        ? {
            ...q,
            Quotation_Status: 'Pending',
            items: editLineItems,
            Total_Amount: newTotal,
          }
        : q
    );

    setQuotations(updatedQuotations);
    saveStoredQuotations(updatedQuotations);

    // Update corresponding order status to Quotation_Pending
    if (selectedQuotation.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedQuotation.Sales_Order_ID
          ? { ...o, Order_Status: 'Quotation_Pending' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    setFormDirty(false);
    showNotification(
      'success',
      `บันทึกการแก้ไขใบเสนอราคา ${selectedQuotation.Quotation_ID} สำเร็จ (เปลี่ยนสถานะเป็น Pending)`
    );
    setCurrentView('list');
  };

  const handleOpenQuoteWindow = (quote: StorageQuotationRecord | null) => {
    if (!quote) return;
    const defaultQuoteItems = [
      { id: '302CNN001', name: 'ป้ายหน้าห้องสีขาว ขนาดสั้น', quantity: 10, unit: 'ห่อ', unitPrice: 80 },
      { id: '302UMD001', name: 'ใบรายงานการรักษาพยาบาลผู้ป่วยนอก', quantity: 200, unit: 'เล่ม', unitPrice: 40 },
      { id: '302OPD001', name: 'ใบรับรองแพทย์', quantity: 1000, unit: 'เล่ม', unitPrice: 120 },
      { id: '302CMN010', name: 'บัตรนัดผู้ป่วยสีฟ้า', quantity: 30, unit: 'ห่อ', unitPrice: 125 },
      { id: '301AFN010', name: 'ซองสีน้ำตาล', quantity: 1000, unit: 'ซอง', unitPrice: 4 },
      { id: '301AFN008', name: 'ซองสีน้ำตาลขนาดข้าง', quantity: 1000, unit: 'ซอง', unitPrice: 8 },
      { id: '301AFN001', name: 'ซองสีขาว', quantity: 20, unit: 'กล่อง', unitPrice: 400 },
      { id: '303AMD009', name: 'กระดาษหัวจดหมายโรงพยาบาลเอกชล', quantity: 30, unit: 'ห่อ', unitPrice: 100 },
      { id: '302BTN001', name: 'แบบฟอร์มวัดปรอทผู้ใหญ่', quantity: 40, unit: 'เล่ม', unitPrice: 80 },
      { id: '302BIN002', name: 'INTAKE OUT PUT', quantity: 30, unit: 'เล่ม', unitPrice: 70 },
      { id: '302BDN001', name: 'DOCTOR VISIT', quantity: 100, unit: 'เล่ม', unitPrice: 50 },
      { id: '302BDN002', name: 'DOCTOR ORDER SHEET', quantity: 100, unit: 'เล่ม', unitPrice: 50 },
      { id: '302BBK001', name: 'BLOOD BANK GROUP AB', quantity: 5, unit: 'ห่อ', unitPrice: 120 },
      { id: '302BBK002', name: 'BLOOD BANK GROUP O', quantity: 5, unit: 'ห่อ', unitPrice: 120 },
      { id: '302BBK003', name: 'BLOOD BANK GROUP B', quantity: 5, unit: 'ห่อ', unitPrice: 120 },
      { id: '302BBK004', name: 'BLOOD BANK GROUP A', quantity: 5, unit: 'ห่อ', unitPrice: 120 },
    ];

    const quoteItems = (quote.items && quote.items.length > 0)
      ? quote.items
      : defaultQuoteItems;

    const calculatedTotal =
      quote.Total_Amount ||
      quoteItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0), 0);

    const rowsHtml = quoteItems.map((item, idx) => `
      <tr class="border-b border-neutral-200">
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${idx + 1}.</td>
        <td class="py-2.5 px-3 text-left border-r border-neutral-200 font-medium">${item.id}</td>
        <td class="py-2.5 px-3 text-left border-r border-neutral-200">${item.name}</td>
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${item.quantity.toLocaleString()}</td>
        <td class="py-2.5 px-3 text-center border-r border-neutral-200">${item.unit}</td>
        <td class="py-2.5 px-3 text-right border-r border-neutral-200">${item.unitPrice.toLocaleString()}.-</td>
        <td class="py-2.5 px-3 text-right font-medium">${(item.quantity * item.unitPrice).toLocaleString()}.-</td>
      </tr>
    `).join('');

    const docHtml = `
      <div class="space-y-6 text-sm text-black">
        <div class="flex justify-between items-start">
          <div>
            <h1 class="text-4xl font-extrabold tracking-tight">ใบเสนอราคา</h1>
            <p class="text-xs font-bold text-neutral-800 mt-3">รหัสใบเสนอราคา: ${quote.Quotation_ID}</p>
            <p class="text-xs font-bold text-neutral-800 mt-1">วันที่: ${formatDocumentDate(quote.Quotation_Date)}</p>
          </div>
          <div class="text-right text-xs leading-relaxed text-neutral-800">
            <div class="font-bold text-sm">ร้านวันชัยการพิมพ์</div>
            <div>20 ม.5 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000</div>
            <div>โทร: 089-9354059, 080-6378246</div>
            <div>อีเมล: siripen122512@gmail.com</div>
          </div>
        </div>

        <div class="border-t border-b border-neutral-400 py-2.5">
          <span class="font-bold text-xs text-neutral-900">นามลูกค้า: ${quote.Company_Name}</span>
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
            <span class="font-bold text-xs text-neutral-900">ยอดรวมทั้งหมด:</span>
            <div class="bg-[#E0E0E0] px-8 py-2 font-bold text-sm text-black">
              ${calculatedTotal.toLocaleString()}.-
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-8 pr-6">
          <div class="text-center w-48 space-y-2">
            <div class="h-16"></div>
            <div class="border-b border-neutral-500 w-full"></div>
            <p class="font-bold text-xs text-black pt-1">เปรมภัสสร แซ่ตั้ง</p>
            <p class="text-[11px] text-neutral-600">ผู้ออกใบเสนอราคา</p>
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
            <title>ใบเสนอราคา - ${quote.Quotation_ID}</title>
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
              <span class="font-bold text-sm">ใบเสนอราคา: ${quote.Quotation_ID}</span>
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

      {/* =========================================================================
          VIEW 1: รายการใบเสนอราคา (Main List matching Figma node 128:1128)
          ========================================================================= */}
      {currentView === 'list' && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <h1 className="text-3xl font-bold tracking-tight text-black">ใบเสนอราคา</h1>

            <div className="flex items-center gap-4">
              <button
                onClick={handleStartEditList}
                className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                แก้ไขใบเสนอราคา
              </button>

              <button
                onClick={handleStartCreateQuotation}
                className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg flex items-center gap-2"
              >
                <FileCheck className="w-4 h-4" />
                สร้างใบเสนอราคา
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              {/* Header Capsule */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสใบเสนอราคา</div>
                <div className="col-span-3">คำสั่งซื้ออ้างอิง</div>
                <div className="col-span-3">ชื่อบริษัท</div>
                <div className="col-span-2">วันที่ออกใบเสนอราคา</div>
                <div className="col-span-1 text-right">สถานะ</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-1">
                {quotations.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ยังไม่มีข้อมูลใบเสนอราคา กดปุ่ม &quot;สร้างใบเสนอราคา&quot; เพื่อเริ่มต้น
                  </div>
                ) : (
                  quotations.map((q) => (
                    <div
                      key={q.Quotation_ID}
                      onClick={() => handleSelectQuotationForView(q)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black/40 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-3 font-semibold text-black group-hover:text-neutral-600 transition-colors">
                        {q.Quotation_ID}
                      </div>
                      <div className="col-span-3 text-neutral-600 font-mono text-xs">
                        {q.Sales_Order_ID || '-'}
                      </div>
                      <div className="col-span-3 text-neutral-800 font-medium">{q.Company_Name}</div>
                      <div className="col-span-2 text-neutral-600">{formatDocumentDate(q.Quotation_Date)}</div>
                      <div className="col-span-1 text-right">
                        <span className="text-xs font-medium text-black">
                          {q.Quotation_Status}
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

      {/* =========================================================================
          VIEW 2: แสดงรายละเอียดใบเสนอราคา (Requirement: เปลี่ยนได้แค่ 3 สถานะ ปฏิเสธ, ต้องการแก้ไข, อนุมัติ)
          ========================================================================= */}
      {currentView === 'view_detail' && selectedQuotation && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('list')}
                className="text-black hover:opacity-70 transition-opacity"
                title="กลับหน้าใบเสนอราคา"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  รายละเอียดใบเสนอราคา: {selectedQuotation.Quotation_ID}
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  สถานะปัจจุบัน:{' '}
                  <span className="font-semibold text-black">
                    {selectedQuotation.Quotation_Status}
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleOpenQuoteWindow(selectedQuotation)}
              className="px-6 py-2.5 border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-800 hover:bg-neutral-100 inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> ดูเอกสาร
            </button>
          </div>

          {/* Read-Only Details Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลทั่วไป (Read-only) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>ข้อมูลใบเสนอราคา</span>
                <span className="text-xs text-neutral-300">
                  คำสั่งซื้ออ้างอิง: {selectedQuotation.Sales_Order_ID || '-'}
                </span>
              </div>
              <div className="p-6 bg-white grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">รหัสใบเสนอราคา</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800">
                    {selectedQuotation.Quotation_ID}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">วันที่ออกใบเสนอราคา</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {formatDocumentDate(selectedQuotation.Quotation_Date)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ชื่อบริษัท</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedQuotation.Company_Name}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลลูกค้า (Read-only) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลลูกค้า</div>
              <div className="p-6 bg-white grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ชื่อผู้สั่งซื้อ / ติดต่อ</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedQuotation.Customer_Name || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">เบอร์โทรศัพท์</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedQuotation.Customer_Phone || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ที่อยู่</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedQuotation.Customer_Address || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: รายการสินค้า (Read-only) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>รายการสินค้าและราคา</span>
                <span className="text-xs text-neutral-300">
                  {(selectedQuotation.items || []).length} รายการ
                </span>
              </div>
              <div className="p-6 bg-white space-y-3">
                {(selectedQuotation.items || []).map((item, idx) => {
                  const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
                  return (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-white border border-neutral-200/80 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
                    >
                      <div className="md:col-span-2">
                        <span className="text-[11px] text-neutral-400 block mb-1">รหัสรายการ</span>
                        <div className="px-3 py-1.5 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-mono font-medium">
                          {item.id}
                        </div>
                      </div>
                      <div className="md:col-span-4">
                        <span className="text-[11px] text-neutral-400 block mb-1">ชื่อสินค้า</span>
                        <div className="px-3 py-1.5 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-semibold text-black">
                          {item.name}
                        </div>
                      </div>
                      <div className="md:col-span-2 text-center">
                        <span className="text-[11px] text-neutral-400 block mb-1">จำนวน</span>
                        <div className="px-3 py-1.5 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-bold">
                          {item.quantity.toLocaleString()} {item.unit}
                        </div>
                      </div>
                      <div className="md:col-span-2 text-right">
                        <span className="text-[11px] text-neutral-400 block mb-1">ราคาต่อหน่วย</span>
                        <div className="px-3 py-1.5 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-800">
                          {item.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                        </div>
                      </div>
                      <div className="md:col-span-2 text-right">
                        <span className="text-[11px] text-neutral-400 block mb-1">ราคารวม</span>
                        <div className="px-3 py-1.5 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-extrabold text-black font-mono">
                          {lineTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 4: สรุปยอดรวม (Read-only) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">สรุปยอดรวม</div>
              <div className="p-6 bg-white flex flex-wrap items-center justify-between gap-6">
                <div>
                  <span className="text-sm text-neutral-600 block mb-1">สถานะใบเสนอราคา:</span>
                  <span className="text-sm font-semibold text-black">
                    {selectedQuotation.Quotation_Status}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-neutral-600 block mb-1 text-right">ยอดราคารวมทั้งสิ้น:</span>
                  <div className="text-2xl font-black text-black font-mono">
                    {((selectedQuotation.items || []).reduce(
                      (acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0),
                      0
                    )).toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}
                    บาท
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions:
                Requirement:
                - เมื่อเลือกใบเสนอราคาแสดงรายละเอียดใบเสนอราคา เปลี่ยนได้แค่สถานะซึ่งเป็นปุ่ม:
                  1. "ปฏิเสธ" (สภานะของใบเสนอราคา=Rejected, สถานะคำสั่งซื้อ=Quotation_Rejected)
                  2. 'ต้องการแก้ไข' (สภานะของใบเสนอราคา=Under Revision, สถานะคำสั่งซื้อ=Quotation_Under_Revision)
                  3. 'อนุมัติ' (สภานะของใบเสนอราคา=Completed, สถานะคำสั่งซื้อ=Quotation_Completed)
                - เมื่อกดปุ่มย้อนกลับหรือลูกศรให้กลับมาที่หน้าใบเสนอราคาเลย ไม่ไปหน้าแก้ไขใบเสนอราคา
            */}
            {/* Bottom Actions:
                Requirement: รายละเอียดใบเสนอราคามีปุ่มได้แค่ pending
            */}
            {selectedQuotation.Quotation_Status === 'Pending' && (
              <div className="pt-6 pb-12 flex justify-end gap-4 border-t border-neutral-200">
                {/* ปุ่ม ปฏิเสธ (สีดำ) */}
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateQuotationStatus('Rejected', 'Quotation_Rejected', 'ปฏิเสธ')
                  }
                  className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  ปฏิเสธ
                </button>

                {/* ปุ่ม ต้องการแก้ไข (สีดำ) */}
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateQuotationStatus(
                      'Under Revision',
                      'Quotation_Under_Revision',
                      'ต้องการแก้ไข'
                    )
                  }
                  className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  ต้องการแก้ไข
                </button>

                {/* ปุ่ม อนุมัติ (สีดำ) */}
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateQuotationStatus('Completed', 'Quotation_Completed', 'อนุมัติ')
                  }
                  className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  อนุมัติ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 3: เลือกคำสั่งซื้อสำหรับสร้างใบเสนอราคา
          ========================================================================= */}
      {currentView === 'select_order' && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('list')}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  เลือกคำสั่งซื้อสำหรับสร้างใบเสนอราคา
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  เลือกคำสั่งซื้อที่ยังไม่มีใบเสนอราคา เพื่อกรอกราคาของแต่ละสินค้า
                </p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-80">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={orderSearchText}
                onChange={(e) => setOrderSearchText(e.target.value)}
                placeholder="ค้นหารหัสคำสั่งซื้อ หรือชื่อบริษัท..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสคำสั่งซื้อ</div>
                <div className="col-span-3">ชื่อบริษัท</div>
                <div className="col-span-3">ผู้สั่งซื้อ / เบอร์โทร</div>
                <div className="col-span-2">วันที่สั่งซื้อ</div>
                <div className="col-span-1 text-right">จำนวนสินค้า</div>
              </div>

              <div className="space-y-3 pt-1">
                {filteredUnquotedOrders.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <FileText className="w-12 h-12 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold text-neutral-800">
                      ไม่พบคำสั่งซื้อที่รอสร้างใบเสนอราคา
                    </div>
                    <div className="text-xs text-neutral-500 max-w-md mx-auto">
                      คำสั่งซื้อทั้งหมดมีใบเสนอราคาแล้ว หรือยังไม่ได้สร้างคำสั่งซื้อใหม่ในระบบ
                    </div>
                  </div>
                ) : (
                  filteredUnquotedOrders.map((order) => (
                    <div
                      key={order.Sales_Order_ID}
                      onClick={() => handleSelectOrderForQuotation(order)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black hover:bg-neutral-50 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-3 font-bold text-black flex items-center gap-2">
                        <span className="group-hover:text-neutral-600 transition-colors">
                          {order.Sales_Order_ID}
                        </span>
                      </div>
                      <div className="col-span-3 text-neutral-800 font-medium">
                        {order.Company_Name}
                      </div>
                      <div className="col-span-3 text-neutral-600">
                        <div>{order.Customer_Name}</div>
                        <div className="text-xs text-neutral-400">{order.Customer_Phone}</div>
                      </div>
                      <div className="col-span-2 text-neutral-600">{formatDocumentDate(order.Order_Date)}</div>
                      <div className="col-span-1 text-right font-semibold text-black">
                        {(order.items || []).length} รายการ
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 4: สร้างใบเสนอราคา / กำหนดราคาของแต่ละสินค้า
          Requirement:
          - หน้าสร้างใบเสนอราคา รูปแบบเป็นไปตามภาพ media_1793943793504_a41f1137.png
          - เมื่อกดยืนยันค่อยให้กรอกรหัสใบเสนอราคา และเลือกวันที่
          - จากนั้นค่อยไปหน้ารายละเอียดของใบเสนอราคานั้น ๆ
          - วันที่เช็คแค่ไม่เกินวันสั่งคำสั่งซื้อพอ อย่าลืมเช็ครหัสห้ามซ้ำ และข้อมูลห้ามว่าง
          ========================================================================= */}
      {currentView === 'create_quotation' && selectedOrderForQuote && (
        <div className="min-h-screen bg-[#FDFBF7]">
          {/* Top Title Bar */}
          <div className="px-10 py-6 border-b border-neutral-200">
            <h1 className="text-2xl font-bold tracking-tight text-black">สร้างใบเสนอราคา</h1>
          </div>

          {/* Main Layout Area */}
          <div className="p-8 max-w-6xl mx-auto flex items-start gap-4">
            {/* Back Button next to the top of Card 1 */}
            <button
              type="button"
              onClick={() => {
                if (!confirmDiscardChanges()) return;
                setCurrentView('select_order');
              }}
              className="text-black hover:opacity-70 transition-opacity mt-1 shrink-0 cursor-pointer"
              title="ย้อนกลับ"
            >
              <ArrowLeftCircle className="w-8 h-8" />
            </button>

            {/* Right Form Cards */}
            <div className="flex-1 space-y-6">
              {/* Card 1: ข้อมูลคำสั่งซื้อ */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-6 py-3 font-bold text-base">
                  ข้อมูลคำสั่งซื้อ
                </div>
                <div className="p-6 space-y-4">
                  {/* Row 1: รหัสคำสั่งซื้อ */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-neutral-800 shrink-0 w-24">
                      รหัสคำสั่งซื้อ
                    </span>
                    <div className="flex-1 bg-[#EAE8E1] text-neutral-800 font-semibold px-4 py-2.5 rounded-xl text-sm">
                      {selectedOrderForQuote.Sales_Order_ID}
                    </div>
                  </div>

                  {/* Row 2: ชื่อบริษัท, ชื่อลูกค้า, วันที่สั่งซื้อ */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-neutral-800 shrink-0">ชื่อบริษัท</span>
                      <div className="flex-1 bg-[#EAE8E1] text-neutral-800 px-4 py-2.5 rounded-xl text-sm font-medium truncate" title={selectedOrderForQuote.Company_Name}>
                        {selectedOrderForQuote.Company_Name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-neutral-800 shrink-0">ชื่อลูกค้า</span>
                      <div className="flex-1 bg-[#EAE8E1] text-neutral-800 px-4 py-2.5 rounded-xl text-sm font-medium truncate" title={selectedOrderForQuote.Customer_Name}>
                        {selectedOrderForQuote.Customer_Name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-neutral-800 shrink-0">วันที่สั่งซื้อ</span>
                      <div className="flex-1 bg-[#EAE8E1] text-neutral-800 px-4 py-2.5 rounded-xl text-sm font-medium text-center">
                        {formatDocumentDate(selectedOrderForQuote.Order_Date)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: รายการสินค้า */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-6 py-3 font-bold text-base">
                  รายการสินค้า
                </div>
                <div className="p-6 space-y-4 max-h-[520px] overflow-y-auto">
                  {newQuoteItems.map((item, idx) => {
                    const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
                    return (
                      <div
                        key={item.productId || item.id || idx}
                        className="border border-neutral-300 rounded-2xl p-4 shadow-sm bg-white"
                      >
                        <div className="grid grid-cols-12 gap-3 items-center">
                          {/* 1. รหัสรายการใบเสนอราคา */}
                          <div className="col-span-12 sm:col-span-3">
                            <label className="text-xs text-neutral-700 font-medium block mb-1">
                              รหัสรายการใบเสนอราคา
                            </label>
                            <input
                              type="text"
                              value={item.id}
                              onChange={(e) => handleNewItemIdChange(idx, e.target.value)}
                              placeholder="เช่น QDA0001"
                              className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                            />
                          </div>

                          {/* 2. ชื่อสินค้า */}
                          <div className="col-span-12 sm:col-span-3">
                            <label className="text-xs text-neutral-700 font-medium block mb-1">
                              ชื่อสินค้า
                            </label>
                            <div
                              className="w-full bg-[#EAE8E1] text-neutral-800 px-3 py-2 rounded-xl text-sm font-medium truncate"
                              title={item.name}
                            >
                              {item.name}
                            </div>
                          </div>

                          {/* 3. จำนวน */}
                          <div className="col-span-6 sm:col-span-1">
                            <label className="text-xs text-neutral-700 font-medium block mb-1 text-center">
                              จำนวน
                            </label>
                            <div className="w-full bg-[#EAE8E1] text-neutral-800 px-2 py-2 rounded-xl text-sm font-medium text-center">
                              {item.quantity}
                            </div>
                          </div>

                          {/* 4. หน่วย */}
                          <div className="col-span-6 sm:col-span-1">
                            <label className="text-xs text-neutral-700 font-medium block mb-1 text-center">
                              หน่วย
                            </label>
                            <div className="w-full bg-[#EAE8E1] text-neutral-800 px-2 py-2 rounded-xl text-sm font-medium text-center">
                              {item.unit || 'ชิ้น'}
                            </div>
                          </div>

                          {/* 5. ราคาต่อหน่วย */}
                          <div className="col-span-6 sm:col-span-2">
                            <label className="text-xs text-neutral-700 font-medium block mb-1 text-center">
                              ราคาต่อหน่วย
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitPrice === 0 ? '' : item.unitPrice}
                              onChange={(e) => handleNewItemPriceChange(idx, e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold text-center focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                            />
                          </div>

                          {/* 6. เป็นเงิน */}
                          <div className="col-span-6 sm:col-span-2">
                            <label className="text-xs text-neutral-700 font-medium block mb-1 text-center">
                              เป็นเงิน
                            </label>
                            <div className="w-full bg-[#EAE8E1] text-neutral-800 px-2 py-2 rounded-xl text-sm font-mono font-medium text-center truncate">
                              {lineTotal > 0
                                ? lineTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })
                                : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 3: ข้อมูล */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-6 py-3 font-bold text-base">
                  ข้อมูล
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-neutral-800 shrink-0">
                      ยอดราคารวม
                    </span>
                    <div className="flex-1 bg-[#EAE8E1] text-neutral-800 px-4 py-2.5 rounded-xl text-sm font-mono font-bold text-center">
                      {calculateCreateTotal() > 0
                        ? `${calculateCreateTotal().toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-neutral-800 shrink-0">
                      สถานะใบเสนอราคา
                    </span>
                    <div className="flex-1 bg-[#EAE8E1] text-neutral-800 px-4 py-2.5 rounded-xl text-sm font-bold text-center">
                      Pending
                    </div>
                  </div>
                </div>
              </div>

              {/* Single Centered Confirm Button */}
              <div className="flex justify-center pt-2 pb-8">
                <button
                  type="button"
                  onClick={handleStartConfirmQuotation}
                  className="px-16 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-base font-bold shadow-md transition-all cursor-pointer"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>

          {/* Modal กรอกรหัสใบเสนอราคา และเลือกวันที่ (ปรากฏหลังกดยืนยัน) */}
          {showConfirmModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-neutral-300 animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">ยืนยันการสร้างใบเสนอราคา</h2>
                    <p className="text-xs text-neutral-300 mt-0.5">
                      กรุณาระบุรหัสใบเสนอราคา และวันที่ออกใบเสนอราคา
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="text-neutral-300 hover:text-white text-lg font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                  {/* Order Reference Info */}
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-xs text-neutral-700 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">คำสั่งซื้ออ้างอิง:</span>
                      <span className="font-bold text-neutral-900">{selectedOrderForQuote.Sales_Order_ID}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">ลูกค้า:</span>
                      <span className="font-semibold text-neutral-900">
                        {selectedOrderForQuote.Company_Name} ({selectedOrderForQuote.Customer_Name})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">วันที่สั่งซื้อ:</span>
                      <span className="font-semibold text-neutral-900">
                        {formatDocumentDate(selectedOrderForQuote.Order_Date)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-200 pt-1">
                      <span className="text-neutral-500">ยอดราคารวมทั้งสิ้น:</span>
                      <span className="font-bold text-black font-mono text-sm">
                        {calculateCreateTotal().toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                      </span>
                    </div>
                  </div>

                  {/* Input: รหัสใบเสนอราคา */}
                  <div>
                    <label className="text-sm font-semibold text-neutral-800 block mb-1.5">
                      รหัสใบเสนอราคา <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newQuoteId}
                      onChange={(e) => {
                        setFormDirty(true);
                        setNewQuoteId(e.target.value);
                      }}
                      placeholder="เช่น QU001A"
                      className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      * ต้องไม่ว่างและไม่ซ้ำกับใบเสนอราคาที่มีอยู่ในระบบ
                    </p>
                  </div>

                  {/* Input: วันที่ออกใบเสนอราคา (แสดงผลและรับค่า วว/ดด/ปปปป) */}
                  <div>
                    <label className="text-sm font-semibold text-neutral-800 block mb-1.5">
                      วันที่ออกใบเสนอราคา <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={newQuoteDate}
                        onChange={(e) => {
                          setFormDirty(true);
                          setNewQuoteDate(e.target.value);
                        }}
                        onBlur={() => {
                          if (newQuoteDate.trim()) {
                            const formatted = formatDocumentDate(newQuoteDate);
                            if (formatted && formatted !== '-') {
                              setNewQuoteDate(formatted);
                            }
                          }
                        }}
                        placeholder="วว/ดด/ปปปป (เช่น 15/06/2569)"
                        className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                      />
                      <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                        <input
                          type="date"
                          min={isoDateForInput(selectedOrderForQuote.Order_Date) || undefined}
                          value={isoDateForInput(newQuoteDate)}
                          onChange={(e) => {
                            setFormDirty(true);
                            if (e.target.value) {
                              setNewQuoteDate(formatDocumentDate(e.target.value));
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                          title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                        />
                        <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      * รูปแบบ วว/ดด/ปปปป (ต้องไม่เก่ากว่าวันที่สั่งซื้อ {formatDocumentDate(selectedOrderForQuote.Order_Date)})
                    </p>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="px-5 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-xl text-sm font-semibold transition-all cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewQuotation}
                    className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer"
                  >
                    บันทึกใบเสนอราคา
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 5: แก้ไขใบเสนอราคา - รายการ
          Requirement: เมื่อกดปุ่ม"แก้ไขใบเสนอราคา" ต้องแสดงใบเสนอราคาที่มีสถานะ "Under_Revision" เท่านั้น
          ========================================================================= */}
      {currentView === 'edit_list' && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('list')}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">แก้ไขใบเสนอราคา</h1>
                <p className="text-sm text-neutral-500 mt-1">
                  แสดงเฉพาะใบเสนอราคาที่มีสถานะต้องการแก้ไข (Under Revision)
                </p>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสใบเสนอราคา</div>
                <div className="col-span-4">ชื่อบริษัท</div>
                <div className="col-span-3">วันที่ออกใบเสนอราคา</div>
                <div className="col-span-2 text-right">สถานะใบเสนอราคา</div>
              </div>

              <div className="space-y-3 pt-1">
                {underRevisionQuotations.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <FileText className="w-12 h-12 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold text-neutral-800">
                      ไม่พบใบเสนอราคาที่มีสถานะต้องการแก้ไข (Under Revision)
                    </div>
                    <div className="text-xs text-neutral-500 max-w-md mx-auto">
                      ใบเสนอราคาในระบบไม่มีรายการที่รอการแก้ไข สามารถกลับไปที่หน้ารายการหลักได้
                    </div>
                  </div>
                ) : (
                  underRevisionQuotations.map((q) => (
                    <div
                      key={q.Quotation_ID}
                      onClick={() => handleSelectQuotationForEditForm(q)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black/40 hover:bg-neutral-50 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-3 font-semibold text-black group-hover:text-neutral-600 transition-colors">
                        {q.Quotation_ID}
                      </div>
                      <div className="col-span-4 text-neutral-800">{q.Company_Name}</div>
                      <div className="col-span-3 text-neutral-600">{formatDocumentDate(q.Quotation_Date)}</div>
                      <div className="col-span-2 text-right">
                        <span className="text-xs font-medium text-black">
                          {q.Quotation_Status}
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

      {/* =========================================================================
          VIEW 6: ฟอร์มแก้ไขใบเสนอราคา
          Requirement:
          - เมื่อเข้ามาแก้ไขใบเสนอราคา แก้ไขได้แค่: ราคาต่อหน่วย, จำนวนสินค้า, หน่วย และชื่อสินค้า
          - เมื่อกดบันทึก ตรวจสอบข้อมูลไม่มีช่องไหนว่าง จึงเปลี่ยนสถานะเป็น pending
          ========================================================================= */}
      {currentView === 'edit_form' && selectedQuotation && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('edit_list');
                }}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  แก้ไขใบเสนอราคา: {selectedQuotation.Quotation_ID}
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  แก้ไขได้เฉพาะ: ราคาต่อหน่วย, จำนวนสินค้า, หน่วย และชื่อสินค้า
                </p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลคงที่ (Read-only) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลใบเสนอราคา</div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">
                      รหัสใบเสนอราคา
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={selectedQuotation.Quotation_ID}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อบริษัท</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedQuotation.Company_Name}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">
                      วันที่ออกใบเสนอราคา
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={formatDocumentDate(selectedQuotation.Quotation_Date)}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: รายการสินค้าที่แก้ไขได้ (ชื่อสินค้า, จำนวน, หน่วย, ราคาต่อหน่วย) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>แก้ไขรายการสินค้า</span>
                <span className="text-xs text-neutral-300">
                  {editLineItems.length} รายการ
                </span>
              </div>
              <div className="p-6 bg-white space-y-4">
                {editLineItems.map((item, idx) => {
                  const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
                  return (
                    <div
                      key={item.id || idx}
                      className="p-5 bg-white border border-neutral-300 rounded-xl shadow-sm hover:border-black/50 transition-all space-y-3"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* รหัสรายการ (Read-only) */}
                        <div className="md:col-span-2">
                          <label className="text-[11px] text-neutral-500 block mb-1 font-medium">
                            รหัสรายการ
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={item.id}
                            className="w-full px-3 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-lg text-xs font-mono font-medium text-neutral-800"
                          />
                        </div>

                        {/* ชื่อสินค้า (Editable, White) */}
                        <div className="md:col-span-4">
                          <label className="text-[11px] text-neutral-700 block mb-1 font-semibold">
                            ชื่อสินค้า *
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleEditItemField(idx, 'name', e.target.value)}
                            placeholder="ชื่อสินค้า..."
                            className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                          />
                        </div>

                        {/* จำนวน (Editable, White) */}
                        <div className="md:col-span-2">
                          <label className="text-[11px] text-neutral-700 block mb-1 font-semibold text-center">
                            จำนวน *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => handleEditItemField(idx, 'quantity', e.target.value)}
                            placeholder="จำนวน"
                            className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-lg text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                          />
                        </div>

                        {/* หน่วย (Editable, White) */}
                        <div className="md:col-span-1">
                          <label className="text-[11px] text-neutral-700 block mb-1 font-semibold text-center">
                            หน่วย *
                          </label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleEditItemField(idx, 'unit', e.target.value)}
                            placeholder="ชิ้น/เล่ม"
                            className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-lg text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                          />
                        </div>

                        {/* ราคาต่อหน่วย (Editable, White) */}
                        <div className="md:col-span-3">
                          <label className="text-[11px] text-neutral-700 block mb-1 font-semibold text-right">
                            ราคาต่อหน่วย (บาท) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                            onChange={(e) => handleEditItemField(idx, 'unitPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-white border border-neutral-300 text-black rounded-lg text-xs font-bold text-right focus:outline-none focus:ring-1 focus:ring-black shadow-inner"
                          />
                        </div>
                      </div>

                      {/* Line Total display */}
                      <div className="flex justify-end pt-2 border-t border-neutral-100">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-neutral-500 font-medium">ราคารวมรายการนี้:</span>
                          <span className="font-extrabold text-sm text-black font-mono">
                            {lineTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-neutral-500">บาท</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 3: ข้อมูล สรุปยอดและผลการแก้ไข */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">สรุปยอดรวม</div>
              <div className="p-6 bg-white flex flex-wrap items-center justify-between gap-6">
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">
                    สถานะหลังการบันทึก:
                  </span>
                  <span className="text-sm font-semibold text-black">
                    Pending (รออนุมัติรอบใหม่)
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1 text-right">
                    ยอดราคารวมทั้งสิ้น:
                  </span>
                  <div className="text-2xl font-black text-black font-mono">
                    {calculateEditFormTotal().toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    บาท
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="flex justify-center gap-6 pt-4 pb-8">
              <button
                type="button"
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('edit_list');
                }}
                className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={handleSaveEditedQuotationForm}
                className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 7: ดูเอกสาร A4 ใบเสนอราคา (Matching Uploaded Image 1)
          ========================================================================= */}
      {currentView === 'print' && selectedQuotation && (() => {
        const quoteItems = selectedQuotation.items && selectedQuotation.items.length > 0
          ? selectedQuotation.items
          : [
              { id: '302CNN001', name: 'ป้ายหน้าห้องสีขาว ขนาดสั้น', quantity: 10, unit: 'ห่อ', unitPrice: 80 },
              { id: '302UMD001', name: 'ใบรายงานการรักษาพยาบาลผู้ป่วยนอก', quantity: 200, unit: 'เล่ม', unitPrice: 40 },
              { id: '302OPD001', name: 'ใบรับรองแพทย์', quantity: 1000, unit: 'เล่ม', unitPrice: 120 },
            ];

        const calculatedTotal =
          selectedQuotation.Total_Amount ||
          quoteItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0), 0);

        return (
          <div className="p-8 bg-neutral-100 min-h-screen">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between mb-6 max-w-[210mm] mx-auto no-print">
              <button
                onClick={() => setCurrentView('view_detail')}
                className="text-black hover:opacity-70 flex items-center gap-2 text-sm font-semibold transition-opacity"
              >
                <ArrowLeftCircle className="w-6 h-6" /> กลับหน้ารายละเอียด
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenQuoteWindow(selectedQuotation)}
                  className="px-5 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-black text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  เปิดในหน้าต่างใหม่
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-6 py-2.5 bg-black text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md"
                >
                  บันทึกเอกสาร
                </button>
              </div>
            </div>

            {/* A4 Sheet Container matching Image 1 */}
            <div className="w-[210mm] min-h-[297mm] p-[18mm] bg-white border border-neutral-300 shadow-2xl mx-auto space-y-6 text-xs text-black font-sans print:border-none print:shadow-none print:m-0 print:p-0">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-4xl font-extrabold tracking-tight text-black">ใบเสนอราคา</h1>
                  <p className="text-xs font-bold text-neutral-800 mt-3">
                    รหัสใบเสนอราคา: {selectedQuotation.Quotation_ID}
                  </p>
                  <p className="text-xs font-bold text-neutral-800 mt-1">
                    วันที่: {formatDocumentDate(selectedQuotation.Quotation_Date)}
                  </p>
                </div>
                <div className="text-right text-xs leading-relaxed text-neutral-800">
                  <div className="font-bold text-sm text-black">ร้านวันชัยการพิมพ์</div>
                  <div>20 ม.5 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000</div>
                  <div>โทร: 089-9354059, 080-6378246</div>
                  <div>อีเมล: siripen122512@gmail.com</div>
                </div>
              </div>

              {/* Customer */}
              <div className="border-t border-b border-neutral-400 py-2.5">
                <span className="font-bold text-xs text-neutral-900">
                  นามลูกค้า: {selectedQuotation.Company_Name}
                </span>
              </div>

              {/* Items Table matching Image 1 */}
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
                <tbody className="divide-y divide-neutral-200">
                  {quoteItems.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-neutral-200">
                      <td className="py-2.5 px-3 text-center text-neutral-700 border-r border-neutral-200">{idx + 1}.</td>
                      <td className="py-2.5 px-3 text-left font-medium text-black border-r border-neutral-200">{item.id}</td>
                      <td className="py-2.5 px-3 text-left text-neutral-900 border-r border-neutral-200">{item.name}</td>
                      <td className="py-2.5 px-3 text-center text-neutral-800 border-r border-neutral-200">{item.quantity.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-center text-neutral-800 border-r border-neutral-200">{item.unit}</td>
                      <td className="py-2.5 px-3 text-right text-neutral-800 border-r border-neutral-200">{item.unitPrice.toLocaleString()}.-</td>
                      <td className="py-2.5 px-3 text-right font-medium text-black">
                        {(item.quantity * item.unitPrice).toLocaleString()}.-
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Section matching Image 1 */}
              <div className="flex justify-end pt-3">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-xs text-neutral-900">ยอดรวมทั้งหมด:</span>
                  <div className="bg-[#E0E0E0] px-8 py-2 font-bold text-sm text-black">
                    {calculatedTotal.toLocaleString()}.-
                  </div>
                </div>
              </div>

              {/* Signatures Section: ไม่ต้องมีลายเซ็น ให้เว้นไว้ */}
              <div className="flex justify-end pt-12 pr-6">
                <div className="text-center w-48 space-y-2">
                  <div className="h-16"></div>
                  <div className="border-b border-neutral-500 w-full"></div>
                  <p className="font-bold text-xs text-black pt-1">เปรมภัสสร แซ่ตั้ง</p>
                  <p className="text-[11px] text-neutral-600">ผู้ออกใบเสนอราคา</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function QuotationsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">กำลังโหลด...</div>}>
      <QuotationsContent />
    </Suspense>
  );
}
