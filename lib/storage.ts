/**
 * Centralized Client-Side Storage Helper using localStorage + Window Memory + IndexedDB
 * Ensures all added orders, quotations, print jobs, deliveries, and receipts persist across
 * page navigation, browser reloads, and desktop application restarts without ever hitting
 * the 5MB localStorage quota limit.
 */

import {
  MOCK_ORDERS,
  MOCK_QUOTATIONS,
  MOCK_RECEIPTS,
  ReportQuotation,
  ReportReceipt,
} from './mockReportData';

export interface StorageProductItem {
  id: string;
  name: string;
  printType: string;
  quantity: string;
  unit: string;
  paperType: string;
  paperSize: string;
  paperColor: string;
  description: string;
  imageUrl?: string;
  unitPrice?: number;
}

export interface StorageOrderRecord {
  Sales_Order_ID: string;
  Company_Name: string;
  Customer_Name: string;
  Customer_Phone: string;
  Customer_Address: string;
  Order_Date: string;
  Order_Status: string;
  items: StorageProductItem[];
}

export interface StorageCustomerRecord {
  id: string;
  company: string;
  name: string;
  phone: string;
  address: string;
}

export interface StorageQuotationItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface StorageQuotationRecord {
  Quotation_ID: string;
  Sales_Order_ID?: string;
  Company_Name: string;
  Customer_Name?: string;
  Customer_Phone?: string;
  Customer_Address?: string;
  Quotation_Date: string;
  Quotation_Status: string;
  items: StorageQuotationItem[];
  Total_Amount?: number;
}

export interface StorageDailyLogRecord {
  logId: string;
  date: string;
  remainingQty: number;
  dailyQty: number;
  accumulatedQty: number;
}

export interface StorageQcRecord {
  recordId: string;
  date: string;
  passedQty: number;
  defectQty: number;
  accumulatedPassedQty?: number;
}

export interface StoragePrintJobRecord {
  Print_Job_ID: string;
  Sales_Order_ID: string;
  Product_ID: string;
  Product_Name: string;
  Print_Type: string;
  Quantity: number;
  Unit: string;
  Paper_Type: string;
  Paper_Size: string;
  Paper_Color: string;
  Description?: string;
  ImageUrl?: string;
  Prototype_Image_Url?: string;
  Prototype_Image?: string;
  Delivery_ID?: string;
  Prototype_Status: string;
  Print_Job_Status?: string;
  Date: string;
  Company_Name?: string;
  Customer_Phone?: string;
  Customer_Address?: string;
  Produced_Qty?: number;
  Passed_QC?: number;
  Reorder_Qty?: number;
  Daily_Logs?: StorageDailyLogRecord[];
  QC_Records?: StorageQcRecord[];
}

export interface StorageDeliveryRecord {
  Delivery_ID: string;
  Sales_Order_ID: string;
  Customer_Name: string;
  Company_Name: string;
  Customer_Phone?: string;
  Customer_Address?: string;
  Delivery_Status: string;
  Deliverer?: string;
  Delivery_Date?: string;
}

export interface StorageReceiptItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface StorageReceiptRecord {
  Receipt_ID: string;
  Sales_Order_ID: string;
  Quotation_ID?: string;
  Company_Name: string;
  Customer_Name?: string;
  Customer_Phone?: string;
  Customer_Address?: string;
  Receipt_Date: string;
  Payment_Receiver: string;
  Total_Amount?: number;
  items?: StorageReceiptItem[];
}

// Clean Default Records (Empty arrays ready for fresh user input)
const DEFAULT_CUSTOMERS: StorageCustomerRecord[] = [];
const DEFAULT_ORDERS: StorageOrderRecord[] = [];
const DEFAULT_QUOTATIONS: StorageQuotationRecord[] = [];
const DEFAULT_PRINT_JOBS: StoragePrintJobRecord[] = [];
const DEFAULT_DELIVERIES: StorageDeliveryRecord[] = [];
const DEFAULT_RECEIPTS: StorageReceiptRecord[] = [];

// Storage Keys (Clean version)
const STORAGE_KEYS = {
  ORDERS: 'wanchai_orders_clean_v1',
  CUSTOMERS: 'wanchai_customers_clean_v1',
  QUOTATIONS: 'wanchai_quotations_clean_v1',
  PRINT_JOBS: 'wanchai_print_jobs_clean_v1',
  DELIVERIES: 'wanchai_deliveries_clean_v1',
  RECEIPTS: 'wanchai_receipts_clean_v1',
};

