'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeftCircle,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  RefreshCw,
  Plus,
  RotateCcw,
  Check,
  Calendar,
} from 'lucide-react';
import {
  getStoredPrintJobs,
  saveStoredPrintJobs,
  getStoredOrders,
  saveStoredOrders,
  StoragePrintJobRecord,
  StorageOrderRecord,
  StorageDailyLogRecord,
  StorageQcRecord,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, isoDateForInput } from '@/lib/dateUtils';

function ProductionTrackingContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'status';

  // Master Data from localStorage
  const [printJobs, setPrintJobs] = useState<StoragePrintJobRecord[]>([]);
  const [orders, setOrders] = useState<StorageOrderRecord[]>([]);

  // Navigation mode within each tab:
  // 'list' | 'status_detail' | 'completed_detail' | 'qc_detail' | 'reorder'
  const [viewMode, setViewMode] = useState<
    'list' | 'status_detail' | 'completed_detail' | 'qc_detail' | 'reorder'
  >('list');

  // Selected Jobs
  const [selectedStatusJob, setSelectedStatusJob] = useState<StoragePrintJobRecord | null>(null);
  const [selectedCompletedJob, setSelectedCompletedJob] = useState<StoragePrintJobRecord | null>(null);
  const [selectedQcJob, setSelectedQcJob] = useState<StoragePrintJobRecord | null>(null);

  // Search input
  const [searchTerm, setSearchTerm] = useState('');

  // Toast Notification
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -------------------------------------------------------------------------
  // Modals State for "จำนวนสินค้าที่ผลิตเสร็จ"
  // Requirement:
  // - เมื่อกดอัปเดตต้องขึ้น pop up ให้กรอกรหัสบันทึกการผลิตก่อน แล้วค่อย pop up ให้กรอกจำนวนที่ผลิตเสร็จต่อวัน
  // - ไม่ต้องแสดงข้อความเงื่อนไข
  // -------------------------------------------------------------------------
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false);
  const [completedStep, setCompletedStep] = useState<1 | 2>(1);
  const [inputLogId, setInputLogId] = useState('');
  const [inputLogDate, setInputLogDate] = useState('');
  const [inputDailyQty, setInputDailyQty] = useState<number | ''>('');

  // -------------------------------------------------------------------------
  // Modals State for "จำนวนสินค้าที่ผ่าน QC"
  // Requirement:
  // - เมื่อกดปุ่มอัปเดตจะมี pop up กรอกรหัสบันทึกการตรวจ QC กดถัดไปจะให้กดจำนวนที่ผ่าน QC
  // - ไม่ต้องแสดงข้อความเงื่อนไข
  // -------------------------------------------------------------------------
  const [isQcModalOpen, setIsQcModalOpen] = useState(false);
  const [qcStep, setQcStep] = useState<1 | 2>(1);
  const [inputQcRecordId, setInputQcRecordId] = useState('');
  const [inputQcDate, setInputQcDate] = useState('');
  const [inputQcPassedQty, setInputQcPassedQty] = useState<number | ''>(0);

  // -------------------------------------------------------------------------
  // State for "หน้าสั่งผลิตเพิ่มเติม"
  // Requirement:
  // - เมื่อกดปุ่มสั่งผลิตเพิ่มเติม จะมาที่หน้านี้
  // - รายละเอียดตามใน figma หรือในรูปที่แนบ
  // - เมื่อกดปุ่ม ส่งผลิตเพิ่ม จะมี pop up ให้กรอกจำนวนที่ผลิตเพิ่ม เมื่อกดยืนยันจะ เปลี่ยนสถานะใบสั่งผลิต=In Production (สถานะคำสั่งซื้อ = Print_Job_In_Production)
  // -------------------------------------------------------------------------
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [inputReorderQty, setInputReorderQty] = useState<number | ''>('');

  useEffect(() => {
    loadData();
  }, []);

  // When activeTab in URL changes, reload data and reset to list view
  useEffect(() => {
    loadData();
    setViewMode('list');
    setSelectedStatusJob(null);
    setSelectedCompletedJob(null);
    setSelectedQcJob(null);
    setSearchTerm('');
  }, [activeTab]);

  const loadData = () => {
    const jobs = getStoredPrintJobs();
    const ords = getStoredOrders();
    setPrintJobs(jobs);
    setOrders(ords);
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // -------------------------------------------------------------------------
  // Entity Unique ID Generators (Must not collide and not be empty)
  // Requirement: ถ้าเป็นจำนวนต้องไม่น้อยกว่า 0 ถ้าเป็นรหัสต้องไม่ซ้ำ และต้องไม่เป็นค่าว่าง
  // -------------------------------------------------------------------------
  const generateUniqueLogId = () => {
    const existingLogIds = new Set<string>();
    printJobs.forEach((j) => (j.Daily_Logs || []).forEach((l) => existingLogIds.add(l.logId.toLowerCase())));
    let newId = '';
    do {
      newId = `PR${Math.floor(100 + Math.random() * 900)}`;
    } while (existingLogIds.has(newId.toLowerCase()));
    return newId;
  };

  const generateUniqueQcRecordId = () => {
    const existingQcIds = new Set<string>();
    printJobs.forEach((j) => (j.QC_Records || []).forEach((r) => existingQcIds.add(r.recordId.toLowerCase())));
    let newId = '';
    do {
      newId = `QC${Math.floor(100 + Math.random() * 900)}`;
    } while (existingQcIds.has(newId.toLowerCase()));
    return newId;
  };

  // -------------------------------------------------------------------------
  // TAB 1: สถานะใบสั่งผลิต (Print Job Status) Handlers
  // Requirement: เมื่อเลือกใบสั่งผลิตแล้วจะสามารถดูรายละเอียดของใบสั่งผลิตได้ โดยมี ข้อมูลลูกค้า ข้อมูลใบสั่งผลิต สถานะใบสั่งผลิต
  // -------------------------------------------------------------------------
  const handleOpenStatusDetail = (job: StoragePrintJobRecord) => {
    setSelectedStatusJob(job);
    setViewMode('status_detail');
  };

  // -------------------------------------------------------------------------
  // TAB 2: จำนวนสินค้าที่ผลิตเสร็จ (Completed Count) Handlers
  // Requirement:
  // - แสดงใบสั่งผลิตมีสถานะเป็น In Production
  // - เมื่อกดอัปเดตต้องขึ้น pop up ให้กรอกรหัสบันทึกการผลิตก่อน แล้วค่อย pop up ให้กรอกจำนวนที่ผลิตเสร็จต่อวัน
  // - เช็คว่าทำเสร็จครบตามจำนวนแล้วรึยัง ถ้าครบแล้วปุ่มอัปเดตจะเปลี่ยนไปเป็นปุ่มพร้อมตรวจสอบ QC
  // - เมื่อกดปุ่มพร้อมตรวจสอบ QC ปุ่มจะหายไป สถานะใบสั่งผลิตจะเปลี่ยนเป็น QC Pending(สภานะคำสั่งซื้อ = Print_Job_QC_Pending)
  // -------------------------------------------------------------------------
  const inProductionJobs = printJobs.filter(
    (j) => j.Print_Job_Status === 'In Production' || j.Print_Job_Status === 'In_Production'
  );

  const handleOpenCompletedDetail = (job: StoragePrintJobRecord) => {
    setSelectedCompletedJob(job);
    setViewMode('completed_detail');
  };

  // Trigger modal step 1
  const handleStartCompletedUpdate = () => {
    setInputLogId(generateUniqueLogId());
    setInputLogDate(formatDocumentDate(new Date().toISOString().split('T')[0]));
    setInputDailyQty('');
    setCompletedStep(1);
    setIsCompletedModalOpen(true);
  };

  // Modal Step 1 -> Step 2 validation
  const handleCompletedNextToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = inputLogId.trim();
    if (!trimmedId) {
      showNotification('error', 'บันทึกไม่สำเร็จ: กรุณากรอกรหัสบันทึกการผลิต');
      return;
    }
    const isDuplicate = printJobs.some((j) =>
      (j.Daily_Logs || []).some((l) => l.logId.toLowerCase() === trimmedId.toLowerCase())
    );
    if (isDuplicate) {
      showNotification(
        'error',
        `บันทึกไม่สำเร็จ: รหัสบันทึกการผลิต "${trimmedId}" ซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }
    setCompletedStep(2);
  };

  // Modal Step 2 save handler
  const handleSaveCompletedDailyLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompletedJob) return;

    const trimmedId = inputLogId.trim();
    if (!trimmedId) {
      showNotification('error', 'บันทึกไม่สำเร็จ: กรุณากรอกรหัสบันทึกการผลิต');
      return;
    }

    const qty = Number(inputDailyQty);
    if (inputDailyQty === '' || isNaN(qty) || qty <= 0) {
      showNotification('error', 'บันทึกไม่สำเร็จ: จำนวนที่ผลิตเสร็จต่อวันต้องเป็นตัวเลขที่มากกว่า 0');
      return;
    }

    const currentLogs = selectedCompletedJob.Daily_Logs || [];
    const currentAccum =
      currentLogs.length > 0
        ? currentLogs[currentLogs.length - 1].accumulatedQty
        : (selectedCompletedJob.Produced_Qty || 0);
    const newAccum = currentAccum + qty;
    const targetQty = (selectedCompletedJob.Quantity || 0) + (selectedCompletedJob.Reorder_Qty || 0);
    const newRemaining = Math.max(0, targetQty - newAccum);

    const newLog: StorageDailyLogRecord = {
      logId: trimmedId,
      date: formatDocumentDate(inputLogDate) || new Date().toLocaleDateString('th-TH'),
      remainingQty: newRemaining,
      dailyQty: qty,
      accumulatedQty: newAccum,
    };

    const updatedLogs = [...currentLogs, newLog];
    const updatedJob: StoragePrintJobRecord = {
      ...selectedCompletedJob,
      Produced_Qty: newAccum,
      Daily_Logs: updatedLogs,
    };

    setSelectedCompletedJob(updatedJob);

    const currentJobs = getStoredPrintJobs();
    const targetId = selectedCompletedJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = currentJobs.map((j) =>
      j.Print_Job_ID.trim().toLowerCase() === targetId ? updatedJob : j
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    setFormDirty(false);
    showNotification(
      'success',
      `บันทึกยอดผลิต ${qty.toLocaleString()} ${selectedCompletedJob.Unit} สำเร็จ (สะสม: ${newAccum.toLocaleString()}/${targetQty.toLocaleString()} ${selectedCompletedJob.Unit})`
    );
    setIsCompletedModalOpen(false);
  };

  // Click "พร้อมตรวจสอบ QC"
  // Requirement: เมื่อกดปุ่มพร้อมตรวจสอบ QC ปุ่มจะหายไป สถานะใบสั่งผลิตจะเปลี่ยนเป็น QC Pending(สภานะคำสั่งซื้อ = Print_Job_QC_Pending)
  const handleReadyForQc = () => {
    if (!selectedCompletedJob) return;

    const updatedJob: StoragePrintJobRecord = {
      ...selectedCompletedJob,
      Print_Job_Status: 'QC Pending',
    };
    setSelectedCompletedJob(updatedJob);

    const currentJobs = getStoredPrintJobs();
    const targetId = selectedCompletedJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = currentJobs.map((j) =>
      j.Print_Job_ID.trim().toLowerCase() === targetId ? updatedJob : j
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedCompletedJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedCompletedJob.Sales_Order_ID
          ? { ...o, Order_Status: 'Print_Job_QC_Pending' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      `ส่งมอบงานเพื่อตรวจสอบ QC เรียบร้อยแล้ว (สถานะใบสั่งผลิต: QC Pending, คำสั่งซื้อ: Print_Job_QC_Pending)`
    );
  };

  // -------------------------------------------------------------------------
  // TAB 3: จำนวนสินค้าที่ผ่าน QC (QC Passed) Handlers
  // Requirement:
  // - แสดงใบสั่งผลิตมีสถานะเป็น QC Pending
  // - เมื่อเลือกใบสั่งผลิตจะแสดง ข้อมูลใบสั่งผลิต สถานะใบสั่งผลิต จำนวนสินค้าที่ผ่าน QC และมีปุ่มอัปเดต
  // - ตรงช่องที่แสดงจำนวนสินค้าที่ผ่าน QC ให้ทำเป็นประวัติ ตาม figma คล้ายกับหน้าจำนวนสินค้าที่ผลิตเสร็จ
  // - ต้องมีประวัติ หรือมีสินค้าที่ไม่ผ่าน QC ก่อนถึงจะมีปุ่มสั่งผลิตเพิ่มขึ้นมา
  // - เมื่อกดปุ่มอัปเดตจะมี pop up กรอกรหัสบันทึกการตรวจ QC กดถัดไปจะให้กดจำนวนที่ผ่าน QC
  // - ถ้ามีจำนวนสินค้าทีผ่าน QC ครบแล้วปุ่มอัปเดตจะเปลี่ยนเป็น ดำเนินการผลิตเสร็จสิ้น
  // - เมื่อกดปุ่ม ดำเนินการผลิตเสร็จสิ้น จะเปลี่ยนสถานะใบสั่งผลิต=Completed (สภานะคำสั่งซื้อ = Print_Job_Completed)
  // -------------------------------------------------------------------------
  const qcPendingJobs = printJobs.filter(
    (j) => j.Print_Job_Status === 'QC Pending' || j.Print_Job_Status === 'QC_Pending'
  );

  const handleOpenQcDetail = (job: StoragePrintJobRecord) => {
    setSelectedQcJob(job);
    setViewMode('qc_detail');
  };

  // Start QC Update Modal
  // Requirement: การระบุจำนวนที่ผ่าน QC ค่าเริ่มต้นต้องเป็น 0
  const handleStartQcUpdate = () => {
    setInputQcRecordId(generateUniqueQcRecordId());
    setInputQcDate(formatDocumentDate(new Date().toISOString().split('T')[0]));
    setInputQcPassedQty(0);
    setQcStep(1);
    setIsQcModalOpen(true);
  };

  // Modal Step 1 -> Step 2 validation
  const handleQcNextToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = inputQcRecordId.trim();
    if (!trimmedId) {
      showNotification('error', 'บันทึกไม่สำเร็จ: กรุณากรอกรหัสบันทึกการตรวจ QC');
      return;
    }
    const isDuplicate = printJobs.some((j) =>
      (j.QC_Records || []).some((r) => r.recordId.toLowerCase() === trimmedId.toLowerCase())
    );
    if (isDuplicate) {
      showNotification(
        'error',
        `บันทึกไม่สำเร็จ: รหัสบันทึกการตรวจ QC "${trimmedId}" ซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }
    setQcStep(2);
  };

  // Modal Step 2 save handler
  // Requirement:
  // - ตรงจำนวนสินค้าที่ผ่าน QC การบันทึกประวัติต้องเป็นการทบเพิ่ม เมื่อมีการอัปเดตจำนวน ไม่ใช่การอัปเดตล่าสุด
  // - เมื่อสั่งผลิตใหม่ เกณฑ์จำนวนที่จะผ่าน QC ต้องเท่าเดิม(ตามจำนวนที่สั่งมา) ไม่ใช่เพิ่มขึ้น
  const handleSaveQcPassed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQcJob) return;

    const trimmedId = inputQcRecordId.trim();
    if (!trimmedId) {
      showNotification('error', 'บันทึกไม่สำเร็จ: กรุณากรอกรหัสบันทึกการตรวจ QC');
      return;
    }

    const newlyPassed = Number(inputQcPassedQty);
    if (inputQcPassedQty === '' || isNaN(newlyPassed) || newlyPassed < 0) {
      showNotification('error', 'บันทึกไม่สำเร็จ: จำนวนสินค้าที่ผ่าน QC ต้องเป็นตัวเลขที่ไม่น้อยกว่า 0');
      return;
    }

    const currentRecords = selectedQcJob.QC_Records || [];
    const currentAccumPassed = selectedQcJob.Passed_QC || 0;
    const targetQty = selectedQcJob.Quantity || 0;

    // ทบเพิ่ม (accumulate)
    const newAccumPassed = currentAccumPassed + newlyPassed;
    if (newAccumPassed > targetQty) {
      showNotification(
        'error',
        `จำนวนสินค้าที่ผ่าน QC สะสม (${newAccumPassed.toLocaleString()} ${selectedQcJob.Unit}) ต้องไม่เกินจำนวนที่สั่งผลิต (${targetQty.toLocaleString()} ${selectedQcJob.Unit})`
      );
      return;
    }

    const defect = Math.max(0, targetQty - newAccumPassed);

    const newRecord: StorageQcRecord = {
      recordId: trimmedId,
      date: formatDocumentDate(inputQcDate) || new Date().toLocaleDateString('th-TH'),
      passedQty: newlyPassed,
      accumulatedPassedQty: newAccumPassed,
      defectQty: defect,
    };

    const updatedRecords = [...currentRecords, newRecord];

    const updatedJob: StoragePrintJobRecord = {
      ...selectedQcJob,
      Passed_QC: newAccumPassed,
      QC_Records: updatedRecords,
    };

    setSelectedQcJob(updatedJob);

    const currentJobs = getStoredPrintJobs();
    const targetId = selectedQcJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = currentJobs.map((j) =>
      j.Print_Job_ID.trim().toLowerCase() === targetId ? updatedJob : j
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    setFormDirty(false);
    showNotification(
      'success',
      `บันทึกผล QC เรียบร้อยแล้ว: ผ่านเพิ่ม ${newlyPassed.toLocaleString()} ${selectedQcJob.Unit} (สะสม ${newAccumPassed.toLocaleString()}/${targetQty.toLocaleString()} ${selectedQcJob.Unit}, ไม่ผ่าน ${defect.toLocaleString()} ${selectedQcJob.Unit})`
    );
    setIsQcModalOpen(false);
  };

  // Click "ดำเนินการผลิตเสร็จสิ้น"
  // Requirement: เมื่อกดปุ่ม ดำเนินการผลิตเสร็จสิ้น จะเปลี่ยนสถานะใบสั่งผลิต=Completed (สภานะคำสั่งซื้อ = Print_Job_Completed)
  const handleCompleteProduction = () => {
    if (!selectedQcJob) return;

    const updatedJob: StoragePrintJobRecord = {
      ...selectedQcJob,
      Print_Job_Status: 'Completed',
    };
    setSelectedQcJob(updatedJob);

    const currentJobs = getStoredPrintJobs();
    const targetId = selectedQcJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = currentJobs.map((j) =>
      j.Print_Job_ID.trim().toLowerCase() === targetId ? updatedJob : j
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedQcJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedQcJob.Sales_Order_ID
          ? { ...o, Order_Status: 'Print_Job_Completed' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      `ดำเนินการผลิตเสร็จสิ้นเรียบร้อยแล้ว (สถานะใบสั่งผลิต: Completed, คำสั่งซื้อ: Print_Job_Completed)`
    );
  };

  // -------------------------------------------------------------------------
  // TAB 3 -> VIEW: หน้าสั่งผลิตเพิ่มเติม
  // Requirement:
  // - เมื่อกดปุ่มสั่งผลิตเพิ่มเติม จะมาที่หน้านี้
  // - รายละเอียดตามใน figma หรือในรูปที่แนบ
  // - เมื่อกดปุ่ม ส่งผลิตเพิ่ม จะมี pop up ให้กรอกจำนวนที่ผลิตเพิ่ม เมื่อกดยืนยันจะ เปลี่ยนสถานะใบสั่งผลิต=In Production (สถานะคำสั่งซื้อ = Print_Job_In_Production)
  // -------------------------------------------------------------------------
  const handleGoToReorderPage = () => {
    if (!selectedQcJob) return;
    const targetQty = selectedQcJob.Quantity || 0;
    const defect = Math.max(0, targetQty - (selectedQcJob.Passed_QC ?? 0));
    setInputReorderQty(defect > 0 ? defect : 1);
    setViewMode('reorder');
  };

  const handleOpenReorderModal = () => {
    if (!selectedQcJob) return;
    const targetQty = selectedQcJob.Quantity || 0;
    const defect = Math.max(0, targetQty - (selectedQcJob.Passed_QC ?? 0));
    setInputReorderQty(defect > 0 ? defect : 1);
    setIsReorderModalOpen(true);
  };

  const handleConfirmReorderModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQcJob) return;

    const qty = Number(inputReorderQty);
    if (inputReorderQty === '' || isNaN(qty) || qty <= 0) {
      showNotification('error', 'จำนวนที่ผลิตเพิ่มต้องเป็นตัวเลขที่มากกว่า 0');
      return;
    }

    const prevReorder = selectedQcJob.Reorder_Qty || 0;
    const newReorder = prevReorder + qty;

    // Set job back to 'In Production' and save Reorder_Qty
    const updatedJob: StoragePrintJobRecord = {
      ...selectedQcJob,
      Print_Job_Status: 'In Production',
      Reorder_Qty: newReorder,
    };
    setSelectedQcJob(updatedJob);

    const currentJobs = getStoredPrintJobs();
    const targetId = selectedQcJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = currentJobs.map((j) =>
      j.Print_Job_ID.trim().toLowerCase() === targetId ? updatedJob : j
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedQcJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID === selectedQcJob.Sales_Order_ID
          ? { ...o, Order_Status: 'Print_Job_In_Production' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    setFormDirty(false);
    showNotification(
      'success',
      `สั่งผลิตเพิ่มเติมจำนวน ${qty.toLocaleString()} ${selectedQcJob.Unit} เรียบร้อยแล้ว (สถานะใบสั่งผลิต: In Production, คำสั่งซื้อ: Print_Job_In_Production)`
    );
    setIsReorderModalOpen(false);
    setViewMode('list');
  };

  // Determine Page Title
  const getHeaderTitle = () => {
    if (viewMode === 'status_detail' && selectedStatusJob) {
      return `รายละเอียดใบสั่งผลิต: ${selectedStatusJob.Print_Job_ID}`;
    }
    if (viewMode === 'completed_detail' && selectedCompletedJob) {
      return `จำนวนสินค้าที่ผลิตเสร็จ: ${selectedCompletedJob.Print_Job_ID}`;
    }
    if (viewMode === 'qc_detail' && selectedQcJob) {
      return `จำนวนสินค้าที่ผ่าน QC: ${selectedQcJob.Print_Job_ID}`;
    }
    if (viewMode === 'reorder' && selectedQcJob) {
      return `สั่งผลิตเพิ่มเติม: ${selectedQcJob.Print_Job_ID}`;
    }
    if (activeTab === 'completed') return 'จำนวนสินค้าที่ผลิตเสร็จ';
    if (activeTab === 'qc') return 'จำนวนสินค้าที่ผ่าน QC';
    return 'สถานะใบสั่งผลิต';
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

      {/* Header Bar matching Figma (170px height) */}
      <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
        <div className="flex items-center gap-4">
          {viewMode !== 'list' && (
            <button
              onClick={() => {
                if (viewMode === 'reorder') {
                  setViewMode('qc_detail');
                } else {
                  setViewMode('list');
                }
              }}
              className="text-black hover:opacity-70 transition-opacity"
              title="ย้อนกลับ"
            >
              <ArrowLeftCircle className="w-9 h-9" />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-black">{getHeaderTitle()}</h1>
            {viewMode === 'list' && (
              <p className="text-sm text-neutral-500 mt-1">
                {activeTab === 'status' && 'ติดตามและดูรายละเอียดสถานะใบสั่งผลิตทั้งหมดในระบบ'}
                {activeTab === 'completed' && 'บันทึกและติดตามยอดการผลิตสินค้าที่กำลังดำเนินการ (In Production)'}
                {activeTab === 'qc' && 'บันทึกผลการตรวจสอบคุณภาพสินค้า (QC Pending)'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={loadData}
            title="รีเฟรชข้อมูล"
            className="p-3 text-neutral-500 hover:text-black hover:bg-[#F2F1ED] rounded-xl transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-12 max-w-6xl mx-auto space-y-8">
        {/* =========================================================================
            TAB 1: สถานะใบสั่งผลิต (Print Job Status)
            ========================================================================= */}
        {activeTab === 'status' && viewMode === 'list' && (
          <div className="space-y-6">
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัสใบสั่งผลิต หรือชื่อสินค้า..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-[#F2F1ED] border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="bg-white border-2 border-neutral-200/90 rounded-2xl shadow-sm p-6 space-y-3">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-semibold grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสใบสั่งผลิต</div>
                <div className="col-span-3">รหัสคำสั่งซื้อ</div>
                <div className="col-span-4">ชื่อสินค้า</div>
                <div className="col-span-2 text-right">สถานะใบสั่งผลิต</div>
              </div>

              <div className="space-y-3 pt-2">
                {printJobs.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">ยังไม่มีข้อมูลใบสั่งผลิต</div>
                ) : (
                  printJobs
                    .filter(
                      (j) =>
                        !searchTerm ||
                        j.Print_Job_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        j.Product_Name.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((job) => (
                      <div
                        key={job.Print_Job_ID}
                        onClick={() => handleOpenStatusDetail(job)}
                        className="bg-white border border-[#E6E2D7] rounded-xl py-4 px-8 text-sm text-neutral-900 grid grid-cols-12 items-center shadow-sm hover:border-black/50 hover:shadow-md cursor-pointer transition-all"
                      >
                        <div className="col-span-3 font-bold text-black text-base">
                          {job.Print_Job_ID}
                        </div>
                        <div className="col-span-3 text-neutral-600 font-medium">
                          {job.Sales_Order_ID}
                        </div>
                        <div className="col-span-4 font-semibold text-neutral-900">
                          {job.Product_Name}
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="text-sm font-bold text-black">
                            {job.Print_Job_Status ||
                              (job.Prototype_Status === 'Completed' ? 'In Production' : 'In Design')}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 1 DETAIL: รายละเอียดของใบสั่งผลิต (สถานะใบสั่งผลิต)
            Requirement: เมื่อเลือกใบสั่งผลิตแล้วจะสามารถดูรายละเอียดของใบสั่งผลิตได้ โดยมี ข้อมูลลูกค้า ข้อมูลใบสั่งผลิต สถานะใบสั่งผลิต */}
        {activeTab === 'status' && viewMode === 'status_detail' && selectedStatusJob && (
          <div className="space-y-8 max-w-5xl mx-auto">
            {/* Card 1: ข้อมูลลูกค้า */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                ข้อมูลลูกค้า
              </div>
              <div className="p-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อบริษัท</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Company_Name || 'ทั่วไป'}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Customer_Phone || '-'}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">ที่อยู่</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedStatusJob.Customer_Address || '-'}
                    className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลใบสั่งผลิต */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                ข้อมูลใบสั่งผลิต
              </div>
              <div className="p-8 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">รหัสใบสั่งผลิต</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Print_Job_ID}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อสินค้า</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Product_Name}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-6">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดงานพิมพ์</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Print_Type}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-900"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">จำนวน</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Quantity.toLocaleString()}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-center text-black"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">หน่วย</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedStatusJob.Unit}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: สถานะใบสั่งผลิต */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                สถานะใบสั่งผลิต
              </div>
              <div className="p-8">
                <label className="block text-xs font-semibold text-neutral-500 mb-2">สถานะปัจจุบัน</label>
                <input
                  type="text"
                  readOnly
                  value={
                    selectedStatusJob.Print_Job_Status ||
                    (selectedStatusJob.Prototype_Status === 'Completed' ? 'In Production' : 'In Design')
                  }
                  className="w-full px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black"
                />
              </div>
            </div>

            {/* Bottom Button */}
            <div className="flex justify-center pt-2 pb-12">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
              >
                ย้อนกลับ
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: จำนวนสินค้าที่ผลิตเสร็จ (Completed Count)
            Requirement: แสดงใบสั่งผลิตมีสถานะเป็น In Production
            ========================================================================= */}
        {activeTab === 'completed' && viewMode === 'list' && (
          <div className="space-y-6">
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัสใบสั่งผลิต หรือชื่อสินค้า..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-[#F2F1ED] border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="bg-white border-2 border-neutral-200/90 rounded-2xl shadow-sm p-6 space-y-3">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-semibold grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสใบสั่งผลิต</div>
                <div className="col-span-2">รหัสคำสั่งซื้อ</div>
                <div className="col-span-3">ชื่อสินค้า</div>
                <div className="col-span-2 text-center">จำนวนสั่งผลิต</div>
                <div className="col-span-2 text-right">ต้องผลิตเพิ่ม</div>
              </div>

              <div className="space-y-3 pt-2">
                {inProductionJobs.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ไม่มีใบสั่งผลิตที่มีสถานะเป็น In Production
                  </div>
                ) : (
                  inProductionJobs
                    .filter(
                      (j) =>
                        !searchTerm ||
                        j.Print_Job_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        j.Product_Name.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((item) => (
                      <div
                        key={item.Print_Job_ID}
                        onClick={() => handleOpenCompletedDetail(item)}
                        className="bg-white border border-[#E6E2D7] rounded-xl py-4 px-8 text-sm text-neutral-900 grid grid-cols-12 items-center shadow-sm hover:border-black/50 hover:shadow-md cursor-pointer transition-all"
                      >
                        <div className="col-span-3 font-bold text-black text-base">
                          {item.Print_Job_ID}
                        </div>
                        <div className="col-span-2 text-neutral-600 font-medium">
                          {item.Sales_Order_ID}
                        </div>
                        <div className="col-span-3 font-semibold text-neutral-900">
                          {item.Product_Name}
                        </div>
                        <div className="col-span-2 text-center font-bold text-black">
                          {item.Quantity.toLocaleString()} {item.Unit}
                        </div>
                        <div className="col-span-2 text-right font-bold text-rose-600">
                          {item.Reorder_Qty && item.Reorder_Qty > 0
                            ? `${item.Reorder_Qty.toLocaleString()} ${item.Unit}`
                            : '-'}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2 DETAIL: รายละเอียดจำนวนสินค้าที่ผลิตเสร็จ
            Requirement:
            - เช็คว่าทำเสร็จครบตามจำนวนแล้วรึยัง ถ้าครบแล้วปุ่มอัปเดตจะเปลี่ยนไปเป็นปุ่มพร้อมตรวจสอบ QC
            - เมื่อกดปุ่มพร้อมตรวจสอบ QC ปุ่มจะหายไป สถานะใบสั่งผลิตจะเปลี่ยนเป็น QC Pending(สภานะคำสั่งซื้อ = Print_Job_QC_Pending)
            - เมื่อกรอกจำนวนที่จะผลิตเพิ่มแล้ว หน้าจำนวนที่ผลิตสินค้าเสร็จต้องอัปเดตด้วยว่าต้องผลิตเพิ่มกี่อัน
        */}
        {activeTab === 'completed' && viewMode === 'completed_detail' && selectedCompletedJob && (() => {
          const currentLogs = selectedCompletedJob.Daily_Logs || [];
          const currentAccum =
            currentLogs.length > 0
              ? currentLogs[currentLogs.length - 1].accumulatedQty
              : (selectedCompletedJob.Produced_Qty || 0);
          const targetTotal = (selectedCompletedJob.Quantity || 0) + (selectedCompletedJob.Reorder_Qty || 0);
          const isFullyProduced = currentAccum >= targetTotal;
          const isQcPending = selectedCompletedJob.Print_Job_Status === 'QC Pending' || selectedCompletedJob.Print_Job_Status === 'QC_Pending';

          return (
            <div className="space-y-8 max-w-5xl mx-auto">
              {/* Card 1: ข้อมูลใบสั่งผลิต */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ข้อมูลใบสั่งผลิต
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-4">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">รหัสใบสั่งผลิต</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedCompletedJob.Print_Job_ID}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black"
                      />
                    </div>
                    <div className="col-span-8">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อสินค้า</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedCompletedJob.Product_Name}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-6">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดงานพิมพ์</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedCompletedJob.Print_Type}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-900"
                      />
                    </div>
                    <div className={selectedCompletedJob.Reorder_Qty && selectedCompletedJob.Reorder_Qty > 0 ? "col-span-2" : "col-span-3"}>
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">จำนวนที่สั่งผลิต</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedCompletedJob.Quantity.toLocaleString()}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black text-center"
                      />
                    </div>
                    {selectedCompletedJob.Reorder_Qty && selectedCompletedJob.Reorder_Qty > 0 ? (
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-rose-600 mb-1">จำนวนที่ต้องผลิตเพิ่ม</label>
                        <input
                          type="text"
                          readOnly
                          value={`${selectedCompletedJob.Reorder_Qty.toLocaleString()} ${selectedCompletedJob.Unit}`}
                          className="w-full px-4 py-2.5 bg-rose-50 border border-rose-300 rounded-xl text-sm font-bold text-center text-rose-600"
                        />
                      </div>
                    ) : null}
                    <div className={selectedCompletedJob.Reorder_Qty && selectedCompletedJob.Reorder_Qty > 0 ? "col-span-2" : "col-span-3"}>
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">หน่วย</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedCompletedJob.Unit}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: ติดตามสถานะใบสั่งผลิต */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ติดตามสถานะใบสั่งผลิต
                </div>
                <div className="p-8">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">สถานะใบสั่งผลิต</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedCompletedJob.Print_Job_Status || 'In Production'}
                    className="w-full px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black"
                  />
                </div>
              </div>

              {/* Card 3: ตารางจำนวนสินค้าที่ผลิตเสร็จ */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  จำนวนสินค้าที่ผลิตเสร็จ
                </div>
                <div className="p-8 space-y-4">
                  <div className="bg-black text-white rounded-xl py-3 px-6 text-sm font-semibold grid grid-cols-12 items-center">
                    <div className="col-span-2">รหัสบันทึก</div>
                    <div className="col-span-3">วันที่ผลิต</div>
                    <div className="col-span-3 text-center">จำนวนที่ต้องผลิตเพิ่ม</div>
                    <div className="col-span-2 text-center">ผลิตเสร็จต่อวัน</div>
                    <div className="col-span-2 text-right">ผลิตเสร็จสะสม</div>
                  </div>

                  {currentLogs.length === 0 ? (
                    <div className="py-12 text-center text-neutral-500 font-light text-base">
                      ยังไม่มีประวัติการบันทึกยอดผลิต กดปุ่ม &quot;อัปเดต&quot; ด้านล่างเพื่อเริ่มต้น
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentLogs.map((log, idx) => (
                        <div
                          key={log.logId || idx}
                          className="bg-white border border-[#E6E2D7] rounded-xl py-3 px-6 text-sm grid grid-cols-12 items-center shadow-sm"
                        >
                          <div className="col-span-2 font-mono font-bold text-black">
                            {log.logId}
                          </div>
                          <div className="col-span-3 font-medium text-black">
                            {formatDocumentDate(log.date)}
                          </div>
                          <div className="col-span-3 text-center text-neutral-700">
                            {log.remainingQty.toLocaleString()} {selectedCompletedJob.Unit}
                          </div>
                          <div className="col-span-2 text-center font-bold text-black">
                            {log.dailyQty.toLocaleString()} {selectedCompletedJob.Unit}
                          </div>
                          <div className="col-span-2 text-right font-bold text-black">
                            {log.accumulatedQty.toLocaleString()} {selectedCompletedJob.Unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions
                  Requirement:
                  - เช็คว่าทำเสร็จครบตามจำนวนแล้วรึยัง ถ้าครบแล้วปุ่มอัปเดตจะเปลี่ยนไปเป็นปุ่มพร้อมตรวจสอบ QC
                  - เมื่อกดปุ่มพร้อมตรวจสอบ QC ปุ่มจะหายไป สถานะใบสั่งผลิตจะเปลี่ยนเป็น QC Pending(สภานะคำสั่งซื้อ = Print_Job_QC_Pending)
              */}
              <div className="flex justify-center gap-4 pt-4 pb-12">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDiscardChanges()) return;
                    setViewMode('list');
                  }}
                  className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
                >
                  ย้อนกลับ
                </button>

                {!isQcPending && (
                  <>
                    {!isFullyProduced ? (
                      <button
                        type="button"
                        onClick={handleStartCompletedUpdate}
                        className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        อัปเดต
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleReadyForQc}
                        className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        พร้อมตรวจสอบ QC
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* =========================================================================
            TAB 3: จำนวนสินค้าที่ผ่าน QC (QC Passed)
            Requirement: แสดงใบสั่งผลิตมีสถานะเป็น QC Pending
            ========================================================================= */}
        {activeTab === 'qc' && viewMode === 'list' && (
          <div className="space-y-6">
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัสใบสั่งผลิต หรือชื่อสินค้า..."
                className="w-full pl-11 pr-4 py-3 text-sm bg-[#F2F1ED] border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="bg-white border-2 border-neutral-200/90 rounded-2xl shadow-sm p-6 space-y-3">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-semibold grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบสั่งผลิต</div>
                <div className="col-span-2">รหัสคำสั่งซื้อ</div>
                <div className="col-span-4">ชื่อสินค้า</div>
                <div className="col-span-1 text-center">จำนวน</div>
                <div className="col-span-1 text-center">หน่วย</div>
                <div className="col-span-2 text-right">ผ่าน QC</div>
              </div>

              <div className="space-y-3 pt-2">
                {qcPendingJobs.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ไม่มีใบสั่งผลิตที่มีสถานะเป็น QC Pending
                  </div>
                ) : (
                  qcPendingJobs
                    .filter(
                      (j) =>
                        !searchTerm ||
                        j.Print_Job_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        j.Product_Name.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((item) => (
                      <div
                        key={item.Print_Job_ID}
                        onClick={() => handleOpenQcDetail(item)}
                        className="bg-white border border-[#E6E2D7] rounded-xl py-4 px-8 text-sm text-neutral-900 grid grid-cols-12 items-center shadow-sm hover:border-black/50 hover:shadow-md cursor-pointer transition-all"
                      >
                        <div className="col-span-2 font-bold text-black text-base">
                          {item.Print_Job_ID}
                        </div>
                        <div className="col-span-2 text-neutral-600 font-medium">
                          {item.Sales_Order_ID}
                        </div>
                        <div className="col-span-4 font-semibold text-neutral-900">
                          {item.Product_Name}
                        </div>
                        <div className="col-span-1 text-center font-bold text-black">
                          {item.Quantity.toLocaleString()}
                        </div>
                        <div className="col-span-1 text-center text-neutral-700 font-medium">
                          {item.Unit}
                        </div>
                        <div className="col-span-2 text-right font-bold text-black text-base">
                          {(item.Passed_QC ?? 0).toLocaleString()}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3 DETAIL: รายละเอียดการตรวจสอบ QC
            Requirement:
            - เมื่อเลือกใบสั่งผลิตจะแสดง ข้อมูลใบสั่งผลิต สถานะใบสั่งผลิต จำนวนสินค้าที่ผ่าน QC และมีปุ่มอัปเดต
            - ตรงช่องที่แสดงจำนวนสินค้าที่ผ่าน QC ให้ทำเป็นประวัติ ตาม figma คล้ายกับหน้าจำนวนสินค้าที่ผลิตเสร็จ
            - ต้องมีประวัติ หรือมีสินค้าที่ไม่ผ่าน QC ก่อนถึงจะมีปุ่มสั่งผลิตเพิ่มขึ้นมา
            - เมื่อกดปุ่มอัปเดตจะมี pop up กรอกรหัสบันทึกการตรวจ QC กดถัดไปจะให้กดจำนวนที่ผ่าน QC
            - ถ้ามีจำนวนสินค้าทีผ่าน QC ครบแล้วปุ่มอัปเดตจะเปลี่ยนเป็น ดำเนินการผลิตเสร็จสิ้น
            - เมื่อกดปุ่ม ดำเนินการผลิตเสร็จสิ้น จะเปลี่ยนสถานะใบสั่งผลิต=Completed (สภานะคำสั่งซื้อ = Print_Job_Completed)
        */}
        {activeTab === 'qc' && viewMode === 'qc_detail' && selectedQcJob && (() => {
          const currentRecords = selectedQcJob.QC_Records || [];
          const targetQty = selectedQcJob.Quantity || 0;
          const passed = selectedQcJob.Passed_QC ?? 0;
          const defect = Math.max(0, targetQty - passed);
          const isFullyPassed = passed >= targetQty;
          const isCompleted = selectedQcJob.Print_Job_Status === 'Completed';

          // Requirement: ต้องมีประวัติ หรือมีสินค้าที่ไม่ผ่าน QC ก่อนถึงจะมีปุ่มสั่งผลิตเพิ่มขึ้นมา
          const hasQcHistory = currentRecords.length > 0;
          const hasDefect = defect > 0;
          const showReorderButton = hasQcHistory && hasDefect;

          return (
            <div className="space-y-8 max-w-5xl mx-auto">
              {/* Card 1: ข้อมูลใบสั่งผลิต */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ข้อมูลใบสั่งผลิต
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-4">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">รหัสใบสั่งผลิต</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Print_Job_ID}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black"
                      />
                    </div>
                    <div className="col-span-8">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อสินค้า</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Product_Name}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-6">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดงานพิมพ์</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Print_Type}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-900"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">จำนวนที่สั่งผลิต</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Quantity.toLocaleString()}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-center text-black"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">หน่วย</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Unit}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: ติดตามสถานะใบสั่งผลิต */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ติดตามสถานะใบสั่งผลิต
                </div>
                <div className="p-8">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">สถานะใบสั่งผลิต</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedQcJob.Print_Job_Status || 'QC Pending'}
                    className="w-full px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black"
                  />
                </div>
              </div>

              {/* Card 3: จำนวนสินค้าที่ผ่าน QC (ประวัติการตรวจสอบคุณภาพ QC ตาม Figma คล้ายกับหน้าจำนวนสินค้าที่ผลิตเสร็จ) */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  จำนวนสินค้าที่ผ่าน QC
                </div>
                <div className="p-8 space-y-4">
                  <div className="bg-black text-white rounded-xl py-3 px-6 text-sm font-semibold grid grid-cols-12 items-center">
                    <div className="col-span-2">รหัสบันทึก</div>
                    <div className="col-span-3">วันที่ตรวจ</div>
                    <div className="col-span-3 text-center">จำนวนที่ไม่ผ่าน QC</div>
                    <div className="col-span-2 text-center">จำนวนที่ผ่าน QC</div>
                    <div className="col-span-2 text-right">ผ่าน QC สะสม</div>
                  </div>

                  {currentRecords.length === 0 ? (
                    <div className="py-12 text-center text-neutral-500 font-light text-base">
                      ยังไม่มีประวัติการตรวจสอบ QC กดปุ่ม &quot;อัปเดต&quot; ด้านล่างเพื่อเริ่มต้น
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentRecords.map((rec, idx) => (
                        <div
                          key={rec.recordId || idx}
                          className="bg-white border border-[#E6E2D7] rounded-xl py-3 px-6 text-sm grid grid-cols-12 items-center shadow-sm"
                        >
                          <div className="col-span-2 font-mono font-bold text-black">
                            {rec.recordId}
                          </div>
                          <div className="col-span-3 font-medium text-black">
                            {formatDocumentDate(rec.date)}
                          </div>
                          <div className="col-span-3 text-center font-bold text-rose-600">
                            {rec.defectQty.toLocaleString()} {selectedQcJob.Unit}
                          </div>
                          <div className="col-span-2 text-center font-bold text-black">
                            {rec.passedQty.toLocaleString()} {selectedQcJob.Unit}
                          </div>
                          <div className="col-span-2 text-right font-bold text-black">
                            {(rec.accumulatedPassedQty ?? rec.passedQty).toLocaleString()} {selectedQcJob.Unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions
                  Requirement:
                  - ถ้ามีจำนวนสินค้าทีผ่าน QC ครบแล้วปุ่มอัปเดตจะเปลี่ยนเป็น ดำเนินการผลิตเสร็จสิ้น
                  - เมื่อกดปุ่ม ดำเนินการผลิตเสร็จสิ้น จะเปลี่ยนสถานะใบสั่งผลิต=Completed (สภานะคำสั่งซื้อ = Print_Job_Completed)
                  - ถ้ามีทีไม่ผ่าน QC หรือที่ผ่าน QC ยังไม่ครบ จะมีปุ่ม สั่งผลิตเพิ่มเติม โผล่มา
                  - ต้องมีประวัติ หรือมีสินค้าที่ไม่ผ่าน QC ก่อนถึงจะมีปุ่มสั่งผลิตเพิ่มขึ้นมา
              */}
              <div className="flex justify-center gap-4 pt-4 pb-12">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDiscardChanges()) return;
                    setViewMode('list');
                  }}
                  className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
                >
                  ย้อนกลับ
                </button>

                {!isCompleted && (
                  <>
                    {!isFullyPassed ? (
                      <>
                        <button
                          type="button"
                          onClick={handleStartQcUpdate}
                          className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          อัปเดต
                        </button>

                        {/* ปุ่มสั่งผลิตเพิ่มเติม: ต้องมีประวัติ และมีสินค้าที่ไม่ผ่าน QC */}
                        {showReorderButton && (
                          <button
                            type="button"
                            onClick={handleGoToReorderPage}
                            className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                          >
                            <RotateCcw className="w-4 h-4" />
                            สั่งผลิตเพิ่มเติม
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCompleteProduction}
                        className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        ดำเนินการผลิตเสร็จสิ้น
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* =========================================================================
            หน้าสั่งผลิตเพิ่มเติม (Reorder View matching Figma Node 168:5690)
            Requirement:
            - เมื่อกดปุ่มสั่งผลิตเพิ่มเติม จะมาที่หน้านี้
            - รายละเอียดตามใน figma หรือในรูปที่แนบ
            - เมื่อกดปุ่ม ส่งผลิตเพิ่ม จะมี pop up ให้กรอกจำนวนที่ผลิตเพิ่ม เมื่อกดยืนยันจะ เปลี่ยนสถานะใบสั่งผลิต=In Production (สถานะคำสั่งซื้อ = Print_Job_In_Production)
            ========================================================================= */}
        {viewMode === 'reorder' && selectedQcJob && (() => {
          const passed = selectedQcJob.Passed_QC ?? 0;
          const defect = Math.max(0, selectedQcJob.Quantity - passed);

          return (
            <div className="space-y-8 max-w-5xl mx-auto">
              {/* Card 1: ข้อมูลใบสั่งผลิต matching Figma Node 168:5689 */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ข้อมูลใบสั่งผลิต
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-4">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">รหัสใบสั่งผลิต</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Print_Job_ID}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-black"
                      />
                    </div>
                    <div className="col-span-8">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชื่อสินค้า</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Product_Name}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-6">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">ชนิดงานพิมพ์</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Print_Type}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-900"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">จำนวนสั่งทำเดิม</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Quantity.toLocaleString()}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-center text-black"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-semibold text-neutral-500 mb-1">หน่วย</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedQcJob.Unit}
                        className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-900"
                      />
                    </div>
                  </div>

                  {/* จำนวนสินค้าที่ไม่ผ่าน QC matching Figma Node 168:5686 */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1.5">
                      จำนวนสินค้าที่ไม่ผ่าน QC
                    </label>
                    <div className="px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-rose-600 w-52 flex items-center justify-between">
                      <span>{defect.toLocaleString()}</span>
                      <span className="text-sm font-medium text-neutral-600">{selectedQcJob.Unit}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: ติดตามสถานะใบสั่งผลิต matching Figma Node 168:5695 */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-black text-white px-8 py-3.5 font-bold text-sm">
                  ติดตามสถานะใบสั่งผลิต
                </div>
                <div className="p-8">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">สถานะใบสั่งผลิต</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedQcJob.Print_Job_Status || 'QC Pending'}
                    className="w-full px-5 py-3 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-base font-bold text-black"
                  />
                </div>
              </div>

              {/* Bottom Actions matching Figma Node 152:4126
                  Requirement: เมื่อกดปุ่ม ส่งผลิตเพิ่ม จะมี pop up ให้กรอกจำนวนที่ผลิตเพิ่ม เมื่อกดยืนยันจะ เปลี่ยนสถานะใบสั่งผลิต=In Production (สถานะคำสั่งซื้อ = Print_Job_In_Production)
              */}
              <div className="flex justify-center gap-4 pt-4 pb-12">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDiscardChanges()) return;
                    setViewMode('qc_detail');
                  }}
                  className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleOpenReorderModal}
                  className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  สั่งผลิตเพิ่ม
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* =========================================================================
          MODALS: จำนวนสินค้าที่ผลิตเสร็จ (2-Step Pop-up)
          Requirement:
          - เมื่อกดอัปเดต pop up ที่ให้ใส่รหัสและ จำนวนไม่ต้องแสดงข้อความเงื่อนไข
          ========================================================================= */}
      {isCompletedModalOpen && selectedCompletedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-black">
                  {completedStep === 1 ? 'ระบุรหัสบันทึกการผลิต' : 'ระบุจำนวนที่ผลิตเสร็จต่อวัน'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  ใบสั่งผลิต: {selectedCompletedJob.Print_Job_ID} • {selectedCompletedJob.Product_Name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setIsCompletedModalOpen(false);
                }}
                className="p-1 text-neutral-400 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {completedStep === 1 ? (
              <form onSubmit={handleCompletedNextToStep2} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    รหัสบันทึกการผลิต (Production Record ID) *
                  </label>
                  <input
                    type="text"
                    required
                    value={inputLogId}
                    onChange={(e) => {
                      setFormDirty(true);
                      setInputLogId(e.target.value);
                    }}
                    placeholder="เช่น PR001"
                    className="w-full px-4 py-2.5 bg-white text-sm font-bold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    วันที่ผลิต *
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      required
                      value={inputLogDate}
                      onChange={(e) => {
                        setFormDirty(true);
                        setInputLogDate(e.target.value);
                      }}
                      onBlur={() => {
                        if (inputLogDate.trim()) {
                          const formatted = formatDocumentDate(inputLogDate);
                          if (formatted && formatted !== '-') {
                            setInputLogDate(formatted);
                          }
                        }
                      }}
                      placeholder="วว/ดด/ปปปป"
                      className="w-full px-4 py-2.5 bg-white text-sm font-semibold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                    />
                    <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                      <input
                        type="date"
                        value={isoDateForInput(inputLogDate)}
                        onChange={(e) => {
                          setFormDirty(true);
                          if (e.target.value) {
                            setInputLogDate(formatDocumentDate(e.target.value));
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                      />
                      <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmDiscardChanges()) return;
                      setIsCompletedModalOpen(false);
                    }}
                    className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl"
                  >
                    ถัดไป
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveCompletedDailyLog} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    จำนวนที่ผลิตเสร็จวันนี้ ({selectedCompletedJob.Unit}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={inputDailyQty}
                    onChange={(e) => {
                      setFormDirty(true);
                      setInputDailyQty(e.target.value ? Number(e.target.value) : '');
                    }}
                    placeholder="ระบุจำนวนที่ผลิตเสร็จต่อวัน"
                    className="w-full px-4 py-2.5 bg-white text-sm font-bold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setCompletedStep(1)}
                    className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl"
                  >
                    บันทึกยอดผลิต
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS: จำนวนสินค้าที่ผ่าน QC (2-Step Pop-up)
          Requirement:
          - เมื่อกดอัปเดต pop up ที่ให้ใส่รหัสและ จำนวนไม่ต้องแสดงข้อความเงื่อนไข
          ========================================================================= */}
      {isQcModalOpen && selectedQcJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-black">
                  {qcStep === 1 ? 'ระบุรหัสบันทึกการตรวจ QC' : 'ระบุจำนวนที่ผ่าน QC'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  ใบสั่งผลิต: {selectedQcJob.Print_Job_ID} • {selectedQcJob.Product_Name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setIsQcModalOpen(false);
                }}
                className="p-1 text-neutral-400 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {qcStep === 1 ? (
              <form onSubmit={handleQcNextToStep2} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    รหัสบันทึกการตรวจ QC (QC Record ID) *
                  </label>
                  <input
                    type="text"
                    required
                    value={inputQcRecordId}
                    onChange={(e) => {
                      setFormDirty(true);
                      setInputQcRecordId(e.target.value);
                    }}
                    placeholder="เช่น QC001"
                    className="w-full px-4 py-2.5 bg-white text-sm font-bold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    วันที่ตรวจ QC *
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      required
                      value={inputQcDate}
                      onChange={(e) => {
                        setFormDirty(true);
                        setInputQcDate(e.target.value);
                      }}
                      onBlur={() => {
                        if (inputQcDate.trim()) {
                          const formatted = formatDocumentDate(inputQcDate);
                          if (formatted && formatted !== '-') {
                            setInputQcDate(formatted);
                          }
                        }
                      }}
                      placeholder="วว/ดด/ปปปป"
                      className="w-full px-4 py-2.5 bg-white text-sm font-semibold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                    />
                    <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                      <input
                        type="date"
                        value={isoDateForInput(inputQcDate)}
                        onChange={(e) => {
                          setFormDirty(true);
                          if (e.target.value) {
                            setInputQcDate(formatDocumentDate(e.target.value));
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        title="คลิกเพื่อเลือกวันที่จากปฏิทิน"
                      />
                      <Calendar className="w-5 h-5 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmDiscardChanges()) return;
                      setIsQcModalOpen(false);
                    }}
                    className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl"
                  >
                    ถัดไป
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveQcPassed} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    จำนวนที่ผ่าน QC *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={inputQcPassedQty}
                    onChange={(e) => {
                      setFormDirty(true);
                      setInputQcPassedQty(e.target.value === '' ? '' : Number(e.target.value));
                    }}
                    placeholder="ระบุจำนวนที่ผ่าน QC"
                    className="w-full px-4 py-2.5 bg-white text-sm font-bold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setQcStep(1)}
                    className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl"
                  >
                    บันทึกผล QC
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS: สั่งผลิตเพิ่มเติม (Pop-up ให้กรอกจำนวนที่ผลิตเพิ่ม)
          Requirement: เมื่อกดปุ่ม ส่งผลิตเพิ่ม จะมี pop up ให้กรอกจำนวนที่ผลิตเพิ่ม เมื่อกดยืนยันจะ เปลี่ยนสถานะใบสั่งผลิต=In Production (สถานะคำสั่งซื้อ = Print_Job_In_Production)
          ========================================================================= */}
      {isReorderModalOpen && selectedQcJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-black">สั่งผลิตเพิ่มเติม</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  ใบสั่งผลิต: {selectedQcJob.Print_Job_ID} • {selectedQcJob.Product_Name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setIsReorderModalOpen(false);
                }}
                className="p-1 text-neutral-400 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReorderModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  จำนวนที่ผลิตเพิ่ม ({selectedQcJob.Unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={inputReorderQty}
                  onChange={(e) => {
                    setFormDirty(true);
                    setInputReorderQty(e.target.value ? Number(e.target.value) : '');
                  }}
                  placeholder="ระบุจำนวนที่ผลิตเพิ่ม"
                  className="w-full px-4 py-2.5 bg-white text-sm font-bold text-black border border-neutral-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDiscardChanges()) return;
                    setIsReorderModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs text-neutral-600 font-medium hover:text-black"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl"
                >
                  ยืนยัน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductionTrackingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">กำลังโหลด...</div>}>
      <ProductionTrackingContent />
    </Suspense>
  );
}
