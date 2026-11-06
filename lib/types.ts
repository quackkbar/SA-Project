export type AppRole = 'Sales' | 'Production' | 'Warehouse' | 'Finance';

export interface RoleConfig {
  id: AppRole;
  title: string;
  badgeColor: string;
  description: string;
  useCases: string[];
}

export const APP_ROLES: Record<AppRole, RoleConfig> = {
  Sales: {
    id: 'Sales',
    title: 'ฝ่ายขาย (Sales)',
    badgeColor: 'bg-blue-600 text-white',
    description: 'รับคำสั่งซื้อ, ออกใบเสนอราคา, และสั่งเริ่มผลิต',
    useCases: ['UC1', 'UC2', 'UC3', 'UC4', 'UC5'],
  },
  Production: {
    id: 'Production',
    title: 'ฝ่ายผลิต (Production)',
    badgeColor: 'bg-amber-600 text-white',
    description: 'รับใบสั่งผลิต, จัดการแบบพิมพ์ Prototype, บันทึกยอดผลิตประจำวัน, และสั่งผลิตเพิ่ม',
    useCases: ['UC6', 'UC7', 'UC8', 'UC9', 'UC10', 'UC11', 'UC13'],
  },
  Warehouse: {
    id: 'Warehouse',
    title: 'คลังสินค้าและ QC (Warehouse & QC)',
    badgeColor: 'bg-emerald-600 text-white',
    description: 'ตรวจสอบคุณภาพสินค้า (QC) และจัดการการจัดส่งสินค้า',
    useCases: ['UC12', 'UC14'],
  },
  Finance: {
    id: 'Finance',
    title: 'การเงินและบัญชี (Finance)',
    badgeColor: 'bg-purple-600 text-white',
    description: 'ออกใบเสร็จรับเงิน และบันทึกบัญชีรับเงิน',
    useCases: ['UC15', 'UC16'],
  },
};

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Quotation_Not_Started: { label: 'ยังไม่ทำใบเสนอราคา', color: 'bg-gray-100 text-gray-700' },
  Quotation_Pending: { label: 'รอตรวจใบเสนอราคา', color: 'bg-yellow-100 text-yellow-800' },
  Quotation_Completed: { label: 'ใบเสนอราคาเสร็จสิ้น', color: 'bg-blue-100 text-blue-800' },
  Quotation_Rejected: { label: 'ใบเสนอราคาถูกปฏิเสธ', color: 'bg-red-100 text-red-800' },
  Quotation_Under_Revision: { label: 'กำลังแก้ไขใบเสนอราคา', color: 'bg-orange-100 text-orange-800' },
  Prototype_Not_Started: { label: 'ยังไม่เริ่มทำแบบพิมพ์', color: 'bg-purple-100 text-purple-800' },
  Prototype_In_Progress: { label: 'กำลังทำแบบพิมพ์', color: 'bg-indigo-100 text-indigo-800' },
  Prototype_Pending: { label: 'รอตรวจแบบพิมพ์', color: 'bg-yellow-100 text-yellow-800' },
  Prototype_Completed: { label: 'แบบพิมพ์เสร็จสิ้น', color: 'bg-teal-100 text-teal-800' },
  Prototype_Under_Revision: { label: 'กำลังแก้ไขแบบพิมพ์', color: 'bg-orange-100 text-orange-800' },
  Print_Job_In_Production: { label: 'กำลังพิมพ์งาน', color: 'bg-blue-100 text-blue-800' },
  Print_Job_QC_Pending: { label: 'รอตรวจสอบ QC', color: 'bg-amber-100 text-amber-800' },
  Print_Job_Completed: { label: 'พิมพ์เสร็จสิ้นสมบูรณ์', color: 'bg-emerald-100 text-emerald-800' },
  Delivery_Preparing: { label: 'กำลังเตรียมส่งมอบ', color: 'bg-cyan-100 text-cyan-800' },
  Delivery_Shipping: { label: 'กำลังจัดส่งสินค้า', color: 'bg-sky-100 text-sky-800' },
  Delivery_Delivered: { label: 'จัดส่งเรียบร้อยแล้ว', color: 'bg-green-100 text-green-800' },
};

export const PROTOTYPE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Not_Started: { label: 'ยังไม่เริ่มทำแบบ', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  In_Progress: { label: 'กำลังออกแบบ', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  Pending: { label: 'รอตรวจแบบพิมพ์', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  Completed: { label: 'อนุมัติแบบแล้ว', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  Under_Revision: { label: 'ขอแก้ไขแบบ', color: 'bg-rose-100 text-rose-800 border-rose-300' },
};

export const PRINT_JOB_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  In_Design: { label: 'อยู่ในขั้นตอนออกแบบ', color: 'bg-purple-100 text-purple-800' },
  In_Production: { label: 'กำลังเดินเครื่องพิมพ์', color: 'bg-blue-100 text-blue-800' },
  QC_Pending: { label: 'รอตรวจคุณภาพ (QC)', color: 'bg-amber-100 text-amber-800' },
  Completed: { label: 'ผลิตเสร็จสิ้นสมบูรณ์', color: 'bg-emerald-100 text-emerald-800' },
};

export const DELIVERY_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Producing: { label: 'รอฝ่ายผลิตเสร็จสิ้น', color: 'bg-slate-100 text-slate-700' },
  Preparing: { label: 'กำลังจัดเตรียมสินค้า', color: 'bg-cyan-100 text-cyan-800' },
  Shipping: { label: 'อยู่ระหว่างนำจ่ายขนส่ง', color: 'bg-sky-100 text-sky-800' },
  Delivered: { label: 'ส่งมอบสำเร็จเรียบร้อย', color: 'bg-green-100 text-green-800' },
};
