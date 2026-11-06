'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Plus, FileText, CheckCircle2, XCircle, 
  RotateCcw, Send, Wrench, AlertCircle, RefreshCw, Eye, Edit3
} from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/lib/types';

export default function SalesWorkflowPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'uc1' | 'uc2' | 'uc3' | 'uc5'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --------------------------------------------------------------------------
  // UC1 State: Order Intake
  // --------------------------------------------------------------------------
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState<boolean>(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', address: '', phone: '' });
  const [orderItems, setOrderItems] = useState<Array<{ productName: string; quantity: number; productFormat: string }>>([
    { productName: '', quantity: 1000, productFormat: 'พิมพ์ 4 สี กระดาษอาร์ตการ์ด 260 แกรม' },
  ]);

  // --------------------------------------------------------------------------
  // UC2 State: Create Quotation
  // --------------------------------------------------------------------------
  const [selectedOrderForQuote, setSelectedOrderForQuote] = useState<any | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<string, number>>({});

  // --------------------------------------------------------------------------
  // UC4 State: Edit Quotation Modal
  // --------------------------------------------------------------------------
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);
  const [editPrices, setEditPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [ordersRes, custRes] = await Promise.all([
        fetch('/api/sales/orders'),
        fetch('/api/customers'),
      ]);
      const ordersData = await ordersRes.json();
      const custData = await custRes.json();

      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      if (Array.isArray(custData) && custData.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(custData[0].Customer_ID);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // --------------------------------------------------------------------------
  // UC1: Create New Customer Handler
  // --------------------------------------------------------------------------
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: newCustomer.name,
          customerAddress: newCustomer.address,
          customerPhone: newCustomer.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCustomers([...customers, data]);
      setSelectedCustomerId(data.Customer_ID);
      setShowNewCustomerModal(false);
      setNewCustomer({ name: '', address: '', phone: '' });
      showNotification('success', `สร้างข้อมูลลูกค้า ${data.Customer_Name} (${data.Customer_ID}) เรียบร้อย`);
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // --------------------------------------------------------------------------
  // UC1: Submit New Order (Order Intake)
  // --------------------------------------------------------------------------
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      showNotification('error', 'กรุณาเลือกลูกค้า');
      return;
    }

    const validItems = orderItems.filter((i) => i.productName.trim() !== '' && i.quantity > 0);
    if (validItems.length === 0) {
      showNotification('error', 'กรุณากรอกชื่อสินค้าและจำนวนอย่างน้อย 1 รายการ');
      return;
    }

    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          items: validItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `บันทึกคำสั่งซื้อใหม่ ${data.order.Sales_Order_ID} เรียบร้อยแล้ว (สถานะ: Quotation_Not_Started)`);
      setOrderItems([{ productName: '', quantity: 1000, productFormat: 'พิมพ์ 4 สี กระดาษอาร์ตการ์ด 260 แกรม' }]);
      fetchInitialData();
      setActiveTab('orders');
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // --------------------------------------------------------------------------
  // UC2: Submit Quotation
  // --------------------------------------------------------------------------
  const handleSubmitQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForQuote) return;

    const items = selectedOrderForQuote.orderDetails.map((item: any) => ({
      productId: item.Product_ID,
      unitPrice: quotePrices[item.Product_ID] || 0,
    }));

    try {
      const res = await fetch('/api/sales/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesOrderId: selectedOrderForQuote.Sales_Order_ID,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `จัดทำใบเสนอราคา ${data.Quotation_ID} สำเร็จ (สถานะออเดอร์ปรับเป็น: Quotation_Pending)`);
      setSelectedOrderForQuote(null);
      setQuotePrices({});
      fetchInitialData();
      setActiveTab('uc3');
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // --------------------------------------------------------------------------
  // UC3: Update Quotation Status (Approve / Reject / Request Revision)
  // --------------------------------------------------------------------------
  const handleUpdateQuoteStatus = async (quotationId: string, action: 'approve' | 'reject' | 'request_revision') => {
    try {
      const res = await fetch('/api/sales/quotations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotationId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const actionText = action === 'approve' ? 'อนุมัติเรียบร้อย' : action === 'reject' ? 'ปฏิเสธเรียบร้อย' : 'ส่งกลับแก้ไข';
      showNotification('success', `ปรับสถานะใบเสนอราคา ${quotationId} เป็น ${actionText} แล้ว (R1 คำนวณสถานะออเดอร์อัตโนมัติ)`);
      fetchInitialData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // --------------------------------------------------------------------------
  // UC4: Submit Quotation Edit
  // --------------------------------------------------------------------------
  const handleSubmitQuotationEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotation) return;

    const items = editingQuotation.quotationDetails.map((detail: any) => ({
      productId: detail.Product_ID,
      unitPrice: editPrices[detail.Product_ID] ?? Number(detail.Unit_Price),
    }));

    try {
      const res = await fetch('/api/sales/quotations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationId: editingQuotation.Quotation_ID,
          action: 'edit',
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `แก้ไขใบเสนอราคา ${editingQuotation.Quotation_ID} สำเร็จ ปรับสถานะกลับมาเป็น 'Pending'`);
      setEditingQuotation(null);
      fetchInitialData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // --------------------------------------------------------------------------
  // UC5: Issue Print Job
  // --------------------------------------------------------------------------
  const handleIssuePrintJob = async (salesOrderId: string) => {
    if (!confirm(`ยืนยันการสั่งผลิตคำสั่งซื้อ ${salesOrderId}? ระบบจะสร้างใบสั่งผลิต (Print Job) และเตรียมการจัดส่ง`)) return;

    try {
      const res = await fetch('/api/sales/issue-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesOrderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `ออกใบสั่งผลิตสำหรับ ${salesOrderId} เรียบร้อยแล้ว (สถานะออเดอร์ปรับเป็น: Prototype_Not_Started)`);
      fetchInitialData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Filter lists for specific workflows
  const unquotedOrders = orders.filter((o) => o.Order_Status === 'Quotation_Not_Started' && !o.quotation);
  const quotationsList = orders.filter((o) => o.quotation).map((o) => ({ ...o.quotation, salesOrder: o }));
  const approvedForProduction = orders.filter((o) => o.quotation?.Quotation_Status === 'Completed' && (!o.orderDetails?.[0]?.printJob || o.Order_Status === 'Quotation_Completed'));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">ฝ่ายขาย (Sales)</span>
            <h1 className="text-xl font-bold text-slate-900">ระบบงานฝ่ายขาย (Use Case 1 – 5)</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            บันทึกรับคำสั่งซื้อ (UC1) $\rightarrow$ ออกใบเสนอราคา (UC2) $\rightarrow$ อนุมัติ/แก้ไข (UC3, UC4) $\rightarrow$ สั่งผลิต (UC5)
          </p>
        </div>

        <button
          onClick={fetchInitialData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรชข้อมูล
        </button>
      </div>

      {/* Global Alert Notification */}
      {message && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Workflow Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-2 text-xs">
        <button
          onClick={() => setActiveTab('orders')}
          className={`py-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'orders' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          รายการคำสั่งซื้อ ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('uc1')}
          className={`py-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'uc1' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Plus className="w-3.5 h-3.5" /> UC1: รับคำสั่งซื้อใหม่
        </button>
        <button
          onClick={() => setActiveTab('uc2')}
          className={`py-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'uc2' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> UC2: จัดทำใบเสนอราคา
          {unquotedOrders.length > 0 && (
            <span className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {unquotedOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('uc3')}
          className={`py-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'uc3' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> UC3 & UC4: ตรวจสอบ/แก้ไขใบเสนอราคา
          <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {quotationsList.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('uc5')}
          className={`py-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'uc5' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" /> UC5: สั่งผลิตงานพิมพ์
          {approvedForProduction.length > 0 && (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {approvedForProduction.length}
            </span>
          )}
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: ALL ORDERS OVERVIEW                                           */}
      {/* ==================================================================== */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">รายการคำสั่งซื้อทั้งหมด (Sales Orders Status Table)</h2>
            <button
              onClick={() => setActiveTab('uc1')}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" /> รับคำสั่งซื้อใหม่
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">รหัสคำสั่งซื้อ</th>
                  <th className="py-3 px-4">วันที่สั่ง</th>
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">รายการสินค้า</th>
                  <th className="py-3 px-4">ยอดรวม (บาท)</th>
                  <th className="py-3 px-4">สถานะคำสั่งซื้อ (R1)</th>
                  <th className="py-3 px-4">ใบเสนอราคา</th>
                  <th className="py-3 px-4 text-center">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {orders.map((o) => {
                  const statusInfo = ORDER_STATUS_LABELS[o.Order_Status] || { label: o.Order_Status, color: 'bg-slate-100 text-slate-700' };
                  const item = o.orderDetails?.[0];

                  return (
                    <tr key={o.Sales_Order_ID} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{o.Sales_Order_ID}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(o.Order_Date).toLocaleDateString('th-TH')}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {o.customer?.Customer_Name}
                        <span className="text-[11px] text-slate-400 block">{o.customer?.Customer_Phone}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{item?.Product_Name}</span>
                        <span className="text-slate-400 block text-[11px]">จำนวน {item?.Quantity?.toLocaleString()} ชิ้น</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        ฿{Number(o.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {o.quotation ? (
                          <div className="text-xs">
                            <span className="font-mono text-slate-700 font-semibold">{o.quotation.Quotation_ID}</span>
                            <span className={`block text-[10px] font-bold ${
                              o.quotation.Quotation_Status === 'Completed' ? 'text-emerald-600' :
                              o.quotation.Quotation_Status === 'Pending' ? 'text-yellow-600' :
                              o.quotation.Quotation_Status === 'Under_Revision' ? 'text-orange-600' : 'text-red-600'
                            }`}>
                              [{o.quotation.Quotation_Status}]
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">ยังไม่มี</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center space-x-1">
                        {!o.quotation && (
                          <button
                            onClick={() => {
                              setSelectedOrderForQuote(o);
                              setActiveTab('uc2');
                            }}
                            className="px-2 py-1 bg-yellow-50 text-yellow-800 border border-yellow-300 rounded text-[11px] font-medium hover:bg-yellow-100"
                          >
                            ทำใบเสนอราคา
                          </button>
                        )}
                        {o.quotation?.Quotation_Status === 'Completed' && (!o.orderDetails?.[0]?.printJob || o.Order_Status === 'Quotation_Completed') && (
                          <button
                            onClick={() => handleIssuePrintJob(o.Sales_Order_ID)}
                            className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded text-[11px] font-medium hover:bg-emerald-100"
                          >
                            สั่งผลิต
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: UC1 ORDER INTAKE FORM (SA Report p.182 Mockup)                */}
      {/* ==================================================================== */}
      {activeTab === 'uc1' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-200 pb-4 mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                UC1: หน้ารับคำสั่งซื้อใหม่ (Sales Order Intake)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                สร้างคำสั่งซื้อใหม่ บันทึกลงตาราง SALES_ORDER (สถานะเริ่มต้น: Quotation_Not_Started) และ ORDER_DETAIL
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มลูกค้าใหม่
            </button>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-6">
            {/* Customer Selector */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เลือกลูกค้า (Customer) <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="">-- กรุณาเลือกลูกค้า --</option>
                {customers.map((c) => (
                  <option key={c.Customer_ID} value={c.Customer_ID}>
                    {c.Customer_ID} — {c.Customer_Name} ({c.Customer_Phone})
                  </option>
                ))}
              </select>
            </div>

            {/* Product Items Table (SA Report p.169-170) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-800">
                  รายการสินค้าในคำสั่งซื้อ (Order Details)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setOrderItems([
                      ...orderItems,
                      { productName: '', quantity: 1000, productFormat: 'พิมพ์ 4 สี มาตรฐาน' },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800"
                >
                  <Plus className="w-3.5 h-3.5" /> เพิ่มรายการสินค้า
                </button>
              </div>

              <div className="space-y-3">
                {orderItems.map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        ชื่อสินค้า / ชื่องานพิมพ์ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น โบรชัวร์แนะนำสินค้า, กล่องลูกฟูก"
                        value={item.productName}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx].productName = e.target.value;
                          setOrderItems(updated);
                        }}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        จำนวนผลิต <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx].quantity = Number(e.target.value);
                          setOrderItems(updated);
                        }}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                        required
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        รายละเอียดสเปกกระดาษ / การพิมพ์
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น อาร์ตมัน 160 แกรม, พับ 3 ตอน"
                        value={item.productFormat}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx].productFormat = e.target.value;
                          setOrderItems(updated);
                        }}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-1 text-right">
                      {orderItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="ลบแถว"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-sm transition inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> บันทึกรับคำสั่งซื้อ (UC1)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: UC2 CREATE QUOTATION (SA Report p.183 Mockup)                 */}
      {/* ==================================================================== */}
      {activeTab === 'uc2' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* List of orders awaiting quotation */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <FileText className="w-5 h-5 text-yellow-600" />
              UC2: จัดทำใบเสนอราคา (Create Quotation)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              เลือกคำสั่งซื้อที่ยังไม่มีการเสนอราคาเพื่อกำหนดราคาต่อหน่วยและบันทึกใบเสนอราคา (สถานะเริ่มต้น: Pending)
            </p>

            {unquotedOrders.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-lg text-center text-slate-500 text-xs">
                ไม่มีคำสั่งซื้อที่รอจัดทำใบเสนอราคาในขณะนี้ (คำสั่งซื้อทั้งหมดมีใบเสนอราคาแล้ว)
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 mb-6">
                {unquotedOrders.map((ord) => (
                  <div
                    key={ord.Sales_Order_ID}
                    onClick={() => {
                      setSelectedOrderForQuote(ord);
                      const initialPrices: Record<string, number> = {};
                      ord.orderDetails.forEach((d: any) => {
                        initialPrices[d.Product_ID] = 10.0;
                      });
                      setQuotePrices(initialPrices);
                    }}
                    className={`p-3.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                      selectedOrderForQuote?.Sales_Order_ID === ord.Sales_Order_ID
                        ? 'bg-yellow-50/80 border-yellow-400 ring-1 ring-yellow-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-blue-600 mr-2">{ord.Sales_Order_ID}</span>
                      <span className="font-semibold text-xs text-slate-900">{ord.customer?.Customer_Name}</span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        {ord.orderDetails?.map((d: any) => `${d.Product_Name} (${d.Quantity.toLocaleString()} ชิ้น)`).join(', ')}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2.5 py-1 rounded">
                      คลิกเพื่อทำใบเสนอราคา
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Quotation Form for Selected Order */}
            {selectedOrderForQuote && (
              <form onSubmit={handleSubmitQuotation} className="bg-slate-50 p-5 rounded-xl border border-yellow-200 space-y-4">
                <div className="flex items-center justify-between border-b border-yellow-200 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      คำนวณราคาสำหรับคำสั่งซื้อ: {selectedOrderForQuote.Sales_Order_ID}
                    </h3>
                    <p className="text-xs text-slate-600">ลูกค้า: {selectedOrderForQuote.customer?.Customer_Name}</p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-600">
                    วันที่สั่ง: {new Date(selectedOrderForQuote.Order_Date).toLocaleDateString('th-TH')}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 text-left">
                        <th className="py-2">รหัสสินค้า</th>
                        <th className="py-2">รายการสินค้า</th>
                        <th className="py-2 text-right">จำนวน</th>
                        <th className="py-2 text-right">ราคาต่อหน่วย (บาท)</th>
                        <th className="py-2 text-right">ราคารวม (บาท)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedOrderForQuote.orderDetails.map((item: any) => {
                        const unitPrice = quotePrices[item.Product_ID] || 0;
                        const lineTotal = unitPrice * item.Quantity;

                        return (
                          <tr key={item.Product_ID}>
                            <td className="py-2.5 font-mono text-slate-500">{item.Product_ID}</td>
                            <td className="py-2.5 font-medium text-slate-900">{item.Product_Name}</td>
                            <td className="py-2.5 text-right font-mono">{item.Quantity.toLocaleString()}</td>
                            <td className="py-2.5 text-right">
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                value={unitPrice}
                                onChange={(e) => {
                                  setQuotePrices({
                                    ...quotePrices,
                                    [item.Product_ID]: Number(e.target.value),
                                  });
                                }}
                                className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-right font-mono focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                                required
                              />
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                              ฿{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-bold text-xs">
                        <td colSpan={4} className="py-3 text-right">ยอดรวมใบเสนอราคา (Total Amount):</td>
                        <td className="py-3 text-right font-mono text-sm text-blue-700">
                          ฿
                          {selectedOrderForQuote.orderDetails
                            .reduce((sum: number, item: any) => sum + (quotePrices[item.Product_ID] || 0) * item.Quantity, 0)
                            .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-yellow-200">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForQuote(null)}
                    className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-yellow-600 text-white rounded-lg text-xs font-semibold hover:bg-yellow-700 shadow-sm transition inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> บันทึกและส่งใบเสนอราคา (UC2)
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: UC3 & UC4 QUOTATION STATUS & REVISION MANAGEMENT             */}
      {/* ==================================================================== */}
      {activeTab === 'uc3' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              UC3 & UC4: ตรวจสอบและปรับสถานะใบเสนอราคา (Quotation Review & Revision)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              จำลองผลการตอบรับจากลูกค้า: อนุมัติ (Completed) / ขอแก้ไข (Under_Revision) / ปฏิเสธ (Rejected) และแก้ไขราคาตาม UC4
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">เลขที่ใบเสนอราคา</th>
                  <th className="py-3 px-4">คำสั่งซื้อ</th>
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">ยอดรวม (บาท)</th>
                  <th className="py-3 px-4">สถานะใบเสนอราคา</th>
                  <th className="py-3 px-4 text-center">จัดการสถานะ (UC3)</th>
                  <th className="py-3 px-4 text-right">แก้ไข (UC4)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {quotationsList.map((q) => {
                  const isCompleted = q.Quotation_Status === 'Completed';
                  const isPending = q.Quotation_Status === 'Pending';
                  const isUnderRevision = q.Quotation_Status === 'Under_Revision';
                  const isRejected = q.Quotation_Status === 'Rejected';

                  return (
                    <tr key={q.Quotation_ID} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{q.Quotation_ID}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{q.Sales_Order_ID}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{q.salesOrder?.customer?.Customer_Name}</td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        ฿{Number(q.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            isCompleted ? 'bg-emerald-100 text-emerald-800' :
                            isPending ? 'bg-yellow-100 text-yellow-800' :
                            isUnderRevision ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {q.Quotation_Status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex gap-1">
                          {/* Approve Button */}
                          <button
                            onClick={() => handleUpdateQuoteStatus(q.Quotation_ID, 'approve')}
                            disabled={isCompleted}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              isCompleted
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                            }`}
                            title="ลูกค้าอนุมัติใบเสนอราคา"
                          >
                            ✓ อนุมัติ
                          </button>

                          {/* Request Revision Button */}
                          <button
                            onClick={() => handleUpdateQuoteStatus(q.Quotation_ID, 'request_revision')}
                            disabled={isUnderRevision || isCompleted}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              isUnderRevision || isCompleted
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100'
                            }`}
                            title="ลูกค้าขอแก้ไขราคา/เงื่อนไข"
                          >
                            ✎ ขอแก้ไข
                          </button>

                          {/* Reject Button */}
                          <button
                            onClick={() => handleUpdateQuoteStatus(q.Quotation_ID, 'reject')}
                            disabled={isRejected || isCompleted}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              isRejected || isCompleted
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                            }`}
                            title="ลูกค้าปฏิเสธใบเสนอราคา"
                          >
                            ✕ ปฏิเสธ
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isUnderRevision ? (
                          <button
                            onClick={() => {
                              setEditingQuotation(q);
                              const p: Record<string, number> = {};
                              q.quotationDetails?.forEach((d: any) => {
                                p[d.Product_ID] = Number(d.Unit_Price);
                              });
                              setEditPrices(p);
                            }}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold hover:bg-blue-700 inline-flex items-center gap-1 shadow-sm"
                          >
                            <Edit3 className="w-3 h-3" /> แก้ไขราคา (UC4)
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: UC5 ISSUE PRINT JOB                                           */}
      {/* ==================================================================== */}
      {activeTab === 'uc5' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-600" />
              UC5: สั่งผลิตงานพิมพ์ (Issue Print Job)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              สร้างใบสั่งผลิต (PRINT_JOB สถานะเริ่มต้น: In_Design, Prototype: Not_Started) และเปิดเอกสารจัดส่ง (DELIVERY: Producing)
            </p>
          </div>

          {approvedForProduction.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">ไม่มีคำสั่งซื้อที่รอออกใบสั่งผลิตในขณะนี้</p>
              <p className="text-slate-400 mt-1">
                (ต้องเป็นคำสั่งซื้อที่ใบเสนอราคาอนุมัติแล้ว และยังไม่ได้ออกใบสั่งผลิต)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvedForProduction.map((ord) => (
                <div key={ord.Sales_Order_ID} className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-blue-700">{ord.Sales_Order_ID}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        Quotation {ord.quotation?.Quotation_ID} อนุมัติแล้ว
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 block mt-1">
                      ลูกค้า: {ord.customer?.Customer_Name} ({ord.customer?.Customer_Phone})
                    </span>
                    <ul className="text-xs text-slate-600 mt-2 list-disc list-inside">
                      {ord.orderDetails?.map((d: any) => (
                        <li key={d.Product_ID}>
                          <span className="font-medium text-slate-800">{d.Product_Name}</span> — จำนวน {d.Quantity.toLocaleString()} ชิ้น ({d.Product_Format})
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleIssuePrintJob(ord.Sales_Order_ID)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-sm transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Wrench className="w-3.5 h-3.5" /> ออกใบสั่งผลิต (UC5)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE NEW CUSTOMER (UC1 Support)                             */}
      {/* ==================================================================== */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm mb-1">เพิ่มข้อมูลลูกค้าใหม่ (New Customer)</h3>
            <p className="text-xs text-slate-500 mb-4">บันทึกลงตาราง CUSTOMER ด้วยรหัส Prefix CUS</p>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ชื่อบริษัท / ชื่อลูกค้า <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น บริษัท สยามพัฒนา จำกัด"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น 081-234-5678"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ที่อยู่จัดส่ง / ออกใบเสร็จ
                </label>
                <textarea
                  rows={2}
                  placeholder="เลขที่, ถนน, ตำบล, อำเภอ, จังหวัด"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
                >
                  บันทึกข้อมูลลูกค้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT QUOTATION (UC4: Edit Quotation Under Revision)           */}
      {/* ==================================================================== */}
      {editingQuotation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm mb-1">
              UC4: แก้ไขใบเสนอราคา ({editingQuotation.Quotation_ID})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              คำสั่งซื้อ: {editingQuotation.Sales_Order_ID} (สถานะปัจจุบัน: Under_Revision)
            </p>

            <form onSubmit={handleSubmitQuotationEdit} className="space-y-4">
              <div className="space-y-3">
                {editingQuotation.quotationDetails?.map((detail: any) => (
                  <div key={detail.Quotation_Detail_ID} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-slate-900 block">{detail.orderDetail?.Product_Name || detail.Product_ID}</span>
                      <span className="text-[11px] text-slate-500">จำนวน: {detail.Quantity?.toLocaleString()} ชิ้น</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">ราคา/หน่วย:</span>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={editPrices[detail.Product_ID] ?? Number(detail.Unit_Price)}
                        onChange={(e) => {
                          setEditPrices({
                            ...editPrices,
                            [detail.Product_ID]: Number(e.target.value),
                          });
                        }}
                        className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-right font-mono"
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingQuotation(null)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 shadow-sm"
                >
                  บันทึกราคาใหม่และส่งทบทวน (UC4)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
