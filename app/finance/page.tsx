'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Printer,
  Calendar,
  UserCheck,
  Building,
  CheckCircle,
  Clock,
  ArrowRight,
  Eye,
  X,
} from 'lucide-react';
import { ORDER_STATUS_LABELS, DELIVERY_STATUS_LABELS } from '@/lib/types';

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<'issue' | 'payment'>('issue');
  const [ordersWithoutReceipt, setOrdersWithoutReceipt] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // UC16 Record Payment Form Modal State
  const [selectedReceiptForPay, setSelectedReceiptForPay] = useState<any | null>(null);
  const [receiverNameInput, setReceiverNameInput] = useState('นางสาวสมศรี การเงินดี (แคชเชียร์)');
  const [receiptDateInput, setReceiptDateInput] = useState(new Date().toISOString().slice(0, 10));

  // Receipt Preview / Print Modal State
  const [previewReceipt, setPreviewReceipt] = useState<any | null>(null);

  // Notification State
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/receipts');
      const data = await res.json();
      if (data.ordersWithoutReceipt) setOrdersWithoutReceipt(data.ordersWithoutReceipt);
      if (data.receipts) setReceipts(data.receipts);
    } catch (err) {
      console.error('Fetch finance data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // UC15: Issue Receipt
  const handleIssueReceipt = async (salesOrderId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/finance/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesOrderId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการออกใบเสร็จ');
      }

      showNotification('success', `ออกใบเสร็จรับเงินเลขที่ ${data.Receipt_ID} สำหรับคำสั่งซื้อ ${salesOrderId} เรียบร้อยแล้ว`);
      fetchFinanceData();
      setActiveTab('payment');
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // UC16: Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceiptForPay) return;

    if (!receiverNameInput.trim()) {
      showNotification('error', 'กรุณาระบุชื่อผู้รับเงิน');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/finance/receipts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: selectedReceiptForPay.Receipt_ID,
          paymentReceiver: receiverNameInput.trim(),
          receiptDate: receiptDateInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการบันทึกรับเงิน');
      }

      showNotification('success', `บันทึกการรับเงินสำหรับใบเสร็จ ${data.Receipt_ID} เรียบร้อยแล้ว`);
      setSelectedReceiptForPay(null);
      fetchFinanceData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Receipts for UC16
  const filteredReceipts = receipts.filter((r) => {
    const isPaid = r.Receipt_Date !== null && r.Payment_Receiver !== null;
    const matchesFilter =
      paymentFilter === 'ALL' ||
      (paymentFilter === 'UNPAID' && !isPaid) ||
      (paymentFilter === 'PAID' && isPaid);

    const matchesSearch =
      r.Receipt_ID.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.Sales_Order_ID.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.salesOrder.customer.Customer_Name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Calculate KPIs
  const totalRevenueCollected = receipts
    .filter((r) => r.Receipt_Date !== null)
    .reduce((sum, r) => sum + Number(r.salesOrder.Total_Amount || 0), 0);

  const pendingCollectionAmount = receipts
    .filter((r) => r.Receipt_Date === null)
    .reduce((sum, r) => sum + Number(r.salesOrder.Total_Amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              ฝ่ายการเงินและบัญชี (Finance & Accounting)
            </span>
            <span className="text-xs text-slate-500 font-medium">Use Cases: UC15, UC16</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">ระบบออกใบเสร็จรับเงินและบันทึกบัญชี</h1>
          <p className="text-sm text-slate-500">
            ออกใบเสร็จรับเงินสำหรับคำสั่งซื้อที่อนุมัติแล้ว, บันทึกการรับชำระเงิน, และพิมพ์ใบเสร็จรับเงินอย่างเป็นทางการ
          </p>
        </div>

        <button
          onClick={fetchFinanceData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรชข้อมูล
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between shadow-sm border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            )}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-bold hover:underline">
            ปิด
          </button>
        </div>
      )}

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-amber-600 uppercase">รอออกใบเสร็จ (UC15)</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">{ordersWithoutReceipt.length}</div>
          <span className="text-xs text-amber-500">อนุมัติราคาแล้ว ยังไม่ออก RC</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-blue-600 uppercase">รอรับชำระเงิน (Unpaid)</span>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {receipts.filter((r) => r.Receipt_Date === null).length}
          </div>
          <span className="text-xs text-blue-500">
            มูลค่า ฿{pendingCollectionAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-emerald-600 uppercase">ชำระเงินเสร็จสิ้น (Paid)</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {receipts.filter((r) => r.Receipt_Date !== null).length}
          </div>
          <span className="text-xs text-emerald-500">บันทึกรับเงินแล้ว (UC16)</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-purple-600 uppercase">ยอดรับเงินสะสม</span>
          <div className="text-2xl font-bold text-purple-700 mt-1">
            ฿{totalRevenueCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-xs text-purple-500">เงินสด/เงินโอนที่เข้าบัญชี</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl">
        <button
          onClick={() => setActiveTab('issue')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'issue'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          ออกใบเสร็จรับเงิน (UC15)
          {ordersWithoutReceipt.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-bold">
              {ordersWithoutReceipt.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('payment')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'payment'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          บันทึกบัญชี / รับชำระเงิน (UC16)
          <span className="ml-1 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full font-bold">
            {receipts.length}
          </span>
        </button>
      </div>

      {/* TAB 1: ISSUE RECEIPT (UC15) */}
      {activeTab === 'issue' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ออกใบเสร็จรับเงินใหม่ (UC15 Issue Receipt)</h2>
              <p className="text-xs text-slate-500">
                รายการคำสั่งซื้อที่ผ่านการอนุมัติใบเสนอราคาแล้ว (Quotation Completed) และยังไม่ได้ออกใบเสร็จ
              </p>
            </div>
            <span className="text-xs font-medium bg-purple-50 text-purple-800 px-3 py-1 rounded-full border border-purple-200">
              Check Constraint: เมื่อสร้างใหม่ Receipt_Date และ Payment_Receiver จะเป็น NULL เพื่อรอบันทึกใน UC16
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลดรายการคำสั่งซื้อ...</div>
          ) : ordersWithoutReceipt.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed rounded-lg">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <span className="font-semibold block text-slate-700">ไม่มีคำสั่งซื้อที่ค้างออกใบเสร็จ</span>
              <span className="text-xs">ทุกคำสั่งซื้อที่อนุมัติราคาแล้วได้ออกใบเสร็จครบถ้วน</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">รหัสคำสั่งซื้อ</th>
                    <th className="px-4 py-3">ลูกค้า / ที่อยู่</th>
                    <th className="px-4 py-3">รายการสินค้าในออเดอร์</th>
                    <th className="px-4 py-3 text-center">สถานะออเดอร์</th>
                    <th className="px-4 py-3 text-right">ยอดรวมเงิน (Total)</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ordersWithoutReceipt.map((order) => {
                    const statusInfo = ORDER_STATUS_LABELS[order.Order_Status] || {
                      label: order.Order_Status,
                      color: 'bg-slate-100 text-slate-700',
                    };

                    return (
                      <tr key={order.Sales_Order_ID} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-blue-600 font-mono">
                          {order.Sales_Order_ID}
                          <span className="block text-[11px] font-normal text-slate-400">
                            วันที่: {order.Order_Date?.slice(0, 10)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900 block">
                            {order.customer.Customer_Name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {order.customer.Customer_Phone} • {order.customer.Customer_Address}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {order.orderDetails.map((item: any) => (
                              <div key={item.Product_ID} className="text-xs text-slate-700">
                                • {item.Product_Name} ({item.Product_Format}) —{' '}
                                <strong>{item.Quantity.toLocaleString()} ชิ้น</strong>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          ฿{Number(order.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleIssueReceipt(order.Sales_Order_ID)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            สร้างใบเสร็จ (UC15)
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECORD PAYMENT (UC16) & RECEIPTS HISTORY */}
      {activeTab === 'payment' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">บันทึกบัญชี / รับชำระเงิน (UC16 Payment Entry)</h2>
              <p className="text-xs text-slate-500">
                รายการใบเสร็จรับเงินทั้งหมด สามารถบันทึกการรับเงิน และเปิดดูเอกสารใบเสร็จฉบับเต็มเพื่อพิมพ์หรือเก็บภาพหน้าจอ
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">สถานะชำระ:</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                <button
                  onClick={() => setPaymentFilter('ALL')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    paymentFilter === 'ALL' ? 'bg-white shadow-sm text-purple-700 font-bold' : 'text-slate-600'
                  }`}
                >
                  ทั้งหมด ({receipts.length})
                </button>
                <button
                  onClick={() => setPaymentFilter('UNPAID')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    paymentFilter === 'UNPAID' ? 'bg-white shadow-sm text-blue-700 font-bold' : 'text-slate-600'
                  }`}
                >
                  รอรับเงิน ({receipts.filter((r) => r.Receipt_Date === null).length})
                </button>
                <button
                  onClick={() => setPaymentFilter('PAID')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    paymentFilter === 'PAID' ? 'bg-white shadow-sm text-emerald-700 font-bold' : 'text-slate-600'
                  }`}
                >
                  ชำระแล้ว ({receipts.filter((r) => r.Receipt_Date !== null).length})
                </button>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ RC, SO, หรือลูกค้า..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Table of Receipts */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลดรายการใบเสร็จ...</div>
          ) : filteredReceipts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed rounded-lg">
              ไม่พบรายการใบเสร็จที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">เลขที่ใบเสร็จ</th>
                    <th className="px-4 py-3">คำสั่งซื้อ / ลูกค้า</th>
                    <th className="px-4 py-3 text-right">ยอดเงินรวม</th>
                    <th className="px-4 py-3 text-center">สถานะการชำระเงิน</th>
                    <th className="px-4 py-3">วันที่รับเงิน & ผู้รับเงิน</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredReceipts.map((rc) => {
                    const isPaid = rc.Receipt_Date !== null;
                    const order = rc.salesOrder;

                    return (
                      <tr key={rc.Receipt_ID} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-purple-700 font-mono">
                          {rc.Receipt_ID}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900 block">
                            {order.customer.Customer_Name}
                          </span>
                          <span className="text-xs text-slate-500">
                            คำสั่งซื้อ: <strong className="text-slate-700">{rc.Sales_Order_ID}</strong>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          ฿{Number(order.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle className="w-3.5 h-3.5" />
                              รับชำระแล้ว
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                              <Clock className="w-3.5 h-3.5" />
                              รอรับชำระเงิน
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {isPaid ? (
                            <div>
                              <span className="font-semibold text-slate-800 block">
                                ผู้รับ: {rc.Payment_Receiver}
                              </span>
                              <span className="text-slate-400">
                                วันที่: {rc.Receipt_Date?.slice(0, 10)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">ยังไม่ได้รับเงิน</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => {
                                setSelectedReceiptForPay(rc);
                              }}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded text-xs font-semibold transition-colors"
                            >
                              บันทึกรับเงิน (UC16)
                            </button>
                          )}

                          <button
                            onClick={() => setPreviewReceipt(rc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            ดูใบเสร็จ / พิมพ์
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: UC16 RECORD PAYMENT FORM */}
      {selectedReceiptForPay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">บันทึกการรับเงิน (UC16)</h3>
                  <span className="text-xs text-slate-500 font-mono">
                    ใบเสร็จเลขที่: {selectedReceiptForPay.Receipt_ID}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedReceiptForPay(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">คำสั่งซื้อ:</span>
                  <span className="font-bold text-slate-800">{selectedReceiptForPay.Sales_Order_ID}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ลูกค้า:</span>
                  <span className="font-bold text-slate-800">
                    {selectedReceiptForPay.salesOrder.customer.Customer_Name}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 text-sm">
                  <span className="font-semibold text-slate-700">ยอดเงินที่ต้องรับชำระ:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    ฿{Number(selectedReceiptForPay.salesOrder.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  วันที่รับเงิน (Receipt Date)
                </label>
                <input
                  type="date"
                  value={receiptDateInput}
                  onChange={(e) => setReceiptDateInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อผู้รับเงิน / แคชเชียร์ (Payment Receiver)
                </label>
                <input
                  type="text"
                  value={receiverNameInput}
                  onChange={(e) => setReceiverNameInput(e.target.value)}
                  placeholder="เช่น นางสาวสมศรี การเงินดี (แคชเชียร์)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                เมื่อบันทึกแล้ว ข้อมูลวันที่และชื่อผู้รับเงินจะถูกบันทึกลงในระบบอย่างสมบูรณ์
                และใบเสร็จจะถูกเปลี่ยนสถานะเป็น &quot;รับชำระแล้ว&quot;
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedReceiptForPay(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !receiverNameInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'ยืนยันบันทึกรับเงิน (UC16)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OFFICIAL RECEIPT PREVIEW / PRINT MODAL */}
      {previewReceipt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-8 my-8 space-y-6 border border-slate-300">
            {/* Modal Controls (Not Printed) */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                ตัวอย่างเอกสารใบเสร็จรับเงิน (Official Receipt Document Preview)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  พิมพ์เอกสาร (Print)
                </button>
                <button
                  onClick={() => setPreviewReceipt(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* DOCUMENT BODY: A4 FORMAL THAI RECEIPT */}
            <div className="space-y-6 text-slate-800 p-2">
              {/* Header: Company Profile */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-800 pb-5">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    ร้านวันชัยการพิมพ์ (Wanchai Printing)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110
                    <br />
                    โทรศัพท์: 02-123-4567 • อีเมล: contact@wanchaiprinting.com
                    <br />
                    เลขประจำตัวผู้เสียภาษีอากร: <strong className="text-slate-800">0-1055-58012-34-5</strong> (สำนักงานใหญ่)
                  </p>
                </div>
                <div className="text-right sm:text-right">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-bold rounded tracking-wider uppercase mb-1">
                    ต้นฉบับ / Original
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">ใบเสร็จรับเงิน</h2>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">
                    RECEIPT / TAX INVOICE
                  </span>
                </div>
              </div>

              {/* Document Meta Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500">ชื่อลูกค้า: </span>
                    <strong className="text-slate-900">{previewReceipt.salesOrder.customer.Customer_Name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">ที่อยู่จัดส่ง: </span>
                    <span className="text-slate-700">{previewReceipt.salesOrder.customer.Customer_Address}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">เบอร์โทรศัพท์: </span>
                    <span className="text-slate-700">{previewReceipt.salesOrder.customer.Customer_Phone}</span>
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div>
                    <span className="text-slate-500">เลขที่ใบเสร็จ (Receipt No.): </span>
                    <strong className="text-purple-700 font-mono text-sm">{previewReceipt.Receipt_ID}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">อ้างอิงคำสั่งซื้อ (Order No.): </span>
                    <strong className="text-slate-800 font-mono">{previewReceipt.Sales_Order_ID}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">วันที่รับเงิน (Date): </span>
                    <strong className="text-slate-800">
                      {previewReceipt.Receipt_Date ? previewReceipt.Receipt_Date.slice(0, 10) : '— ยังไม่ชำระ (รอรับเงิน) —'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-12">ลำดับ</th>
                      <th className="py-2.5 px-3">รายการสินค้า (Description)</th>
                      <th className="py-2.5 px-3">รูปแบบ / สเปก</th>
                      <th className="py-2.5 px-3 text-right">จำนวน</th>
                      <th className="py-2.5 px-3 text-right">ราคาต่อหน่วย</th>
                      <th className="py-2.5 px-3 text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewReceipt.salesOrder.orderDetails.map((item: any, idx: number) => {
                      const unitPrice = item.quotationDetail
                        ? Number(item.quotationDetail.Unit_Price)
                        : Number(previewReceipt.salesOrder.Total_Amount) / item.Quantity;
                      const lineTotal = item.quotationDetail
                        ? Number(item.quotationDetail.Total_Price)
                        : unitPrice * item.Quantity;

                      return (
                        <tr key={item.Product_ID}>
                          <td className="py-2.5 px-3 text-center text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{item.Product_Name}</td>
                          <td className="py-2.5 px-3 text-slate-600">{item.Product_Format}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{item.Quantity.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            ฿{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                            ฿{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Box */}
              <div className="flex justify-end">
                <div className="w-72 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>มูลค่ารวมก่อนภาษี (Subtotal):</span>
                    <span className="font-mono">
                      ฿{(Number(previewReceipt.salesOrder.Total_Amount) / 1.07).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ภาษีมูลค่าเพิ่ม 7% (VAT):</span>
                    <span className="font-mono">
                      ฿{(Number(previewReceipt.salesOrder.Total_Amount) - Number(previewReceipt.salesOrder.Total_Amount) / 1.07).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-slate-300 pt-1.5 text-slate-900">
                    <span>ยอดเงินสุทธิ (Grand Total):</span>
                    <span className="font-mono text-purple-700">
                      ฿{Number(previewReceipt.salesOrder.Total_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures & Stamps */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs text-center">
                <div className="space-y-6">
                  <div className="h-10 border-b border-dashed border-slate-400 w-48 mx-auto flex items-end justify-center">
                    <span className="text-[11px] text-slate-500">ฝ่ายขายและประเมินราคา</span>
                  </div>
                  <span className="text-slate-600 block">ผู้จัดทำเอกสาร (Issued By)</span>
                </div>

                <div className="space-y-6">
                  <div className="h-10 border-b border-dashed border-slate-400 w-48 mx-auto flex items-end justify-center">
                    {previewReceipt.Payment_Receiver ? (
                      <span className="font-bold text-emerald-800 text-[11px]">
                        {previewReceipt.Payment_Receiver}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">— รอรับชำระเงิน —</span>
                    )}
                  </div>
                  <span className="text-slate-600 block">ผู้รับเงิน / แคชเชียร์ (Received By)</span>
                </div>
              </div>

              {/* Document Footer Note */}
              <div className="text-[10px] text-slate-400 text-center border-t border-slate-100 pt-3">
                เอกสารนี้เป็นหลักฐานการรับเงินที่ถูกต้องตามกฎหมาย ออกโดยระบบจัดการโรงพิมพ์ ร้านวันชัยการพิมพ์
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
