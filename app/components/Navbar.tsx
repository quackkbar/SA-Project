'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from './RoleContext';
import { APP_ROLES, AppRole } from '@/lib/types';
import {
  FileText,
  Calculator,
  Printer,
  Wrench,
  Truck,
  Receipt,
  LayoutDashboard,
  Minus,
  Square,
  X,
  Server,
  Database,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function Navbar() {
  const { role, setRole } = useRole();
  const pathname = usePathname();
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleDateString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // The Exact 6 Menus from SA (5).pdf page 182 and 188
  const saMenus = [
    {
      id: 'orders',
      title: '1. หน้าคำสั่งซื้อ',
      href: '/orders',
      icon: FileText,
      pageRef: 'หน้า 188',
      roleBadge: 'ฝ่ายขาย',
    },
    {
      id: 'quotations',
      title: '2. หน้าใบเสนอราคา',
      href: '/quotations',
      icon: Calculator,
      pageRef: 'หน้า 189',
      roleBadge: 'ฝ่ายขาย',
    },
    {
      id: 'print-jobs',
      title: '3. หน้าใบสั่งผลิต',
      href: '/print-jobs',
      icon: Printer,
      pageRef: 'หน้า 190, 191',
      roleBadge: 'ฝ่ายผลิต',
    },
    {
      id: 'production-tracking',
      title: '4. หน้าติดตามการผลิต',
      href: '/production-tracking',
      icon: Wrench,
      pageRef: 'หน้า 191, 192 (ผลิต & QC)',
      roleBadge: 'ฝ่ายผลิต & QC',
    },
    {
      id: 'delivery-tracking',
      title: '5. หน้าติดตามการขนส่ง',
      href: '/delivery-tracking',
      icon: Truck,
      pageRef: 'หน้า 193',
      roleBadge: 'ฝ่ายจัดส่ง',
    },
    {
      id: 'receipts',
      title: '6. หน้ารายการใบเสร็จ',
      href: '/receipts',
      icon: Receipt,
      pageRef: 'หน้า 193',
      roleBadge: 'ฝ่ายการเงิน',
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 shadow-md select-none">
      {/* 1. Desktop Window Frame Header (Desktop Application Appearance) */}
      <div className="bg-slate-950 text-slate-300 px-3 py-1.5 flex items-center justify-between text-xs border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-bold text-slate-100 tracking-wide font-sans">
            ระบบจัดการโรงพิมพ์ ร้านวันชัยการพิมพ์ (Wanchai Printing ERP System)
          </span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-slate-400 text-[11px] hidden sm:inline">
            รายงานการวิเคราะห์และออกแบบระบบ SA (5).pdf • หน้า 182–194
          </span>
        </div>

        {/* Right side: Clock & Window Controls */}
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{timeStr || 'Loading...'}</span>
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <span className="text-[11px] text-slate-400 hidden lg:inline mr-1">บทบาททดสอบ:</span>
            {(Object.keys(APP_ROLES) as AppRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  role === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {APP_ROLES[r].title.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Window Control Buttons Mock */}
          <div className="flex items-center gap-1 ml-2 text-slate-500">
            <button className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Minimize">
              <Minus className="w-3 h-3" />
            </button>
            <button className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Maximize">
              <Square className="w-2.5 h-2.5" />
            </button>
            <button className="p-1 hover:bg-rose-900/60 rounded text-slate-400 hover:text-rose-200" title="Close">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Primary 6 Menus Bar (Strictly matching SA (5).pdf p.182 & 188) */}
      <div className="bg-slate-900 px-3 py-1 flex items-center justify-between overflow-x-auto scrollbar-none">
        <nav className="flex items-center space-x-1 min-w-max">
          {/* Home Icon */}
          <Link
            href="/"
            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-colors ${
              pathname === '/'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            title="ภาพรวมระบบและติดตามสถานะออเดอร์"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>ภาพรวม</span>
          </Link>

          <div className="h-5 w-px bg-slate-700 mx-1"></div>

          {/* 6 Exact Menus from Report */}
          {saMenus.map((menu) => {
            const Icon = menu.icon;
            const isActive = pathname === menu.href;

            return (
              <Link
                key={menu.id}
                href={menu.href}
                className={`group flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-400 group-hover:text-blue-300'}`} />
                <span>{menu.title}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5"></span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* System Badges (Desktop Status) */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400 pl-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
            <Database className="w-3 h-3 text-emerald-400" />
            <span>PostgreSQL: Connected</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
            <Server className="w-3 h-3 text-blue-400" />
            <span>App: Desktop Frame</span>
          </span>
        </div>
      </div>
    </header>
  );
}
