'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle,
  PackageCheck,
  Send,
  Calendar,
  UserCheck,
  FileCheck,
  Clock,
  ArrowRight,
} from 'lucide-react';
import {
  DELIVERY_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PRINT_JOB_STATUS_LABELS,
} from '@/lib/types';

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<'qc' | 'delivery'>('qc');
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // QC Form State
  const [selectedProdRecord, setSelectedProdRecord] = useState<any | null>(null);
  const [qtyPassedInput, setQtyPassedInput] = useState<number>(0);
  const [qtyFailedInput, setQtyFailedInput] = useState<number>(0);
  const [qcDateInput, setQcDateInput] = useState(new Date().toISOString().slice(0, 10));

  // Delivery Form State
  const [selectedDelivery, setSelectedDelivery] = useState<any | null>(null);
  const [delivererInput, setDelivererInput] = useState('วันชัย Express (นายประสิทธิ์ ว่องไว)');
  const [deliveryDateInput, setDeliveryDateInput] = useState(new Date().toISOString().slice(0, 10));

  // Feedback State
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resQc, resDel] = await Promise.all([
        fetch('/api/warehouse/qc'),
        fetch('/api/warehouse/delivery'),
      ]);

      const [dataQc, dataDel] = await Promise.all([resQc.json(), resDel.json()]);

      if (Array.isArray(dataQc)) setQcRecords(dataQc);
      if (Array.isArray(dataDel)) setDeliveries(dataDel);
    } catch (err) {
      console.error('Fetch warehouse data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // UC12: Submit QC Inspection Record
  const handleQCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdRecord) {
      showNotification('error', 'กรุณาเลือกรายการผลิตที่ต้องการตรวจ QC');
      return;
    }

    if (qtyPassedInput + qtyFailedInput <= 0) {
      showNotification('error', 'ยอดตรวจ (ผ่าน + เสีย) ต้องมากกว่า 0');
      return;
    }

    if (qtyPassedInput + qtyFailedInput > selectedProdRecord.summary.pendingQC) {
      showNotification(
        'error',
        `ยอดตรวจรวม (${qtyPassedInput + qtyFailedInput}) เกินจำนวนคงเหลือที่รอตรวจ (${selectedProdRecord.summary.pendingQC})`
      );
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/warehouse/qc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedProdRecord.Batch_ID,
          productionRecordId: selectedProdRecord.Production_Record_ID,
          quantityPassed: Number(qtyPassedInput),
          quantityFailed: Number(qtyFailedInput),
          qcDate: qcDateInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการบันทึก QC');
      }

      showNotification(
        'success',
        `บันทึก QC เรียบร้อย (ผ่าน: ${qtyPassedInput.toLocaleString()}, เสีย: ${qtyFailedInput.toLocaleString()})`
      );
      setSelectedProdRecord(null);
      setQtyPassedInput(0);
      setQtyFailedInput(0);
      fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // UC14: Advance Delivery Transition
  const handleDeliveryTransition = async (deliveryId: string, nextStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/warehouse/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId,
          nextStatus,
          deliver: delivererInput,
          deliveryDate: deliveryDateInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะการจัดส่ง');
      }

      showNotification('success', `อัปเดตสถานะการจัดส่งเป็น "${DELIVERY_STATUS_LABELS[nextStatus]?.label || nextStatus}" สำเร็จ`);
      setSelectedDelivery(null);
      fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              คลังสินค้าและ QC (Warehouse & Delivery)
            </span>
            <span className="text-xs text-slate-500 font-medium">Use Cases: UC12, UC14</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">ระบบตรวจรับคุณภาพสินค้าและการส่งมอบ</h1>
          <p className="text-sm text-slate-500">
            ตรวจสอบคุณภาพงานพิมพ์ (QC Passed / Failed), จัดการคิวจัดส่ง และยืนยันการส่งมอบถึงมือลูกค้า
          </p>
        </div>

        <button
          onClick={fetchData}
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
          <span className="text-xs font-semibold text-amber-600 uppercase">รอตรวจสอบ QC</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {qcRecords.filter((r) => !r.summary.isFullyInspected).length}
          </div>
          <span className="text-xs text-amber-500">กะการผลิตที่ค้างตรวจ</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-emerald-600 uppercase">ตรวจ QC ครบแล้ว</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {qcRecords.filter((r) => r.summary.isFullyInspected).length}
          </div>
          <span className="text-xs text-emerald-500">บันทึกผลเรียบร้อย</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-cyan-600 uppercase">เตรียมจัดส่ง (Preparing)</span>
          <div className="text-2xl font-bold text-cyan-700 mt-1">
            {deliveries.filter((d) => d.Delivery_Status === 'Preparing').length}
          </div>
          <span className="text-xs text-cyan-500">พร้อมแพ็คสินค้า</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-green-600 uppercase">ส่งมอบสำเร็จ (Delivered)</span>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {deliveries.filter((d) => d.Delivery_Status === 'Delivered').length}
          </div>
          <span className="text-xs text-green-500">ลูกค้ารับสินค้าเรียบร้อย</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl">
        <button
          onClick={() => setActiveTab('qc')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'qc'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          ตรวจสอบคุณภาพสินค้า QC (UC12)
        </button>

        <button
          onClick={() => setActiveTab('delivery')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'delivery'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          จัดการการจัดส่งสินค้า (UC14)
        </button>
      </div>

      {/* TAB 1: QC INSPECTION (UC12) */}
      {activeTab === 'qc' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">บันทึกผลการตรวจสอบคุณภาพ (UC12 Quality Control)</h2>
              <p className="text-xs text-slate-500">
                แยกจำนวนงานพิมพ์ที่ &quot;ผ่านเกณฑ์ (Passed)&quot; และ &quot;ชำรุด/ของเสีย (Failed)&quot; ตามแต่ละกะการผลิตจริง
              </p>
            </div>
            <span className="text-xs font-medium bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
              เมื่อผ่าน QC ครบตามเป้าหมาย: ระบบจะปรับสถานะงานพิมพ์เป็น &quot;Completed&quot; ทันที
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: List Production Records */}
            <div className="lg:col-span-1 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                กะการผลิตที่ต้องตรวจ QC ({qcRecords.filter((r) => !r.summary.isFullyInspected).length})
              </span>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {qcRecords
                  .filter((r) => !r.summary.isFullyInspected)
                  .map((rec) => {
                    const isSelected = selectedProdRecord?.Production_Record_ID === rec.Production_Record_ID;
                    return (
                      <div
                        key={rec.Production_Record_ID}
                        onClick={() => {
                          setSelectedProdRecord(rec);
                          setQtyPassedInput(rec.summary.pendingQC);
                          setQtyFailedInput(0);
                        }}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">
                            {rec.Production_Record_ID}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            รอตรวจ {rec.summary.pendingQC.toLocaleString()} ชิ้น
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">
                          {rec.productionBatch.printJob.orderDetail.Product_Name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                          <span>Batch: {rec.Batch_ID}</span>
                          <span>ผลิตเมื่อ: {rec.Production_Date?.slice(0, 10)}</span>
                        </div>
                      </div>
                    );
                  })}
                {qcRecords.filter((r) => !r.summary.isFullyInspected).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs border border-dashed rounded-lg">
                    ไม่มีกะการผลิตที่ค้างตรวจ QC ในขณะนี้
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: QC Form */}
            <div className="lg:col-span-2">
              {selectedProdRecord ? (
                <form
                  onSubmit={handleQCSubmit}
                  className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6"
                >
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-emerald-600 uppercase">
                          กะการผลิต: {selectedProdRecord.Production_Record_ID} (Batch: {selectedProdRecord.Batch_ID})
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">
                          {selectedProdRecord.productionBatch.printJob.orderDetail.Product_Name}
                        </h3>
                        <span className="text-xs text-slate-500">
                          รหัสงานพิมพ์: {selectedProdRecord.productionBatch.Print_Job_ID} • ผลิตเมื่อ:{' '}
                          {selectedProdRecord.Production_Date?.slice(0, 10)}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                        ยอดผลิตของกะนี้: {selectedProdRecord.Quantity_Produced.toLocaleString()} ชิ้น
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div>
                        <span className="text-[11px] text-slate-400 block">ตรวจผ่านแล้ว</span>
                        <span className="text-sm font-bold text-emerald-600">
                          {selectedProdRecord.summary.totalPassed.toLocaleString()} ชิ้น
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">ของเสียที่พบ</span>
                        <span className="text-sm font-bold text-rose-600">
                          {selectedProdRecord.summary.totalFailed.toLocaleString()} ชิ้น
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">คงเหลือรอตรวจ</span>
                        <span className="text-sm font-bold text-amber-600">
                          {selectedProdRecord.summary.pendingQC.toLocaleString()} ชิ้น
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* QC Inputs */}
                  <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900">บันทึกผลการตรวจสอบของกะนี้</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          วันที่ตรวจ QC
                        </label>
                        <input
                          type="date"
                          value={qcDateInput}
                          onChange={(e) => setQcDateInput(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-emerald-800 mb-1">
                          จำนวนผ่านเกณฑ์ (Passed)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={qtyPassedInput || ''}
                          onChange={(e) => setQtyPassedInput(Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/30 rounded-lg text-sm font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-rose-800 mb-1">
                          จำนวนชำรุด/ของเสีย (Failed)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={qtyFailedInput || ''}
                          onChange={(e) => setQtyFailedInput(Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-rose-300 bg-rose-50/30 rounded-lg text-sm font-semibold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    {/* Quick Split Buttons */}
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block mb-1.5">
                        ตั้งค่าด่วน:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQtyPassedInput(selectedProdRecord.summary.pendingQC);
                            setQtyFailedInput(0);
                          }}
                          className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-xs font-semibold transition-colors"
                        >
                          ผ่านทั้งหมด 100% ({selectedProdRecord.summary.pendingQC.toLocaleString()} ชิ้น)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const total = selectedProdRecord.summary.pendingQC;
                            const scrap = Math.max(1, Math.round(total * 0.02)); // 2% scrap
                            setQtyPassedInput(total - scrap);
                            setQtyFailedInput(scrap);
                          }}
                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-xs font-semibold transition-colors"
                        >
                          จำลองพบของเสีย 2% (สำหรับทดสอบ UC13 ผลิตเพิ่ม)
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading || qtyPassedInput + qtyFailedInput <= 0}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                    >
                      {actionLoading ? 'กำลังบันทึกผล QC...' : 'ยืนยันบันทึกผลการตรวจสอบ QC (UC12)'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500">
                  <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <span className="font-semibold block text-slate-700">กรุณาเลือกกะการผลิตจากแถบซ้ายมือ</span>
                  <span className="text-xs">เพื่อบันทึกผลการตรวจสอบคุณภาพสินค้า (QC Passed/Failed)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DELIVERY MANAGEMENT (UC14) */}
      {activeTab === 'delivery' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">จัดการการจัดส่งสินค้า (UC14 Delivery Workflow)</h2>
              <p className="text-xs text-slate-500">
                ควบคุมขั้นตอนการจัดส่งสินค้าตามลำดับที่ถูกต้อง: ผลิตเสร็จ $\rightarrow$ เตรียมส่ง $\rightarrow$ อยู่ระหว่างขนส่ง $\rightarrow$ ส่งมอบสำเร็จ
              </p>
            </div>
            <span className="text-xs font-medium bg-cyan-50 text-cyan-800 px-3 py-1 rounded-full border border-cyan-200">
              กฎความถูกต้อง: จะเตรียมจัดส่งได้เมื่อทุกรายการงานพิมพ์ผลิตเสร็จ 100% และผ่าน QC ครบถ้วนเท่านั้น
            </span>
          </div>

          {/* Delivery Table */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลดรายการจัดส่ง...</div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ยังไม่มีรายการจัดส่งในระบบ</div>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery) => {
                const order = delivery.salesOrder;
                const statusBadge = DELIVERY_STATUS_LABELS[delivery.Delivery_Status] || {
                  label: delivery.Delivery_Status,
                  color: 'bg-gray-100 text-gray-800',
                };

                return (
                  <div
                    key={delivery.Delivery_ID}
                    className="border border-slate-200 rounded-xl p-5 bg-white hover:border-slate-300 shadow-sm space-y-4"
                  >
                    {/* Top Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-base">{delivery.Delivery_ID}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-medium text-slate-600">
                            คำสั่งซื้อ: <strong>{delivery.Sales_Order_ID}</strong>
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusBadge.color}`}
                          >
                            {statusBadge.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          ลูกค้า: <strong className="text-slate-700">{order.customer.Customer_Name}</strong> ({order.customer.Customer_Phone})
                          {' • '}ที่อยู่: {order.customer.Customer_Address}
                        </div>
                      </div>

                      {/* Deliverer details if assigned */}
                      {delivery.Deliver && (
                        <div className="text-right text-xs">
                          <span className="text-slate-400 block">พนักงานจัดส่ง:</span>
                          <span className="font-semibold text-slate-800">{delivery.Deliver}</span>
                          {delivery.Delivery_Date && (
                            <span className="text-slate-500 block">
                              วันที่: {delivery.Delivery_Date.slice(0, 10)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Middle: Order Items & QC Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-1.5 uppercase">
                          รายการสินค้าในคำสั่งซื้อ ({order.orderDetails.length} รายการ)
                        </span>
                        <div className="space-y-1">
                          {order.orderDetails.map((item: any) => (
                            <div key={item.Product_ID} className="flex justify-between text-slate-600">
                              <span>
                                • {item.Product_Name} ({item.Product_Format})
                              </span>
                              <span className="font-semibold">
                                {item.Quantity.toLocaleString()} ชิ้น
                                {item.printJob && (
                                  <span
                                    className={`ml-2 text-[10px] px-1.5 py-0.2 rounded font-normal ${
                                      PRINT_JOB_STATUS_LABELS[item.printJob.Print_Job_Status]?.color
                                    }`}
                                  >
                                    {PRINT_JOB_STATUS_LABELS[item.printJob.Print_Job_Status]?.label}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                        <div>
                          <span className="font-bold text-slate-700 block mb-1.5 uppercase">
                            สถานะการผลิต & การตรวจสอบคุณภาพ
                          </span>
                          <div className="flex justify-between text-slate-600 mb-1">
                            <span>ยอดผ่านเกณฑ์ QC รวม:</span>
                            <span className="font-bold text-emerald-700">
                              {delivery.metrics.totalPassedQC.toLocaleString()} / {delivery.metrics.totalOrderQty.toLocaleString()} ชิ้น
                            </span>
                          </div>
                        </div>

                        {delivery.metrics.allJobsCompleted ? (
                          <div className="text-[11px] text-emerald-700 bg-emerald-100/60 p-2 rounded flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span>งานพิมพ์ทั้งหมดผลิตเสร็จสิ้นและผ่าน QC ครบถ้วนแล้ว</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-800 bg-amber-100/60 p-2 rounded flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span>ยังอยู่ระหว่างเดินเครื่องพิมพ์หรือรอตรวจ QC (ยังส่งมอบไม่ได้)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step-by-Step Delivery Action Controls */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
                      <div className="text-xs text-slate-400">
                        {delivery.Delivery_Status === 'Producing' && 'ขั้นตอนที่ 1: รอทุกงานพิมพ์เสร็จสิ้น จึงเริ่มขั้นตอนเตรียมจัดส่ง'}
                        {delivery.Delivery_Status === 'Preparing' && 'ขั้นตอนที่ 2: สินค้าแพ็คเรียบร้อยแล้ว กำหนดผู้จัดส่งและเริ่มนำส่ง'}
                        {delivery.Delivery_Status === 'Shipping' && 'ขั้นตอนที่ 3: สินค้าอยู่บนรถนำส่ง ยืนยันเมื่อลูกค้ารับสินค้าเรียบร้อย'}
                        {delivery.Delivery_Status === 'Delivered' && 'ส่งมอบสำเร็จแล้ว — ข้อมูลถูกส่งต่อไปยังฝ่ายการเงินเพื่อออกใบเสร็จ (UC15)'}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {/* Transition 1: Producing -> Preparing */}
                        {delivery.Delivery_Status === 'Producing' && (
                          <button
                            onClick={() => handleDeliveryTransition(delivery.Delivery_ID, 'Preparing')}
                            disabled={actionLoading || !delivery.metrics.canPrepare}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors ${
                              delivery.metrics.canPrepare
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            }`}
                          >
                            {delivery.metrics.canPrepare ? 'เตรียมจัดส่งสินค้า (Step 1)' : 'รอฝ่ายผลิตเสร็จสิ้น 100%'}
                          </button>
                        )}

                        {/* Transition 2: Preparing -> Shipping */}
                        {delivery.Delivery_Status === 'Preparing' && (
                          <button
                            onClick={() => {
                              setSelectedDelivery(delivery);
                            }}
                            disabled={actionLoading}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                          >
                            ระบุคนส่ง & เริ่มจัดส่ง (Step 2)
                          </button>
                        )}

                        {/* Transition 3: Shipping -> Delivered */}
                        {delivery.Delivery_Status === 'Shipping' && (
                          <button
                            onClick={() => handleDeliveryTransition(delivery.Delivery_ID, 'Delivered')}
                            disabled={actionLoading}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                          >
                            บันทึกส่งมอบสำเร็จ (Step 3)
                          </button>
                        )}

                        {/* Delivered Complete */}
                        {delivery.Delivery_Status === 'Delivered' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ส่งมอบเรียบร้อยสมบูรณ์
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step 2 Inline Assign Modal / Panel */}
                    {selectedDelivery?.Delivery_ID === delivery.Delivery_ID && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3 mt-3">
                        <h4 className="text-xs font-bold text-blue-900 uppercase">
                          กรอกข้อมูลพนักงานจัดส่งและกำหนดวันส่งสินค้า
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              ชื่อพนักงานขนส่ง / ผู้จัดส่ง (Deliverer)
                            </label>
                            <input
                              type="text"
                              value={delivererInput}
                              onChange={(e) => setDelivererInput(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              วันที่เริ่มจัดส่ง (Delivery Date)
                            </label>
                            <input
                              type="date"
                              value={deliveryDateInput}
                              onChange={(e) => setDeliveryDateInput(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedDelivery(null)}
                            className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-50"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeliveryTransition(delivery.Delivery_ID, 'Shipping')}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 shadow-sm"
                          >
                            ยืนยันเริ่มจัดส่ง (Shipping)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
