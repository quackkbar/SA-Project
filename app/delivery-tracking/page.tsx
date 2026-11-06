'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeftCircle,
  Wrench,
  Package,
  Truck,
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  Calendar,
} from 'lucide-react';
import {
  getStoredDeliveries,
  saveStoredDeliveries,
  getStoredOrders,
  saveStoredOrders,
  getStoredPrintJobs,
  getStoredQuotations,
  StorageDeliveryRecord,
  StorageOrderRecord,
  StoragePrintJobRecord,
  StorageQuotationRecord,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, isoDateForInput } from '@/lib/dateUtils';

export default function DeliveryTrackingPage() {
  // Navigation views: 'list' | 'detail'
  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [deliveries, setDeliveries] = useState<StorageDeliveryRecord[]>([]);
  const [printJobs, setPrintJobs] = useState<StoragePrintJobRecord[]>([]);
  const [orders, setOrders] = useState<StorageOrderRecord[]>([]);
  const [quotations, setQuotations] = useState<StorageQuotationRecord[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<StorageDeliveryRecord | null>(null);

  // Search filter in list view
  const [searchTerm, setSearchTerm] = useState('');

  // Toast Notification
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pop-up Modal state for "ทำการจัดส่ง"
  const [isShipModalOpen, setIsShipModalOpen] = useState(false);
  const [inputDeliverer, setInputDeliverer] = useState('');
  const [inputShipDate, setInputShipDate] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');

  useEffect(() => {
    loadData();
    setCurrentDateStr(new Date().toLocaleDateString('th-TH'));
  }, []);

  const loadData = () => {
    let storedDeliveries = getStoredDeliveries();
    const storedPrintJobs = getStoredPrintJobs();
    const storedOrders = getStoredOrders();
    const storedQuotations = getStoredQuotations();

    // Ensure every print job with a Delivery_ID has a corresponding delivery record in storage
    let hasNewDeliveries = false;
    storedPrintJobs.forEach((pj) => {
      if (pj.Delivery_ID) {
        const matchedOrder = storedOrders.find(
          (o) => o.Sales_Order_ID.trim().toLowerCase() === pj.Sales_Order_ID.trim().toLowerCase()
        );
        const orderStatus = matchedOrder?.Order_Status || '';
        const inferredStatus =
          orderStatus === 'Delivery_Delivered'
            ? 'Delivered'
            : orderStatus === 'Delivery_Shipping'
            ? 'Shipping'
            : orderStatus === 'Delivery_Preparing'
            ? 'Preparing'
            : 'Producing';

        const existingIdx = storedDeliveries.findIndex(
          (d) => d.Delivery_ID && d.Delivery_ID.trim().toLowerCase() === pj.Delivery_ID!.trim().toLowerCase()
        );
        if (existingIdx === -1) {
          const newDel: StorageDeliveryRecord = {
            Delivery_ID: pj.Delivery_ID,
            Sales_Order_ID: pj.Sales_Order_ID,
            Customer_Name: matchedOrder?.Customer_Name || pj.Company_Name || '-',
            Company_Name: pj.Company_Name || matchedOrder?.Company_Name || '-',
            Customer_Phone: pj.Customer_Phone || matchedOrder?.Customer_Phone || '-',
            Customer_Address: pj.Customer_Address || matchedOrder?.Customer_Address || '-',
            Delivery_Status: inferredStatus,
            Deliverer: '-',
            Delivery_Date: '-',
          };
          storedDeliveries.push(newDel);
          hasNewDeliveries = true;
        } else if (
          storedDeliveries[existingIdx].Delivery_Status === 'Producing' &&
          inferredStatus !== 'Producing'
        ) {
          storedDeliveries[existingIdx] = {
            ...storedDeliveries[existingIdx],
            Delivery_Status: inferredStatus,
          };
          hasNewDeliveries = true;
        }
      }
    });

    if (hasNewDeliveries) {
      saveStoredDeliveries(storedDeliveries);
    }

    setDeliveries(storedDeliveries);
    setPrintJobs(storedPrintJobs);
    setOrders(storedOrders);
    setQuotations(storedQuotations);

    // Initial selected delivery check
    if (storedDeliveries.length > 0 && !selectedDelivery) {
      setSelectedDelivery(storedDeliveries[0]);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Open detail view for a specific delivery
  const handleOpenDetail = (delivery: StorageDeliveryRecord) => {
    setSelectedDelivery(delivery);
    setCurrentView('detail');
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 1: เมื่อกดปุ่มเตรียมจัดส่ง
  // เปลี่ยนสถานะการจัดส่งเป็น Preparing (สถานะคำสั่งซื้อ = Delivery_Preparing)
  // -------------------------------------------------------------------------
  const handlePrepareDelivery = () => {
    if (!selectedDelivery) return;

    const updated: StorageDeliveryRecord = {
      ...selectedDelivery,
      Delivery_Status: 'Preparing',
    };
    setSelectedDelivery(updated);

    const currentDeliveries = getStoredDeliveries();
    const targetDelId = (selectedDelivery.Delivery_ID || '').trim().toLowerCase();
    const targetSoId = (selectedDelivery.Sales_Order_ID || '').trim().toLowerCase();
    const updatedDeliveries = currentDeliveries.map((d) => {
      const dId = (d.Delivery_ID || '').trim().toLowerCase();
      const dSoId = (d.Sales_Order_ID || '').trim().toLowerCase();
      if (dId === targetDelId || (targetSoId && dSoId === targetSoId)) {
        return { ...d, Delivery_Status: 'Preparing' };
      }
      return d;
    });
    setDeliveries(updatedDeliveries);
    saveStoredDeliveries(updatedDeliveries);

    // Update corresponding order status to Delivery_Preparing
    if (selectedDelivery.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedDelivery.Sales_Order_ID
          ? { ...o, Order_Status: 'Delivery_Preparing' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      `เปลี่ยนสถานะการจัดส่ง ${selectedDelivery.Delivery_ID} เป็น "Preparing" เรียบร้อยแล้ว (สถานะคำสั่งซื้อ: Delivery_Preparing)`
    );
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 2: เมื่อกดปุ่มทำการจัดส่ง
  // ให้ขึ้น pop up สำหรับกรอกชื่อผู้จัดส่ง และวันที่จัดส่งเป็นวันปัจจุบัน
  // เปลี่ยนสถานะการจัดส่งเป็น Shipping (สถานะคำสั่งซื้อ = Delivery_Shipping)
  // -------------------------------------------------------------------------
  const handleOpenShipModal = () => {
    setInputDeliverer('');
    setInputShipDate(formatDocumentDate(new Date().toISOString().split('T')[0]));
    setIsShipModalOpen(true);
  };

  const handleCloseShipModal = () => {
    if (!confirmDiscardChanges()) return;
    setIsShipModalOpen(false);
  };

  const handleConfirmShipping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelivery) return;

    const trimmedDeliverer = inputDeliverer.trim();
    if (!trimmedDeliverer) {
      showNotification('error', 'บันทึกไม่สำเร็จ: กรุณากรอกชื่อผู้จัดส่ง');
      return;
    }

    const shipDateFormatted = formatDocumentDate(inputShipDate) || new Date().toLocaleDateString('th-TH');

    const updated: StorageDeliveryRecord = {
      ...selectedDelivery,
      Delivery_Status: 'Shipping',
      Deliverer: trimmedDeliverer,
      Delivery_Date: shipDateFormatted,
    };
    setSelectedDelivery(updated);

    const currentDeliveries = getStoredDeliveries();
    const targetDelId = (selectedDelivery.Delivery_ID || '').trim().toLowerCase();
    const targetSoId = (selectedDelivery.Sales_Order_ID || '').trim().toLowerCase();
    const updatedDeliveries = currentDeliveries.map((d) => {
      const dId = (d.Delivery_ID || '').trim().toLowerCase();
      const dSoId = (d.Sales_Order_ID || '').trim().toLowerCase();
      if (dId === targetDelId || (targetSoId && dSoId === targetSoId)) {
        return {
          ...d,
          Delivery_Status: 'Shipping',
          Deliverer: trimmedDeliverer,
          Delivery_Date: shipDateFormatted,
        };
      }
      return d;
    });
    setDeliveries(updatedDeliveries);
    saveStoredDeliveries(updatedDeliveries);

    // Update corresponding order status to Delivery_Shipping
    if (selectedDelivery.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedDelivery.Sales_Order_ID
          ? { ...o, Order_Status: 'Delivery_Shipping' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    setFormDirty(false);
    setIsShipModalOpen(false);
    showNotification(
      'success',
      `เริ่มทำการจัดส่งเรียบร้อยแล้ว ผู้จัดส่ง: ${trimmedDeliverer} (สถานะการจัดส่ง: Shipping, คำสั่งซื้อ: Delivery_Shipping)`
    );
  };

  // -------------------------------------------------------------------------
  // WORKFLOW 3: เมื่อกดปุ่มจัดส่งสำเร็จ
  // เปลี่ยนสถานะการจัดส่งเป็น Delivered (สถานะคำสั่งซื้อ = Delivery_Delivered)
  // -------------------------------------------------------------------------
  const handleDeliveryCompleted = () => {
    if (!selectedDelivery) return;

    const updated: StorageDeliveryRecord = {
      ...selectedDelivery,
      Delivery_Status: 'Delivered',
    };
    setSelectedDelivery(updated);

    const currentDeliveries = getStoredDeliveries();
    const targetDelId = (selectedDelivery.Delivery_ID || '').trim().toLowerCase();
    const targetSoId = (selectedDelivery.Sales_Order_ID || '').trim().toLowerCase();
    const updatedDeliveries = currentDeliveries.map((d) => {
      const dId = (d.Delivery_ID || '').trim().toLowerCase();
      const dSoId = (d.Sales_Order_ID || '').trim().toLowerCase();
      if (dId === targetDelId || (targetSoId && dSoId === targetSoId)) {
        return { ...d, Delivery_Status: 'Delivered' };
      }
      return d;
    });
    setDeliveries(updatedDeliveries);
    saveStoredDeliveries(updatedDeliveries);

    // Update corresponding order status to Delivery_Delivered
    if (selectedDelivery.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedDelivery.Sales_Order_ID
          ? { ...o, Order_Status: 'Delivery_Delivered' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      `บันทึกจัดส่งสำเร็จเรียบร้อยแล้ว (สถานะการจัดส่ง: Delivered, คำสั่งซื้อ: Delivery_Delivered)`
    );
  };

  const getStepActiveIndex = (status?: string) => {
    switch (status) {
      case 'Producing':
        return 0;
      case 'Preparing':
        return 1;
      case 'Shipping':
        return 2;
      case 'Delivered':
        return 3;
      default:
        return 0;
    }
  };

  // -------------------------------------------------------------------------
  // Query-based delivery filtering matching user's exact SQL:
  // WITH Delivery_Rank AS (
  //     SELECT d.Delivery_ID, d.Delivery_Status, so.Sales_Order_ID, c.Customer_name, c.Customer_Company, q.Quotation_Date,
  //            ROW_NUMBER() OVER (PARTITION BY so.Sales_Order_ID ORDER BY d.Delivery_ID) AS rn
  //     FROM DELIVERY d
  //     JOIN SALES_ORDER so ON so.Sales_Order_ID = d.Sales_Order_ID
  //     JOIN CUSTOMER c ON c.Customer_ID = so.Customer_ID
  //     JOIN QUOTATION q ON q.Quotation_ID = so.Quotation_ID
  //     WHERE EXISTS (
  //         SELECT 1 FROM ORDER_DETAIL ord JOIN PRINT_JOB pj ON ord.Product_ID = pj.Product_ID
  //         WHERE ord.Sales_Order_ID = so.Sales_Order_ID
  //     )
  //     AND NOT EXISTS (
  //         SELECT 1 FROM ORDER_DETAIL ord JOIN PRINT_JOB pj ON ord.Product_ID = pj.Product_ID
  //         WHERE ord.Sales_Order_ID = so.Sales_Order_ID AND pj.Print_Job_Status <> 'Completed'
  //     )
  // )
  // SELECT Delivery_ID, Delivery_Status, Sales_Order_ID, Customer_name, Customer_Company
  // FROM Delivery_Rank WHERE rn = 1 ORDER BY Quotation_Date;
  // -------------------------------------------------------------------------
  const deliveryListFromQuery = React.useMemo(() => {
    // Collect all unique sales order IDs present in deliveries and orders
    const allSalesOrderIds = new Set<string>();
    deliveries.forEach((d) => {
      const soId = (d.Sales_Order_ID || '').trim();
      if (soId) allSalesOrderIds.add(soId);
    });
    orders.forEach((o) => {
      const soId = (o.Sales_Order_ID || '').trim();
      if (soId) allSalesOrderIds.add(soId);
    });

    const rankedDeliveries: (StorageDeliveryRecord & { Quotation_Date?: string })[] = [];

    allSalesOrderIds.forEach((soId) => {
      const soIdLower = soId.toLowerCase();

      // Find matching sales order
      const matchedOrder = orders.find(
        (o) => (o.Sales_Order_ID || '').trim().toLowerCase() === soIdLower
      );

      // Find all deliveries for this sales order
      const delivsForOrder = deliveries.filter(
        (d) => (d.Sales_Order_ID || '').trim().toLowerCase() === soIdLower
      );
      if (delivsForOrder.length === 0) return;

      // Find all print jobs for this sales order (matching ord.Sales_Order_ID = so.Sales_Order_ID)
      const orderPjs = printJobs.filter((pj) => {
        const pjSoId = (pj.Sales_Order_ID || '').trim().toLowerCase();
        if (pjSoId === soIdLower) return true;
        if (matchedOrder && Array.isArray(matchedOrder.items) && pj.Product_ID) {
          return matchedOrder.items.some(
            (it) => it.id && it.id.trim().toLowerCase() === pj.Product_ID.trim().toLowerCase()
          );
        }
        return false;
      });

      // WHERE EXISTS: Must have at least 1 print job
      if (orderPjs.length === 0) return;

      // AND NOT EXISTS: No print jobs where Print_Job_Status <> 'Completed'
      // Meaning all print jobs must have Print_Job_Status === 'Completed'
      const hasIncomplete = orderPjs.some(
        (pj) => (pj.Print_Job_Status || '').trim().toLowerCase() !== 'completed'
      );
      if (hasIncomplete) return;

      // ROW_NUMBER() OVER (PARTITION BY so.Sales_Order_ID ORDER BY d.Delivery_ID) AS rn -> WHERE rn = 1
      delivsForOrder.sort((a, b) => (a.Delivery_ID || '').localeCompare(b.Delivery_ID || ''));
      const rn1Delivery = delivsForOrder[0];

      // JOIN QUOTATION q ON q.Sales_Order_ID = so.Sales_Order_ID
      const matchedQuote = quotations.find((q) => {
        const qSoId = (q.Sales_Order_ID || '').trim().toLowerCase();
        return qSoId === soIdLower;
      });

      const quoteDate = matchedQuote?.Quotation_Date || '';

      rankedDeliveries.push({
        ...rn1Delivery,
        Customer_Name: matchedOrder?.Customer_Name || rn1Delivery.Customer_Name || '-',
        Company_Name: matchedOrder?.Company_Name || rn1Delivery.Company_Name || '-',
        Quotation_Date: quoteDate,
      });
    });

    // ORDER BY Quotation_Date
    rankedDeliveries.sort((a, b) => {
      const dateA = isoDateForInput(a.Quotation_Date) || a.Quotation_Date || '';
      const dateB = isoDateForInput(b.Quotation_Date) || b.Quotation_Date || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return (a.Delivery_ID || '').localeCompare(b.Delivery_ID || '');
    });

    return rankedDeliveries;
  }, [deliveries, orders, printJobs, quotations]);

  const filteredDeliveries = deliveryListFromQuery.filter((d) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      d.Delivery_ID.toLowerCase().includes(term) ||
      d.Sales_Order_ID.toLowerCase().includes(term) ||
      d.Customer_Name.toLowerCase().includes(term) ||
      d.Company_Name.toLowerCase().includes(term)
    );
  });

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
          SCREEN 1: รายการติดตามการจัดส่ง (matching Figma node 96:1436)
          Requirement: -รายการการจัดส่งทั้งหมด
          - เอาปุ่มดูสถานะการจัดส่งออก
          ========================================================================= */}
      {currentView === 'list' && (
        <div>
          {/* Top Header without "ดูสถานะการจัดส่ง" button */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-black">ติดตามการจัดส่ง</h1>
              <p className="text-sm text-neutral-500 mt-1">รายการการจัดส่งทั้งหมด</p>
            </div>
          </div>

          {/* Table Container */}
          <div className="p-12 space-y-6 max-w-7xl mx-auto">
            {/* Search Box */}
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัสใบจัดส่ง รหัสคำสั่งซื้อ หรือชื่อบริษัท..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-[#F2F1ED] border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400"
              />
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h2 className="text-lg font-bold text-black">รายการการจัดส่งทั้งหมด</h2>
                <span className="text-xs text-neutral-500">
                  ทั้งหมด {filteredDeliveries.length} รายการ
                </span>
              </div>

              {/* Header Capsule */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบจัดส่ง</div>
                <div className="col-span-2">รหัสคำสั่งซื้อ</div>
                <div className="col-span-3">ชื่อลูกค้า</div>
                <div className="col-span-3">ชื่อบริษัท</div>
                <div className="col-span-2 text-right">สถานะการจัดส่ง</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-1">
                {filteredDeliveries.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ไม่พบรายการการจัดส่งที่มีสถานะใบสั่งผลิตเป็น Completed
                  </div>
                ) : (
                  filteredDeliveries.map((d) => (
                    <div
                      key={d.Delivery_ID}
                      onClick={() => handleOpenDetail(d)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-2 font-bold text-black group-hover:text-neutral-600 transition-colors">
                        {d.Delivery_ID}
                      </div>
                      <div className="col-span-2 text-neutral-600 font-mono text-xs">
                        {d.Sales_Order_ID}
                      </div>
                      <div className="col-span-3 text-neutral-800 font-medium">
                        {d.Customer_Name}
                      </div>
                      <div className="col-span-3 text-neutral-800">
                        {d.Company_Name}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-xs font-semibold text-black">
                          {d.Delivery_Status}
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
          SCREEN 2: ติดตามสถานะการจัดส่ง (matching Figma node 106:2439)
          Requirement:
          - ช่องผุ้จัดส่ง และวันที่จะกรอกไม่ได้
          - เมื่อกดปุ่มเตรียมจัดส่ง เปลี่ยนสถานะการจัดส่งเป็น Preparing(สถานะคำสั่งซื้อ=Delivery_Preparing)
          - เมื่อกดปุ่มทำการจัดส่งให้ขึ้น pop up สำหรับกรอกชื่อผู้จัดส่ง และวันที่จัดส่งเป็นวันปัจจุบัน เปลี่ยนสถานะการจัดส่งเป็น Shipping(สถานะคำสั่งซื้อ=Delivery_Shipping)
          - เมื่อกดปุ่มจัดส่งสำเร็จ เปลี่ยนสถานะการจัดส่งเป็น Delivered(สถานะคำสั่งซื้อ=Delivery_Delivered)
          ========================================================================= */}
      {currentView === 'detail' && selectedDelivery && (() => {
        const activeStep = getStepActiveIndex(selectedDelivery.Delivery_Status);

        return (
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
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-black">ติดตามสถานะการจัดส่ง</h1>
                  <p className="text-sm text-neutral-500 mt-1">
                    รหัสใบจัดส่ง: <span className="font-semibold text-black">{selectedDelivery.Delivery_ID}</span> | คำสั่งซื้อ: <span className="font-mono">{selectedDelivery.Sales_Order_ID}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-12 space-y-8 max-w-5xl mx-auto">
              {/* Visual Stepper Card matching Figma */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-md p-10 flex items-center justify-center">
                <div className="flex items-center w-full max-w-2xl justify-between relative">
                  {/* Connecting lines */}
                  <div className="absolute top-1/2 left-12 right-12 h-1 bg-neutral-200 -translate-y-1/2 z-0" />
                  <div
                    className="absolute top-1/2 left-12 h-1 bg-black -translate-y-1/2 z-0 transition-all duration-300"
                    style={{ width: `${(activeStep / 3) * 85}%` }}
                  />

                  {/* Step 1: Producing */}
                  <div className="flex flex-col items-center gap-3 relative z-10">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center shadow-sm transition-all ${
                        activeStep >= 0 ? 'bg-black text-white' : 'bg-[#EEEEEE] text-neutral-400'
                      }`}
                    >
                      <Wrench className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-800">Producing</span>
                  </div>

                  {/* Step 2: Preparing */}
                  <div className="flex flex-col items-center gap-3 relative z-10">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center shadow-sm transition-all ${
                        activeStep >= 1 ? 'bg-black text-white' : 'bg-[#EEEEEE] text-neutral-400'
                      }`}
                    >
                      <Package className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-800">Preparing</span>
                  </div>

                  {/* Step 3: Shipping */}
                  <div className="flex flex-col items-center gap-3 relative z-10">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center shadow-sm transition-all ${
                        activeStep >= 2 ? 'bg-black text-white' : 'bg-[#EEEEEE] text-neutral-400'
                      }`}
                    >
                      <Truck className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-800">Shipping</span>
                  </div>

                  {/* Step 4: Delivered */}
                  <div className="flex flex-col items-center gap-3 relative z-10">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center shadow-sm transition-all ${
                        activeStep >= 3 ? 'bg-black text-white' : 'bg-[#EEEEEE] text-neutral-400'
                      }`}
                    >
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-800">delivered</span>
                  </div>
                </div>
              </div>

              {/* Card: ข้อมูลใบจัดส่ง matching Figma */}
              <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
                <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลใบจัดส่ง</div>
                <div className="p-6 bg-white space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">รหัสใบจัดส่ง</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDelivery.Delivery_ID}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">รหัสคำสั่งซื้อ</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDelivery.Sales_Order_ID}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">ชื่อลูกค้า</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedDelivery.Customer_Name}
                      className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">ชื่อบริษัท</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDelivery.Company_Name}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">เบอร์โทรศัพท์</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDelivery.Customer_Phone || '08x-xxx-xxxx'}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">ที่อยู่จัดส่ง</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedDelivery.Customer_Address || 'สำนักงานใหญ่ 86 ถ.ลงหาดบางแสน ต.แสนสุข ชลบุรี'}
                      className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>

                  {/* Requirement: ช่องผุ้จัดส่ง และวันที่จะกรอกไม่ได้ (readOnly) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">ผู้จัดส่ง</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDelivery.Deliverer || '-'}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800 cursor-not-allowed"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-700 font-medium shrink-0 w-24">วันที่จัดส่ง</span>
                      <input
                        type="text"
                        readOnly
                        value={formatDocumentDate(selectedDelivery.Delivery_Date) || '-'}
                        className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons:
                  - เมื่อกดปุ่มเตรียมจัดส่ง เปลี่ยนสถานะการจัดส่งเป็น Preparing (สถานะคำสั่งซื้อ=Delivery_Preparing)
                  - เมื่อกดปุ่มทำการจัดส่งให้ขึ้น pop up สำหรับกรอกชื่อผู้จัดส่ง และวันที่จัดส่งเป็นวันปัจจุบัน เปลี่ยนสถานะการจัดส่งเป็น Shipping (สถานะคำสั่งซื้อ=Delivery_Shipping)
                  - เมื่อกดปุ่มจัดส่งสำเร็จ เปลี่ยนสถานะการจัดส่งเป็น Delivered (สถานะคำสั่งซื้อ=Delivery_Delivered)
              */}
              <div className="flex justify-end pt-2 pb-6">
                {selectedDelivery.Delivery_Status === 'Producing' && (
                  <button
                    type="button"
                    onClick={handlePrepareDelivery}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
                  >
                    เตรียมจัดส่ง
                  </button>
                )}

                {selectedDelivery.Delivery_Status === 'Preparing' && (
                  <button
                    type="button"
                    onClick={handleOpenShipModal}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                  >
                    <Truck className="w-4 h-4" />
                    ทำการจัดส่ง
                  </button>
                )}

                {selectedDelivery.Delivery_Status === 'Shipping' && (
                  <button
                    type="button"
                    onClick={handleDeliveryCompleted}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    จัดส่งสำเร็จ
                  </button>
                )}

                {selectedDelivery.Delivery_Status === 'Delivered' && (
                  <div className="px-6 py-2.5 bg-neutral-100 text-neutral-800 rounded-xl text-sm font-bold border border-neutral-300 inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ดำเนินการจัดส่งสำเร็จแล้ว
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          POP-UP MODAL: ทำการจัดส่ง
          Requirement:
          - เมื่อกดปุ่มทำการจัดส่งให้ขึ้น pop up สำหรับกรอกชื่อผู้จัดส่ง และวันที่จัดส่งเป็นวันปัจจุบัน
            เปลี่ยนสถานะการจัดส่งเป็น Shipping (สถานะคำสั่งซื้อ=Delivery_Shipping)
          - ถ้าเป็นรหัสต้องไม่ซ้ำ และต้องไม่เป็นค่าว่าง (ไม่ต้องโชว์ข้อความเงื่อนไข)
          ========================================================================= */}
      {isShipModalOpen && selectedDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200 p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-black">ทำการจัดส่ง</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  ใบจัดส่ง: {selectedDelivery.Delivery_ID} • คำสั่งซื้อ: {selectedDelivery.Sales_Order_ID}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseShipModal}
                className="p-1 text-neutral-400 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmShipping} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ชื่อผู้จัดส่ง *
                </label>
                <input
                  type="text"
                  required
                  value={inputDeliverer}
                  onChange={(e) => {
                    setFormDirty(true);
                    setInputDeliverer(e.target.value);
                  }}
                  placeholder="ระบุชื่อผู้จัดส่ง เช่น วันชัย Express (นายประสิทธิ์)"
                  className="w-full px-4 py-2.5 bg-white text-sm font-medium text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  วันที่จัดส่ง *
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    value={inputShipDate}
                    onChange={(e) => setInputShipDate(e.target.value)}
                    onBlur={() => {
                      if (inputShipDate.trim()) {
                        const formatted = formatDocumentDate(inputShipDate);
                        if (formatted && formatted !== '-') {
                          setInputShipDate(formatted);
                        }
                      }
                    }}
                    placeholder="วว/ดด/ปปปป"
                    className="w-full px-4 py-2.5 bg-white text-sm font-semibold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                  />
                  <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                    <input
                      type="date"
                      value={isoDateForInput(inputShipDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setInputShipDate(formatDocumentDate(e.target.value));
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                    />
                    <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={handleCloseShipModal}
                  className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  ยืนยันการจัดส่ง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
