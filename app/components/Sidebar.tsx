'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  FileText,
  FileCheck,
  Layers,
  Wrench,
  Truck,
  Receipt,
  ChevronRight,
} from 'lucide-react';
import { confirmDiscardChanges } from '@/lib/formDirty';

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'status';

  const isProductionActive = pathname.startsWith('/production-tracking');

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // If clicking on current exact path/query, no need to prompt
    const fullCurrent = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (fullCurrent === href) return;

    if (!confirmDiscardChanges()) {
      e.preventDefault();
    }
  };

  const mainNavItems = [
    {
      id: 'orders',
      title: 'คำสั่งซื้อ',
      href: '/orders',
      icon: FileText,
      isActive: pathname.startsWith('/orders'),
    },
    {
      id: 'quotations',
      title: 'ใบเสนอราคา',
      href: '/quotations',
      icon: FileCheck,
      isActive: pathname.startsWith('/quotations'),
    },
    {
      id: 'print-jobs',
      title: 'ใบสั่งผลิต',
      href: '/print-jobs',
      icon: Layers,
      isActive: pathname.startsWith('/print-jobs'),
    },
    {
      id: 'production-tracking',
      title: 'ติดตามการผลิต',
      href: '/production-tracking?tab=status',
      icon: Wrench,
      isActive: isProductionActive,
      hasSubmenu: true,
    },
    {
      id: 'delivery-tracking',
      title: 'ติดตามการจัดส่ง',
      href: '/delivery-tracking',
      icon: Truck,
      isActive: pathname.startsWith('/delivery-tracking'),
    },
    {
      id: 'receipts',
      title: 'ใบเสร็จ',
      href: '/receipts',
      icon: Receipt,
      isActive: pathname.startsWith('/receipts'),
    },
  ];

  return (
    <aside className="w-[250px] shrink-0 bg-black text-white flex flex-col h-screen select-none border-r border-black z-30 sticky top-0">
      {/* Brand Header matching Figma 250x170px */}
      <div className="w-[250px] h-[170px] bg-black px-8 flex flex-col justify-center border-b border-neutral-900 shrink-0">
        <Link href="/orders" className="block text-left group">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-white group-hover:text-neutral-200 transition-colors">
            วันชัย
          </h1>
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-white group-hover:text-neutral-200 transition-colors">
            การพิมพ์
          </h2>
        </Link>
      </div>

      {/* Main Navigation Menu matching Figma */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive;

          return (
            <div key={item.id} className="space-y-1">
              <Link
                href={item.href}
                onClick={(e) => handleLinkClick(e, item.href)}
                className={`flex items-center gap-4 px-8 py-3.5 text-sm transition-colors ${
                  active
                    ? 'bg-[#ECEAE2] text-black font-semibold'
                    : 'text-white hover:bg-neutral-900 font-medium'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-black' : 'text-white'
                  }`}
                />
                <span className="truncate">{item.title}</span>
              </Link>

              {/* Submenu for Production Tracking */}
              {item.hasSubmenu && isProductionActive && (
                <div className="bg-neutral-950 py-1 space-y-1">
                  <Link
                    href="/production-tracking?tab=status"
                    onClick={(e) => handleLinkClick(e, '/production-tracking?tab=status')}
                    className={`flex items-center gap-2 pl-14 pr-6 py-2 text-xs transition-colors ${
                      currentTab === 'status'
                        ? 'text-white font-bold bg-neutral-900'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    <span>สถานะใบสั่งผลิต</span>
                  </Link>

                  <Link
                    href="/production-tracking?tab=completed"
                    onClick={(e) => handleLinkClick(e, '/production-tracking?tab=completed')}
                    className={`flex items-center gap-2 pl-14 pr-6 py-2 text-xs transition-colors ${
                      currentTab === 'completed'
                        ? 'text-white font-bold bg-neutral-900'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    <span>จำนวนสินค้าที่ผลิตเสร็จ</span>
                  </Link>

                  <Link
                    href="/production-tracking?tab=qc"
                    onClick={(e) => handleLinkClick(e, '/production-tracking?tab=qc')}
                    className={`flex items-center gap-2 pl-14 pr-6 py-2 text-xs transition-colors ${
                      currentTab === 'qc'
                        ? 'text-white font-bold bg-neutral-900'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    <span>จำนวนสินค้าที่ผ่าน QC</span>
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