const ACTIVE_STORAGE_KEY_SET = new Set<string>(Object.values(STORAGE_KEYS));

// Module-level memory caches (paired with window.__vanchai_* for cross-chunk persistence)
let _memoryOrders: StorageOrderRecord[] | null = null;
let _memoryCustomers: StorageCustomerRecord[] | null = null;
let _memoryQuotations: StorageQuotationRecord[] | null = null;
let _memoryPrintJobs: StoragePrintJobRecord[] | null = null;
let _memoryDeliveries: StorageDeliveryRecord[] | null = null;
let _memoryReceipts: StorageReceiptRecord[] | null = null;

// ----------------------------------------------------
// IndexedDB & Window Cache for High-Capacity Images
// ----------------------------------------------------
const DB_NAME = 'vanchai_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'prototype_images';

function getProtoCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  (window as any).__vanchai_proto_cache = (window as any).__vanchai_proto_cache || {};
  return (window as any).__vanchai_proto_cache;
}

function getIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function saveImageToCacheAndIDB(id: string, dataUrl: string): void {
  if (!id || !dataUrl || dataUrl === '__saved_in_indexeddb__') return;
  const cache = getProtoCache();
  cache[id] = dataUrl;
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, dataUrl, updated: Date.now() });
    } catch {}
  });
}

// Hydrate images from IndexedDB into window.__vanchai_proto_cache on browser load
let _idbHydrated = false;
function hydrateImagesFromIndexedDB(): void {
  if (typeof window === 'undefined' || _idbHydrated) return;
  _idbHydrated = true;
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result;
        if (Array.isArray(results)) {
          const cache = getProtoCache();
          let added = false;
          results.forEach((row: any) => {
            if (row && row.id && row.dataUrl && !cache[row.id]) {
              cache[row.id] = row.dataUrl;
              added = true;
            }
          });
          if (added) {
            window.dispatchEvent(new Event('vanchai_images_hydrated'));
          }
        }
      };
    } catch {}
  });
}

if (typeof window !== 'undefined') {
  hydrateImagesFromIndexedDB();
}

// ----------------------------------------------------
// Quota Cleaner & Safe LocalStorage Writer
// ----------------------------------------------------
let _hasCleanedQuota = false;

export function cleanLocalStorageQuota(force = false): void {
  if (typeof window === 'undefined') return;
  if (_hasCleanedQuota && !force) return;
  _hasCleanedQuota = true;

  hydrateImagesFromIndexedDB();
  const cache = getProtoCache();

  // 1. Remove all legacy / non-active keys from localStorage (e.g., wanchai_*_v2, wanchai_*_v1)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !ACTIVE_STORAGE_KEY_SET.has(k)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}

  // 2. Move any large prototype images out of sessionStorage into window cache + IndexedDB
  try {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith('vanchai_proto_img_')) {
        const cleanId = k.replace('vanchai_proto_img_', '').trim();
        const val = window.sessionStorage.getItem(k);
        if (val && val !== '__saved_in_indexeddb__' && cleanId) {
          saveImageToCacheAndIDB(cleanId, val);
        }
        sessionKeysToRemove.push(k);
      }
    }
    sessionKeysToRemove.forEach((k) => {
      try {
        window.sessionStorage.removeItem(k);
      } catch {}
    });
  } catch {}

  // 3. Strip bulky base64 images (> 2000 chars) from ORDERS in localStorage (preserving them in cache + IDB)
  try {
    const rawOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (rawOrders) {
      const orders = JSON.parse(rawOrders);
      if (Array.isArray(orders)) {
        let modified = false;
        orders.forEach((o: any) => {
          const orderId = (o.Sales_Order_ID || '').trim();
          if (Array.isArray(o.items)) {
            o.items.forEach((it: any) => {
              const itemId = (it.id || '').trim();
              if (it.imageUrl && typeof it.imageUrl === 'string' && it.imageUrl.length > 2000) {
                if (orderId && itemId) {
                  saveImageToCacheAndIDB(`order_img_${orderId}_${itemId}`, it.imageUrl);
                }
                it.imageUrl = '';
                modified = true;
              }
            });
          }
        });
        if (modified) {
          localStorage.removeItem(STORAGE_KEYS.ORDERS);
          localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        }
      }
    }
  } catch {}

  // 4. Strip bulky base64 images (> 2000 chars) from PRINT_JOBS in localStorage (preserving them in cache + IDB)
  try {
    const rawJobs = localStorage.getItem(STORAGE_KEYS.PRINT_JOBS);
    if (rawJobs) {
      const jobs = JSON.parse(rawJobs);
      if (Array.isArray(jobs)) {
        let modified = false;
        jobs.forEach((j: any) => {
          const cleanId = (j.Print_Job_ID || '').trim();
          if (j.Prototype_Status === 'In Process') {
            j.Prototype_Status = 'In Progress';
            modified = true;
          }
          if (j.Prototype_Image_Url === '__saved_in_indexeddb__') {
            j.Prototype_Image_Url = '';
            modified = true;
          }
          if (j.Prototype_Image === '__saved_in_indexeddb__') {
            j.Prototype_Image = '';
            modified = true;
          }
          if (j.Prototype_Image_Url && typeof j.Prototype_Image_Url === 'string' && j.Prototype_Image_Url.length > 2000) {
            if (cleanId) saveImageToCacheAndIDB(cleanId, j.Prototype_Image_Url);
            j.Prototype_Image_Url = '';
            modified = true;
          }
          if (j.Prototype_Image && typeof j.Prototype_Image === 'string' && j.Prototype_Image.length > 2000) {
            if (cleanId) saveImageToCacheAndIDB(cleanId, j.Prototype_Image);
            j.Prototype_Image = '';
            modified = true;
          }
          if (j.ImageUrl && typeof j.ImageUrl === 'string' && j.ImageUrl.length > 2000) {
            if (cleanId) saveImageToCacheAndIDB(`job_img_${cleanId}`, j.ImageUrl);
            j.ImageUrl = '';
            modified = true;
          }
        });
        if (modified) {
          localStorage.removeItem(STORAGE_KEYS.PRINT_JOBS);
          localStorage.setItem(STORAGE_KEYS.PRINT_JOBS, JSON.stringify(jobs));
        }
      }
    }
  } catch {}
}

