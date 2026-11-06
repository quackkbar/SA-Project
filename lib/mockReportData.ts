/**
 * Mock Data Types and Clean State
 * Reset to empty arrays for fresh user mock data creation
 */

export interface ReportOrder {
  Sales_Order_ID: string;
  Company_Name: string;
  Customer_Name: string;
  Order_Date: string;
  Order_Status: string;
}

export const MOCK_ORDERS: ReportOrder[] = [];

export interface ReportQuotation {
  Quotation_ID: string;
  Company_Name: string;
  Quotation_Date: string;
  Quotation_Status: string;
}

export const MOCK_QUOTATIONS: ReportQuotation[] = [];

export interface ReportPrintJob {
  Print_Job_ID: string;
  Product_Name: string;
  Print_Type: string;
  Prototype_Status: string;
  Date: string;
}

export const MOCK_PRINT_JOBS: ReportPrintJob[] = [];

export interface ReportProductionStatus {
  Print_Job_ID: string;
  Sales_Order_ID: string;
  Product_Name: string;
  Job_Status: string;
}

export const MOCK_PRODUCTION_STATUS: ReportProductionStatus[] = [];

export interface ReportCompletedItem {
  Print_Job_ID: string;
  Sales_Order_ID: string;
  Product_Name: string;
  Quantity: number;
  Unit: string;
}

export const MOCK_COMPLETED_ITEMS: ReportCompletedItem[] = [];

export interface ReportQcItem {
  Print_Job_ID: string;
  Sales_Order_ID: string;
  Product_Name: string;
  Quantity: number;
  Unit: string;
  Passed_QC: number;
}

export const MOCK_QC_ITEMS: ReportQcItem[] = [];

export interface ReportDelivery {
  Delivery_ID: string;
  Sales_Order_ID: string;
  Customer_Name: string;
  Company_Name: string;
  Delivery_Status: string;
}

export const MOCK_DELIVERIES: ReportDelivery[] = [];

export interface ReportReceipt {
  Receipt_ID: string;
  Sales_Order_ID: string;
  Company_Name: string;
  Receipt_Date: string;
  Payment_Receiver: string;
}

export const MOCK_RECEIPTS: ReportReceipt[] = [];
