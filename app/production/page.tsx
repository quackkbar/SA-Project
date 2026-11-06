'use client';

import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Layers,
  FileCheck2,
  PlusCircle,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  Printer,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  PRINT_JOB_STATUS_LABELS,
  PROTOTYPE_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '@/lib/types';

export default function ProductionPage() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'prototype' | 'production' | 'reorder'>('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Prototype Modal / Action State
  const [selectedJobForProto, setSelectedJobForProto] = useState<any | null>(null);
  const [plateInput, setPlateInput] = useState('');
  const [mockupTemplate, setMockupTemplate] = useState('โบรชัวร์แผ่นพับ 4 สี A4 เคลือบด้าน');

  // Production Record Form State
  const [selectedJobForProd, setSelectedJobForProd] = useState<any | null>(null);
  const [qtyProducedInput, setQtyProducedInput] = useState<number>(0);
  const [prodDateInput, setProdDateInput] = useState(new Date().toISOString().slice(0, 10));

  // Reorder Form State
  const [selectedJobForReorder, setSelectedJobForReorder] = useState<any | null>(null);
  const [reorderReasonInput, setReorderReasonInput] = useState('ผลิตชดเชยของเสียจากการตรวจสอบ QC');

  // Feedback State
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/production/jobs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setJobs(data);
      }
    } catch (err) {
      console.error('Fetch jobs error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // UC7 - UC10: Prototype Lifecycle Handler
  const handlePrototypeAction = async (printJobId: string, action: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/production/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printJobId,
          action,
          plateId: plateInput || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการดำเนินการ');
      }

      showNotification('success', `อัปเดตสถานะแบบพิมพ์ (${action}) สำเร็จ`);
      setSelectedJobForProto(null);
      fetchJobs();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // UC11: Daily Production Recording Handler
  const handleRecordProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobForProd || !selectedJobForProd.metrics.activeBatch) {
      showNotification('error', 'กรุณาเลือกใบสั่งผลิตที่มี Batch กำลังเปิดอยู่');
      return;
    }

    if (qtyProducedInput <= 0) {
      showNotification('error', 'จำนวนยอดผลิตต้องมากกว่า 0');
      return;
    }

    setActionLoading(true);
    try {
      const batchId = selectedJobForProd.metrics.activeBatch.Batch_ID;
      const res = await fetch('/api/production/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          quantityProduced: Number(qtyProducedInput),
          productionDate: prodDateInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการบันทึกยอดผลิต');
      }

      showNotification('success', `บันทึกยอดผลิต ${qtyProducedInput} ชิ้น ใน Batch ${batchId} เรียบร้อยแล้ว`);
      setQtyProducedInput(0);
      setSelectedJobForProd(null);
      fetchJobs();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // UC13: Reorder Batch Handler
  const handleReorder = async (printJobId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/production/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printJobId,
          reason: reorderReasonInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการสั่งผลิตเพิ่ม');
      }

      showNotification('success', `เปิดสั่งผลิตรอบใหม่ (${data.newBatchId} - Cycle ${data.newBatchCycle}) จำนวน ${data.targetQuantity} ชิ้น สำเร็จ`);
      setSelectedJobForReorder(null);
      fetchJobs();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.Print_Job_ID.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.orderDetail.Product_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.orderDetail.Sales_Order_ID.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.orderDetail.salesOrder.customer.Customer_Name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || job.Print_Job_Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              ฝ่ายผลิต (Production)
            </span>
            <span className="text-xs text-slate-500 font-medium">Use Cases: UC6 - UC11, UC13</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">ระบบบริหารการผลิตและควบคุมแบบพิมพ์</h1>
          <p className="text-sm text-slate-500">
            ตรวจรับใบสั่งผลิต, บริหารวงรอบการออกแบบและอนุมัติแบบพิมพ์ (Prototype), บันทึกยอดผลิตจริง และสั่งผลิตชดเชย
          </p>
        </div>

        <button
          onClick={fetchJobs}
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
          <span className="text-xs font-semibold text-slate-500 uppercase">ใบสั่งผลิตทั้งหมด</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{jobs.length}</div>
          <span className="text-xs text-slate-400">รายการในระบบ</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-purple-600 uppercase">ขั้นตอนแบบพิมพ์ (In Design)</span>
          <div className="text-2xl font-bold text-purple-700 mt-1">
            {jobs.filter((j) => j.Print_Job_Status === 'In_Design').length}
          </div>
          <span className="text-xs text-purple-500">รอออกแบบ / ตรวจแบบ</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-blue-600 uppercase">กำลังพิมพ์งาน (In Production)</span>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {jobs.filter((j) => j.Print_Job_Status === 'In_Production').length}
          </div>
          <span className="text-xs text-blue-500">มี Batch เปิดเดินเครื่อง</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-amber-600 uppercase">รอ QC / ผลิตเพิ่ม</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {jobs.filter((j) => j.Print_Job_Status === 'QC_Pending' || j.metrics?.canReorder).length}
          </div>
          <span className="text-xs text-amber-500">รอตรวจสอบคุณภาพ</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'jobs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          รายการใบสั่งผลิต (UC6)
        </button>

        <button
          onClick={() => setActiveTab('prototype')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'prototype'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          จัดการแบบพิมพ์ Prototype (UC7–UC10)
        </button>

        <button
          onClick={() => setActiveTab('production')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'production'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          บันทึกยอดผลิตจริงประจำวัน (UC11)
        </button>

        <button
          onClick={() => setActiveTab('reorder')}
          className={`flex items-center gap-2 py-4 px-4 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'reorder'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          สั่งผลิตเพิ่มรอบใหม่ (UC13)
        </button>
      </div>

      {/* TAB 1: LIST PRINT JOBS (UC6) */}
      {activeTab === 'jobs' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหา Job ID, สินค้า, ลูกค้า, SO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">สถานะงานพิมพ์ทั้งหมด</option>
                <option value="In_Design">อยู่ในขั้นตอนออกแบบ (In Design)</option>
                <option value="In_Production">กำลังเดินเครื่องพิมพ์ (In Production)</option>
                <option value="QC_Pending">รอตรวจคุณภาพ (QC Pending)</option>
                <option value="Completed">ผลิตเสร็จสมบูรณ์ (Completed)</option>
              </select>
            </div>
          </div>

          {/* Table of Jobs */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลดรายการใบสั่งผลิต...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ไม่พบรายการใบสั่งผลิตที่ตรงกับเงื่อนไข</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">รหัสงานพิมพ์</th>
                    <th className="px-4 py-3">คำสั่งซื้อ / ลูกค้า</th>
                    <th className="px-4 py-3">รายการสินค้า & สเปก</th>
                    <th className="px-4 py-3 text-center">สถานะแบบพิมพ์ (Proto)</th>
                    <th className="px-4 py-3 text-center">สถานะงานพิมพ์</th>
                    <th className="px-4 py-3 text-center">ความคืบหน้าผลิต/QC</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredJobs.map((job) => {
                    const protoBadge = PROTOTYPE_STATUS_LABELS[job.Prototype_Status] || {
                      label: job.Prototype_Status,
                      color: 'bg-gray-100 text-gray-800',
                    };
                    const jobBadge = PRINT_JOB_STATUS_LABELS[job.Print_Job_Status] || {
                      label: job.Print_Job_Status,
                      color: 'bg-gray-100 text-gray-800',
                    };

                    return (
                      <tr key={job.Print_Job_ID} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {job.Print_Job_ID}
                          {job.Plate_ID && (
                            <span className="block text-[11px] font-normal text-slate-400">
                              Plate: {job.Plate_ID}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">
                            {job.orderDetail.Sales_Order_ID}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {job.orderDetail.salesOrder.customer.Customer_Name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">
                            {job.orderDetail.Product_Name}
                          </span>
                          <div className="text-xs text-slate-500">
                            <span>จำนวน: {job.orderDetail.Quantity.toLocaleString()} ชิ้น</span>
                            <span className="mx-1">•</span>
                            <span>{job.orderDetail.Product_Format}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${protoBadge.color}`}
                          >
                            {protoBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${jobBadge.color}`}
                          >
                            {jobBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="w-28 mx-auto">
                            <div className="flex justify-between text-[11px] font-medium text-slate-600 mb-1">
                              <span>ผ่าน QC: {job.metrics.totalPassed}</span>
                              <span>{job.metrics.completionPercent}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full"
                                style={{ width: `${job.metrics.completionPercent}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              ผลิตแล้ว {job.metrics.totalProduced} / เป้าหมาย {job.orderDetail.Quantity}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {job.Print_Job_Status === 'In_Design' && (
                            <button
                              onClick={() => {
                                setSelectedJobForProto(job);
                                setPlateInput(job.Plate_ID || '');
                                setActiveTab('prototype');
                              }}
                              className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded text-xs font-medium transition-colors border border-purple-200"
                            >
                              ทำแบบพิมพ์
                            </button>
                          )}

                          {job.Print_Job_Status === 'In_Production' && job.metrics.activeBatch && (
                            <button
                              onClick={() => {
                                setSelectedJobForProd(job);
                                setQtyProducedInput(
                                  Math.max(
                                    0,
                                    job.metrics.activeBatch.Target_Quantity -
                                      job.metrics.activeBatch.Produced_Quantity
                                  )
                                );
                                setActiveTab('production');
                              }}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-medium transition-colors border border-blue-200"
                            >
                              ลงยอดผลิต
                            </button>
                          )}

                          {job.metrics?.canReorder && (
                            <button
                              onClick={() => {
                                setSelectedJobForReorder(job);
                                setActiveTab('reorder');
                              }}
                              className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-xs font-medium transition-colors border border-amber-200"
                            >
                              สั่งผลิตเพิ่ม
                            </button>
                          )}
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

      {/* TAB 2: PROTOTYPE LIFECYCLE (UC7 - UC10) */}
      {activeTab === 'prototype' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">วงรอบแบบพิมพ์ตัวอย่าง (Prototype Lifecycle)</h2>
              <p className="text-xs text-slate-500">
                กระบวนการออกแบบ ทำแบบพิมพ์ตัวอย่าง ส่งให้ลูกค้าตรวจ และอนุมัติเพื่อเริ่มสายการผลิต (UC7 - UC10)
              </p>
            </div>
            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
              กฎความถูกต้อง: เมื่ออนุมัติ จะสร้าง Batch 1 (Target = Order Quantity) ในทรานแซกชันเดียวกันทันที
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Select Job in Design */}
            <div className="lg:col-span-1 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                เลือกใบสั่งผลิตที่ต้องทำแบบพิมพ์ ({jobs.filter((j) => j.Print_Job_Status === 'In_Design').length})
              </span>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {jobs
                  .filter((j) => j.Print_Job_Status === 'In_Design')
                  .map((job) => {
                    const isSelected = selectedJobForProto?.Print_Job_ID === job.Print_Job_ID;
                    const badge = PROTOTYPE_STATUS_LABELS[job.Prototype_Status];
                    return (
                      <div
                        key={job.Print_Job_ID}
                        onClick={() => {
                          setSelectedJobForProto(job);
                          setPlateInput(job.Plate_ID || '');
                        }}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">{job.Print_Job_ID}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">
                          {job.orderDetail.Product_Name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                          <span>SO: {job.orderDetail.Sales_Order_ID}</span>
                          <span>{job.orderDetail.Quantity.toLocaleString()} ชิ้น</span>
                        </div>
                      </div>
                    );
                  })}
                {jobs.filter((j) => j.Print_Job_Status === 'In_Design').length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs border border-dashed rounded-lg">
                    ไม่มีใบสั่งผลิตในขั้นตอนทำแบบพิมพ์
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Prototype Action Center */}
            <div className="lg:col-span-2">
              {selectedJobForProto ? (
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6">
                  {/* Job Header */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">
                          {selectedJobForProto.Print_Job_ID}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                            PROTOTYPE_STATUS_LABELS[selectedJobForProto.Prototype_Status].color
                          }`}
                        >
                          {PROTOTYPE_STATUS_LABELS[selectedJobForProto.Prototype_Status].label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        สินค้า: <strong className="text-slate-700">{selectedJobForProto.orderDetail.Product_Name}</strong> ({selectedJobForProto.orderDetail.Product_Format})
                        {' • '}จำนวนเป้าหมาย: <strong className="text-slate-700">{selectedJobForProto.orderDetail.Quantity.toLocaleString()} ชิ้น</strong>
                      </div>
                    </div>
                  </div>

                  {/* Visual Prototype Stage Stepper */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <span className="text-xs font-bold text-slate-600 block mb-3 uppercase">
                      ขั้นตอนการทำงาน (Prototype Workflow)
                    </span>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
                      <div
                        className={`p-2.5 rounded-lg border ${
                          selectedJobForProto.Prototype_Status === 'Not_Started'
                            ? 'bg-slate-200 border-slate-400 text-slate-800'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        }`}
                      >
                        1. ยังไม่เริ่ม
                      </div>
                      <div
                        className={`p-2.5 rounded-lg border ${
                          selectedJobForProto.Prototype_Status === 'In_Progress'
                            ? 'bg-indigo-100 border-indigo-400 text-indigo-900 ring-2 ring-indigo-400'
                            : ['Pending', 'Completed'].includes(selectedJobForProto.Prototype_Status)
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}
                      >
                        2. กำลังออกแบบ
                      </div>
                      <div
                        className={`p-2.5 rounded-lg border ${
                          selectedJobForProto.Prototype_Status === 'Pending'
                            ? 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-400'
                            : selectedJobForProto.Prototype_Status === 'Under_Revision'
                            ? 'bg-rose-100 border-rose-400 text-rose-900 ring-2 ring-rose-400'
                            : selectedJobForProto.Prototype_Status === 'Completed'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}
                      >
                        3. ตรวจแบบพิมพ์
                      </div>
                      <div
                        className={`p-2.5 rounded-lg border ${
                          selectedJobForProto.Prototype_Status === 'Completed'
                            ? 'bg-teal-100 border-teal-400 text-teal-900 ring-2 ring-teal-400'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}
                      >
                        4. อนุมัติ & ผลิต
                      </div>
                    </div>
                  </div>

                  {/* Actions for Step 1 / Under Revision: UC7 Start Design */}
                  {(selectedJobForProto.Prototype_Status === 'Not_Started' ||
                    selectedJobForProto.Prototype_Status === 'Under_Revision') && (
                    <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {selectedJobForProto.Prototype_Status === 'Not_Started'
                              ? 'UC7: เริ่มทำแบบพิมพ์ตัวอย่าง (Start Prototype)'
                              : 'UC7: เริ่มแก้ไขแบบพิมพ์ตามข้อเสนอแนะ (Start Revision)'}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            กดปุ่มนี้เพื่อเปลี่ยนสถานะเป็น &quot;กำลังทำแบบพิมพ์ (In_Progress)&quot; และเปิดหน้าจัดการเพลท
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handlePrototypeAction(selectedJobForProto.Print_Job_ID, 'start')}
                        disabled={actionLoading}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                      >
                        {actionLoading ? 'กำลังดำเนินการ...' : 'ยืนยันเริ่มทำแบบพิมพ์ (UC7)'}
                      </button>
                    </div>
                  )}

                  {/* Actions for Step 2: UC8 Mockup & Plate + UC9 Submit */}
                  {selectedJobForProto.Prototype_Status === 'In_Progress' && (
                    <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        UC8: บันทึกข้อมูลแบบและเพลทแม่พิมพ์ (Mockup & Plate Design)
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            รหัสแม่พิมพ์ / Plate ID
                          </label>
                          <input
                            type="text"
                            placeholder="เช่น PLT-2026-042, CTP-OFFSET-01"
                            value={plateInput}
                            onChange={(e) => setPlateInput(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            รูปแบบตัวอย่างจำลอง (Template Preview)
                          </label>
                          <select
                            value={mockupTemplate}
                            onChange={(e) => setMockupTemplate(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="โบรชัวร์แผ่นพับ 4 สี A4 เคลือบด้าน">โบรชัวร์แผ่นพับ 4 สี A4 เคลือบด้าน</option>
                            <option value="กล่องบรรจุภัณฑ์ UV เคลือบเงา ปั๊มทอง">กล่องบรรจุภัณฑ์ UV เคลือบเงา ปั๊มทอง</option>
                            <option value="นามบัตรกระดาษอาร์ต 300 แกรม เคลือบ PVC">นามบัตรกระดาษอาร์ต 300 แกรม เคลือบ PVC</option>
                            <option value="แผ่นพับ 3 ตอน พิมพ์สีหน้า-หลัง คมชัดสูง">แผ่นพับ 3 ตอน พิมพ์สีหน้า-หลัง คมชัดสูง</option>
                          </select>
                        </div>
                      </div>

                      {/* Visual Mockup Box */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-inner flex-shrink-0">
                          <Printer className="w-8 h-8 opacity-80" />
                        </div>
                        <div className="text-xs">
                          <span className="font-bold text-slate-800 block text-sm">{mockupTemplate}</span>
                          <span className="text-slate-500">
                            ขนาด: {selectedJobForProto.orderDetail.Product_Format} • พร้อมสำหรับนำเสนอให้ลูกค้าและหัวหน้าตรวจรับ
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handlePrototypeAction(selectedJobForProto.Print_Job_ID, 'submit')}
                          disabled={actionLoading}
                          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                        >
                          {actionLoading ? 'กำลังดำเนินการ...' : 'UC9: ออกแบบเสร็จสิ้น ส่งตรวจแบบพิมพ์ (Submit)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions for Step 3: UC10 Prototype Inspection & Approval */}
                  {selectedJobForProto.Prototype_Status === 'Pending' && (
                    <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                          <FileCheck2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            UC10: ตรวจสอบและอนุมัติแบบพิมพ์ (Prototype Inspection & Approval)
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            แบบพิมพ์อยู่ในสถานะ &quot;รอตรวจแบบพิมพ์&quot; สามารถอนุมัติเพื่อเริ่มการผลิต หรือขอแก้ไขแบบได้
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <strong>ผลกระทบเมื่ออนุมัติ:</strong> ระบบจะอัปเดตสถานะงานพิมพ์เป็น &quot;กำลังเดินเครื่องพิมพ์&quot; และทำการสร้าง <strong>Batch 1 (Target: {selectedJobForProto.orderDetail.Quantity.toLocaleString()} ชิ้น)</strong> ในฐานข้อมูลทันที
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          onClick={() => handlePrototypeAction(selectedJobForProto.Print_Job_ID, 'request_revision')}
                          disabled={actionLoading}
                          className="flex-1 py-2.5 bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 font-semibold text-sm rounded-lg transition-colors"
                        >
                          ขอแก้ไขแบบพิมพ์ (Under Revision)
                        </button>
                        <button
                          onClick={() => handlePrototypeAction(selectedJobForProto.Print_Job_ID, 'approve')}
                          disabled={actionLoading}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                        >
                          {actionLoading ? 'กำลังสร้าง Batch...' : 'อนุมัติแบบพิมพ์ & สั่งผลิตทันที (Approve)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Completed State */}
                  {selectedJobForProto.Prototype_Status === 'Completed' && (
                    <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-lg flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                      <div className="text-xs text-emerald-900">
                        <span className="font-bold text-sm block">แบบพิมพ์ได้รับการอนุมัติเรียบร้อยแล้ว</span>
                        อนุมัติเมื่อ: {selectedJobForProto.Prototype_Approved_Date?.slice(0, 10) || 'วันนี้'} • สถานะปัจจุบันพร้อมเดินเครื่องพิมพ์ในแท็บ &quot;บันทึกยอดผลิตจริง&quot;
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500">
                  <FileCheck2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <span className="font-semibold block text-slate-700">กรุณาเลือกใบสั่งผลิตจากแถบซ้ายมือ</span>
                  <span className="text-xs">เพื่อดูรายละเอียด จัดการเพลท หรือดำเนินการอนุมัติแบบพิมพ์</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DAILY PRODUCTION RECORDING (UC11) */}
      {activeTab === 'production' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">บันทึกยอดผลิตจริงประจำวัน (UC11 Daily Production)</h2>
              <p className="text-xs text-slate-500">
                บันทึกยอดชิ้นงานที่เครื่องพิมพ์ผลิตได้จริงในแต่ละวัน ระบบจะสะสมยอดเข้า Batch อัตโนมัติด้วย Trigger ฐานข้อมูล
              </p>
            </div>
            <span className="text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
              เมื่อยอดสะสมถึงเป้าหมาย: Batch จะปิดอัตโนมัติ และสถานะปรับเป็น &quot;รอตรวจ QC&quot;
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Select Open Batches */}
            <div className="lg:col-span-1 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                งานที่กำลังเดินเครื่องพิมพ์ ({jobs.filter((j) => j.metrics?.activeBatch).length})
              </span>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {jobs
                  .filter((j) => j.metrics?.activeBatch)
                  .map((job) => {
                    const isSelected = selectedJobForProd?.Print_Job_ID === job.Print_Job_ID;
                    const batch = job.metrics.activeBatch;
                    const progress = Math.min(
                      100,
                      Math.round((batch.Produced_Quantity / batch.Target_Quantity) * 100)
                    );

                    return (
                      <div
                        key={job.Print_Job_ID}
                        onClick={() => {
                          setSelectedJobForProd(job);
                          setQtyProducedInput(
                            Math.max(0, batch.Target_Quantity - batch.Produced_Quantity)
                          );
                        }}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">{job.Print_Job_ID}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            {batch.Batch_ID} (Cycle {batch.Batch_Cycle})
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">
                          {job.orderDetail.Product_Name}
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                            <span>
                              ผลิตได้ {batch.Produced_Quantity.toLocaleString()} / {batch.Target_Quantity.toLocaleString()}
                            </span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {jobs.filter((j) => j.metrics?.activeBatch).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs border border-dashed rounded-lg">
                    ไม่มีงานพิมพ์ที่มี Batch เปิดอยู่ขณะนี้
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Production Form */}
            <div className="lg:col-span-2">
              {selectedJobForProd && selectedJobForProd.metrics.activeBatch ? (
                <form
                  onSubmit={handleRecordProduction}
                  className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6"
                >
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-blue-600 uppercase">
                          Batch ที่เปิดอยู่: {selectedJobForProd.metrics.activeBatch.Batch_ID} (รอบการผลิต Cycle {selectedJobForProd.metrics.activeBatch.Batch_Cycle})
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">
                          {selectedJobForProd.orderDetail.Product_Name}
                        </h3>
                        <span className="text-xs text-slate-500">
                          ใบสั่งพิมพ์: {selectedJobForProd.Print_Job_ID} • สั่งซื้อ: {selectedJobForProd.orderDetail.Sales_Order_ID}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        สถานะ: Open
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div>
                        <span className="text-[11px] text-slate-400 block">เป้าหมายรอบนี้</span>
                        <span className="text-sm font-bold text-slate-800">
                          {selectedJobForProd.metrics.activeBatch.Target_Quantity.toLocaleString()} ชิ้น
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">ผลิตแล้วสะสม</span>
                        <span className="text-sm font-bold text-blue-600">
                          {selectedJobForProd.metrics.activeBatch.Produced_Quantity.toLocaleString()} ชิ้น
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">ยอดคงเหลือของ Batch</span>
                        <span className="text-sm font-bold text-amber-600">
                          {Math.max(
                            0,
                            selectedJobForProd.metrics.activeBatch.Target_Quantity -
                              selectedJobForProd.metrics.activeBatch.Produced_Quantity
                          ).toLocaleString()}{' '}
                          ชิ้น
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form Inputs */}
                  <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900">กรอกยอดผลิตจริงประจำวัน</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          วันที่เดินเครื่องพิมพ์
                        </label>
                        <input
                          type="date"
                          value={prodDateInput}
                          onChange={(e) => setProdDateInput(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          จำนวนที่ผลิตได้ในกะนี้ (ชิ้น)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={qtyProducedInput || ''}
                          onChange={(e) => setQtyProducedInput(Number(e.target.value))}
                          placeholder="กรอกจำนวน..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Quick Fill Buttons */}
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block mb-1.5">
                        ปุ่มเพิ่มจำนวนด่วน:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[500, 1000, 2000, 5000].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setQtyProducedInput(num)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium text-slate-700 transition-colors"
                          >
                            +{num.toLocaleString()}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setQtyProducedInput(
                              Math.max(
                                0,
                                selectedJobForProd.metrics.activeBatch.Target_Quantity -
                                  selectedJobForProd.metrics.activeBatch.Produced_Quantity
                              )
                            )
                          }
                          className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-xs font-semibold transition-colors"
                        >
                          ใส่ยอดคงเหลือทั้งหมด
                        </button>
                      </div>
                    </div>

                    {/* Live Preview Info */}
                    {qtyProducedInput > 0 && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                        {selectedJobForProd.metrics.activeBatch.Produced_Quantity + qtyProducedInput >=
                        selectedJobForProd.metrics.activeBatch.Target_Quantity ? (
                          <span>
                            ✅ ยอดนี้จะทำให้ <strong>Batch ครบเป้าหมาย</strong> และเปลี่ยนสถานะเป็น &quot;รอตรวจสอบ QC&quot; โดยอัตโนมัติ
                          </span>
                        ) : (
                          <span>
                            ℹ️ ยอดสะสมใหม่จะเป็น{' '}
                            <strong>
                              {(
                                selectedJobForProd.metrics.activeBatch.Produced_Quantity + qtyProducedInput
                              ).toLocaleString()}{' '}
                              / {selectedJobForProd.metrics.activeBatch.Target_Quantity.toLocaleString()} ชิ้น
                            </strong>{' '}
                            (Batch จะยังเปิดอยู่เพื่อรอผลิตต่อ)
                          </span>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={actionLoading || qtyProducedInput <= 0}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                    >
                      {actionLoading ? 'กำลังบันทึก...' : 'ยืนยันบันทึกยอดผลิต (UC11)'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500">
                  <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <span className="font-semibold block text-slate-700">กรุณาเลือกงานพิมพ์ที่กำลังเดินเครื่อง</span>
                  <span className="text-xs">เพื่อบันทึกยอดการผลิตจริงประจำวัน</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REORDER BATCH (UC13) */}
      {activeTab === 'reorder' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">สั่งผลิตเพิ่มรอบใหม่ (UC13 Reorder Batch)</h2>
              <p className="text-xs text-slate-500">
                คำนวณยอดขาดจากการตรวจสอบคุณภาพ (QC) แล้วเปิด Batch ผลิตรอบใหม่ ($Cycle = k+1$)
              </p>
            </div>
            <span className="text-xs font-medium bg-amber-50 text-amber-800 px-3 py-1 rounded-full border border-amber-200">
              เงื่อนไข: ตรวจ QC ครบ 100% ไม่มีงานค้างตรวจ และยอดผ่าน QC ยังไม่ครบตามคำสั่งซื้อ
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Eligible Jobs */}
            <div className="lg:col-span-1 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                งานที่เข้าเกณฑ์สั่งผลิตเพิ่ม ({jobs.filter((j) => j.metrics?.canReorder).length})
              </span>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {jobs
                  .filter((j) => j.metrics?.canReorder)
                  .map((job) => {
                    const isSelected = selectedJobForReorder?.Print_Job_ID === job.Print_Job_ID;
                    return (
                      <div
                        key={job.Print_Job_ID}
                        onClick={() => setSelectedJobForReorder(job)}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/50 shadow-sm ring-1 ring-amber-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">{job.Print_Job_ID}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                            ขาดอีก {job.metrics.deficit.toLocaleString()} ชิ้น
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">
                          {job.orderDetail.Product_Name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                          <span>สั่ง: {job.orderDetail.Quantity.toLocaleString()}</span>
                          <span>ผ่าน QC: {job.metrics.totalPassed.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                {jobs.filter((j) => j.metrics?.canReorder).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs border border-dashed rounded-lg">
                    ขณะนี้ไม่มีรายการที่ขาดชิ้นงานจากการตรวจ QC
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Deficit Calculation & Issue Form */}
            <div className="lg:col-span-2">
              {selectedJobForReorder ? (
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6">
                  {/* Calculation Card */}
                  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-slate-900">
                      สรุปผลการคำนวณยอดชดเชยการผลิต (Deficit Calculation)
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-500 block">ยอดตามสั่งซื้อ</span>
                        <span className="text-base font-bold text-slate-900">
                          {selectedJobForReorder.orderDetail.Quantity.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <span className="text-[11px] text-emerald-700 block">ผ่าน QC แล้ว</span>
                        <span className="text-base font-bold text-emerald-800">
                          {selectedJobForReorder.metrics.totalPassed.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                        <span className="text-[11px] text-rose-700 block">ชำรุด/ของเสีย</span>
                        <span className="text-base font-bold text-rose-800">
                          {selectedJobForReorder.metrics.totalFailed.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 ring-1 ring-amber-400">
                        <span className="text-[11px] text-amber-800 font-bold block">ยอดขาดที่ต้องผลิตเพิ่ม</span>
                        <span className="text-lg font-extrabold text-amber-900">
                          {selectedJobForReorder.metrics.deficit.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1 pt-2">
                      <div>
                        • รอบการผลิตล่าสุด:{' '}
                        <strong>
                          Cycle {selectedJobForReorder.productionBatches.length} (ทุก Batch ปิดครบแล้ว)
                        </strong>
                      </div>
                      <div>
                        • รอบการผลิตที่จะเปิดใหม่:{' '}
                        <strong className="text-blue-700">
                          Cycle {selectedJobForReorder.productionBatches.length + 1}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Reorder Form */}
                  <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900">เปิดคำสั่งผลิตเพิ่มรอบใหม่ (Cycle {selectedJobForReorder.productionBatches.length + 1})</h4>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        เหตุผลการสั่งผลิตเพิ่ม
                      </label>
                      <input
                        type="text"
                        value={reorderReasonInput}
                        onChange={(e) => setReorderReasonInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                      เมื่อยืนยัน ระบบจะสร้าง <strong>PRODUCTION_BATCH ใหม่</strong> ที่มีเป้าหมาย{' '}
                      <strong>{selectedJobForReorder.metrics.deficit.toLocaleString()} ชิ้น</strong> และปรับสถานะงานพิมพ์กลับเป็น &quot;กำลังเดินเครื่องพิมพ์ (In_Production)&quot; ทันที
                    </div>

                    <button
                      onClick={() => handleReorder(selectedJobForReorder.Print_Job_ID)}
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                    >
                      {actionLoading ? 'กำลังสร้างคำสั่งผลิตเพิ่ม...' : 'ยืนยันเปิด Batch ผลิตรอบใหม่ (UC13)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500">
                  <PlusCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <span className="font-semibold block text-slate-700">กรุณาเลือกรายการที่เข้าเกณฑ์สั่งผลิตเพิ่ม</span>
                  <span className="text-xs">เพื่อเปิดคำสั่งผลิตชดเชยของเสีย</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