function safeSetLocalStorage(key: string, jsonValue: string): void {
  if (typeof window === 'undefined') return;
  cleanLocalStorageQuota();
  try {
    localStorage.removeItem(key);
    localStorage.setItem(key, jsonValue);
  } catch (err) {
    cleanLocalStorageQuota(true);
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, jsonValue);
    } catch (retryErr) {
      console.error(`Failed to write ${key} to localStorage`, retryErr);
    }
  }
}

export function clearAllStoredData(): void {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
  _memoryOrders = null;
  _memoryCustomers = null;
  _memoryQuotations = null;
  _memoryPrintJobs = null;
  _memoryDeliveries = null;
  _memoryReceipts = null;
  try {
    delete (window as any).__vanchai_orders;
    delete (window as any).__vanchai_customers;
    delete (window as any).__vanchai_quotations;
    delete (window as any).__vanchai_print_jobs;
    delete (window as any).__vanchai_deliveries;
    delete (window as any).__vanchai_receipts;
  } catch {}
}

// ----------------------------------------------------
// Orders
// ----------------------------------------------------
export function getStoredOrders(): StorageOrderRecord[] {
  if (typeof window === 'undefined') return DEFAULT_ORDERS;
  cleanLocalStorageQuota();

  let ordersFromStorage: StorageOrderRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        ordersFromStorage = parsed;
      }
    }
  } catch {}

  const memOrders: StorageOrderRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_orders) || _memoryOrders;

  if (memOrders && Array.isArray(memOrders) && memOrders.length > 0) {
    if (ordersFromStorage.length === 0) {
      ordersFromStorage = [...memOrders];
    } else {
      const memMap = new Map<string, StorageOrderRecord>();
      memOrders.forEach((m) => {
        const id = (m.Sales_Order_ID || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      // Update existing records with newer in-memory records
      const merged = ordersFromStorage.map((o) => {
        const id = (o.Sales_Order_ID || '').trim().toLowerCase();
        return memMap.get(id) || o;
      });
      const existingIds = new Set(
        merged.map((o) => (o.Sales_Order_ID || '').trim().toLowerCase())
      );
      // Prepend any newly created records from memory
      memOrders.forEach((m) => {
        const id = (m.Sales_Order_ID || '').trim().toLowerCase();
        if (id && !existingIds.has(id)) {
          merged.unshift(m);
          existingIds.add(id);
        }
      });
      ordersFromStorage = merged;
    }
  } else if (ordersFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.ORDERS, JSON.stringify(DEFAULT_ORDERS));
    ordersFromStorage = DEFAULT_ORDERS;
  }

  // Restore item sample images from cache if stripped in localStorage
  const cache = getProtoCache();
  const resolved = ordersFromStorage.map((o) => {
    const orderId = (o.Sales_Order_ID || '').trim();
    const items = Array.isArray(o.items)
      ? o.items.map((it) => {
          const itemId = (it.id || '').trim();
          const cachedImg = orderId && itemId ? cache[`order_img_${orderId}_${itemId}`] : '';
          return {
            ...it,
            imageUrl: it.imageUrl || cachedImg || '',
          };
        })
      : [];
    return { ...o, items };
  });

  _memoryOrders = resolved;
  try {
    (window as any).__vanchai_orders = resolved;
  } catch {}
  return resolved;
}

export function saveStoredOrders(orders: StorageOrderRecord[]): void {
  if (typeof window === 'undefined') return;

  _memoryOrders = orders;
  try {
    (window as any).__vanchai_orders = orders;
  } catch {}

  // Extract large images into cache + IndexedDB and strip from localStorage payload
  const lightOrders = orders.map((o) => {
    const orderId = (o.Sales_Order_ID || '').trim();
    const lightItems = Array.isArray(o.items)
      ? o.items.map((it) => {
          const itemId = (it.id || '').trim();
          if (it.imageUrl && it.imageUrl.length > 2000) {
            if (orderId && itemId) {
              saveImageToCacheAndIDB(`order_img_${orderId}_${itemId}`, it.imageUrl);
            }
            return { ...it, imageUrl: '' };
          }
          return it;
        })
      : [];
    return { ...o, items: lightItems };
  });

  safeSetLocalStorage(STORAGE_KEYS.ORDERS, JSON.stringify(lightOrders));
}

// ----------------------------------------------------
// Customers
// ----------------------------------------------------
export function getStoredCustomers(): StorageCustomerRecord[] {
  if (typeof window === 'undefined') return DEFAULT_CUSTOMERS;
  cleanLocalStorageQuota();

  let customersFromStorage: StorageCustomerRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        customersFromStorage = parsed;
      }
    }
  } catch {}

  const memCustomers: StorageCustomerRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_customers) || _memoryCustomers;

  if (memCustomers && Array.isArray(memCustomers) && memCustomers.length > 0) {
    if (customersFromStorage.length === 0) {
      customersFromStorage = [...memCustomers];
    } else {
      const memMap = new Map<string, StorageCustomerRecord>();
      memCustomers.forEach((m) => {
        const id = (m.id || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      const merged = customersFromStorage.map((c) => {
        const id = (c.id || '').trim().toLowerCase();
        return memMap.get(id) || c;
      });
      const existingIds = new Set(merged.map((c) => (c.id || '').trim().toLowerCase()));
      memCustomers.forEach((m) => {
        const id = (m.id || '').trim().toLowerCase();
        if (id && !existingIds.has(id)) {
          merged.unshift(m);
          existingIds.add(id);
        }
      });
      customersFromStorage = merged;
    }
  } else if (customersFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.CUSTOMERS, JSON.stringify(DEFAULT_CUSTOMERS));
    customersFromStorage = DEFAULT_CUSTOMERS;
  }

  _memoryCustomers = customersFromStorage;
  try {
    (window as any).__vanchai_customers = customersFromStorage;
  } catch {}
  return customersFromStorage;
}

export function saveStoredCustomers(customers: StorageCustomerRecord[]): void {
  if (typeof window === 'undefined') return;
  _memoryCustomers = customers;
  try {
    (window as any).__vanchai_customers = customers;
  } catch {}
  safeSetLocalStorage(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
}

// ----------------------------------------------------
// Quotations
// ----------------------------------------------------
export function getStoredQuotations(): StorageQuotationRecord[] {
  if (typeof window === 'undefined') return DEFAULT_QUOTATIONS;
  cleanLocalStorageQuota();

  let quotesFromStorage: StorageQuotationRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUOTATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        quotesFromStorage = parsed;
      }
    }
  } catch {}

  const memQuotes: StorageQuotationRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_quotations) || _memoryQuotations;

  if (memQuotes && Array.isArray(memQuotes) && memQuotes.length > 0) {
    if (quotesFromStorage.length === 0) {
      quotesFromStorage = [...memQuotes];
    } else {
      const memMap = new Map<string, StorageQuotationRecord>();
      memQuotes.forEach((m) => {
        const id = (m.Quotation_ID || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      const merged = quotesFromStorage.map((q) => {
        const id = (q.Quotation_ID || '').trim().toLowerCase();
        return memMap.get(id) || q;
      });
      const existingIds = new Set(
        merged.map((q) => (q.Quotation_ID || '').trim().toLowerCase())
      );
      memQuotes.forEach((m) => {
        const id = (m.Quotation_ID || '').trim().toLowerCase();
        if (id && !existingIds.has(id)) {
          merged.unshift(m);
          existingIds.add(id);
        }
      });
      quotesFromStorage = merged;
    }
  } else if (quotesFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.QUOTATIONS, JSON.stringify(DEFAULT_QUOTATIONS));
    quotesFromStorage = DEFAULT_QUOTATIONS;
  }

  _memoryQuotations = quotesFromStorage;
  try {
    (window as any).__vanchai_quotations = quotesFromStorage;
  } catch {}
  return quotesFromStorage;
}

export function saveStoredQuotations(quotations: StorageQuotationRecord[]): void {
  if (typeof window === 'undefined') return;
  _memoryQuotations = quotations;
  try {
    (window as any).__vanchai_quotations = quotations;
  } catch {}
  safeSetLocalStorage(STORAGE_KEYS.QUOTATIONS, JSON.stringify(quotations));
}

// ----------------------------------------------------
// Print Jobs & Robust Persistent Storage
// ----------------------------------------------------
export function getStoredPrintJobs(): StoragePrintJobRecord[] {
  if (typeof window === 'undefined') return DEFAULT_PRINT_JOBS;

  cleanLocalStorageQuota();

  let jobsFromStorage: StoragePrintJobRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRINT_JOBS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        jobsFromStorage = parsed;
      }
    }
  } catch {}

  // Merge with sessionStorage if present
  if (typeof window !== 'undefined') {
    try {
      const fromSession = window.sessionStorage?.getItem('vanchai_session_print_jobs_v1');
      if (fromSession) {
        const parsed = JSON.parse(fromSession);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (jobsFromStorage.length === 0) {
            jobsFromStorage = parsed;
          } else {
            const sessMap = new Map<string, StoragePrintJobRecord>();
            parsed.forEach((s: StoragePrintJobRecord) => {
              const id = (s.Print_Job_ID || '').trim().toLowerCase();
              if (id) sessMap.set(id, s);
            });
            jobsFromStorage = jobsFromStorage.map((j) => {
              const id = (j.Print_Job_ID || '').trim().toLowerCase();
              const sessJob = sessMap.get(id);
              if (sessJob) {
                return {
                  ...j,
                  ...sessJob,
                  Prototype_Image_Url:
                    sessJob.Prototype_Image_Url || j.Prototype_Image_Url || '',
                  Prototype_Image:
                    sessJob.Prototype_Image || j.Prototype_Image || '',
                  ImageUrl: sessJob.ImageUrl || j.ImageUrl || '',
                };
              }
              return j;
            });
            const existingIds = new Set(
              jobsFromStorage.map((j) => (j.Print_Job_ID || '').trim().toLowerCase())
            );
            parsed.forEach((s: StoragePrintJobRecord) => {
              const id = (s.Print_Job_ID || '').trim().toLowerCase();
              if (id && !existingIds.has(id)) {
                jobsFromStorage.unshift(s);
                existingIds.add(id);
              }
            });
          }
        }
      }
    } catch {}
  }

  const memJobs: StoragePrintJobRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_print_jobs) || _memoryPrintJobs;

  // Merge with in-memory cache: in-memory records ALWAYS win over stale localStorage records
  if (memJobs && Array.isArray(memJobs) && memJobs.length > 0) {
    if (jobsFromStorage.length === 0) {
      jobsFromStorage = [...memJobs];
    } else {
      const memMap = new Map<string, StoragePrintJobRecord>();
      memJobs.forEach((m) => {
        const id = (m.Print_Job_ID || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      const merged = jobsFromStorage.map((j) => {
        const id = (j.Print_Job_ID || '').trim().toLowerCase();
        const memJob = memMap.get(id);
        if (memJob) {
          return {
            ...j,
            ...memJob,
            Prototype_Image_Url:
              memJob.Prototype_Image_Url ||
              memJob.Prototype_Image ||
              j.Prototype_Image_Url ||
              j.Prototype_Image ||
              '',
            Prototype_Image:
              memJob.Prototype_Image ||
              memJob.Prototype_Image_Url ||
              j.Prototype_Image ||
              j.Prototype_Image_Url ||
              '',
            ImageUrl: memJob.ImageUrl || j.ImageUrl || '',
          };
        }
        return j;
      });
      const storageIds = new Set(
        merged.map((j) => (j.Print_Job_ID || '').trim().toLowerCase())
      );
      memJobs.forEach((memJob) => {
        const memId = (memJob.Print_Job_ID || '').trim().toLowerCase();
        if (memId && !storageIds.has(memId)) {
          merged.unshift(memJob);
          storageIds.add(memId);
        }
      });
      jobsFromStorage = merged;
    }
    const lightMerged = jobsFromStorage.map((j) => ({
      ...j,
      Prototype_Image_Url:
        j.Prototype_Image_Url && j.Prototype_Image_Url.length > 2000 ? '' : j.Prototype_Image_Url,
      Prototype_Image:
        j.Prototype_Image && j.Prototype_Image.length > 2000 ? '' : j.Prototype_Image,
      ImageUrl: j.ImageUrl && j.ImageUrl.length > 2000 ? '' : j.ImageUrl,
    }));
    safeSetLocalStorage(STORAGE_KEYS.PRINT_JOBS, JSON.stringify(lightMerged));
  } else if (jobsFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.PRINT_JOBS, JSON.stringify(DEFAULT_PRINT_JOBS));
    jobsFromStorage = DEFAULT_PRINT_JOBS;
  }

  const cache = getProtoCache();

  // Recover prototype & product images from cache and normalize fields
  const resolved = jobsFromStorage.map((job: StoragePrintJobRecord) => {
    const cleanId = (job.Print_Job_ID || '').trim();
    const orderId = (job.Sales_Order_ID || '').trim();
    const prodId = (job.Product_ID || '').trim();

    let protoStatus = job.Prototype_Status;
    if (protoStatus === 'In Process') {
      protoStatus = 'In Progress';
    }

    const status =
      job.Print_Job_Status ||
      (protoStatus === 'Completed' ? 'In Production' : 'In Design');

    let protoImg = job.Prototype_Image_Url || job.Prototype_Image || '';
    if (protoImg === '__saved_in_indexeddb__') {
      protoImg = '';
    }
    if (!protoImg && cleanId) {
      protoImg = cache[cleanId] || '';
    }

    let prodImg = job.ImageUrl || '';
    if (!prodImg && cleanId) {
      prodImg =
        cache[`job_img_${cleanId}`] ||
        (orderId && prodId ? cache[`order_img_${orderId}_${prodId}`] : '') ||
        '';
    }

    return {
      ...job,
      Prototype_Status: protoStatus,
      Prototype_Image_Url: protoImg,
      Prototype_Image: protoImg,
      ImageUrl: prodImg,
      Print_Job_Status: status,
      Daily_Logs: Array.isArray(job.Daily_Logs) ? job.Daily_Logs : [],
      QC_Records: Array.isArray(job.QC_Records) ? job.QC_Records : [],
      Produced_Qty: typeof job.Produced_Qty === 'number' ? job.Produced_Qty : 0,
      Passed_QC: typeof job.Passed_QC === 'number' ? job.Passed_QC : 0,
      Reorder_Qty: typeof job.Reorder_Qty === 'number' ? job.Reorder_Qty : 0,
    };
  });

  _memoryPrintJobs = resolved;
  try {
    (window as any).__vanchai_print_jobs = resolved;
  } catch {}
  return resolved;
}

export function saveStoredPrintJobs(jobs: StoragePrintJobRecord[]): void {
  if (typeof window === 'undefined') return;

  const cache = getProtoCache();

  // Normalize status and preserve any existing cached images if not explicitly cleared
  const normalizedJobs = jobs.map((j) => {
    const cleanId = (j.Print_Job_ID || '').trim();
    let protoImg =
      j.Prototype_Image_Url === '__saved_in_indexeddb__'
        ? ''
        : j.Prototype_Image_Url || j.Prototype_Image || '';
    if (!protoImg && cleanId && cache[cleanId]) {
      protoImg = cache[cleanId];
    }

    let prodImg = j.ImageUrl || '';
    if (!prodImg && cleanId && cache[`job_img_${cleanId}`]) {
      prodImg = cache[`job_img_${cleanId}`];
    }

    if (protoImg && cleanId) {
      saveImageToCacheAndIDB(cleanId, protoImg);
    }
    if (prodImg && cleanId && prodImg.length > 2000) {
      saveImageToCacheAndIDB(`job_img_${cleanId}`, prodImg);
    }

    return {
      ...j,
      Prototype_Status: j.Prototype_Status === 'In Process' ? 'In Progress' : j.Prototype_Status,
      Prototype_Image_Url: protoImg,
      Prototype_Image: protoImg,
      ImageUrl: prodImg,
    };
  });

  // 1. Immediately store full objects in runtime memory and window cache
  _memoryPrintJobs = normalizedJobs;
  try {
    (window as any).__vanchai_print_jobs = normalizedJobs;
  } catch {}

  // 2. Strip bulky base64 images (> 2000 chars) from localStorage payload so localStorage stays < 20KB
  const lightJobsForLocalStorage = normalizedJobs.map((j) => ({
    ...j,
    Prototype_Image_Url:
      j.Prototype_Image_Url && j.Prototype_Image_Url.length > 2000 ? '' : j.Prototype_Image_Url,
    Prototype_Image:
      j.Prototype_Image && j.Prototype_Image.length > 2000 ? '' : j.Prototype_Image,
    ImageUrl: j.ImageUrl && j.ImageUrl.length > 2000 ? '' : j.ImageUrl,
  }));

  try {
    window.sessionStorage?.setItem(
      'vanchai_session_print_jobs_v1',
      JSON.stringify(lightJobsForLocalStorage)
    );
  } catch {}

  safeSetLocalStorage(STORAGE_KEYS.PRINT_JOBS, JSON.stringify(lightJobsForLocalStorage));
}

// ----------------------------------------------------
// Deliveries
// ----------------------------------------------------
export function getStoredDeliveries(): StorageDeliveryRecord[] {
  if (typeof window === 'undefined') return DEFAULT_DELIVERIES;

  cleanLocalStorageQuota();

  let deliveriesFromStorage: StorageDeliveryRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELIVERIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        deliveriesFromStorage = parsed;
      }
    }
  } catch {}

  // Merge with sessionStorage if present
  if (typeof window !== 'undefined') {
    try {
      const fromSession = window.sessionStorage?.getItem('vanchai_session_deliveries_v1');
      if (fromSession) {
        const parsed = JSON.parse(fromSession);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (deliveriesFromStorage.length === 0) {
            deliveriesFromStorage = parsed;
          } else {
            const sessMap = new Map<string, StorageDeliveryRecord>();
            parsed.forEach((s: StorageDeliveryRecord) => {
              const id = (s.Delivery_ID || '').trim().toLowerCase();
              if (id) sessMap.set(id, s);
            });
            deliveriesFromStorage = deliveriesFromStorage.map((d) => {
              const id = (d.Delivery_ID || '').trim().toLowerCase();
              return sessMap.get(id) || d;
            });
            const existingIds = new Set(
              deliveriesFromStorage.map((d) => (d.Delivery_ID || '').trim().toLowerCase())
            );
            parsed.forEach((s: StorageDeliveryRecord) => {
              const id = (s.Delivery_ID || '').trim().toLowerCase();
              if (id && !existingIds.has(id)) {
                deliveriesFromStorage.unshift(s);
                existingIds.add(id);
              }
            });
          }
        }
      }
    } catch {}
  }

  const memDeliveries: StorageDeliveryRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_deliveries) || _memoryDeliveries;

  // Merge with memory cache: in-memory records ALWAYS win over stale localStorage records
  if (memDeliveries && Array.isArray(memDeliveries) && memDeliveries.length > 0) {
    if (deliveriesFromStorage.length === 0) {
      deliveriesFromStorage = [...memDeliveries];
    } else {
      const memMap = new Map<string, StorageDeliveryRecord>();
      memDeliveries.forEach((m) => {
        const id = (m.Delivery_ID || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      const merged = deliveriesFromStorage.map((d) => {
        const id = (d.Delivery_ID || '').trim().toLowerCase();
        return memMap.get(id) || d;
      });
      const existingIds = new Set(
        merged.map((d) => (d.Delivery_ID || '').trim().toLowerCase())
      );
      memDeliveries.forEach((memD) => {
        const memId = (memD.Delivery_ID || '').trim().toLowerCase();
        if (memId && !existingIds.has(memId)) {
          merged.unshift(memD);
          existingIds.add(memId);
        }
      });
      deliveriesFromStorage = merged;
    }
    safeSetLocalStorage(STORAGE_KEYS.DELIVERIES, JSON.stringify(deliveriesFromStorage));
  } else if (deliveriesFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.DELIVERIES, JSON.stringify(DEFAULT_DELIVERIES));
    deliveriesFromStorage = DEFAULT_DELIVERIES;
  }

  _memoryDeliveries = deliveriesFromStorage;
  try {
    (window as any).__vanchai_deliveries = deliveriesFromStorage;
  } catch {}
  return deliveriesFromStorage;
}

export function saveStoredDeliveries(deliveries: StorageDeliveryRecord[]): void {
  if (typeof window === 'undefined') return;

  _memoryDeliveries = deliveries;
  try {
    (window as any).__vanchai_deliveries = deliveries;
    window.sessionStorage?.setItem('vanchai_session_deliveries_v1', JSON.stringify(deliveries));
  } catch {}

  safeSetLocalStorage(STORAGE_KEYS.DELIVERIES, JSON.stringify(deliveries));
}

// ----------------------------------------------------
// Receipts
// ----------------------------------------------------
export function getStoredReceipts(): StorageReceiptRecord[] {
  if (typeof window === 'undefined') return DEFAULT_RECEIPTS;

  cleanLocalStorageQuota();

  let receiptsFromStorage: StorageReceiptRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECEIPTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        receiptsFromStorage = parsed;
      }
    }
  } catch {}

  // Merge with sessionStorage if present
  if (typeof window !== 'undefined') {
    try {
      const fromSession = window.sessionStorage?.getItem('vanchai_session_receipts_v1');
      if (fromSession) {
        const parsed = JSON.parse(fromSession);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (receiptsFromStorage.length === 0) {
            receiptsFromStorage = parsed;
          } else {
            const sessMap = new Map<string, StorageReceiptRecord>();
            parsed.forEach((s: StorageReceiptRecord) => {
              const id = (s.Receipt_ID || '').trim().toLowerCase();
              if (id) sessMap.set(id, s);
            });
            receiptsFromStorage = receiptsFromStorage.map((r) => {
              const id = (r.Receipt_ID || '').trim().toLowerCase();
              return sessMap.get(id) || r;
            });
            const existingIds = new Set(
              receiptsFromStorage.map((r) => (r.Receipt_ID || '').trim().toLowerCase())
            );
            parsed.forEach((s: StorageReceiptRecord) => {
              const id = (s.Receipt_ID || '').trim().toLowerCase();
              if (id && !existingIds.has(id)) {
                receiptsFromStorage.unshift(s);
                existingIds.add(id);
              }
            });
          }
        }
      }
    } catch {}
  }

  const memReceipts: StorageReceiptRecord[] | null =
    (typeof window !== 'undefined' && (window as any).__vanchai_receipts) || _memoryReceipts;

  // Merge with memory cache: in-memory records ALWAYS win over stale localStorage records
  if (memReceipts && Array.isArray(memReceipts) && memReceipts.length > 0) {
    if (receiptsFromStorage.length === 0) {
      receiptsFromStorage = [...memReceipts];
    } else {
      const memMap = new Map<string, StorageReceiptRecord>();
      memReceipts.forEach((m) => {
        const id = (m.Receipt_ID || '').trim().toLowerCase();
        if (id) memMap.set(id, m);
      });
      const merged = receiptsFromStorage.map((r) => {
        const id = (r.Receipt_ID || '').trim().toLowerCase();
        return memMap.get(id) || r;
      });
      const existingIds = new Set(
        merged.map((r) => (r.Receipt_ID || '').trim().toLowerCase())
      );
      memReceipts.forEach((memR) => {
        const memId = (memR.Receipt_ID || '').trim().toLowerCase();
        if (memId && !existingIds.has(memId)) {
          merged.unshift(memR);
          existingIds.add(memId);
        }
      });
      receiptsFromStorage = merged;
    }
    safeSetLocalStorage(STORAGE_KEYS.RECEIPTS, JSON.stringify(receiptsFromStorage));
  } else if (receiptsFromStorage.length === 0) {
    safeSetLocalStorage(STORAGE_KEYS.RECEIPTS, JSON.stringify(DEFAULT_RECEIPTS));
    receiptsFromStorage = DEFAULT_RECEIPTS;
  }

  _memoryReceipts = receiptsFromStorage;
  try {
    (window as any).__vanchai_receipts = receiptsFromStorage;
  } catch {}
  return receiptsFromStorage;
}

export function saveStoredReceipts(receipts: StorageReceiptRecord[]): void {
  if (typeof window === 'undefined') return;

  _memoryReceipts = receipts;
  try {
    (window as any).__vanchai_receipts = receipts;
    window.sessionStorage?.setItem('vanchai_session_receipts_v1', JSON.stringify(receipts));
  } catch {}

  safeSetLocalStorage(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));
}
