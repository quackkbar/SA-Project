import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { RoleProvider } from './components/RoleContext';
import Sidebar from './components/Sidebar';

export const metadata: Metadata = {
  title: 'ระบบจัดการโรงพิมพ์ - ร้านวันชัยการพิมพ์',
  description: 'ระบบจัดการโรงพิมพ์ ร้านวันชัยการพิมพ์',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="h-screen w-screen overflow-hidden bg-[#F8F9FA] text-[#111111] antialiased flex flex-row">
        <RoleProvider>
          <Suspense fallback={<aside className="w-[250px] shrink-0 bg-black h-screen" />}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 min-w-0 h-screen overflow-y-auto bg-[#F8F9FA]">
            {children}
          </main>
        </RoleProvider>
      </body>
    </html>
  );
}
