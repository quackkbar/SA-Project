-- ============================================================================
-- STEP 2: PostgreSQL Schema & DDL Design — MVP / Prototype Final Candidate
-- Project : Print Shop Management System (ระบบจัดการโรงพิมพ์ - ร้านวันชัยการพิมพ์)
-- Baseline: FINAL_SPECIFICATION_V8_PRODUCTION_READY.md + SA (5).pdf
-- Target  : PostgreSQL 15+
-- STATUS  : DESIGN SPECIFICATION FILE ONLY (MVP CANDIDATE)
--           NO DATABASE CONNECTION OR EXECUTION HAS BEEN PERFORMED.
--
-- Purpose & Architectural Scope for MVP / Prototype:
--   1. Rapid Application Development: Designed to support frontend/backend developers
--      in building and demonstrating core use cases (UC1–UC16) without enterprise complexity.
--   2. Pragmatic Role & Ownership Model:
--      - Database Migration is executed by the standard PostgreSQL admin/owner (e.g. 'postgres').
--      - Backend Application connects via a dedicated application role 'printshop_app' (WITH LOGIN).
--      - Frontend/Browser has NO direct database access and holds NO database credentials.
--   3. Standard Backend Data Access:
--      - Backend services execute standard CRUD transactions directly (via ORM or query builder).
--      - Critical invariants are enforced by PostgreSQL Constraints, Sequences, and Triggers.
--      - There is no need to write 16+ complex PL/pgSQL stored procedures in this round.
--   4. Deferred Advanced Idempotency:
--      - Complex cryptographic payload hashing (RFC 8785) and nested PL/pgSQL subtransactions
--        are deferred to Post-MVP. Idempotency tables remain for standard backend deduplication.
--   5. Auxiliary Supervisory Force-Close:
--      - Supervisor role authorization is verified at the Backend API layer prior to invocation.
--   6. Accurate Delivery Guard:
--      - Validates assigned deliverer and actual delivery date (<= CURRENT_DATE).
--      - Does not claim customer delivery acknowledgment (out of scope for academic data dictionary).
--
-- HOW TO MIGRATE / RUN THIS DDL:
--   Run as standard PostgreSQL database administrator / owner (e.g., 'postgres'):
--     createdb -U postgres printshop_db
--     psql -h localhost -p 5432 -U postgres -d printshop_db -f STEP2_MVP_DDL_FINAL_CANDIDATE.sql
--
-- BACKEND CONNECTION (.env):
--   DATABASE_URL="postgresql://printshop_app:printshop_dev_password@localhost:5432/printshop_db"
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. PRAGMATIC ROLE PROVISIONING (MVP MODEL)
-- ============================================================================
-- In this MVP / Prototype configuration:
--   1. Migration Runner: Standard administrative superuser (default 'postgres' or current database owner).
--      All tables, types, sequences, views, and functions are naturally owned by the migration runner.
--   2. Application Runtime Account: 'printshop_app' (WITH LOGIN).
--      Used exclusively by the Backend Application Server via secure server-side environment variables.
--
-- SECURITY NOTICE:
-- The password 'printshop_dev_password' is an insecure default intended STRICTLY for local prototype
-- development, manual testing, and CI/CD demonstration. For any staging or production deployment,
-- ALWAYS override this password via environment variables or secret managers:
--   ALTER ROLE printshop_app WITH PASSWORD 'your_strong_secret_password';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'printshop_app') THEN
        CREATE ROLE printshop_app WITH LOGIN PASSWORD 'printshop_dev_password';
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO printshop_app;

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

-- 1.1 Quotation Status Enum (UC1 - UC4)
CREATE TYPE public.quotation_status AS ENUM (
    'Pending',
    'Completed',
    'Rejected',
    'Under_Revision'
);

-- 1.2 Prototype Status Enum (UC5 - UC10)
CREATE TYPE public.prototype_status AS ENUM (
    'Not_Started',
    'In_Progress',
    'Pending',
    'Completed',
    'Under_Revision'
);

-- 1.3 Print Job Status Enum (UC5 - UC13)
CREATE TYPE public.print_job_status AS ENUM (
    'In_Design',
    'In_Production',
    'QC_Pending',
    'Completed'
);

-- 1.4 Delivery Status Enum (UC5, UC14)
CREATE TYPE public.delivery_status AS ENUM (
    'Producing',
    'Preparing',
    'Shipping',
    'Delivered'
);

-- 1.5 Sales Order Status Enum (Centralized 16-State Scope from SA Data Dictionary p.166)
CREATE TYPE public.sales_order_status AS ENUM (
    'Quotation_Not_Started',
    'Quotation_Pending',
    'Quotation_Completed',
    'Quotation_Rejected',
    'Quotation_Under_Revision',
    'Prototype_Not_Started',
    'Prototype_In_Progress',
    'Prototype_Pending',
    'Prototype_Completed', -- DEPRECATED / UNREACHABLE at runtime under atomic UC10 transitions
    'Prototype_Under_Revision',
    'Print_Job_In_Production',
    'Print_Job_QC_Pending',
    'Print_Job_Completed',
    'Delivery_Preparing',
    'Delivery_Shipping',
    'Delivery_Delivered'
);

-- ============================================================================
-- 2. SEQUENCES (Prefix + exactly 5 numeric digits; MAXVALUE 99999 NO CYCLE)
-- ============================================================================
CREATE SEQUENCE public.seq_customer_id          START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_sales_order_id       START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_product_id           START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_quotation_id         START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_quotation_detail_id  START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_print_job_id         START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_production_batch_id   START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_production_record_id START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_qc_record_id         START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_delivery_id           START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE public.seq_receipt_id            START 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;


-- ============================================================================
-- 3. CORE OPERATIONAL ENTITIES (11 TABLES)
-- ============================================================================

-- 3.1 CUSTOMER (ลูกค้า) — SA Data Dictionary p.165
CREATE TABLE public."CUSTOMER" (
    "Customer_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('CUS' || LPAD(NEXTVAL('public.seq_customer_id')::TEXT, 5, '0')),
    "Customer_Name" VARCHAR(50),
    "Customer_Phone" VARCHAR(12) NOT NULL,
    "Customer_Comp_Addr" VARCHAR(100) NOT NULL,
    "Customer_Company" VARCHAR(50) NOT NULL,
    CONSTRAINT chk_customer_id CHECK ("Customer_ID" ~ '^CUS[0-9]{5}$'),
    CONSTRAINT chk_customer_phone_nonempty CHECK (BTRIM("Customer_Phone") <> ''),
    CONSTRAINT chk_customer_addr_nonempty CHECK (BTRIM("Customer_Comp_Addr") <> ''),
    CONSTRAINT chk_customer_company_nonempty CHECK (BTRIM("Customer_Company") <> '')
);
ALTER SEQUENCE public.seq_customer_id OWNED BY public."CUSTOMER"."Customer_ID";
CREATE INDEX idx_customer_company ON public."CUSTOMER" ("Customer_Company");

-- 3.2 SALES_ORDER (คำสั่งซื้อ) — SA Data Dictionary p.166
CREATE TABLE public."SALES_ORDER" (
    "Sales_Order_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('SO' || LPAD(NEXTVAL('public.seq_sales_order_id')::TEXT, 5, '0')),
    "Order_Date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "Order_Status" public.sales_order_status NOT NULL DEFAULT 'Quotation_Not_Started',
    "Customer_ID" VARCHAR(8) NOT NULL,
    CONSTRAINT chk_sales_order_id CHECK ("Sales_Order_ID" ~ '^SO[0-9]{5}$'),
    CONSTRAINT fk_sales_order_customer FOREIGN KEY ("Customer_ID")
        REFERENCES public."CUSTOMER" ("Customer_ID") ON DELETE RESTRICT
);
ALTER SEQUENCE public.seq_sales_order_id OWNED BY public."SALES_ORDER"."Sales_Order_ID";
CREATE INDEX idx_sales_order_customer ON public."SALES_ORDER" ("Customer_ID");
CREATE INDEX idx_sales_order_status ON public."SALES_ORDER" ("Order_Status");

-- 3.3 ORDER_DETAIL (รายการสินค้าในคำสั่งซื้อ) — SA Data Dictionary p.169-170
CREATE TABLE public."ORDER_DETAIL" (
    "Product_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('PRD' || LPAD(NEXTVAL('public.seq_product_id')::TEXT, 5, '0')),
    "Product_Name" VARCHAR(100) NOT NULL,
    "Quantity" INTEGER NOT NULL CHECK ("Quantity" > 0),
    "Unit" VARCHAR(20) NOT NULL,
    "Paper_Size" VARCHAR(50),
    "Paper_Type" VARCHAR(50),
    "Product_Type" VARCHAR(50),
    "Description" TEXT,
    "Color" VARCHAR(50),
    "Sample_Image" VARCHAR(255),
    "Sales_Order_ID" VARCHAR(8) NOT NULL,
    CONSTRAINT chk_product_id CHECK ("Product_ID" ~ '^PRD[0-9]{5}$'),
    CONSTRAINT chk_order_detail_name_nonempty CHECK (BTRIM("Product_Name") <> ''),
    CONSTRAINT chk_order_detail_unit_nonempty CHECK (BTRIM("Unit") <> ''),
    CONSTRAINT fk_order_detail_sales_order FOREIGN KEY ("Sales_Order_ID")
        REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    CONSTRAINT uq_product_sales_order UNIQUE ("Product_ID", "Sales_Order_ID")
);
ALTER SEQUENCE public.seq_product_id OWNED BY public."ORDER_DETAIL"."Product_ID";
CREATE INDEX idx_order_detail_sales_order ON public."ORDER_DETAIL" ("Sales_Order_ID", "Product_ID");

