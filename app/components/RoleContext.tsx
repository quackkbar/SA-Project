'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppRole, APP_ROLES } from '@/lib/types';

interface RoleContextType {
  role: AppRole;
  setRole: (role: AppRole) => void;
  roleConfig: typeof APP_ROLES[AppRole];
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<AppRole>('Sales');

  useEffect(() => {
    const saved = localStorage.getItem('printshop_active_role') as AppRole;
    if (saved && APP_ROLES[saved]) {
      setRoleState(saved);
    }
  }, []);

  const setRole = (newRole: AppRole) => {
    setRoleState(newRole);
    localStorage.setItem('printshop_active_role', newRole);
  };

  return (
    <RoleContext.Provider value={{ role, setRole, roleConfig: APP_ROLES[role] }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
