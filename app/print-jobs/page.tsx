'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import {
  ArrowLeftCircle,
  FileCheck,
  CheckCircle,
  AlertTriangle,
  Search,
  Eye,
  X,
  Play,
  RotateCcw,
  Sparkles,
  FileText,
  Upload,
  Image as ImageIcon,
  Save,
  Calendar,
} from 'lucide-react';
import {
  getStoredOrders,
  saveStoredOrders,
  getStoredQuotations,
  getStoredPrintJobs,
  saveStoredPrintJobs,
  getStoredDeliveries,
  saveStoredDeliveries,
  StorageOrderRecord,
  StorageQuotationRecord,
  StorageProductItem,
  StoragePrintJobRecord,
  StorageDeliveryRecord,
} from '@/lib/storage';
import { setFormDirty, confirmDiscardChanges } from '@/lib/formDirty';
import { formatDocumentDate, isoDateForInput } from '@/lib/dateUtils';

function PrintJobsContent() {
  // Navigation views:
  // 'list'                  : Main print jobs list
  // 'detail'                : Print job detail (read-only, view image if available, no status change/upload)
  // 'select_completed_order': Select order with Quotation_Status === 'Completed'
  // 'select_unjobbed_item'  : Select product item from order that doesn't have a print job yet
  // 'item_detail_create'    : Show full item specs and only single bottom "สร้าง" button
  // 'select_prototype_job'  : Select print job with Prototype_Status in ['Not Started', 'Under Revision', 'In Progress']
  // 'prototype_design'      : Prototype design screen
  const [currentView, setCurrentView] = useState<
    | 'list'
    | 'detail'
    | 'select_completed_order'
    | 'select_unjobbed_item'
    | 'item_detail_create'
    | 'select_prototype_job'
    | 'prototype_design'
  >('list');

  // Stored state
  const [printJobs, setPrintJobs] = useState<StoragePrintJobRecord[]>([]);
  const [orders, setOrders] = useState<StorageOrderRecord[]>([]);
  const [quotations, setQuotations] = useState<StorageQuotationRecord[]>([]);

  // Selection states
  const [selectedJob, setSelectedJob] = useState<StoragePrintJobRecord | null>(null);
  const [selectedOrderForJob, setSelectedOrderForJob] = useState<StorageOrderRecord | null>(null);
  const [selectedItemForJob, setSelectedItemForJob] = useState<StorageProductItem | null>(null);
  const [selectedProtoJob, setSelectedProtoJob] = useState<StoragePrintJobRecord | null>(null);

  // Pop-up Modal State for Creating Print Job (Step 1: Print Job ID & Date, Step 2: Delivery ID)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [inputPrintJobId, setInputPrintJobId] = useState('');
  const [inputPrintJobDate, setInputPrintJobDate] = useState('');
  const [inputDeliveryId, setInputDeliveryId] = useState('');

  // Prototype Image State & File Input Ref
  const [protoImage, setProtoImage] = useState<string>('');
  const protoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Search input
  const [searchText, setSearchText] = useState('');

  // Notification Toast
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [currentView]);

  const loadData = () => {
    const jobs = getStoredPrintJobs();
    setPrintJobs(jobs);
    setOrders(getStoredOrders());
    setQuotations(getStoredQuotations());

    setSelectedJob((prev) => {
      if (!prev) return prev;
      const targetId = prev.Print_Job_ID?.trim().toLowerCase();
      const found = jobs.find((j) => j.Print_Job_ID?.trim().toLowerCase() === targetId);
      return found || prev;
    });

    setSelectedProtoJob((prev) => {
      if (!prev) return prev;
      const targetId = prev.Print_Job_ID?.trim().toLowerCase();
      const found = jobs.find((j) => j.Print_Job_ID?.trim().toLowerCase() === targetId);
      if (found) {
        const img = found.Prototype_Image_Url || found.Prototype_Image || '';
        if (img) setProtoImage(img);
        return found;
      }
      return prev;
    });
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ----------------------------------------------------
  // Helper: Open Print Job Details
  // Requirement:
  // หน้ารายละเอียดใบสั่งผลิตจะขึ้นแค่รายละเอียดไม่มีการเปลี่ยนสถานะ อัพโหลดรูป หรือการแก้ไขอะไรทั้งนั้น และสามารถกดดูรูปได้เมื่อมีรูป
  // ----------------------------------------------------
  const handleOpenDetail = (job: StoragePrintJobRecord) => {
    const cleanId = (job.Print_Job_ID || '').trim();
    let protoImg = job.Prototype_Image_Url || job.Prototype_Image || '';
    if (!protoImg || protoImg === '__saved_in_indexeddb__') {
      if (typeof window !== 'undefined') {
        protoImg =
          window.sessionStorage?.getItem(`vanchai_proto_img_${cleanId}`) ||
          (window as any)?.__vanchai_proto_cache?.[cleanId] ||
          '';
      }
    }
    const resolvedJob: StoragePrintJobRecord = {
      ...job,
      Prototype_Status: job.Prototype_Status === 'In Process' ? 'In Progress' : job.Prototype_Status,
      Prototype_Image_Url: protoImg,
      Prototype_Image: protoImg,
    };
    setSelectedJob(resolvedJob);
    setCurrentView('detail');
  };

  // ----------------------------------------------------
  // Actions on Print Job Detail: Approve or Request Revision for Pending Prototype
  // Requirement:
  // - ถ้าใบสั่งผลิตไหนมี prototype สถานะ pending หน้ารายละเอียดใบสั่งผลิตจะมีปุ่มย้อนกลับ ปุ่มต้องการแก้ไข ปุ่มอนุมัติ
  // - ถ้ากดปุ่มต้องการแก้ไข สถานะ prototype=Under Revision (สถานะคำสั่งซื้อ=Prototype_Under_Revision)
  // - ถ้ากดปุ่มอนุมัติ สถานะ prototype=Completed (สถานะคำสั่งซื้อ=Prototype_Completed)
  // - เมื่อ prototype มีสถานะเป็น completed ใบสั่งผลิตจะมีสภานะเป็น In Production (สถานะคำสั่งซื้อ=Print_Job_In_Production)
  // ----------------------------------------------------
  const handleDetailRevisePrototype = () => {
    if (!selectedJob) return;

    const cleanId = (selectedJob.Print_Job_ID || '').trim();
    let currentImg = selectedJob.Prototype_Image_Url || selectedJob.Prototype_Image || '';
    if (!currentImg || currentImg === '__saved_in_indexeddb__') {
      if (typeof window !== 'undefined') {
        currentImg =
          window.sessionStorage?.getItem(`vanchai_proto_img_${cleanId}`) ||
          (window as any)?.__vanchai_proto_cache?.[cleanId] ||
          '';
      }
    }

    const updatedJob: StoragePrintJobRecord = {
      ...selectedJob,
      Prototype_Status: 'Under Revision',
      Prototype_Image_Url: currentImg,
      Prototype_Image: currentImg,
    };
    setSelectedJob(updatedJob);

    const freshJobs = getStoredPrintJobs();
    const targetId = cleanId.toLowerCase();
    const updatedJobs = freshJobs.map((pj) =>
      (pj.Print_Job_ID || '').trim().toLowerCase() === targetId ? updatedJob : pj
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const orderTargetId = (selectedJob.Sales_Order_ID || '').trim().toLowerCase();
      const updatedOrders = currentOrders.map((o) =>
        (o.Sales_Order_ID || '').trim().toLowerCase() === orderTargetId
          ? { ...o, Order_Status: 'Prototype_Under_Revision' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      'บันทึกต้องการแก้ไข Prototype เรียบร้อยแล้ว (สถานะคำสั่งซื้อ: Prototype_Under_Revision)'
    );
  };

  const handleDetailApprovePrototype = () => {
    if (!selectedJob) return;

    const cleanId = (selectedJob.Print_Job_ID || '').trim();
    let currentImg = selectedJob.Prototype_Image_Url || selectedJob.Prototype_Image || '';
    if (!currentImg || currentImg === '__saved_in_indexeddb__') {
      if (typeof window !== 'undefined') {
        currentImg =
          window.sessionStorage?.getItem(`vanchai_proto_img_${cleanId}`) ||
          (window as any)?.__vanchai_proto_cache?.[cleanId] ||
          '';
      }
    }

    const updatedJob: StoragePrintJobRecord = {
      ...selectedJob,
      Prototype_Status: 'Completed',
      Print_Job_Status: 'In Production',
      Prototype_Image_Url: currentImg,
      Prototype_Image: currentImg,
    };
    setSelectedJob(updatedJob);

    const freshJobs = getStoredPrintJobs();
    const targetId = cleanId.toLowerCase();
    const updatedJobs = freshJobs.map((pj) =>
      (pj.Print_Job_ID || '').trim().toLowerCase() === targetId ? updatedJob : pj
    );
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const orderTargetId = (selectedJob.Sales_Order_ID || '').trim().toLowerCase();
      const updatedOrders = currentOrders.map((o) =>
        (o.Sales_Order_ID || '').trim().toLowerCase() === orderTargetId
          ? { ...o, Order_Status: 'Print_Job_In_Production' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification(
      'success',
      'อนุมัติ Prototype เรียบร้อยแล้ว (สถานะใบสั่งผลิต: In Production, คำสั่งซื้อ: Print_Job_In_Production)'
    );
  };

  // ----------------------------------------------------
  // WORKFLOW 1: Create Print Job
  // Requirement:
  // - เมื่อกดปุ่มสร้างใบสั่งผลิตจะไปหน้าเลือกคำสั่งซื้อที่มีใบเสนอราคาสถานะ completed
  // - เมื่อเลือกคำสั่งซื้อแล้วจะขึ้นรายการคำสั่งซื้อที่ยังไม่มีใบสั่งผลิต
  // - เมื่อเลือกสินค้าที่ไม่มีใบสั่งผลิตแล้วจะขึ้นรายละเอียดทั้งหมด
  // - ให้มีแค่สร้างปุ่มเดียว ปุ่มสร้างมุมขวาบนให้เอาออก
  // - เมื่อกดปุ่มสร้างจะมีหน้าต่าง pop up มาให้กรอก รหัสใบสั่ง
  // - ตอนกรอกรหัสใบสั่งผลิตและการจัดส่งไม่ต้องบอกว่าระบบสุ่มให้แล้ว
  // - กดปุ่มถัดไปจะเป็น กรอกรหัสการจัดส่ง
  // - เมื่อบันทึกสำเร็จ สถานะของคำสั่งซื้อจะต้องเป็น 'Prototype_Not_Started' ด้วย
  // ----------------------------------------------------
  // 1. Filter orders that have Completed Quotation AND have at least one product that does NOT have a print job yet
  // Requirement:
  // - ถ้าคำสั่งซื้อไหนที่สินค้ามีใบสั่งผลิตทุกอันแล้วไม่ต้องแสดงในหน้าเลือกคำสั่งซื้อสำหรับสร้างใบผลิต
  const completedOrders = orders.filter((o) => {
    const matchingQuotation = quotations.find((q) => q.Sales_Order_ID === o.Sales_Order_ID);
    const hasCompletedQuotation =
      (matchingQuotation && matchingQuotation.Quotation_Status === 'Completed') ||
      o.Order_Status === 'Quotation_Completed';
    if (!hasCompletedQuotation) return false;

    const items = o.items || [];
    if (items.length === 0) return false;
    const hasUnjobbedItems = items.some((item) => {
      return !printJobs.some(
        (pj) => pj.Sales_Order_ID === o.Sales_Order_ID && pj.Product_ID === item.id
      );
    });
    return hasUnjobbedItems;
  });

  const handleStartCreateJob = () => {
    loadData();
    setSearchText('');
    setCurrentView('select_completed_order');
  };

  const handleSelectCompletedOrder = (order: StorageOrderRecord) => {
    setSelectedOrderForJob(order);
    setCurrentView('select_unjobbed_item');
  };

  // Filter items in selected order that do NOT have a print job yet
  const unjobbedItems = (selectedOrderForJob?.items || []).filter((item) => {
    return !printJobs.some(
      (pj) =>
        pj.Sales_Order_ID === selectedOrderForJob?.Sales_Order_ID &&
        pj.Product_ID === item.id
    );
  });

  const handleSelectUnjobbedItem = (item: StorageProductItem) => {
    setSelectedItemForJob(item);
    setCurrentView('item_detail_create');
  };

  // Trigger Pop-up Modal Step 1
  const handleOpenCreateModal = () => {
    let jobNum = '';
    do {
      jobNum = `PJ${Math.floor(100 + Math.random() * 900)}K1`;
    } while (printJobs.some((pj) => pj.Print_Job_ID.toLowerCase() === jobNum.toLowerCase()));

    let delNum = '';
    do {
      delNum = `DEL${Math.floor(100 + Math.random() * 900)}A`;
    } while (
      printJobs.some(
        (pj) => pj.Delivery_ID && pj.Delivery_ID.toLowerCase() === delNum.toLowerCase()
      )
    );

    // Requirement: วันที่ของใบเสนอราคาต้องเป็นของคำสั่งซื้อที่เลือก
    const freshQuotes = getStoredQuotations();
    const targetOrderId = (selectedOrderForJob?.Sales_Order_ID || '').trim().toLowerCase();
    const relatedQuote = freshQuotes.find(
      (q) => (q.Sales_Order_ID || '').trim().toLowerCase() === targetOrderId
    );
    const quoteDate =
      relatedQuote?.Quotation_Date ||
      selectedOrderForJob?.Order_Date ||
      new Date().toISOString().split('T')[0];

    setInputPrintJobId(jobNum);
    setInputPrintJobDate(formatDocumentDate(quoteDate));
    setInputDeliveryId(delNum);
    setModalStep(1);
    setShowCreateModal(true);
  };

  const handleModalNextToStep2 = () => {
    if (!inputPrintJobId.trim()) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสใบสั่งผลิต');
      return;
    }
    const freshJobs = getStoredPrintJobs();
    const isDuplicate = freshJobs.some(
      (pj) => pj.Print_Job_ID.trim().toLowerCase() === inputPrintJobId.trim().toLowerCase()
    );
    if (isDuplicate) {
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: รหัสใบสั่งผลิต "${inputPrintJobId.trim()}" ซ้ำกับใบสั่งผลิตที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }
    setModalStep(2);
  };

  const handleModalConfirmSave = () => {
    if (!inputDeliveryId.trim()) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณากรอกรหัสการจัดส่ง');
      return;
    }
    const freshJobs = getStoredPrintJobs();
    const existingDeliveries = getStoredDeliveries();
    const isDelivDuplicate =
      freshJobs.some(
        (pj) =>
          pj.Delivery_ID &&
          pj.Delivery_ID.trim().toLowerCase() === inputDeliveryId.trim().toLowerCase()
      ) ||
      existingDeliveries.some(
        (d) =>
          d.Delivery_ID &&
          d.Delivery_ID.trim().toLowerCase() === inputDeliveryId.trim().toLowerCase()
      );
    if (isDelivDuplicate) {
      showNotification(
        'error',
        `สร้างไม่สำเร็จ: รหัสการจัดส่ง "${inputDeliveryId.trim()}" ซ้ำกับที่มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      );
      return;
    }

    if (!selectedOrderForJob || !selectedItemForJob) return;

    const newJob: StoragePrintJobRecord = {
      Print_Job_ID: inputPrintJobId.trim(),
      Sales_Order_ID: selectedOrderForJob.Sales_Order_ID,
      Product_ID: selectedItemForJob.id,
      Product_Name: selectedItemForJob.name,
      Print_Type: selectedItemForJob.printType || 'งานพิมพ์',
      Quantity: Number(selectedItemForJob.quantity) || 1,
      Unit: selectedItemForJob.unit || 'ชิ้น',
      Paper_Type: selectedItemForJob.paperType || '-',
      Paper_Size: selectedItemForJob.paperSize || '-',
      Paper_Color: selectedItemForJob.paperColor || '-',
      Description: selectedItemForJob.description || '',
      ImageUrl: selectedItemForJob.imageUrl || '',
      Delivery_ID: inputDeliveryId.trim(),
      Prototype_Status: 'Not Started',
      Print_Job_Status: 'In Design',
      Date: formatDocumentDate(inputPrintJobDate) || new Date().toLocaleDateString('th-TH'),
      Company_Name: selectedOrderForJob.Company_Name,
      Customer_Phone: selectedOrderForJob.Customer_Phone,
      Customer_Address: selectedOrderForJob.Customer_Address,
    };

    const cleanJobId = newJob.Print_Job_ID.trim().toLowerCase();
    const updatedJobs = [
      newJob,
      ...freshJobs.filter((pj) => (pj.Print_Job_ID || '').trim().toLowerCase() !== cleanJobId),
    ];
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    // Requirement: ตอนที่สร้างใบสั่งผลิตก็มีการสร้างการจัดส่งด้วย
    const newDelivery: StorageDeliveryRecord = {
      Delivery_ID: inputDeliveryId.trim(),
      Sales_Order_ID: selectedOrderForJob.Sales_Order_ID,
      Customer_Name: selectedOrderForJob.Customer_Name,
      Company_Name: selectedOrderForJob.Company_Name,
      Customer_Phone: selectedOrderForJob.Customer_Phone,
      Customer_Address: selectedOrderForJob.Customer_Address,
      Delivery_Status: 'Producing',
      Deliverer: '-',
      Delivery_Date: '-',
    };
    const updatedDeliveries = [
      newDelivery,
      ...existingDeliveries.filter(
        (d) => d.Delivery_ID.trim().toLowerCase() !== newDelivery.Delivery_ID.trim().toLowerCase()
      ),
    ];
    saveStoredDeliveries(updatedDeliveries);

    // Requirement: เมื่อบันทึกสำเร็จ สถานะของคำสั่งซื้อจะต้องเป็น 'Prototype_Not_Started' ด้วย
    const currentOrders = getStoredOrders();
    const updatedOrders = currentOrders.map((o) =>
      o.Sales_Order_ID === selectedOrderForJob.Sales_Order_ID
        ? { ...o, Order_Status: 'Prototype_Not_Started' }
        : o
    );
    setOrders(updatedOrders);
    saveStoredOrders(updatedOrders);

    setFormDirty(false);
    setShowCreateModal(false);
    showNotification(
      'success',
      `สร้างใบสั่งผลิต ${newJob.Print_Job_ID} สำเร็จเรียบร้อย (สถานะคำสั่งซื้อ: Prototype_Not_Started)`
    );
    loadData();
    setCurrentView('list');
  };

  // ----------------------------------------------------
  // WORKFLOW 2: Design Prototype
  // Requirement:
  // - เมื่อกดปุ่มออกแบบ Prototype จะต้องไปหน้าเลือกใยสั่งผลิตที่มีสถานะของ Prototype เป็น Under Revision Not Started และ In Progress
  // - เมื่อเลือกใยสั่งผลิตที่ต้องการ แสดงข้อทมูลลูกค้า ข้อมูลใบสั่งผลิต(ข้อมูลสินค้า) และข้อมูล pototype
  // - ให้มีปุ่มเริ่มออกแบบแค่ปุ่มเดียวที่อนู่ข้างๆปุ่มย้อนกลับ ปุ่มขวาบนเอาออก
  // - ช่องขอ้มูล pototype ถึงแม้จะยังไม่มีรูปแต่ก็ต้องมีช่อง pototype สำหรับใส่รุปไว้แล้วแต่จะยังใารุปไม่ได้จนกว่าจะกดเริ่มออกแบบ
  // - เมื่อกดเริ่มออกแบบแล้วจะยังอยู่หน้าเดิมแต่ปุ่มข้างล่างจะเปลี่ยนไปเป็นบันทึก และบันทึกเสร็จสิ้น และจะสามารถอัพโหลดรูปภาพได้
  // - เมื่อกดบันทึก(ต้องมีรูป prototype) จะยังมีสถานะเป็น In Process อยู่ ยังสามารถอัพและดูรูปได้
  // - เมื่อกดบันทึกและเสร็จสิ้น(ต้องมีรูป) จะเปลลี่ยนสถานะเป็น pending (สถานะของคำสั่งซื้่อก็จะเป็น prototype_pending ด้วย)
  // ----------------------------------------------------
  const eligibleProtoJobs = printJobs.filter((pj) => {
    const s = pj.Prototype_Status;
    return (
      s === 'Not Started' ||
      s === 'Under Revision' ||
      s === 'Under_Revision' ||
      s === 'In Progress' ||
      s === 'In Process' ||
      s === 'In_Process'
    );
  });

  const handleStartPrototypeWorkflow = () => {
    loadData();
    setCurrentView('select_prototype_job');
  };

  const handleSelectProtoJob = (job: StoragePrintJobRecord) => {
    const freshJobs = getStoredPrintJobs();
    const targetId = job.Print_Job_ID?.trim().toLowerCase();
    const current = freshJobs.find((j) => j.Print_Job_ID?.trim().toLowerCase() === targetId) || job;
    setSelectedProtoJob(current);
    const existingImg = current.Prototype_Image_Url || current.Prototype_Image || '';
    setProtoImage(existingImg);
    setCurrentView('prototype_design');
  };

  // Click "เริ่มออกแบบ" or "เริ่มการแก้ไข Prototype":
  // Changes status to In Process, updates order status, stays on the same page, enables image upload & changes buttons!
  const handleStartDesigning = () => {
    if (!selectedProtoJob) return;

    const freshJobs = getStoredPrintJobs();
    const existingImg = protoImage || selectedProtoJob.Prototype_Image_Url || selectedProtoJob.Prototype_Image || '';
    const updatedJob: StoragePrintJobRecord = {
      ...selectedProtoJob,
      Prototype_Status: 'In Progress',
      Prototype_Image_Url: existingImg,
      Prototype_Image: existingImg,
    };
    setSelectedProtoJob(updatedJob);

    const targetId = selectedProtoJob.Print_Job_ID?.trim().toLowerCase();
    const updatedJobs = freshJobs.map((pj) =>
      pj.Print_Job_ID?.trim().toLowerCase() === targetId ? updatedJob : pj
    );
    if (!updatedJobs.some((pj) => pj.Print_Job_ID?.trim().toLowerCase() === targetId)) {
      updatedJobs.push(updatedJob);
    }
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedProtoJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const orderTargetId = selectedProtoJob.Sales_Order_ID?.trim().toLowerCase();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID?.trim().toLowerCase() === orderTargetId
          ? { ...o, Order_Status: 'Prototype_In_Progress' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    showNotification('success', 'เริ่มต้นการออกแบบ Prototype (สถานะ: In Progress)');
  };

  // Upload Prototype Image handler with Canvas Compression to ensure ultra-lightweight persistence
  const handleProtoImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormDirty(true);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const rawDataUrl = reader.result;
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
                const compressed = canvas.toDataURL('image/jpeg', 0.72);
                setProtoImage(compressed);
                setSelectedProtoJob((prev) =>
                  prev
                    ? {
                        ...prev,
                        Prototype_Image_Url: compressed,
                        Prototype_Image: compressed,
                      }
                    : null
                );
              } else {
                setProtoImage(rawDataUrl);
              }
            };
            img.onerror = () => {
              setProtoImage(rawDataUrl);
            };
            img.src = rawDataUrl;
          }
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // Click "บันทึก" (Requires image, remains In Process, can view and upload image)
  const handleSavePrototypeDraft = () => {
    const currentImg = protoImage || selectedProtoJob?.Prototype_Image_Url || selectedProtoJob?.Prototype_Image || '';
    if (!currentImg) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณาอัปโหลดรูปภาพ Prototype ก่อนกดบันทึก');
      return;
    }
    if (!selectedProtoJob) return;

    const freshJobs = getStoredPrintJobs();
    const updatedJob: StoragePrintJobRecord = {
      ...selectedProtoJob,
      Prototype_Status: 'In Progress',
      Prototype_Image_Url: currentImg,
      Prototype_Image: currentImg,
    };
    setSelectedProtoJob(updatedJob);
    setProtoImage(currentImg);

    const targetId = selectedProtoJob.Print_Job_ID?.trim().toLowerCase();
    const updatedJobs = freshJobs.map((pj) =>
      pj.Print_Job_ID?.trim().toLowerCase() === targetId ? updatedJob : pj
    );
    if (!updatedJobs.some((pj) => pj.Print_Job_ID?.trim().toLowerCase() === targetId)) {
      updatedJobs.push(updatedJob);
    }
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    setFormDirty(false);
    showNotification('success', 'บันทึกข้อมูล Prototype เรียบร้อยแล้ว (สถานะ: In Progress)');
  };

  // Click "บันทึกเสร็จสิ้น" (Requires image, changes status to Pending, order to Prototype_Pending, returns to detail/list)
  const handleSaveAndCompletePrototype = () => {
    const currentImg = protoImage || selectedProtoJob?.Prototype_Image_Url || selectedProtoJob?.Prototype_Image || '';
    if (!currentImg) {
      showNotification('error', 'สร้างไม่สำเร็จ: กรุณาอัปโหลดรูปภาพ Prototype ก่อนบันทึกเสร็จสิ้น');
      return;
    }
    if (!selectedProtoJob) return;

    const freshJobs = getStoredPrintJobs();
    const updatedJob: StoragePrintJobRecord = {
      ...selectedProtoJob,
      Prototype_Status: 'Pending',
      Prototype_Image_Url: currentImg,
      Prototype_Image: currentImg,
    };

    const targetId = selectedProtoJob.Print_Job_ID?.trim().toLowerCase();
    const updatedJobs = freshJobs.map((pj) =>
      pj.Print_Job_ID?.trim().toLowerCase() === targetId ? updatedJob : pj
    );
    if (!updatedJobs.some((pj) => pj.Print_Job_ID?.trim().toLowerCase() === targetId)) {
      updatedJobs.push(updatedJob);
    }
    setPrintJobs(updatedJobs);
    saveStoredPrintJobs(updatedJobs);

    if (selectedProtoJob.Sales_Order_ID) {
      const currentOrders = getStoredOrders();
      const orderTargetId = selectedProtoJob.Sales_Order_ID?.trim().toLowerCase();
      const updatedOrders = currentOrders.map((o) =>
        o.Sales_Order_ID?.trim().toLowerCase() === orderTargetId
          ? { ...o, Order_Status: 'Prototype_Pending' }
          : o
      );
      setOrders(updatedOrders);
      saveStoredOrders(updatedOrders);
    }

    setFormDirty(false);
    showNotification(
      'success',
      `บันทึกและเสร็จสิ้น Prototype เรียบร้อยแล้ว (สถานะ: Pending, คำสั่งซื้อ: Prototype_Pending)`
    );
    setSelectedJob(updatedJob);
    setCurrentView('detail');
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

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-lg text-black">{previewImage.title}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-neutral-500 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center items-center bg-neutral-100 rounded-xl p-4 min-h-[260px] max-h-[70vh] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previewImage.url && previewImage.url !== '__saved_in_indexeddb__' ? (
                <img
                  src={previewImage.url}
                  alt={previewImage.title}
                  className="object-contain max-h-[60vh] rounded-lg shadow-sm"
                />
              ) : (
                <div className="py-12 text-neutral-400 text-sm flex flex-col items-center gap-2">
                  <FileCheck className="w-8 h-8 text-neutral-400" />
                  <span>ไม่พบไฟล์รูปภาพ</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <button
                onClick={() => setPreviewImage(null)}
                className="px-6 py-2 bg-black text-white text-sm font-semibold rounded-xl"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 1: รายการใบสั่งผลิต (Matching Figma node 114:796)
          ========================================================================= */}
      {currentView === 'list' && (
        <div>
          {/* Top Header matching Figma 170px height */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <h1 className="text-3xl font-bold tracking-tight text-black">ใบสั่งผลิต</h1>

            <div className="flex items-center gap-4">
              <button
                onClick={handleStartPrototypeWorkflow}
                className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                ออกแบบ Prototype
              </button>

              <button
                onClick={handleStartCreateJob}
                className="px-7 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:shadow-lg flex items-center gap-2"
              >
                <FileCheck className="w-4 h-4" />
                สร้างใบสั่งผลิต
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              {/* Header Capsule */}
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบสั่งผลิต</div>
                <div className="col-span-4">ชื่อสินค้า</div>
                <div className="col-span-2">ชนิดงานพิมพ์</div>
                <div className="col-span-2">สถานะ Prototype</div>
                <div className="col-span-2 text-right">วันที่</div>
              </div>

              {/* Rows */}
              <div className="space-y-3 pt-1">
                {printJobs.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    ยังไม่มีข้อมูลใบสั่งผลิต กดปุ่ม &quot;สร้างใบสั่งผลิต&quot; เพื่อเริ่มต้น
                  </div>
                ) : (
                  printJobs.map((job, idx) => (
                    <div
                      key={job.Print_Job_ID || idx}
                      onClick={() => handleOpenDetail(job)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black/40 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-2 font-semibold text-black group-hover:text-neutral-600 transition-colors">
                        {job.Print_Job_ID}
                      </div>
                      <div className="col-span-4 text-neutral-800 font-medium">
                        {job.Product_Name}
                      </div>
                      <div className="col-span-2 text-neutral-600">{job.Print_Type}</div>
                      <div className="col-span-2">
                        {/* Requirement: สถานะเป็นตัวอักษรธรรมดา ไม่มีสี */}
                        <span className="text-xs font-medium text-black">
                          {job.Prototype_Status}
                        </span>
                      </div>
                      <div className="col-span-2 text-right text-neutral-600">{formatDocumentDate(job.Date)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: รายละเอียดใบสั่งผลิต (Matching Figma node 116:810)
          Requirement:
          - หน้ารายละเอียดใบสั่งผลิตจะขึ้นแค่รายละเอียดไม่มีการเปลี่ยนสถานะ อัพโหลดรูป หรือการแก้ไขอะไรทั้งนั้น และสามารถกดดูรูปได้เมื่อมีรูป
          ========================================================================= */}
      {currentView === 'detail' && selectedJob && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('list')}
                className="text-black hover:opacity-70 transition-opacity"
                title="กลับหน้ารายการใบสั่งผลิต"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  รายละเอียดใบสั่งผลิต: {selectedJob.Print_Job_ID}
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  คำสั่งซื้ออ้างอิง: {selectedJob.Sales_Order_ID || '-'} | สถานะใบสั่งผลิต:{' '}
                  <span className="font-semibold text-black">
                    {selectedJob.Print_Job_Status ||
                      (selectedJob.Prototype_Status === 'Completed'
                        ? 'In Production'
                        : 'In Design')}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Read-Only Details Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลลูกค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลลูกค้า</div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อบริษัท</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Company_Name || 'ทั่วไป'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">เบอร์โทรศัพท์</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Customer_Phone || '-'}
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ที่อยู่</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                    {selectedJob.Customer_Address || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลใบสั่งผลิตและสินค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>ข้อมูลใบสั่งผลิต</span>
                <span className="text-xs text-neutral-300">
                  รหัสสินค้า: {selectedJob.Product_ID || '-'}
                </span>
              </div>
              <div className="p-6 bg-white space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">รหัสใบสั่งผลิต</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800">
                      {selectedJob.Print_Job_ID}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">รหัสการจัดส่ง</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800">
                      {selectedJob.Delivery_ID || '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อสินค้า</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-800">
                      {selectedJob.Product_Name}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  <div className="md:col-span-6">
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดงานพิมพ์</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Print_Type}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">จำนวน</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-center text-neutral-800">
                      {selectedJob.Quantity.toLocaleString()}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">หน่วย</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-800">
                      {selectedJob.Unit}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดของกระดาษ</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Paper_Type}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ขนาดของกระดาษ</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Paper_Size}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">สีของกระดาษ</span>
                    <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800">
                      {selectedJob.Paper_Color}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-neutral-500 block mb-1">คำอธิบายเพิ่มเติม</span>
                  <div className="px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800 min-h-[44px]">
                    {selectedJob.Description || '-'}
                  </div>
                </div>

                {/* Requirement: สามารถกดดูรูปได้เมื่อมีรูป */}
                <div className="bg-[#F2F1ED] rounded-xl p-4 flex items-center justify-between border border-neutral-300">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <FileCheck className="w-5 h-5 text-neutral-600" />
                    <span className="font-semibold">รูปภาพตัวอย่างสินค้า</span>
                  </div>
                  {selectedJob.ImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: selectedJob.ImageUrl!,
                          title: selectedJob.Product_Name,
                        })
                      }
                      className="px-5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" /> ดูรูปภาพตัวอย่าง
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500 font-medium">
                      ไม่มีรูปภาพตัวอย่าง
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: ข้อมูล Prototype (Matching Figma node 116:810) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูล Prototype</div>
              <div className="p-6 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">
                      สถานะการออกแบบ Prototype
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={selectedJob.Prototype_Status}
                      className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-800"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-[#F2F1ED] rounded-xl p-2.5 px-4 border border-neutral-300">
                    <span className="text-sm text-neutral-700 font-medium">ไฟล์ Prototype</span>
                    <button
                      type="button"
                      disabled={
                        !(
                          (selectedJob.Prototype_Image_Url && selectedJob.Prototype_Image_Url !== '__saved_in_indexeddb__') ||
                          (selectedJob.Prototype_Image && selectedJob.Prototype_Image !== '__saved_in_indexeddb__') ||
                          (typeof window !== 'undefined' &&
                            window.sessionStorage?.getItem(`vanchai_proto_img_${(selectedJob.Print_Job_ID || '').trim()}`))
                        )
                      }
                      onClick={() => {
                        const cleanId = (selectedJob.Print_Job_ID || '').trim();
                        let imgUrl = selectedJob.Prototype_Image_Url || selectedJob.Prototype_Image || '';
                        if (!imgUrl || imgUrl === '__saved_in_indexeddb__') {
                          if (typeof window !== 'undefined') {
                            imgUrl =
                              window.sessionStorage?.getItem(`vanchai_proto_img_${cleanId}`) ||
                              (window as any)?.__vanchai_proto_cache?.[cleanId] ||
                              '';
                          }
                        }
                        if (imgUrl && imgUrl !== '__saved_in_indexeddb__') {
                          setPreviewImage({
                            url: imgUrl,
                            title: `Prototype: ${selectedJob.Product_Name}`,
                          });
                        }
                      }}
                      className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        (selectedJob.Prototype_Image_Url && selectedJob.Prototype_Image_Url !== '__saved_in_indexeddb__') ||
                        (selectedJob.Prototype_Image && selectedJob.Prototype_Image !== '__saved_in_indexeddb__') ||
                        (typeof window !== 'undefined' &&
                          window.sessionStorage?.getItem(`vanchai_proto_img_${(selectedJob.Print_Job_ID || '').trim()}`))
                          ? 'bg-black text-white hover:bg-neutral-800 cursor-pointer'
                          : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                      }`}
                    >
                      ดูเอกสาร
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions
                Requirement:
                - ถ้าใบสั่งผลิตไหนมี prototype สถานะ pending หน้ารายละเอียดใบสั่งผลิตจะมีปุ่มย้อนกลับ ปุ่มต้องการแก้ไข ปุ่มอนุมัติ
                - ถ้ากดปุ่มต้องการแก้ไข สถานะ prototype=Under Revision(สถานะคำสั่งซื้อ=Prototype_Under_Revision)
                - ถ้ากดปุ่มอนุมัติ สถานะ prototype=Completed (สถานะคำสั่งซื้อ=Prototype_Completed)
                - เมื่อ prototype มีสถานะเป็น completed ใบสั่งผลิตจะมีสภานะเป็น In Production(สถานะคำสั่งซื้อ=Print_Job_In_Production)
            */}
            <div className="flex justify-center gap-4 pt-4 pb-12">
              <button
                type="button"
                onClick={() => setCurrentView('list')}
                className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
              >
                ย้อนกลับ
              </button>

              {selectedJob.Prototype_Status === 'Pending' && (
                <>
                  <button
                    type="button"
                    onClick={handleDetailRevisePrototype}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
                  >
                    ต้องการแก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={handleDetailApprovePrototype}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
                  >
                    อนุมัติ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 3: เลือกคำสั่งซื้อที่มีใบเสนอราคาสถานะ completed
          ========================================================================= */}
      {currentView === 'select_completed_order' && (
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
                  เลือกคำสั่งซื้อสำหรับสร้างใบสั่งผลิต
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  แสดงเฉพาะคำสั่งซื้อที่มีใบเสนอราคาสถานะอนุมัติแล้ว (Completed)
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative w-80">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหารหัสคำสั่งซื้อ หรือบริษัท..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-3">รหัสคำสั่งซื้อ</div>
                <div className="col-span-4">ชื่อบริษัท</div>
                <div className="col-span-3">ผู้สั่งซื้อ / เบอร์โทร</div>
                <div className="col-span-2 text-right">จำนวนสินค้า</div>
              </div>

              <div className="space-y-3 pt-1">
                {completedOrders.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <FileText className="w-12 h-12 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold text-neutral-800">
                      ไม่พบคำสั่งซื้อที่มีใบเสนอราคาสถานะ Completed
                    </div>
                    <div className="text-xs text-neutral-500 max-w-md mx-auto">
                      กรุณาไปที่หน้าใบเสนอราคาเพื่อทำการ &quot;อนุมัติ&quot; ใบเสนอราคาก่อนเริ่มสร้างใบสั่งผลิต
                    </div>
                  </div>
                ) : (
                  completedOrders
                    .filter((o) => {
                      if (!searchText.trim()) return true;
                      const term = searchText.toLowerCase();
                      return (
                        o.Sales_Order_ID.toLowerCase().includes(term) ||
                        o.Company_Name.toLowerCase().includes(term) ||
                        o.Customer_Name.toLowerCase().includes(term)
                      );
                    })
                    .map((order) => (
                      <div
                        key={order.Sales_Order_ID}
                        onClick={() => handleSelectCompletedOrder(order)}
                        className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black hover:bg-neutral-50 hover:shadow-lg transition-all cursor-pointer group"
                      >
                        <div className="col-span-3 font-bold text-black group-hover:text-neutral-600 transition-colors">
                          {order.Sales_Order_ID}
                        </div>
                        <div className="col-span-4 text-neutral-800 font-medium">
                          {order.Company_Name}
                        </div>
                        <div className="col-span-3 text-neutral-600">
                          <div>{order.Customer_Name}</div>
                          <div className="text-xs text-neutral-400">{order.Customer_Phone}</div>
                        </div>
                        <div className="col-span-2 text-right font-semibold text-black">
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
          VIEW 4: รายการสินค้าในคำสั่งซื้อที่ยังไม่มีใบสั่งผลิต
          ========================================================================= */}
      {currentView === 'select_unjobbed_item' && selectedOrderForJob && (
        <div>
          {/* Top Header */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('select_completed_order')}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  เลือกสินค้าสำหรับสร้างใบสั่งผลิต
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  คำสั่งซื้อ: {selectedOrderForJob.Sales_Order_ID} ({selectedOrderForJob.Company_Name})
                </p>
              </div>
            </div>
          </div>

          {/* Unjobbed Items List */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสสินค้า</div>
                <div className="col-span-4">ชื่อสินค้า</div>
                <div className="col-span-2">ชนิดงานพิมพ์</div>
                <div className="col-span-2 text-center">จำนวนสั่งทำ</div>
                <div className="col-span-2 text-right">กระดาษ/ขนาด</div>
              </div>

              <div className="space-y-3 pt-1">
                {unjobbedItems.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <FileCheck className="w-12 h-12 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold text-neutral-800">
                      สินค้าทุกรายการในคำสั่งซื้อนี้มีใบสั่งผลิตครบแล้ว
                    </div>
                    <div className="text-xs text-neutral-500 max-w-md mx-auto">
                      สามารถเลือกคำสั่งซื้ออื่นเพื่อสร้างใบสั่งผลิตรายการถัดไปได้
                    </div>
                  </div>
                ) : (
                  unjobbedItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      onClick={() => handleSelectUnjobbedItem(item)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black hover:bg-neutral-50 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-2 font-mono font-bold text-black group-hover:text-neutral-600 transition-colors">
                        {item.id}
                      </div>
                      <div className="col-span-4 font-semibold text-neutral-800">
                        {item.name}
                      </div>
                      <div className="col-span-2 text-neutral-600">{item.printType}</div>
                      <div className="col-span-2 text-center font-bold text-black">
                        {item.quantity} {item.unit}
                      </div>
                      <div className="col-span-2 text-right text-xs text-neutral-600">
                        {item.paperType} ({item.paperSize})
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
          VIEW 5: แสดงรายละเอียดสินค้าทั้งหมด & ปุ่มสร้างใบสั่งผลิต
          Requirement:
          - ให้มีแค่สร้างปุ่มเดียว ปุ่มสร้างมุมขวาบนให้เอาออก
          ========================================================================= */}
      {currentView === 'item_detail_create' && selectedOrderForJob && selectedItemForJob && (
        <div>
          {/* Top Header: Single button only at the bottom! Top-right button removed. */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentView('select_unjobbed_item')}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  รายละเอียดสินค้าสำหรับออกใบสั่งผลิต
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  สินค้า: {selectedItemForJob.name} | คำสั่งซื้อ: {selectedOrderForJob.Sales_Order_ID}
                </p>
              </div>
            </div>
          </div>

          {/* Item Full Details Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลลูกค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลลูกค้า</div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อบริษัท</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedOrderForJob.Company_Name}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">เบอร์โทรศัพท์</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedOrderForJob.Customer_Phone}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ที่อยู่</span>
                  <input
                    type="text"
                    readOnly
                    value={selectedOrderForJob.Customer_Address}
                    className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลสินค้าและงานพิมพ์ทั้งหมด */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>ข้อมูลสินค้าและงานพิมพ์</span>
                <span className="text-xs text-neutral-300 font-mono">
                  รหัสสินค้า: {selectedItemForJob.id}
                </span>
              </div>
              <div className="p-6 bg-white space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อสินค้า</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.name}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดงานพิมพ์</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.printType}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-6">
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.paperType}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">ขนาดของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.paperSize}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">สีของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.paperColor}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">จำนวนสั่งทำ</span>
                    <input
                      type="text"
                      readOnly
                      value={`${selectedItemForJob.quantity} ${selectedItemForJob.unit}`}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">คำอธิบายเพิ่มเติม</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedItemForJob.description || '-'}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>

                {/* Sample Image Preview */}
                <div className="bg-[#F2F1ED] rounded-xl p-4 flex items-center justify-between border border-neutral-300">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <FileCheck className="w-5 h-5 text-neutral-600" />
                    <span className="font-semibold">รูปภาพตัวอย่างสินค้า</span>
                  </div>
                  {selectedItemForJob.imageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: selectedItemForJob.imageUrl!,
                          title: selectedItemForJob.name,
                        })
                      }
                      className="px-5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" /> ดูรูปภาพตัวอย่าง
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500 font-medium">
                      ไม่มีรูปภาพตัวอย่าง
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions: Requirement: ให้มีแค่สร้างปุ่มเดียว ปุ่มสร้างมุมขวาบนให้เอาออก */}
            <div className="flex justify-center gap-6 pt-4 pb-12">
              <button
                type="button"
                onClick={() => setCurrentView('select_unjobbed_item')}
                className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                สร้าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          POP-UP MODAL: Step 1 (รหัสใบสั่ง) -> Step 2 (รหัสการจัดส่ง)
          Requirement: ตอนกรอกรหัสใบสั่งผลิตและการจัดส่งไม่ต้องบอกว่าระบบสุ่มให้แล้ว
          ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-neutral-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">
                {modalStep === 1
                  ? 'สร้างใบสั่งผลิต (ขั้นตอนที่ 1/2)'
                  : 'สร้างใบสั่งผลิต (ขั้นตอนที่ 2/2)'}
              </h3>
              <button
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setShowCreateModal(false);
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {modalStep === 1 ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-neutral-800 block mb-2">
                      กรุณากรอกรหัสใบสั่งผลิต *
                    </label>
                    <input
                      type="text"
                      value={inputPrintJobId}
                      onChange={(e) => {
                        setFormDirty(true);
                        setInputPrintJobId(e.target.value);
                      }}
                      placeholder="เช่น PJ085K1"
                      className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-neutral-800 block mb-2">
                      วันที่สั่งผลิต *
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={inputPrintJobDate}
                        onChange={(e) => {
                          setFormDirty(true);
                          setInputPrintJobDate(e.target.value);
                        }}
                        onBlur={() => {
                          if (inputPrintJobDate.trim()) {
                            const formatted = formatDocumentDate(inputPrintJobDate);
                            if (formatted && formatted !== '-') {
                              setInputPrintJobDate(formatted);
                            }
                          }
                        }}
                        placeholder="วว/ดด/ปปปป"
                        className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-black pr-11 shadow-inner"
                      />
                      <div className="absolute right-3 w-6 h-6 flex items-center justify-center">
                        <input
                          type="date"
                          value={isoDateForInput(inputPrintJobDate)}
                          onChange={(e) => {
                            setFormDirty(true);
                            if (e.target.value) {
                              setInputPrintJobDate(formatDocumentDate(e.target.value));
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
              ) : (
                <div>
                  <label className="text-sm font-semibold text-neutral-800 block mb-2">
                    กรุณากรอกรหัสการจัดส่ง *
                  </label>
                  <input
                    type="text"
                    value={inputDeliveryId}
                    onChange={(e) => {
                      setFormDirty(true);
                      setInputDeliveryId(e.target.value);
                    }}
                    placeholder="เช่น DEL901A"
                    className="w-full px-4 py-2.5 bg-white border border-neutral-300 text-black rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-black placeholder-neutral-400 shadow-inner"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-neutral-50 px-6 py-4 flex justify-end gap-3 border-t border-neutral-200">
              {modalStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmDiscardChanges()) return;
                      setShowCreateModal(false);
                    }}
                    className="px-5 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleModalNextToStep2}
                    className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md"
                  >
                    ถัดไป
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    className="px-5 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    onClick={handleModalConfirmSave}
                    className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md"
                  >
                    บันทึก
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 6: เลือกใบสั่งผลิตสำหรับออกแบบ Prototype
          ========================================================================= */}
      {currentView === 'select_prototype_job' && (
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
                  เลือกใบสั่งผลิตสำหรับออกแบบ Prototype
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  แสดงใบสั่งผลิตที่มีสถานะ Prototype: Not Started, Under Revision หรือ In Progress
                </p>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="p-12">
            <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/80 p-8 space-y-4">
              <div className="bg-black text-white rounded-xl py-4 px-8 text-sm font-medium grid grid-cols-12 items-center">
                <div className="col-span-2">รหัสใบสั่งผลิต</div>
                <div className="col-span-4">ชื่อสินค้า</div>
                <div className="col-span-2">ชนิดงานพิมพ์</div>
                <div className="col-span-2">สถานะ Prototype</div>
                <div className="col-span-2 text-right">วันที่</div>
              </div>

              <div className="space-y-3 pt-1">
                {eligibleProtoJobs.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <Sparkles className="w-12 h-12 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold text-neutral-800">
                      ไม่พบใบสั่งผลิตที่รอการออกแบบ Prototype
                    </div>
                    <div className="text-xs text-neutral-500 max-w-md mx-auto">
                      ใบสั่งผลิตทั้งหมดอาจผ่านกระบวนการ Prototype เรียบร้อยแล้ว (Completed)
                    </div>
                  </div>
                ) : (
                  eligibleProtoJobs.map((job, idx) => (
                    <div
                      key={job.Print_Job_ID || idx}
                      onClick={() => handleSelectProtoJob(job)}
                      className="bg-white border border-neutral-200/70 rounded-xl py-4 px-8 text-sm text-neutral-800 grid grid-cols-12 items-center shadow-md hover:border-black hover:bg-neutral-50 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="col-span-2 font-bold text-black group-hover:text-neutral-600 transition-colors">
                        {job.Print_Job_ID}
                      </div>
                      <div className="col-span-4 text-neutral-800 font-semibold">
                        {job.Product_Name}
                      </div>
                      <div className="col-span-2 text-neutral-600">{job.Print_Type}</div>
                      <div className="col-span-2">
                        {/* Requirement: สถานะเป็นตัวอักษรธรรมดา ไม่มีสี */}
                        <span className="text-xs font-semibold text-black">
                          {job.Prototype_Status}
                        </span>
                      </div>
                      <div className="col-span-2 text-right text-neutral-600">{formatDocumentDate(job.Date)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 7: หน้าออกแบบ Prototype
          Requirements:
          - ให้มีปุ่มเริ่มออกแบบแค่ปุ่มเดียวที่อนู่ข้างๆปุ่มย้อนกลับ ปุ่มขวาบนเอาออก
          - ช่องขอ้มูล pototype ถึงแม้จะยังไม่มีรูปแต่ก็ต้องมีช่อง pototype สำหรับใส่รุปไว้แล้วแต่จะยังใารุปไม่ได้จนกว่าจะกดเริ่มออกแบบ
          - เมื่อกดเริ่มออกแบบแล้วจะยังอยู่หน้าเดิมแต่ปุ่มข้างล่างจะเปลี่ยนไปเป็นบันทึก และบันทึกเสร็จสิ้น และจะสามารถอัพโหลดรูปภาพได้
          - เมื่อกดบันทึก(ต้องมีรูป prototype) จะยังมีสถานะเป็น In Process อยู่ ยังสามารถอัพและดูรูปได้
          - เมื่อกดบันทึกและเสร็จสิ้น(ต้องมีรูป) จะเปลลี่ยนสถานะเป็น pending (สถานะของคำสั่งซื้่อก็จะเป็น prototype_pending ด้วย)
          ========================================================================= */}
      {currentView === 'prototype_design' && selectedProtoJob && (
        <div>
          {/* Top Header: Button on top right removed per user request */}
          <div className="h-[170px] px-12 flex items-center justify-between border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('select_prototype_job');
                }}
                className="text-black hover:opacity-70 transition-opacity"
              >
                <ArrowLeftCircle className="w-9 h-9" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-black">
                  ออกแบบ Prototype: {selectedProtoJob.Print_Job_ID}
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  สินค้า: {selectedProtoJob.Product_Name} | สถานะ Prototype:{' '}
                  <span className="font-semibold text-black">
                    {selectedProtoJob.Prototype_Status}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Hidden File Input for Prototype Image */}
          <input
            type="file"
            ref={protoFileInputRef}
            onChange={handleProtoImageUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Form Content */}
          <div className="p-12 space-y-8 max-w-6xl mx-auto">
            {/* Card 1: ข้อมูลลูกค้า */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูลลูกค้า</div>
              <div className="p-6 bg-white space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อบริษัท</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Company_Name || 'ทั่วไป'}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">เบอร์โทรศัพท์</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Customer_Phone || '-'}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block mb-1">ที่อยู่</span>
                  <input
                    type="text"
                    readOnly
                    value={selectedProtoJob.Customer_Address || '-'}
                    className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: ข้อมูลใบสั่งผลิต (ข้อมูลสินค้า) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold flex items-center justify-between">
                <span>ข้อมูลใบสั่งผลิต (ข้อมูลสินค้า)</span>
                <span className="text-xs text-neutral-300 font-mono">
                  รหัสสินค้า: {selectedProtoJob.Product_ID || '-'}
                </span>
              </div>
              <div className="p-6 bg-white space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">รหัสใบสั่งผลิต</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Print_Job_ID}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชื่อสินค้า</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Product_Name}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-6">
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดงานพิมพ์</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Print_Type}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">จำนวนสั่งทำ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Quantity.toLocaleString()}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-bold text-center text-neutral-800"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <span className="text-xs text-neutral-500 block mb-1">หน่วย</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Unit}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-center text-neutral-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ชนิดของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Paper_Type}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">ขนาดของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Paper_Size}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">สีของกระดาษ</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Paper_Color}
                      className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-xs text-neutral-500 block mb-1">คำอธิบายเพิ่มเติม</span>
                  <input
                    type="text"
                    readOnly
                    value={selectedProtoJob.Description || '-'}
                    className="w-full px-4 py-2.5 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-medium text-neutral-800"
                  />
                </div>

                {/* Sample Image */}
                <div className="bg-[#F2F1ED] rounded-xl p-4 flex items-center justify-between border border-neutral-300">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <FileCheck className="w-5 h-5 text-neutral-600" />
                    <span className="font-semibold">รูปภาพตัวอย่างสินค้า</span>
                  </div>
                  {selectedProtoJob.ImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: selectedProtoJob.ImageUrl!,
                          title: selectedProtoJob.Product_Name,
                        })
                      }
                      className="px-5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" /> ดูรูปภาพตัวอย่าง
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500 font-medium">
                      ไม่มีรูปภาพตัวอย่าง
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: ข้อมูล Prototype (Matching Figma node 116:810) */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
              <div className="bg-black text-white px-6 py-3.5 text-sm font-bold">ข้อมูล Prototype</div>
              <div className="p-6 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-neutral-700 font-medium shrink-0">
                      สถานะการออกแบบ Prototype
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={selectedProtoJob.Prototype_Status}
                      className="w-full px-4 py-2 bg-[#F2F1ED] border border-neutral-300 rounded-xl text-sm font-semibold text-neutral-800"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-[#F2F1ED] rounded-xl p-2.5 px-4 border border-neutral-300">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-700 font-medium">ไฟล์ Prototype</span>
                      {protoImage && (
                        <span className="text-xs text-emerald-600 font-semibold">(แนบรูปแล้ว)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => protoFileInputRef.current?.click()}
                        disabled={
                          selectedProtoJob.Prototype_Status !== 'In Progress' &&
                          selectedProtoJob.Prototype_Status !== 'In Process'
                        }
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          selectedProtoJob.Prototype_Status === 'In Progress' ||
                          selectedProtoJob.Prototype_Status === 'In Process'
                            ? 'bg-black hover:bg-neutral-800 text-white cursor-pointer'
                            : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                        }`}
                      >
                        Upload รูป
                      </button>
                      <button
                        type="button"
                        disabled={!protoImage || protoImage === '__saved_in_indexeddb__'}
                        onClick={() => {
                          if (protoImage && protoImage !== '__saved_in_indexeddb__') {
                            setPreviewImage({
                              url: protoImage,
                              title: `Prototype: ${selectedProtoJob.Product_Name}`,
                            });
                          }
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          protoImage && protoImage !== '__saved_in_indexeddb__'
                            ? 'bg-black hover:bg-neutral-800 text-white cursor-pointer'
                            : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                        }`}
                      >
                        ดูเอกสาร
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions
                Requirements:
                - ให้มีปุ่มเริ่มออกแบบแค่ปุ่มเดียวที่อนู่ข้างๆปุ่มย้อนกลับ ปุ่มขวาบนเอาออก
                - เมื่อกดเริ่มออกแบบแล้วจะยังอยู่หน้าเดิมแต่ปุ่มข้างล่างจะเปลี่ยนไปเป็นบันทึก และบันทึกเสร็จสิ้น และจะสามารถอัพโหลดรูปภาพได้
                - เมื่อกดบันทึก(ต้องมีรูป prototype) จะยังมีสถานะเป็น In Process อยู่ ยังสามารถอัพและดูรูปได้
                - เมื่อกดบันทึกและเสร็จสิ้น(ต้องมีรูป) จะเปลลี่ยนสถานะเป็น pending (สถานะของคำสั่งซื้่อก็จะเป็น prototype_pending ด้วย)
            */}
            <div className="flex justify-center gap-4 pt-4 pb-12">
              <button
                type="button"
                onClick={() => {
                  if (!confirmDiscardChanges()) return;
                  setCurrentView('select_prototype_job');
                }}
                className="px-8 py-3 bg-neutral-200 hover:bg-neutral-300 text-black rounded-xl text-sm font-semibold transition-all"
              >
                ย้อนกลับ
              </button>

              {/* State A: Before Designing (Not Started) */}
              {selectedProtoJob.Prototype_Status === 'Not Started' && (
                <button
                  type="button"
                  onClick={handleStartDesigning}
                  className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  เริ่มออกแบบ
                </button>
              )}

              {/* State B: Before Designing (Under Revision) */}
              {(selectedProtoJob.Prototype_Status === 'Under Revision' ||
                selectedProtoJob.Prototype_Status === 'Under_Revision') && (
                <button
                  type="button"
                  onClick={handleStartDesigning}
                  className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  เริ่มการแก้ไข Prototype
                </button>
              )}

              {/* State C: Designing (In Process / In Progress) -> Changed to "บันทึก" and "บันทึกเสร็จสิ้น" */}
              {(selectedProtoJob.Prototype_Status === 'In Progress' ||
                selectedProtoJob.Prototype_Status === 'In Process') && (
                <>
                  <button
                    type="button"
                    onClick={handleSavePrototypeDraft}
                    className="px-8 py-3 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndCompletePrototype}
                    className="px-8 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    บันทึกเสร็จสิ้น
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PrintJobsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">กำลังโหลด...</div>}>
      <PrintJobsContent />
    </Suspense>
  );
}