-- 3.4 QUOTATION (ใบเสนอราคา) — SA Data Dictionary p.171
CREATE TABLE public."QUOTATION" (
    "Quotation_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('QT' || LPAD(NEXTVAL('public.seq_quotation_id')::TEXT, 5, '0')),
    "Quotation_Date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "Status" public.quotation_status NOT NULL DEFAULT 'Pending',
    "Total_Amount" NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK ("Total_Amount" >= 0.00),
    "Sales_Order_ID" VARCHAR(8) NOT NULL UNIQUE,
    CONSTRAINT chk_quotation_id CHECK ("Quotation_ID" ~ '^QT[0-9]{5}$'),
    CONSTRAINT fk_quotation_sales_order FOREIGN KEY ("Sales_Order_ID")
        REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT
);
ALTER SEQUENCE public.seq_quotation_id OWNED BY public."QUOTATION"."Quotation_ID";
CREATE INDEX idx_quotation_status ON public."QUOTATION" ("Status");

-- 3.5 QUOTATION_DETAIL (รายการใบเสนอราคา) — SA Data Dictionary p.172
CREATE TABLE public."QUOTATION_DETAIL" (
    "Quotation_Detail_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('QD' || LPAD(NEXTVAL('public.seq_quotation_detail_id')::TEXT, 5, '0')),
    "Unit_Price" NUMERIC(12,2) NOT NULL CHECK ("Unit_Price" > 0.00),
    "Total_Price" NUMERIC(12,2) NOT NULL CHECK ("Total_Price" > 0.00),
    "Quotation_ID" VARCHAR(8) NOT NULL,
    "Product_ID" VARCHAR(8) NOT NULL UNIQUE,
    CONSTRAINT chk_quotation_detail_id CHECK ("Quotation_Detail_ID" ~ '^QD[0-9]{5}$'),
    CONSTRAINT fk_qd_quotation FOREIGN KEY ("Quotation_ID")
        REFERENCES public."QUOTATION" ("Quotation_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_qd_product FOREIGN KEY ("Product_ID")
        REFERENCES public."ORDER_DETAIL" ("Product_ID") ON DELETE RESTRICT
);
ALTER SEQUENCE public.seq_quotation_detail_id OWNED BY public."QUOTATION_DETAIL"."Quotation_Detail_ID";
CREATE INDEX idx_qd_quotation ON public."QUOTATION_DETAIL" ("Quotation_ID", "Quotation_Detail_ID");

-- 3.6 PRINT_JOB (ใบสั่งผลิต / ชิ้นงานตัวอย่าง) — SA Data Dictionary p.173-174
CREATE TABLE public."PRINT_JOB" (
    "Print_Job_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('PJ' || LPAD(NEXTVAL('public.seq_print_job_id')::TEXT, 5, '0')),
    "Prototype_Status" public.prototype_status NOT NULL DEFAULT 'Not_Started',
    "Prototype_Image" VARCHAR(255),
    "Print_Job_Status" public.print_job_status NOT NULL DEFAULT 'In_Design',
    "Product_ID" VARCHAR(8) NOT NULL UNIQUE,
    CONSTRAINT chk_print_job_id CHECK ("Print_Job_ID" ~ '^PJ[0-9]{5}$'),
    CONSTRAINT fk_print_job_product FOREIGN KEY ("Product_ID")
        REFERENCES public."ORDER_DETAIL" ("Product_ID") ON DELETE RESTRICT,
    CONSTRAINT uq_print_job_product_pair UNIQUE ("Print_Job_ID", "Product_ID"),
    -- Cross-Field Consistency Guard: Production/QC states require Completed Prototype
    CONSTRAINT chk_print_job_prototype_consistency CHECK (
        ("Print_Job_Status" = 'In_Design' AND "Prototype_Status" <> 'Completed') OR
        ("Print_Job_Status" IN ('In_Production', 'QC_Pending', 'Completed') AND "Prototype_Status" = 'Completed')
    )
);
ALTER SEQUENCE public.seq_print_job_id OWNED BY public."PRINT_JOB"."Print_Job_ID";
CREATE INDEX idx_print_job_status ON public."PRINT_JOB" ("Print_Job_Status");
CREATE INDEX idx_print_job_proto ON public."PRINT_JOB" ("Prototype_Status");

-- 3.7 PRODUCTION_BATCH (รอบการผลิตหลัก) — Architectural Specification Section 4
CREATE TABLE public."PRODUCTION_BATCH" (
    "Batch_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('PB' || LPAD(NEXTVAL('public.seq_production_batch_id')::TEXT, 5, '0')),
    "Print_Job_ID" VARCHAR(8) NOT NULL,
    "Batch_Cycle" INTEGER NOT NULL CHECK ("Batch_Cycle" >= 1),
    "Authorized_Quantity" INTEGER NOT NULL CHECK ("Authorized_Quantity" > 0),
    "Produced_Quantity" INTEGER NOT NULL DEFAULT 0 CHECK ("Produced_Quantity" >= 0),
    "Batch_Status" VARCHAR(10) NOT NULL DEFAULT 'Open' CHECK ("Batch_Status" IN ('Open', 'Closed')),
    "Close_Type" VARCHAR(10) CHECK ("Close_Type" IN ('Normal', 'Forced')),
    "Closed_Reason" VARCHAR(255),
    "Closed_By" VARCHAR(50),
    "Created_At" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Closed_At" TIMESTAMPTZ,
    CONSTRAINT chk_batch_id CHECK ("Batch_ID" ~ '^PB[0-9]{5}$'),
    CONSTRAINT fk_batch_print_job FOREIGN KEY ("Print_Job_ID")
        REFERENCES public."PRINT_JOB" ("Print_Job_ID") ON DELETE RESTRICT,
    -- Unique cycle per job (prevents duplicate cycle creation)
    CONSTRAINT uq_pj_batch_cycle UNIQUE ("Print_Job_ID", "Batch_Cycle"),
    CONSTRAINT uq_batch_job UNIQUE ("Batch_ID", "Print_Job_ID"),
    CONSTRAINT uq_batch_job_cycle UNIQUE ("Batch_ID", "Print_Job_ID", "Batch_Cycle"),
    -- Quantity bounds: Produced cannot exceed Authorized
    CONSTRAINT chk_produced_le_auth CHECK ("Produced_Quantity" <= "Authorized_Quantity"),
    -- State integrity: Open batch cannot have Produced == Authorized
    CONSTRAINT chk_open_batch_not_fulfilled CHECK (
        "Batch_Status" <> 'Open' OR "Produced_Quantity" < "Authorized_Quantity"
    ),
    -- Normal close requires exactly reaching authorized quantity
    CONSTRAINT chk_normal_close_fulfilled CHECK (
        "Close_Type" IS DISTINCT FROM 'Normal' OR "Produced_Quantity" = "Authorized_Quantity"
    ),
    -- Forced close allows terminating when Produced < Authorized
    CONSTRAINT chk_forced_close_not_fulfilled CHECK (
        "Close_Type" IS DISTINCT FROM 'Forced' OR "Produced_Quantity" < "Authorized_Quantity"
    ),
    -- Field consistency with Batch_Status
    CONSTRAINT chk_batch_close_fields CHECK (
        ("Batch_Status" = 'Open' AND "Closed_At" IS NULL AND "Closed_Reason" IS NULL
            AND "Close_Type" IS NULL AND "Closed_By" IS NULL)
        OR
        ("Batch_Status" = 'Closed' AND "Closed_At" IS NOT NULL
            AND NULLIF(BTRIM("Closed_Reason"), '') IS NOT NULL AND "Close_Type" IS NOT NULL
            AND ("Close_Type" <> 'Forced' OR NULLIF(BTRIM("Closed_By"), '') IS NOT NULL))
    )
);
ALTER SEQUENCE public.seq_production_batch_id OWNED BY public."PRODUCTION_BATCH"."Batch_ID";
CREATE UNIQUE INDEX uq_single_open_batch_per_job
    ON public."PRODUCTION_BATCH" ("Print_Job_ID") WHERE "Batch_Status" = 'Open';
CREATE INDEX idx_batch_status ON public."PRODUCTION_BATCH" ("Batch_Status");

-- 3.8 PRODUCTION_RECORD (บันทึกการผลิตจริง - Append Only) — SA Data Dictionary p.176-177
CREATE TABLE public."PRODUCTION_RECORD" (
    "Production_Record_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('PR' || LPAD(NEXTVAL('public.seq_production_record_id')::TEXT, 5, '0')),
    "Batch_ID" VARCHAR(8) NOT NULL,
    "Production_Date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "Quantity_Produced" INTEGER NOT NULL CHECK ("Quantity_Produced" > 0),
    CONSTRAINT chk_production_record_id CHECK ("Production_Record_ID" ~ '^PR[0-9]{5}$'),
    CONSTRAINT fk_production_record_batch FOREIGN KEY ("Batch_ID")
        REFERENCES public."PRODUCTION_BATCH" ("Batch_ID") ON DELETE RESTRICT,
    CONSTRAINT uq_production_record_batch UNIQUE ("Production_Record_ID", "Batch_ID")
);
ALTER SEQUENCE public.seq_production_record_id OWNED BY public."PRODUCTION_RECORD"."Production_Record_ID";
CREATE INDEX idx_production_record_batch ON public."PRODUCTION_RECORD" ("Batch_ID", "Production_Record_ID");

-- 3.9 QC_RECORD (บันทึกผลการตรวจสอบคุณภาพ - Append Only) — SA Data Dictionary p.175
-- Approach A: References both Batch_ID and Production_Record_ID via Composite Foreign Key
CREATE TABLE public."QC_RECORD" (
    "QC_Record_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('QC' || LPAD(NEXTVAL('public.seq_qc_record_id')::TEXT, 5, '0')),
    "Batch_ID" VARCHAR(8) NOT NULL,
    "Production_Record_ID" VARCHAR(8) NOT NULL,
    "QC_Date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "Quantity_Passed" INTEGER NOT NULL CHECK ("Quantity_Passed" >= 0),
    "Quantity_Failed" INTEGER NOT NULL CHECK ("Quantity_Failed" >= 0),
    CONSTRAINT chk_qc_record_id CHECK ("QC_Record_ID" ~ '^QC[0-9]{5}$'),
    CONSTRAINT chk_qc_positive_sum CHECK ("Quantity_Passed" + "Quantity_Failed" > 0),
    CONSTRAINT fk_qc_batch FOREIGN KEY ("Batch_ID")
        REFERENCES public."PRODUCTION_BATCH" ("Batch_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_qc_production_record_batch FOREIGN KEY ("Production_Record_ID", "Batch_ID")
        REFERENCES public."PRODUCTION_RECORD" ("Production_Record_ID", "Batch_ID") ON DELETE RESTRICT,
    CONSTRAINT uq_qc_batch_record UNIQUE ("QC_Record_ID", "Batch_ID", "Production_Record_ID")
);
ALTER SEQUENCE public.seq_qc_record_id OWNED BY public."QC_RECORD"."QC_Record_ID";
CREATE INDEX idx_qc_record_batch_prod ON public."QC_RECORD" ("Batch_ID", "Production_Record_ID");

-- 3.10 DELIVERY (การจัดส่งสินค้า) — SA Data Dictionary p.167-168
CREATE TABLE public."DELIVERY" (
    "Delivery_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('DL' || LPAD(NEXTVAL('public.seq_delivery_id')::TEXT, 5, '0')),
    "Delivery_Status" public.delivery_status NOT NULL DEFAULT 'Producing',
    "Delivery_Date" DATE,
    "Deliver" VARCHAR(50),
    "Sales_Order_ID" VARCHAR(8) NOT NULL UNIQUE,
    CONSTRAINT chk_delivery_id CHECK ("Delivery_ID" ~ '^DL[0-9]{5}$'),
    CONSTRAINT fk_delivery_sales_order FOREIGN KEY ("Sales_Order_ID")
        REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    -- State-to-fields check: Shipping and Delivered require Deliver and Delivery_Date
    CONSTRAINT chk_delivery_shipping_fields CHECK (
        ("Delivery_Status" IN ('Producing', 'Preparing') AND "Delivery_Date" IS NULL AND "Deliver" IS NULL)
        OR
        ("Delivery_Status" IN ('Shipping', 'Delivered') AND "Delivery_Date" IS NOT NULL
            AND NULLIF(BTRIM("Deliver"), '') IS NOT NULL)
    )
);
ALTER SEQUENCE public.seq_delivery_id OWNED BY public."DELIVERY"."Delivery_ID";
CREATE INDEX idx_delivery_status ON public."DELIVERY" ("Delivery_Status");

-- 3.11 RECEIPT (ใบเสร็จรับเงิน) — SA Data Dictionary p.168-169
CREATE TABLE public."RECEIPT" (
    "Receipt_ID" VARCHAR(8) PRIMARY KEY
        DEFAULT ('RC' || LPAD(NEXTVAL('public.seq_receipt_id')::TEXT, 5, '0')),
    "Receipt_Date" DATE,
    "Payment_Receiver" VARCHAR(50),
    "Sales_Order_ID" VARCHAR(8) NOT NULL UNIQUE,
    CONSTRAINT chk_receipt_id CHECK ("Receipt_ID" ~ '^RC[0-9]{5}$'),
    CONSTRAINT fk_receipt_sales_order FOREIGN KEY ("Sales_Order_ID")
        REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    -- Both payment fields must be NULL upon UC15 creation, and both populated together in UC16
    CONSTRAINT chk_receipt_payment_fields CHECK (
        ("Receipt_Date" IS NULL AND "Payment_Receiver" IS NULL) OR
        ("Receipt_Date" IS NOT NULL AND NULLIF(BTRIM("Payment_Receiver"), '') IS NOT NULL)
    )
);
ALTER SEQUENCE public.seq_receipt_id OWNED BY public."RECEIPT"."Receipt_ID";
CREATE INDEX idx_receipt_order ON public."RECEIPT" ("Sales_Order_ID");

-- ============================================================================
-- 4. IDEMPOTENCY LOG TABLES (UC11, UC12, UC13) — Immutable Audit Log
-- ============================================================================
-- Architectural Guidance for MVP:
-- These tables store idempotency keys, request hashes, and cached response payloads for critical mutations.
-- In this MVP architecture, the Idempotency workflow is orchestrated at the Backend Application Layer:
--   1. Backend computes a standard 64-character SHA-256 hex digest of the incoming request payload:
--        payloadHash = crypto.createHash('sha256').update(JSON.stringify(reqBody)).digest('hex')
--      and passes it to "Request_Payload_Hash" (VARCHAR(64) NOT NULL).
--   2. On request arrival, Backend checks UCxx_IDEMPOTENCY_LOG:
--      - If Idempotency_Key exists AND Request_Payload_Hash matches -> Safe 200 OK replay with Response_Payload.
--      - If Idempotency_Key exists AND Request_Payload_Hash differs -> Reject with HTTP 409 Conflict.
--      - If Idempotency_Key is new -> Process mutation, insert record into UCxx_IDEMPOTENCY_LOG, and commit.
--   3. Advanced database-level cryptographic payload hashing (RFC 8785 Canonical JSON Scheme)
--      and PL/pgSQL subtransaction exception templates are formally deferred to Post-MVP (Production phase).

-- 4.1 UC11_IDEMPOTENCY_LOG (บันทึกการผลิตซ้ำ)
CREATE TABLE public."UC11_IDEMPOTENCY_LOG" (
    "Log_ID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Idempotency_Key" VARCHAR(64) NOT NULL UNIQUE CHECK (BTRIM("Idempotency_Key") <> ''),
    "Sales_Order_ID" VARCHAR(8) NOT NULL REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    "Print_Job_ID" VARCHAR(8) NOT NULL,
    "Batch_ID" VARCHAR(8) NOT NULL,
    "Production_Record_ID" VARCHAR(8) NOT NULL UNIQUE,
    "Quantity_Produced" INTEGER NOT NULL CHECK ("Quantity_Produced" > 0),
    "Request_Payload_Hash" VARCHAR(64) NOT NULL CHECK ("Request_Payload_Hash" ~ '^[0-9a-f]{64}$'),
    "Response_Status_Code" SMALLINT NOT NULL DEFAULT 200 CHECK ("Response_Status_Code" BETWEEN 100 AND 599),
    "Response_Payload" JSONB NOT NULL,
    "Created_At" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uc11_batch_job FOREIGN KEY ("Batch_ID", "Print_Job_ID")
        REFERENCES public."PRODUCTION_BATCH" ("Batch_ID", "Print_Job_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_uc11_record_batch FOREIGN KEY ("Production_Record_ID", "Batch_ID")
        REFERENCES public."PRODUCTION_RECORD" ("Production_Record_ID", "Batch_ID") ON DELETE RESTRICT
);
CREATE INDEX idx_uc11_idemp_key ON public."UC11_IDEMPOTENCY_LOG" ("Idempotency_Key");
CREATE INDEX idx_uc11_sales_order ON public."UC11_IDEMPOTENCY_LOG" ("Sales_Order_ID");

-- 4.2 UC12_IDEMPOTENCY_LOG (บันทึกการตรวจ QC ซ้ำ)
CREATE TABLE public."UC12_IDEMPOTENCY_LOG" (
    "Log_ID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Idempotency_Key" VARCHAR(64) NOT NULL UNIQUE CHECK (BTRIM("Idempotency_Key") <> ''),
    "Sales_Order_ID" VARCHAR(8) NOT NULL REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    "Print_Job_ID" VARCHAR(8) NOT NULL,
    "Batch_ID" VARCHAR(8) NOT NULL,
    "Production_Record_ID" VARCHAR(8) NOT NULL,
    "QC_Record_ID" VARCHAR(8) NOT NULL UNIQUE,
    "Quantity_Passed" INTEGER NOT NULL CHECK ("Quantity_Passed" >= 0),
    "Quantity_Failed" INTEGER NOT NULL CHECK ("Quantity_Failed" >= 0),
    "Request_Payload_Hash" VARCHAR(64) NOT NULL CHECK ("Request_Payload_Hash" ~ '^[0-9a-f]{64}$'),
    "Response_Status_Code" SMALLINT NOT NULL DEFAULT 200 CHECK ("Response_Status_Code" BETWEEN 100 AND 599),
    "Response_Payload" JSONB NOT NULL,
    "Created_At" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_uc12_positive_sum CHECK ("Quantity_Passed" + "Quantity_Failed" > 0),
    CONSTRAINT fk_uc12_batch_job FOREIGN KEY ("Batch_ID", "Print_Job_ID")
        REFERENCES public."PRODUCTION_BATCH" ("Batch_ID", "Print_Job_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_uc12_record_batch FOREIGN KEY ("Production_Record_ID", "Batch_ID")
        REFERENCES public."PRODUCTION_RECORD" ("Production_Record_ID", "Batch_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_uc12_qc_batch_record FOREIGN KEY ("QC_Record_ID", "Batch_ID", "Production_Record_ID")
        REFERENCES public."QC_RECORD" ("QC_Record_ID", "Batch_ID", "Production_Record_ID") ON DELETE RESTRICT
);
CREATE INDEX idx_uc12_idemp_key ON public."UC12_IDEMPOTENCY_LOG" ("Idempotency_Key");
CREATE INDEX idx_uc12_sales_order ON public."UC12_IDEMPOTENCY_LOG" ("Sales_Order_ID");

-- 4.3 UC13_IDEMPOTENCY_LOG (บันทึกการสั่งผลิตเพิ่มซ้ำ)
CREATE TABLE public."UC13_IDEMPOTENCY_LOG" (
    "Log_ID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Idempotency_Key" VARCHAR(64) NOT NULL UNIQUE CHECK (BTRIM("Idempotency_Key") <> ''),
    "Sales_Order_ID" VARCHAR(8) NOT NULL REFERENCES public."SALES_ORDER" ("Sales_Order_ID") ON DELETE RESTRICT,
    "Print_Job_ID" VARCHAR(8) NOT NULL,
    "Product_ID" VARCHAR(8) NOT NULL,
    "Batch_ID" VARCHAR(8) NOT NULL,
    "Production_Batch_Cycle" INTEGER NOT NULL CHECK ("Production_Batch_Cycle" >= 2),
    "Reorder_Quantity" INTEGER NOT NULL CHECK ("Reorder_Quantity" > 0),
    "Reason" TEXT NOT NULL CHECK (BTRIM("Reason") <> ''),
    "Request_Payload_Hash" VARCHAR(64) NOT NULL CHECK ("Request_Payload_Hash" ~ '^[0-9a-f]{64}$'),
    "Response_Status_Code" SMALLINT NOT NULL DEFAULT 200 CHECK ("Response_Status_Code" BETWEEN 100 AND 599),
    "Response_Payload" JSONB NOT NULL,
    "Created_At" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uc13_batch_job_cycle FOREIGN KEY ("Batch_ID", "Print_Job_ID", "Production_Batch_Cycle")
        REFERENCES public."PRODUCTION_BATCH" ("Batch_ID", "Print_Job_ID", "Batch_Cycle") ON DELETE RESTRICT,
    CONSTRAINT fk_uc13_job_product FOREIGN KEY ("Print_Job_ID", "Product_ID")
        REFERENCES public."PRINT_JOB" ("Print_Job_ID", "Product_ID") ON DELETE RESTRICT,
    CONSTRAINT fk_uc13_product_order FOREIGN KEY ("Product_ID", "Sales_Order_ID")
        REFERENCES public."ORDER_DETAIL" ("Product_ID", "Sales_Order_ID") ON DELETE RESTRICT,
    CONSTRAINT uq_uc13_job_cycle UNIQUE ("Print_Job_ID", "Production_Batch_Cycle")
);
CREATE INDEX idx_uc13_idemp_key ON public."UC13_IDEMPOTENCY_LOG" ("Idempotency_Key");
CREATE INDEX idx_uc13_sales_order ON public."UC13_IDEMPOTENCY_LOG" ("Sales_Order_ID");

-- ============================================================================
-- 5. QUANTITY AUDIT & TRACEABILITY VIEWS
-- ============================================================================

-- 5.1 Batch-level Quantity Totals
CREATE VIEW public.vw_production_batch_totals AS
SELECT 
    pb."Batch_ID",
    pb."Print_Job_ID",
    pb."Batch_Cycle",
    pb."Authorized_Quantity",
    pb."Produced_Quantity",
    pb."Batch_Status",
    COALESCE(SUM(qr."Quantity_Passed"), 0)::BIGINT AS "QC_Passed_Total",
    COALESCE(SUM(qr."Quantity_Failed"), 0)::BIGINT AS "QC_Failed_Total",
    (pb."Produced_Quantity" - COALESCE(SUM(qr."Quantity_Passed" + qr."Quantity_Failed"), 0))::BIGINT AS "Pending_QC"
FROM public."PRODUCTION_BATCH" pb
LEFT JOIN public."QC_RECORD" qr ON qr."Batch_ID" = pb."Batch_ID"
GROUP BY pb."Batch_ID", pb."Print_Job_ID", pb."Batch_Cycle", pb."Authorized_Quantity", pb."Produced_Quantity", pb."Batch_Status";

-- 5.2 Print Job-level Quantity Totals
CREATE VIEW public.vw_print_job_quantity_totals AS
SELECT 
    pj."Print_Job_ID",
    pj."Product_ID",
    od."Sales_Order_ID",
    od."Quantity" AS "Ordered_Quantity",
    COALESCE(SUM(pb."Produced_Quantity"), 0)::BIGINT AS "Produced_Total",
    COALESCE(SUM(qb."Passed_Total"), 0)::BIGINT AS "QC_Passed_Total",
    COALESCE(SUM(qb."Failed_Total"), 0)::BIGINT AS "QC_Failed_Total",
    (COALESCE(SUM(pb."Produced_Quantity"), 0) - COALESCE(SUM(qb."Passed_Total" + qb."Failed_Total"), 0))::BIGINT AS "Pending_QC",
    GREATEST(0, od."Quantity" - COALESCE(SUM(qb."Passed_Total"), 0))::BIGINT AS "To_Produce_More"
FROM public."PRINT_JOB" pj
JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
LEFT JOIN public."PRODUCTION_BATCH" pb ON pb."Print_Job_ID" = pj."Print_Job_ID"
LEFT JOIN (
    SELECT 
        qr."Batch_ID", 
        SUM(qr."Quantity_Passed")::BIGINT AS "Passed_Total",
        SUM(qr."Quantity_Failed")::BIGINT AS "Failed_Total"
    FROM public."QC_RECORD" qr 
    GROUP BY qr."Batch_ID"
) qb ON qb."Batch_ID" = pb."Batch_ID"
GROUP BY pj."Print_Job_ID", pj."Product_ID", od."Sales_Order_ID", od."Quantity";

-- 5.3 Production Record-level QC Totals (Traceability Tier 1)
CREATE VIEW public.vw_production_record_qc_totals AS
SELECT 
    pr."Production_Record_ID",
    pr."Batch_ID",
    pr."Quantity_Produced",
    COALESCE(SUM(qr."Quantity_Passed"), 0)::BIGINT AS "QC_Passed",
    COALESCE(SUM(qr."Quantity_Failed"), 0)::BIGINT AS "QC_Failed",
    (pr."Quantity_Produced" - COALESCE(SUM(qr."Quantity_Passed" + qr."Quantity_Failed"), 0))::BIGINT AS "Pending_QC"
FROM public."PRODUCTION_RECORD" pr
LEFT JOIN public."QC_RECORD" qr ON qr."Production_Record_ID" = pr."Production_Record_ID"
GROUP BY pr."Production_Record_ID", pr."Batch_ID", pr."Quantity_Produced";

-- ============================================================================
-- 6. BUSINESS TRIGGERS: QUOTATION TOTALS & CROSS-ORDER INTEGRITY GUARD
-- ============================================================================

-- 6.1 Guard Quotation Detail Insert/Update: Ensure Product belongs to Quotation's Sales Order
CREATE FUNCTION public.fn_guard_quotation_detail_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_quotation_so VARCHAR(8);
    v_product_so VARCHAR(8);
BEGIN
    SELECT q."Sales_Order_ID" INTO v_quotation_so 
    FROM public."QUOTATION" q 
    WHERE q."Quotation_ID" = NEW."Quotation_ID";
    
    SELECT od."Sales_Order_ID" INTO v_product_so 
    FROM public."ORDER_DETAIL" od 
    WHERE od."Product_ID" = NEW."Product_ID";
    
    IF v_quotation_so IS DISTINCT FROM v_product_so THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Product % belongs to order %, but Quotation % belongs to order %.',
            NEW."Product_ID", v_product_so, NEW."Quotation_ID", v_quotation_so
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_quotation_detail_consistency
BEFORE INSERT OR UPDATE OF "Quotation_ID", "Product_ID" ON public."QUOTATION_DETAIL"
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_quotation_detail_consistency();

-- 6.2 Set Quotation Detail Total Price = Unit_Price * Quantity
CREATE FUNCTION public.fn_set_quotation_detail_total()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_qty INTEGER;
BEGIN
    SELECT od."Quantity" INTO v_qty 
    FROM public."ORDER_DETAIL" od 
    WHERE od."Product_ID" = NEW."Product_ID";
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Referenced product % not found in ORDER_DETAIL.', NEW."Product_ID"
            USING ERRCODE = 'P0001';
    END IF;

    NEW."Total_Price" := NEW."Unit_Price" * v_qty;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_quotation_detail_total
BEFORE INSERT OR UPDATE OF "Unit_Price", "Product_ID" ON public."QUOTATION_DETAIL"
FOR EACH ROW EXECUTE FUNCTION public.fn_set_quotation_detail_total();

-- 6.3 Refresh Quotation Total Amount = SUM(Total_Price)
CREATE FUNCTION public.fn_refresh_quotation_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_qid VARCHAR(8);
BEGIN
    v_qid := CASE WHEN TG_OP = 'DELETE' THEN OLD."Quotation_ID" ELSE NEW."Quotation_ID" END;

    UPDATE public."QUOTATION" q
    SET "Total_Amount" = COALESCE(
        (SELECT SUM(qd."Total_Price") 
         FROM public."QUOTATION_DETAIL" qd 
         WHERE qd."Quotation_ID" = v_qid), 
        0.00
    )
    WHERE q."Quotation_ID" = v_qid;

    IF TG_OP = 'UPDATE' AND OLD."Quotation_ID" IS DISTINCT FROM NEW."Quotation_ID" THEN
        UPDATE public."QUOTATION" q
        SET "Total_Amount" = COALESCE(
            (SELECT SUM(qd."Total_Price") 
             FROM public."QUOTATION_DETAIL" qd 
             WHERE qd."Quotation_ID" = OLD."Quotation_ID"), 
            0.00
        )
        WHERE q."Quotation_ID" = OLD."Quotation_ID";
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_quotation_total
AFTER INSERT OR UPDATE OR DELETE ON public."QUOTATION_DETAIL"
FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_quotation_total();

-- ============================================================================
-- 7. BUSINESS TRIGGERS: PRODUCTION RECORD -> BATCH SYNCHRONIZATION
-- ============================================================================

-- 7.1 Guard Production Record Insert (Enforces Global Lock Hierarchy: PJ -> PB)
CREATE FUNCTION public.fn_guard_production_record_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_batch public."PRODUCTION_BATCH"%ROWTYPE;
    v_pj public."PRINT_JOB"%ROWTYPE;
BEGIN
    -- 1. Identify Print_Job_ID from the target batch
    SELECT pb.* INTO v_batch 
    FROM public."PRODUCTION_BATCH" pb
    WHERE pb."Batch_ID" = NEW."Batch_ID";
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Batch % does not exist.', NEW."Batch_ID"
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Lock parent PRINT_JOB first (Lock Hierarchy Step 1)
    SELECT pj.* INTO v_pj 
    FROM public."PRINT_JOB" pj 
    WHERE pj."Print_Job_ID" = v_batch."Print_Job_ID" 
    FOR UPDATE;

    -- 3. Lock PRODUCTION_BATCH row (Lock Hierarchy Step 2)
    SELECT pb.* INTO v_batch 
    FROM public."PRODUCTION_BATCH" pb
    WHERE pb."Batch_ID" = NEW."Batch_ID" 
    FOR UPDATE;

    -- 4. Validate Batch State
    IF v_batch."Batch_Status" <> 'Open' THEN
        RAISE EXCEPTION 'BUSINESS_GUARD_VIOLATION: Batch % is Closed. Cannot record production.', NEW."Batch_ID"
            USING ERRCODE = 'P0001';
    END IF;

    -- 5. Validate Quantity Bounds
    IF v_batch."Produced_Quantity" + NEW."Quantity_Produced" > v_batch."Authorized_Quantity" THEN
        RAISE EXCEPTION 'QUANTITY_INTEGRITY_VIOLATION: Quantity produced (%) exceeds authorized limit (%).',
            (v_batch."Produced_Quantity" + NEW."Quantity_Produced"), v_batch."Authorized_Quantity"
            USING ERRCODE = 'P0001';
    END IF;

    -- 6. Validate Print Job Status
    IF v_pj."Print_Job_Status" <> 'In_Production' OR v_pj."Prototype_Status" <> 'Completed' THEN
        RAISE EXCEPTION 'BUSINESS_GUARD_VIOLATION: Print Job % is not in In_Production state.', v_pj."Print_Job_ID"
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_production_record_insert
BEFORE INSERT ON public."PRODUCTION_RECORD"
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_production_record_insert();

-- 7.2 Apply Production Record to Batch & Auto-Close when Fulfilled
CREATE FUNCTION public.fn_apply_production_record_to_batch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_pjid VARCHAR(8);
    v_status VARCHAR(10);
BEGIN
    -- Atomic Batch produced quantity update & conditional status transition
    UPDATE public."PRODUCTION_BATCH" pb
    SET "Produced_Quantity" = pb."Produced_Quantity" + NEW."Quantity_Produced",
        "Batch_Status" = CASE 
            WHEN pb."Produced_Quantity" + NEW."Quantity_Produced" = pb."Authorized_Quantity" THEN 'Closed' 
            ELSE 'Open' 
        END,
        "Close_Type" = CASE 
            WHEN pb."Produced_Quantity" + NEW."Quantity_Produced" = pb."Authorized_Quantity" THEN 'Normal' 
            ELSE NULL 
        END,
        "Closed_Reason" = CASE 
            WHEN pb."Produced_Quantity" + NEW."Quantity_Produced" = pb."Authorized_Quantity" THEN 'Authorized quantity fulfilled' 
            ELSE NULL 
        END,
        "Closed_At" = CASE 
            WHEN pb."Produced_Quantity" + NEW."Quantity_Produced" = pb."Authorized_Quantity" THEN CURRENT_TIMESTAMP 
            ELSE NULL 
        END
    WHERE pb."Batch_ID" = NEW."Batch_ID"
    RETURNING pb."Print_Job_ID", pb."Batch_Status" INTO v_pjid, v_status;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Failed to synchronize Batch %.', NEW."Batch_ID"
            USING ERRCODE = 'P0001';
    END IF;

    -- If the batch closed upon fulfillment, atomically transition Print Job to QC_Pending
    IF v_status = 'Closed' THEN
        UPDATE public."PRINT_JOB" 
        SET "Print_Job_Status" = 'QC_Pending'
        WHERE "Print_Job_ID" = v_pjid AND "Print_Job_Status" = 'In_Production';
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'STATE_TRANSITION_FAILED: Could not transition Print Job % to QC_Pending.', v_pjid
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_production_record_to_batch
AFTER INSERT ON public."PRODUCTION_RECORD"
FOR EACH ROW EXECUTE FUNCTION public.fn_apply_production_record_to_batch();

-- ============================================================================
-- 8. BUSINESS TRIGGERS: QC 3-TIER GUARD & AUTO-COMPLETION
-- ============================================================================

-- 8.1 Guard QC Record Insert (3-Tier Mathematical Checks under Global Lock Order)
CREATE FUNCTION public.fn_guard_qc_record_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_pjid VARCHAR(8);
    v_batch public."PRODUCTION_BATCH"%ROWTYPE;
    v_record_qty INTEGER;
    v_record_qc BIGINT;
    v_batch_qc BIGINT;
    v_job_produced BIGINT;
    v_job_qc BIGINT;
BEGIN
    -- 1. Identify Print_Job_ID
    SELECT pb."Print_Job_ID" INTO v_pjid 
    FROM public."PRODUCTION_BATCH" pb 
    WHERE pb."Batch_ID" = NEW."Batch_ID";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Batch % not found.', NEW."Batch_ID"
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Lock parent PRINT_JOB first (Lock Hierarchy Step 1)
    PERFORM 1 FROM public."PRINT_JOB" pj 
    WHERE pj."Print_Job_ID" = v_pjid 
    FOR UPDATE;

    -- 3. Lock PRODUCTION_BATCH (Lock Hierarchy Step 2)
    SELECT pb.* INTO v_batch 
    FROM public."PRODUCTION_BATCH" pb
    WHERE pb."Batch_ID" = NEW."Batch_ID" 
    FOR UPDATE;

    -- 4. Lock and verify PRODUCTION_RECORD (Lock Hierarchy Step 3)
    SELECT pr."Quantity_Produced" INTO v_record_qty
    FROM public."PRODUCTION_RECORD" pr
    WHERE pr."Production_Record_ID" = NEW."Production_Record_ID" 
      AND pr."Batch_ID" = NEW."Batch_ID"
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Production Record % does not belong to Batch %.',
            NEW."Production_Record_ID", NEW."Batch_ID"
            USING ERRCODE = 'P0001';
    END IF;

    -- 5. Tier 1 Guard: Record-level inspection limit
    SELECT COALESCE(SUM(qr."Quantity_Passed" + qr."Quantity_Failed"), 0) INTO v_record_qc
    FROM public."QC_RECORD" qr 
    WHERE qr."Production_Record_ID" = NEW."Production_Record_ID";

    IF v_record_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed" > v_record_qty THEN
        RAISE EXCEPTION 'QC_INTEGRITY_VIOLATION: Total QC inspected (%) exceeds Production Record quantity (%).',
            (v_record_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed"), v_record_qty
            USING ERRCODE = 'P0001';
    END IF;

    -- 6. Tier 2 Guard: Batch-level inspection limit
    SELECT COALESCE(SUM(qr."Quantity_Passed" + qr."Quantity_Failed"), 0) INTO v_batch_qc
    FROM public."QC_RECORD" qr 
    WHERE qr."Batch_ID" = NEW."Batch_ID";

    IF v_batch_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed" > v_batch."Produced_Quantity" THEN
        RAISE EXCEPTION 'QC_INTEGRITY_VIOLATION: Total QC inspected (%) exceeds Batch produced quantity (%).',
            (v_batch_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed"), v_batch."Produced_Quantity"
            USING ERRCODE = 'P0001';
    END IF;

    -- 7. Tier 3 Guard: Job-level cumulative inspection limit (Separated Aggregates to eliminate Cartesian duplicates)
    SELECT COALESCE(SUM(pb."Produced_Quantity"), 0) INTO v_job_produced
    FROM public."PRODUCTION_BATCH" pb
    WHERE pb."Print_Job_ID" = v_pjid;

    SELECT COALESCE(SUM(qr."Quantity_Passed" + qr."Quantity_Failed"), 0) INTO v_job_qc
    FROM public."QC_RECORD" qr
    JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID"
    WHERE pb."Print_Job_ID" = v_pjid;

    IF v_job_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed" > v_job_produced THEN
        RAISE EXCEPTION 'QC_INTEGRITY_VIOLATION: Cumulative QC inspected (%) exceeds cumulative job production (%).',
            (v_job_qc + NEW."Quantity_Passed" + NEW."Quantity_Failed"), v_job_produced
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_qc_record_insert
BEFORE INSERT ON public."QC_RECORD"
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_qc_record_insert();

-- 8.2 Auto-Complete Print Job after QC fulfills order quantity with zero pending
CREATE FUNCTION public.fn_complete_print_job_after_qc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_pjid VARCHAR(8);
    v_ordered INTEGER;
    v_produced BIGINT;
    v_passed BIGINT;
    v_failed BIGINT;
    v_open_batches BIGINT;
BEGIN
    SELECT pb."Print_Job_ID" INTO v_pjid 
    FROM public."PRODUCTION_BATCH" pb 
    WHERE pb."Batch_ID" = NEW."Batch_ID";

    SELECT od."Quantity" INTO v_ordered 
    FROM public."PRINT_JOB" pj
    JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID" 
    WHERE pj."Print_Job_ID" = v_pjid;

    -- Calculate current cumulative quantities across all batches for this Job
    SELECT 
        COALESCE(SUM(pb."Produced_Quantity"), 0),
        COALESCE(SUM(x."Passed"), 0),
        COALESCE(SUM(x."Failed"), 0),
        COUNT(*) FILTER (WHERE pb."Batch_Status" = 'Open')
    INTO v_produced, v_passed, v_failed, v_open_batches
    FROM public."PRODUCTION_BATCH" pb
    LEFT JOIN (
        SELECT 
            qr."Batch_ID", 
            SUM(qr."Quantity_Passed")::BIGINT AS "Passed",
            SUM(qr."Quantity_Failed")::BIGINT AS "Failed"
        FROM public."QC_RECORD" qr 
        GROUP BY qr."Batch_ID"
    ) x ON x."Batch_ID" = pb."Batch_ID"
    WHERE pb."Print_Job_ID" = v_pjid;

    -- Condition to auto-complete: All batches closed, QC passed reaches ordered qty, and zero pending QC
    IF v_open_batches = 0 AND v_passed >= v_ordered AND (v_produced - v_passed - v_failed) = 0 THEN
        UPDATE public."PRINT_JOB" 
        SET "Print_Job_Status" = 'Completed'
        WHERE "Print_Job_ID" = v_pjid AND "Print_Job_Status" = 'QC_Pending';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complete_print_job_after_qc
AFTER INSERT ON public."QC_RECORD"
FOR EACH ROW EXECUTE FUNCTION public.fn_complete_print_job_after_qc();

-- ============================================================================
-- 9. AUXILIARY ADMINISTRATIVE FUNCTIONS: SUPERVISORY FORCE-CLOSE (MVP PRAGMATIC)
-- ============================================================================
-- Architectural Note for MVP:
-- In this MVP architecture, User Authentication and Role-Based Access Control (RBAC)
-- are enforced by the Backend Application layer (e.g. JWT verification, session middleware).
-- The database does not make unverified assumptions about connection session settings.
-- This function acts as an auxiliary administrative routine that enforces relational integrity:
-- verifying that the batch is Open, transitioning status to Closed with type 'Forced',
-- setting supervisor audit info, and triggering automated R1 recalculation.

CREATE OR REPLACE FUNCTION public.fn_force_close_production_batch(
    p_batch_id VARCHAR(8),
    p_closed_by VARCHAR(50),
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_batch public."PRODUCTION_BATCH"%ROWTYPE;
    v_so_id VARCHAR(8);
BEGIN
    -- 1. Input sanitization (Backend is responsible for verifying caller is Supervisor/Admin)
    IF NULLIF(BTRIM(p_closed_by), '') IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Closed_By supervisor identifier is required.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Force-close reason is required.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Lookup batch & parent job
    SELECT * INTO v_batch 
    FROM public."PRODUCTION_BATCH" 
    WHERE "Batch_ID" = p_batch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Batch % does not exist.', p_batch_id
            USING ERRCODE = 'P0001';
    END IF;

    SELECT od."Sales_Order_ID" INTO v_so_id
    FROM public."PRINT_JOB" pj
    JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
    WHERE pj."Print_Job_ID" = v_batch."Print_Job_ID";

    -- 3. Lock Sales Order, Print Job, and Batch in hierarchy
    PERFORM 1 FROM public."SALES_ORDER" WHERE "Sales_Order_ID" = v_so_id FOR UPDATE;
    PERFORM 1 FROM public."PRINT_JOB" WHERE "Print_Job_ID" = v_batch."Print_Job_ID" FOR UPDATE;
    SELECT * INTO v_batch FROM public."PRODUCTION_BATCH" WHERE "Batch_ID" = p_batch_id FOR UPDATE;

    IF v_batch."Batch_Status" <> 'Open' THEN
        RAISE EXCEPTION 'BUSINESS_GUARD_VIOLATION: Batch % is already Closed.', p_batch_id
            USING ERRCODE = 'P0001';
    END IF;

    -- 4. Execute Force-Close using backend-validated supervisor identifier
    UPDATE public."PRODUCTION_BATCH"
    SET "Batch_Status" = 'Closed',
        "Close_Type" = 'Forced',
        "Closed_Reason" = BTRIM(p_reason),
        "Closed_By" = BTRIM(p_closed_by),
        "Closed_At" = CURRENT_TIMESTAMP
    WHERE "Batch_ID" = p_batch_id;

    -- 5. Transition Print Job to QC_Pending if currently In_Production
    UPDATE public."PRINT_JOB"
    SET "Print_Job_Status" = 'QC_Pending'
    WHERE "Print_Job_ID" = v_batch."Print_Job_ID" AND "Print_Job_Status" = 'In_Production';

    -- 6. Recalculate Centralized R1 automatically
    PERFORM public.fn_recalculate_sales_order_status(v_so_id);

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'print_job_id', v_batch."Print_Job_ID",
        'produced_quantity', v_batch."Produced_Quantity",
        'authorized_quantity', v_batch."Authorized_Quantity",
        'close_type', 'Forced',
        'closed_by', BTRIM(p_closed_by),
        'closed_at', CURRENT_TIMESTAMP
    );
END;
$$;
-- ============================================================================
-- 10. APPEND-ONLY PROTECTION: ROW TRIGGERS & STATEMENT TRUNCATE TRIGGERS
-- ============================================================================

-- 10.1 Row-level Trigger Function: Block UPDATE and DELETE on historical records
CREATE FUNCTION public.fn_prevent_append_only_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Table % is strictly append-only. UPDATE and DELETE are prohibited.',
        TG_TABLE_NAME
        USING ERRCODE = 'P0001';
END;
$$;

-- 10.2 Statement-level Trigger Function: Block TRUNCATE on historical records
CREATE FUNCTION public.fn_prevent_append_only_truncate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Table % is strictly append-only. TRUNCATE is prohibited.',
        TG_TABLE_NAME
        USING ERRCODE = 'P0001';
END;
$$;

-- 10.3 Attach Row-level and Statement-level Triggers to Append-Only Tables
DO $$
DECLARE
    t TEXT;
    append_only_tables TEXT[] := ARRAY[
        'PRODUCTION_RECORD',
        'QC_RECORD',
        'UC11_IDEMPOTENCY_LOG',
        'UC12_IDEMPOTENCY_LOG',
        'UC13_IDEMPOTENCY_LOG'
    ];
BEGIN
    FOREACH t IN ARRAY append_only_tables LOOP
        -- Row-level trigger for UPDATE / DELETE
        EXECUTE FORMAT(
            'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_append_only_mutation()',
            'trg_no_update_delete_' || LOWER(t), t
        );
        -- Statement-level trigger for TRUNCATE
        EXECUTE FORMAT(
            'CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.fn_prevent_append_only_truncate()',
            'trg_no_truncate_' || LOWER(t), t
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- 11. DELIVERY TRANSITION & ANTI-JOIN COMPLETENESS GUARD
-- ============================================================================
-- Architectural Note for MVP:
-- The database guard strictly verifies that the delivery has an assigned deliverer (Deliver)
-- and a recorded delivery date that has arrived (Delivery_Date <= CURRENT_DATE).
-- The underlying academic data dictionary (SA p.167-168) and V8 baseline do not define
-- customer signature, photo proof, or recipient acknowledgment fields. Therefore,
-- customer delivery acknowledgment is out of scope for this database schema.

CREATE FUNCTION public.fn_guard_delivery_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_order_detail_count BIGINT;
    v_has_missing_jobs BOOLEAN;
    v_has_unfinished_jobs BOOLEAN;
    v_has_unfulfilled_qc BOOLEAN;
    v_delivery_confirmed TEXT;
BEGIN
    -- Ignore no-op updates
    IF NEW."Delivery_Status" = OLD."Delivery_Status" THEN 
        RETURN NEW; 
    END IF;

    -- Non-Backward Guard
    IF OLD."Delivery_Status" = 'Delivered' THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Backward transition from Delivered is prohibited.'
            USING ERRCODE = 'P0001';
    ELSIF OLD."Delivery_Status" = 'Shipping' AND NEW."Delivery_Status" IN ('Producing', 'Preparing') THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Backward transition from Shipping is prohibited.'
            USING ERRCODE = 'P0001';
    ELSIF OLD."Delivery_Status" = 'Preparing' AND NEW."Delivery_Status" = 'Producing' THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Backward transition from Preparing is prohibited.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Non-Skip Guard
    IF OLD."Delivery_Status" = 'Producing' AND NEW."Delivery_Status" NOT IN ('Preparing') THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Cannot skip Preparing stage from Producing.'
            USING ERRCODE = 'P0001';
    ELSIF OLD."Delivery_Status" = 'Preparing' AND NEW."Delivery_Status" NOT IN ('Shipping') THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Cannot skip Shipping stage from Preparing.'
            USING ERRCODE = 'P0001';
    ELSIF OLD."Delivery_Status" = 'Shipping' AND NEW."Delivery_Status" NOT IN ('Delivered') THEN
        RAISE EXCEPTION 'STATE_TRANSITION_VIOLATION: Invalid transition from Shipping.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Transition 1: Producing -> Preparing
    IF OLD."Delivery_Status" = 'Producing' AND NEW."Delivery_Status" = 'Preparing' THEN
        -- 1. Non-Empty Guard: Order must have at least one product
        SELECT COUNT(*) INTO v_order_detail_count 
        FROM public."ORDER_DETAIL" od 
        WHERE od."Sales_Order_ID" = NEW."Sales_Order_ID";

        IF v_order_detail_count = 0 THEN
            RAISE EXCEPTION 'EMPTY_ORDER_DETAILS: Order has no products to deliver.'
                USING ERRCODE = 'P0001';
        END IF;

        -- 2. All-Items Jobbed Guard (Anti-Join): Every ORDER_DETAIL must have a PRINT_JOB
        SELECT EXISTS (
            SELECT 1 
            FROM public."ORDER_DETAIL" od
            WHERE od."Sales_Order_ID" = NEW."Sales_Order_ID"
              AND NOT EXISTS (
                  SELECT 1 
                  FROM public."PRINT_JOB" pj 
                  WHERE pj."Product_ID" = od."Product_ID"
              )
        ) INTO v_has_missing_jobs;

        IF v_has_missing_jobs THEN
            RAISE EXCEPTION 'UNFULFILLED_ORDER_DETAILS_EXIST: Some order products do not have print jobs.'
                USING ERRCODE = 'P0001';
        END IF;

        -- 3. All-Jobs Completed & All-Batches Closed Guard
        SELECT EXISTS (
            SELECT 1 
            FROM public."PRINT_JOB" pj 
            JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
            WHERE od."Sales_Order_ID" = NEW."Sales_Order_ID"
              AND (
                  pj."Print_Job_Status" IS DISTINCT FROM 'Completed'
                  OR NOT EXISTS (
                      SELECT 1 
                      FROM public."PRODUCTION_BATCH" pb 
                      WHERE pb."Print_Job_ID" = pj."Print_Job_ID"
                  )
                  OR EXISTS (
                      SELECT 1 
                      FROM public."PRODUCTION_BATCH" pb 
                      WHERE pb."Print_Job_ID" = pj."Print_Job_ID" 
                        AND pb."Batch_Status" = 'Open'
                  )
              )
        ) INTO v_has_unfinished_jobs;

        IF v_has_unfinished_jobs THEN
            RAISE EXCEPTION 'UNFINISHED_JOBS_OR_BATCHES_EXIST: All jobs must be Completed and all batches Closed.'
                USING ERRCODE = 'P0001';
        END IF;

        -- 4. Quantity Fulfilled Guard: QC passed must meet ordered quantity with zero pending QC
        SELECT EXISTS (
            SELECT 1 
            FROM public."PRINT_JOB" pj 
            JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
            WHERE od."Sales_Order_ID" = NEW."Sales_Order_ID"
              AND (
                  COALESCE((SELECT SUM(pb."Produced_Quantity") FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0)
                  - COALESCE((SELECT SUM(qr."Quantity_Passed" + qr."Quantity_Failed") 
                              FROM public."QC_RECORD" qr 
                              JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" 
                              WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0) <> 0
                  OR COALESCE((SELECT SUM(qr."Quantity_Passed") 
                               FROM public."QC_RECORD" qr 
                               JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" 
                               WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0) < od."Quantity"
              )
        ) INTO v_has_unfulfilled_qc;

        IF v_has_unfulfilled_qc THEN
            RAISE EXCEPTION 'QC_QUANTITY_NOT_FULFILLED: Insufficient QC passed items for delivery.'
                USING ERRCODE = 'P0001';
        END IF;

    -- Transition 2: Preparing -> Shipping
    ELSIF OLD."Delivery_Status" = 'Preparing' AND NEW."Delivery_Status" = 'Shipping' THEN
        IF NEW."Delivery_Date" IS NULL OR NULLIF(BTRIM(NEW."Deliver"), '') IS NULL THEN
            RAISE EXCEPTION 'DELIVERY_DETAILS_REQUIRED: Deliverer and Delivery_Date are required for Shipping.'
                USING ERRCODE = 'P0001';
        END IF;

    -- Transition 3: Shipping -> Delivered (Verification of actual delivery completion)
    ELSIF OLD."Delivery_Status" = 'Shipping' AND NEW."Delivery_Status" = 'Delivered' THEN
        IF NEW."Delivery_Date" IS NULL OR NEW."Delivery_Date" > CURRENT_DATE THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Delivery_Date must be valid and cannot be in the future.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NULLIF(BTRIM(NEW."Deliver"), '') IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Deliverer name must be preserved upon delivery completion.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_delivery_transition
BEFORE UPDATE OF "Delivery_Status" ON public."DELIVERY"
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_delivery_transition();

-- ============================================================================
-- 12. CENTRALIZED R1 RE-CALCULATION FUNCTION (MULTI-ITEM AWARE)
-- ============================================================================
-- Architectural Guidance for MVP:
-- In this MVP architecture, the centralized R1 state calculation is encapsulated in
-- the stored function `fn_recalculate_sales_order_status(p_sales_order_id)`.
--
-- Rather than installing complex, cascading database triggers on PRINT_JOB, QUOTATION,
-- and DELIVERY (which complicate debugging, testing, and migration rollback),
-- the Backend Application invokes this function explicitly inside its transaction:
--   SELECT public.fn_recalculate_sales_order_status($1);
--
-- This must be called after any mutation affecting sales order progress, including:
--   - Quotation approval/rejection (UC2, UC4)
--   - Prototype approval and transition to production (UC10)
--   - Production batch fulfillment or Force-Close (UC11, Section 9)
--   - QC inspection completion (UC12)
--   - Reorder batch authorization (UC13)
--   - Delivery status advancement (UC14)

CREATE OR REPLACE FUNCTION public.fn_recalculate_sales_order_status(p_sales_order_id VARCHAR(8))
RETURNS public.sales_order_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_status public.sales_order_status;
    v_delivery public.delivery_status;
    v_quote public.quotation_status;
    v_items_count BIGINT;
    v_has_job BOOLEAN;
    v_bad_completed BOOLEAN;
    v_all_completed BOOLEAN;
BEGIN
    -- 1. Lock Sales Order row (Parent Lock)
    PERFORM 1 FROM public."SALES_ORDER" so 
    WHERE so."Sales_Order_ID" = p_sales_order_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Sales Order % does not exist.', p_sales_order_id
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Non-Empty Order Guard: Orders with 0 products are illegal
    SELECT COUNT(*) INTO v_items_count 
    FROM public."ORDER_DETAIL" od 
    WHERE od."Sales_Order_ID" = p_sales_order_id;

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'EMPTY_ORDER_DETAILS: Order % has no products.', p_sales_order_id
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. Cross-Table State Invariant Checks
    IF EXISTS (
        SELECT 1 
        FROM public."PRINT_JOB" pj 
        JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
        WHERE od."Sales_Order_ID" = p_sales_order_id 
          AND pj."Print_Job_Status" = 'In_Design'
          AND EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID")
    ) THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: In_Design print job must not have production batches.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM public."PRINT_JOB" pj 
        JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
        WHERE od."Sales_Order_ID" = p_sales_order_id 
          AND pj."Print_Job_Status" = 'In_Production'
          AND NOT EXISTS (
              SELECT 1 FROM public."PRODUCTION_BATCH" pb 
              WHERE pb."Print_Job_ID" = pj."Print_Job_ID" AND pb."Batch_Status" = 'Open'
          )
    ) THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: In_Production print job must have an active Open batch.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM public."PRINT_JOB" pj 
        JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
        WHERE od."Sales_Order_ID" = p_sales_order_id 
          AND pj."Print_Job_Status" = 'QC_Pending'
          AND (
              NOT EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID")
              OR EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID" AND pb."Batch_Status" = 'Open')
          )
    ) THEN
        RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: QC_Pending print job cannot have Open batches.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 4. Centralized Cascade Evaluation
    -- Priority 1-3: Delivery Lifecycle
    SELECT d."Delivery_Status" INTO v_delivery 
    FROM public."DELIVERY" d 
    WHERE d."Sales_Order_ID" = p_sales_order_id;

    IF v_delivery = 'Delivered' THEN
        v_status := 'Delivery_Delivered';
    ELSIF v_delivery = 'Shipping' THEN
        v_status := 'Delivery_Shipping';
    ELSIF v_delivery = 'Preparing' THEN
        v_status := 'Delivery_Preparing';

    -- Priority 4: Production in progress
    ELSIF EXISTS (
        SELECT 1 
        FROM public."PRINT_JOB" pj 
        JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
        WHERE od."Sales_Order_ID" = p_sales_order_id 
          AND pj."Print_Job_Status" = 'In_Production'
    ) THEN
        v_status := 'Print_Job_In_Production';

    -- Priority 5: QC pending
    ELSIF EXISTS (
        SELECT 1 
        FROM public."PRINT_JOB" pj 
        JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
        WHERE od."Sales_Order_ID" = p_sales_order_id 
          AND pj."Print_Job_Status" = 'QC_Pending'
    ) THEN
        v_status := 'Print_Job_QC_Pending';

    -- Priority 6: All jobs completed evaluation
    ELSE
        SELECT EXISTS (
            SELECT 1 
            FROM public."PRINT_JOB" pj 
            JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
            WHERE od."Sales_Order_ID" = p_sales_order_id 
              AND pj."Print_Job_Status" = 'Completed'
              AND (
                  NOT EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID")
                  OR EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID" AND pb."Batch_Status" = 'Open')
                  OR COALESCE((SELECT SUM(qr."Quantity_Passed") FROM public."QC_RECORD" qr JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0) < od."Quantity"
                  OR COALESCE((SELECT SUM(pb."Produced_Quantity") FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0)
                     <> COALESCE((SELECT SUM(qr."Quantity_Passed" + qr."Quantity_Failed") FROM public."QC_RECORD" qr JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0)
              )
        ) INTO v_bad_completed;

        IF v_bad_completed THEN
            RAISE EXCEPTION 'COMPLETED_JOB_INTEGRITY_ERROR: A print job is marked Completed without fulfilling batches or QC.'
                USING ERRCODE = 'P0001';
        END IF;

        -- Verify if every single order detail is fulfilled
        SELECT
            NOT EXISTS (
                SELECT 1 FROM public."ORDER_DETAIL" od 
                WHERE od."Sales_Order_ID" = p_sales_order_id
                  AND NOT EXISTS (SELECT 1 FROM public."PRINT_JOB" pj WHERE pj."Product_ID" = od."Product_ID")
            )
            AND NOT EXISTS (
                SELECT 1 FROM public."PRINT_JOB" pj 
                JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                WHERE od."Sales_Order_ID" = p_sales_order_id 
                  AND pj."Print_Job_Status" IS DISTINCT FROM 'Completed'
            )
            AND NOT EXISTS (
                SELECT 1 FROM public."PRINT_JOB" pj 
                JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                WHERE od."Sales_Order_ID" = p_sales_order_id
                  AND (
                      NOT EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID")
                      OR EXISTS (SELECT 1 FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID" AND pb."Batch_Status" = 'Open')
                  )
            )
            AND NOT EXISTS (
                SELECT 1 FROM public."PRINT_JOB" pj 
                JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                WHERE od."Sales_Order_ID" = p_sales_order_id
                  AND (
                      COALESCE((SELECT SUM(qr."Quantity_Passed") FROM public."QC_RECORD" qr JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0) < od."Quantity"
                      OR COALESCE((SELECT SUM(pb."Produced_Quantity") FROM public."PRODUCTION_BATCH" pb WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0)
                         <> COALESCE((SELECT SUM(qr."Quantity_Passed" + qr."Quantity_Failed") FROM public."QC_RECORD" qr JOIN public."PRODUCTION_BATCH" pb ON pb."Batch_ID" = qr."Batch_ID" WHERE pb."Print_Job_ID" = pj."Print_Job_ID"), 0)
                  )
            )
        INTO v_all_completed;

        IF v_all_completed THEN
            v_status := 'Print_Job_Completed';
        ELSE
            -- Priority 7: Prototype Cascade (Applies when AT LEAST ONE PRINT_JOB exists)
            SELECT EXISTS (
                SELECT 1 
                FROM public."PRINT_JOB" pj 
                JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                WHERE od."Sales_Order_ID" = p_sales_order_id
            ) INTO v_has_job;

            IF v_has_job THEN
                IF EXISTS (
                    SELECT 1 
                    FROM public."PRINT_JOB" pj 
                    JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                    WHERE od."Sales_Order_ID" = p_sales_order_id 
                      AND pj."Prototype_Status" = 'Under_Revision'
                ) THEN
                    v_status := 'Prototype_Under_Revision';
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public."PRINT_JOB" pj 
                    JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                    WHERE od."Sales_Order_ID" = p_sales_order_id 
                      AND pj."Prototype_Status" = 'Pending'
                ) THEN
                    v_status := 'Prototype_Pending';
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public."PRINT_JOB" pj 
                    JOIN public."ORDER_DETAIL" od ON od."Product_ID" = pj."Product_ID"
                    WHERE od."Sales_Order_ID" = p_sales_order_id 
                      AND pj."Prototype_Status" = 'In_Progress'
                ) THEN
                    v_status := 'Prototype_In_Progress';
                ELSE
                    v_status := 'Prototype_Not_Started';
                END IF;

            -- Priority 8: Quotation Cascade (Applies when ZERO PRINT_JOB exists)
            ELSE
                SELECT q."Status" INTO v_quote 
                FROM public."QUOTATION" q 
                WHERE q."Sales_Order_ID" = p_sales_order_id;

                IF NOT FOUND THEN
                    v_status := 'Quotation_Not_Started';
                ELSIF v_quote = 'Rejected' THEN
                    v_status := 'Quotation_Rejected';
                ELSIF v_quote = 'Under_Revision' THEN
                    v_status := 'Quotation_Under_Revision';
                ELSIF v_quote = 'Pending' THEN
                    v_status := 'Quotation_Pending';
                ELSE
                    v_status := 'Quotation_Completed';
                END IF;
            END IF;
        END IF;
    END IF;

    -- 5. Update SALES_ORDER status if changed
    UPDATE public."SALES_ORDER" so 
    SET "Order_Status" = v_status
    WHERE so."Sales_Order_ID" = p_sales_order_id 
      AND so."Order_Status" IS DISTINCT FROM v_status;

    RETURN v_status;
END;
$$;

-- ============================================================================
-- 13. IDEMPOTENCY STRATEGY FOR MVP (DEFERRED FROM ACTIVE DATABASE FUNCTIONS)
-- ============================================================================
-- Architectural Note for MVP:
-- In this MVP candidate, complex database-level cryptographic payload hashing (RFC 8785)
-- and PL/pgSQL subtransaction exception templates (fn_reference_idempotency_handler)
-- have been removed from active database functions.
--
-- For MVP rapid development, idempotency is handled cleanly at the Backend Application layer:
--   1. The Backend API intercepts requests with an Idempotency-Key HTTP header.
--   2. In a database transaction, it performs a fast lookup on UCxx_IDEMPOTENCY_LOG.
--   3. If found, it returns the cached Response_Payload (HTTP 200 replay).
--   4. If not found, it executes the operation, records the key and response, and commits.
--
-- Advanced cryptographic verification and in-database subtransaction recovery
-- are formally deferred to the Post-MVP enterprise hardening phase.

-- ============================================================================
-- 14. DATABASE ROLES & PERMISSION POLICY DDL (PRAGMATIC MVP MODEL)
-- ============================================================================
-- In an MVP / Prototype architecture:
--   1. Database Migration: Executed by the database administrator/owner (e.g. 'postgres').
--   2. Backend Application: Connects using 'printshop_app' role via backend environment variables.
--   3. Frontend / Browser: Has NO direct database credentials and connects ONLY to Backend APIs.
--
-- This setup enables backend developers to execute standard CRUD operations and transactions
-- directly from ORMs or query builders, while critical business invariants remain guarded
-- by database Constraints, Sequences, Composite Keys, and Automated Triggers.

-- 14.1 Schema Usage
GRANT USAGE ON SCHEMA public TO printshop_app;

-- 14.2 Grants on Operational and Log Tables (Read & Write for Backend Application)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO printshop_app;

-- 14.3 Grants on Sequences (Required for ID Generation)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO printshop_app;

-- 14.4 Grants on Stored Functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO printshop_app;

-- 14.5 Future Object Privileges (Default Privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO printshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO printshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO printshop_app;

COMMIT;

-- ============================================================================
-- END OF STEP 2: MVP FINAL CANDIDATE DDL SPECIFICATION
-- ============================================================================

