import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  Copy,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Info,
  X,
  Upload,
  AlertCircle,
  Check,
  Loader2,
  Eye,
} from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { useColumnResize, ResizeHandle } from "./useColumnResize";
import DocumentDetailPanel from "./DocumentDetailPanel";
import CreateDocumentModal from "./CreateDocumentModal";
import { PageActionButton, PageHeader } from "./PageHeader";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import { supabase, type Company, type DbDocument } from "../lib/supabase";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import {
  ColumnSettingsButton,
  ImportDataButton,
  ImportOneButton,
} from "./ScopedActionButtons";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import OcrBreadcrumb from "./OcrBreadcrumb";
import RefreshAllButton from "./RefreshAllButton";
import OcrSearchField from "./OcrSearchField";
import { getCurrentUserName } from "../lib/currentUser";
import { importMenuRecords } from "../lib/menuImport";
import { loadCompanyGeneralLedgerAccountOptions } from "./GeneralLedgerView";
import GeneralLedgerAccountSelect from "./GeneralLedgerAccountSelect";
import SearchableSelect from "./SearchableSelect";
import SendInvoicePanel from "./invoices/SendInvoicePanel";
import { InvoicePaymentPreviewPanel } from "./invoices/CreateInvoicePanel";
import type { InvoiceChatContext } from "./invoices/invoiceChat";
import {
  ensureOrganizationProductGroup,
  ensureOrganizationProductGroups,
} from "../lib/organizationProductGroups";

export type DocumentLineItem = {
  id: string;
  barcode: string;
  systemId: string;
  product: string;
  description?: string;
  productGroup?: string;
  unit: string;
  qty: string;
  code: string;
  price: string;
  subtotal: string;
  discount: string;
  vat: string;
  vatPct: string;
  total: string;
  department: string;
  object: string;
  series: string;
  center: string;
  expense: string;
  vatClass: string;
};

export type Document = {
  id: string;
  companyId: string;
  receiveDate: string;
  clientCounterparty: string;
  counterpartyId: string;
  counterpartyCode: string;
  documentType: string;
  documentSubtype: string;
  source: string;
  totalAmount: string;
  dueEndDate: string;
  fileCase: string;
  orderNo: string;
  number: string;
  type: string;
  documentDate: string;
  documentPurpose: string;
  invoiceContractDate: string;
  operationDate: string;
  expenseAccount: string;
  vatClassifier: string;
  productGroup: string;
  currency: string;
  amountWithoutVat: string;
  vat: string;
  vatPercent: string;
  departmentCode: string;
  objectProject: string;
  validForm: string;
  accountableResponsible: string;
  costCenter: string;
  series: string;
  note: string;
  accountingNoteStatus: string;
  debit: string;
  credit: string;
  status:
    | "Pending"
    | "Paid"
    | "Overdue"
    | "Draft"
    | "Manual"
    | "Processing"
    | "Rejected"
    | "Provide Additional"
    | "Exception"
    | "Transferred"
    | "Duplicate"
    | "Not Documented"
    | "New"
    | "Approved"
    | "Correcting";
  imageUrl: string | null;
  hasProductDetails: boolean;
  lineItems: DocumentLineItem[];
  summaryLineItems: DocumentLineItem[];
};

const STATUSES: Document["status"][] = [
  "Draft",
  "Pending",
  "Paid",
  "Overdue",
  "Processing",
  "Rejected",
  "Provide Additional",
  "Exception",
  "Transferred",
  "Duplicate",
  "Not Documented",
  "New",
  "Approved",
  "Correcting",
];

function commonLineValue(
  lineItems: DocumentLineItem[],
  key: keyof DocumentLineItem,
  fallback: string,
) {
  if (lineItems.length === 0) return fallback;
  const values = lineItems.map((item) => String(item[key] ?? "").trim());
  const first = values[0];
  return first && values.every((value) => value === first) ? first : "";
}

function documentCellValue(document: Document, key: keyof Document) {
  const lineKey = LINE_ITEM_COL_MAP[key];
  if (lineKey && document.lineItems.length > 1) {
    return commonLineValue(document.lineItems, lineKey, "");
  }
  return document[key];
}

function documentFormData(
  document: Document,
  preserveOperationNumber = false,
) {
  const storedPurpose = document.documentPurpose.trim().toLocaleLowerCase();
  const documentDirection = `${document.type} ${document.documentType}`;
  const formPurpose =
    storedPurpose === "purchase"
      ? "Purchase"
      : storedPurpose === "sale"
        ? "Sale"
        : /purchase|expense/i.test(documentDirection)
          ? "Purchase"
          : /sale|income/i.test(documentDirection)
            ? "Sale"
            : document.documentPurpose;
  return {
    status: document.status,
    receiveDate: document.receiveDate,
    clientCounterparty: document.clientCounterparty,
    documentType: document.documentType,
    documentSubtype: document.documentSubtype,
    source: document.source,
    totalAmount: document.totalAmount,
    dueEndDate: document.dueEndDate,
    fileCase: document.fileCase,
    orderNo: document.orderNo,
    number: document.number,
    type: document.type,
    documentDate: document.documentDate,
    documentPurpose: formPurpose,
    invoiceContractDate: document.invoiceContractDate,
    operationDate: document.operationDate,
    expenseAccount: document.expenseAccount,
    vatClassifier: document.vatClassifier,
    currency: document.currency,
    amountWithoutVat: document.amountWithoutVat,
    vat: document.vat,
    vatPercent: document.vatPercent,
    departmentCode: document.departmentCode,
    objectProject: document.objectProject,
    validForm: document.validForm,
    accountableResponsible: document.accountableResponsible,
    costCenter: document.costCenter,
    series: document.series,
    note: document.note,
    operationNumber: preserveOperationNumber ? document.orderNo : "",
    accountingNoteStatus: document.accountingNoteStatus,
    debit: document.debit,
    credit: document.credit,
  };
}

function editableDocumentNumber(value: string) {
  return value
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
}

function documentAmount(value: string) {
  return Number.parseFloat(editableDocumentNumber(value)) || 0;
}

function documentFinancialLines(document: Document) {
  const sourceLines =
    document.lineItems.length > 0
      ? document.lineItems
      : document.summaryLineItems;
  if (sourceLines.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        name: document.documentPurpose || document.documentType,
        description: document.note,
        productGroup: document.productGroup,
        quantity: "1",
        price: editableDocumentNumber(
          document.amountWithoutVat || document.totalAmount,
        ),
        vatRate: editableDocumentNumber(document.vatPercent) || "0",
      },
    ];
  }
  return sourceLines.map((line) => ({
    id: crypto.randomUUID(),
    name:
      line.product ||
      line.description ||
      document.documentPurpose ||
      document.documentType,
    description: line.description ?? "",
    productGroup: line.productGroup ?? "",
    quantity: editableDocumentNumber(line.qty) || "1",
    price: editableDocumentNumber(line.price),
    vatRate: editableDocumentNumber(line.vatPct) || "0",
  }));
}

export function mapRow(r: DbDocument): Document {
  const text = (value: unknown) =>
    value === null || value === undefined ? "" : String(value);
  const savedLineItems = Array.isArray(r.line_items) ? r.line_items : null;
  const lineItems = ((savedLineItems as DocumentLineItem[] | null) ?? []).map(
    (item) => ({
      ...item,
      productGroup:
        item.productGroup === text(r.document_type)
          ? ""
          : item.productGroup || "",
    }),
  );
  const savedSummaryLineItems = Array.isArray(r.summary_line_items)
    ? r.summary_line_items
    : null;
  const summaryLineItems = (
    (savedSummaryLineItems as DocumentLineItem[] | null) ?? []
  ).map((item) => ({
    ...item,
    productGroup:
      item.productGroup === text(r.document_type)
        ? ""
        : item.productGroup || "",
  }));
  return {
    id: text(r.id),
    companyId: text(r.company_id),
    receiveDate: text(r.receive_date),
    clientCounterparty: text(r.client_counterparty),
    counterpartyId: text(r.counterparty_id),
    counterpartyCode: "",
    documentType: text(r.document_type),
    documentSubtype: text(r.document_subtype),
    source: text(r.source),
    totalAmount: text(r.total_amount),
    dueEndDate: text(r.due_end_date),
    fileCase: text(r.file_case),
    orderNo: text(r.order_no),
    number: text(r.number),
    type: text(r.type),
    documentDate: text(r.document_date),
    documentPurpose: text(r.document_purpose),
    invoiceContractDate: text(r.invoice_contract_date),
    operationDate: text(r.operation_date),
    expenseAccount: commonLineValue(
      lineItems,
      "expense",
      text(r.expense_account),
    ),
    vatClassifier: commonLineValue(
      lineItems,
      "vatClass",
      text(r.vat_classifier),
    ),
    productGroup: commonLineValue(
      lineItems.length > 0 ? lineItems : summaryLineItems,
      "productGroup",
      "",
    ),
    currency: text(r.currency),
    amountWithoutVat: text(r.amount_without_vat),
    vat: text(r.vat),
    vatPercent: commonLineValue(lineItems, "vatPct", text(r.vat_percent)),
    departmentCode: commonLineValue(
      lineItems,
      "department",
      text(r.department_code),
    ),
    objectProject: commonLineValue(
      lineItems,
      "object",
      text(r.object_project),
    ),
    validForm: text(r.valid_form),
    accountableResponsible: text(r.accountable_responsible),
    costCenter: commonLineValue(lineItems, "center", text(r.cost_center)),
    series: text(r.series),
    note: text(r.notes),
    accountingNoteStatus: text(r.accounting_note_status),
    debit: text(r.debit),
    credit: text(r.credit),
    status: (text(r.status) || "Draft") as Document["status"],
    imageUrl: r.image_url,
    hasProductDetails:
      lineItems.length > 1 || summaryLineItems.length > 1,
    lineItems,
    summaryLineItems,
  };
}

const STATUS_COLORS: Record<Document["status"], string> = {
  Manual: "#007EA7",
  Pending: "#EEB648",
  Paid: "#22C55E",
  Overdue: "#EF4444",
  Draft: "#A1B6C6",
  Processing: "#6366F1",
  Rejected: "#DC2626",
  "Provide Additional": "#F59E0B",
  Exception: "#EA580C",
  Transferred: "#0284C7",
  Duplicate: "#7C3AED",
  "Not Documented": "#9CA3AF",
  New: "#007EA7",
  Approved: "#22C55E",
  Correcting: "#EEB648",
};

export const DOCUMENT_BASE_COLUMNS: ColConfig[] = [
  { key: "status", label: "Status", width: 110, visible: true },
  { key: "receiveDate", label: "Receive date", width: 110, visible: true },
  {
    key: "clientCounterparty",
    label: "Client/Counterparty",
    width: 170,
    visible: true,
  },
  {
    key: "counterpartyCode",
    label: "Counterparty code",
    width: 135,
    visible: true,
  },
  { key: "documentType", label: "Document type", width: 140, visible: true },
  { key: "source", label: "Source", width: 90, visible: true },
  { key: "totalAmount", label: "Total amount", width: 120, visible: true },
  { key: "dueEndDate", label: "Due/End date", width: 110, visible: true },
  { key: "fileCase", label: "File/Case", width: 150, visible: true },
  { key: "orderNo", label: "Order No.", width: 100, visible: true },
  { key: "number", label: "Number", width: 100, visible: true },
  { key: "type", label: "Type", width: 90, visible: true },
  { key: "documentDate", label: "Document date", width: 120, visible: true },
  {
    key: "documentPurpose",
    label: "Document purpose",
    width: 150,
    visible: true,
  },
  {
    key: "invoiceContractDate",
    label: "Invoice/Contract date",
    width: 155,
    visible: true,
  },
  { key: "operationDate", label: "Operation date", width: 120, visible: true },
  { key: "expenseAccount", label: "GL account", width: 115, visible: true },
  { key: "vatClassifier", label: "VAT classifier", width: 120, visible: true },
  { key: "productGroup", label: "Product Group", width: 125, visible: true },
  { key: "currency", label: "Currency", width: 90, visible: true },
  {
    key: "amountWithoutVat",
    label: "Amount without VAT",
    width: 155,
    visible: true,
  },
  { key: "vat", label: "VAT", width: 90, visible: true },
  { key: "vatPercent", label: "VAT%", width: 75, visible: true },
  {
    key: "departmentCode",
    label: "Department code",
    width: 140,
    visible: true,
  },
  { key: "objectProject", label: "Object/Project", width: 130, visible: true },
  {
    key: "accountableResponsible",
    label: "Accountable/Responsible person",
    width: 210,
    visible: true,
  },
  { key: "costCenter", label: "Cost center", width: 110, visible: true },
  { key: "series", label: "Series", width: 90, visible: true },
];

type DetailLineMode = "quantity" | "summary";

function detailLineValue(
  document: Document,
  column: string,
  lineItem?: DocumentLineItem,
) {
  const amount = document.amountWithoutVat || document.totalAmount || "—";
  const values: Record<string, string> = {
    Barcode: lineItem?.barcode || "—",
    "System ID": lineItem?.systemId || "—",
    "Document Number": document.number || lineItem?.code || "—",
    Product:
      lineItem?.product ||
      document.documentPurpose ||
      document.documentType ||
      "—",
    "Unit of measure": lineItem?.unit || "—",
    Quantity: lineItem?.qty || "—",
    Price: lineItem?.price || amount,
    Amount: lineItem?.subtotal || amount,
    Discount: lineItem?.discount || "0.00",
    VAT: lineItem?.vat || document.vat || "0.00",
    "VAT %": lineItem?.vatPct || document.vatPercent || "0%",
    "Total amount": document.totalAmount || amount,
    "Total Amount": lineItem?.total || document.totalAmount || amount,
    Department: lineItem?.department || document.departmentCode || "—",
    Object: lineItem?.object || document.objectProject || "—",
    Series: lineItem?.series || document.series || "—",
    Center: lineItem?.center || document.costCenter || "—",
    "Product group": lineItem?.productGroup || "—",
    "GL account": lineItem?.expense || document.expenseAccount || "—",
    "VAT classifier": lineItem?.vatClass || document.vatClassifier || "—",
    "VAT Classifier": lineItem?.vatClass || document.vatClassifier || "—",
  };
  return values[column] ?? "—";
}

function numberWithoutSeries(documentNumber: string, series: string) {
  const value = documentNumber.trim();
  const normalizedSeries = series.trim();
  if (
    normalizedSeries &&
    value.toLocaleLowerCase().startsWith(normalizedSeries.toLocaleLowerCase())
  ) {
    return value.slice(normalizedSeries.length).replace(/^[-_\s]+/, "") || "—";
  }
  return value.replace(/^[A-Za-z]+[-_\s]*/, "") || "—";
}

const QUANTITY_DETAIL_PARENT_MAP: Partial<Record<keyof Document, string>> = {
  status: "Barcode",
  receiveDate: "System ID",
  documentType: "Product",
  source: "Unit of measure",
  dueEndDate: "Quantity",
  fileCase: "Price",
  orderNo: "Discount",
  number: "Document Number",
  totalAmount: "Total Amount",
  amountWithoutVat: "Amount",
  vat: "VAT",
  vatPercent: "VAT %",
  productGroup: "Product group",
  departmentCode: "Department",
  objectProject: "Object",
  series: "Series",
  costCenter: "Center",
  expenseAccount: "GL account",
  vatClassifier: "VAT Classifier",
};

const SUMMARY_DETAIL_PARENT_MAP: Partial<Record<keyof Document, string>> = {
  documentType: "Unit of measure",
  dueEndDate: "Quantity",
  fileCase: "Price",
  totalAmount: "Total amount",
  amountWithoutVat: "Amount",
  vat: "VAT",
  vatPercent: "VAT %",
  productGroup: "Product group",
  departmentCode: "Department",
  objectProject: "Object",
  series: "Series",
  costCenter: "Center",
  expenseAccount: "GL account",
  vatClassifier: "VAT classifier",
};

export function ExpandedDocumentLines({
  document,
  parentColumns,
  generalLedgerName,
  onOpenGeneralLedger,
  onSharedSave,
  onProductGroupSave,
  onLineLookupSave,
}: {
  document: Document;
  parentColumns: ColConfig[];
  generalLedgerName?: string;
  onOpenGeneralLedger?: () => void;
  onStartChat?: (context: InvoiceChatContext) => void;
  onSharedSave: (
    docId: string,
    colKey: string,
    newVal: string,
  ) => Promise<void>;
  onProductGroupSave: (
    docId: string,
    lineItemId: string,
    newVal: string,
  ) => Promise<void>;
  onLineLookupSave: (
    docId: string,
    lineItemId: string,
    key: keyof DocumentLineItem,
    newVal: string,
  ) => Promise<void>;
}) {
  const quantityRows = document.lineItems.filter((line) =>
    [
      line.barcode,
      line.product,
      line.unit,
      line.qty,
      line.code,
      line.price,
      line.subtotal,
    ].some((value) => String(value ?? "").trim().length > 0),
  );
  const hasQuantityLines = quantityRows.length > 0;
  const hasSummaryLine = document.summaryLineItems.length > 0;
  const effectiveMode: DetailLineMode =
    document.summaryLineItems.length > 1 ? "summary" : "quantity";
  const rows: Array<DocumentLineItem | undefined> =
    effectiveMode === "quantity" ? quantityRows : document.summaryLineItems;
  const parentMap =
    effectiveMode === "quantity"
      ? QUANTITY_DETAIL_PARENT_MAP
      : SUMMARY_DETAIL_PARENT_MAP;
  const alignedColumns = parentColumns.map((parentColumn) => ({
    parentColumn,
    detailColumn: parentMap[parentColumn.key as keyof Document],
  }));
  return (
    <section
      aria-label={`Document line details ${document.fileCase}`}
      className="mb-2 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white shadow-[0_2px_8px_rgba(16,35,58,0.06)]"
    >
      <div className="flex min-h-[44px] items-center justify-start gap-3 border-b border-[#E5EDF9] bg-[#F8FDFF] py-2 pl-[72px] pr-4">
        {(hasSummaryLine || hasQuantityLines) && (
          <div className="inline-flex flex-shrink-0 rounded-md bg-[#EEF4F7] p-0.5">
            <span className="flex h-7 items-center rounded bg-white px-3 font-montserrat text-[11px] font-semibold text-[#007EA7] shadow-[0_1px_3px_rgba(16,35,58,0.12)]">
              {effectiveMode === "summary" ? "Summary lines" : "Quantity lines"}
            </span>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <p className="flex-shrink-0 font-montserrat text-[12px] font-semibold text-[#10233A]">
            Document lines
          </p>
          <span
            aria-hidden="true"
            className="h-3 w-px flex-shrink-0 bg-[#D3E1EC]"
          />
          <p
            className="min-w-0 truncate font-montserrat text-[11px] text-[#7288A3]"
            title={document.fileCase}
          >
            {document.fileCase}
          </p>
        </div>
      </div>
      <div className="min-w-max">
          <div className="flex h-7 items-center border-b border-[#E5EDF9] bg-[#F8FDFF] pl-3 pr-2">
            <div className="w-[60px] flex-shrink-0" />
            {alignedColumns.map(({ parentColumn, detailColumn }) => (
              <div
                key={parentColumn.key}
                className="flex-shrink-0 truncate border-l border-[#E5EDF9] px-3 font-montserrat text-[10px] font-semibold uppercase tracking-[0.02em] text-[#7288A3]"
                style={{ width: parentColumn.width }}
                title={detailColumn ?? ""}
              >
                {detailColumn ?? ""}
              </div>
            ))}
            <div className="w-[168px] flex-shrink-0" />
          </div>
          {rows.map((lineItem, rowIndex) => (
            <div
              key={lineItem?.id ?? `fallback-${rowIndex}`}
              className={`flex h-9 items-center pl-3 pr-2 ${rowIndex % 2 === 0 ? "bg-white" : "bg-[#F8FDFF]"}`}
            >
              <div className="flex w-[60px] flex-shrink-0 items-center justify-center font-montserrat text-[11px] text-[#7288A3]">
                #{rowIndex + 1}
              </div>
              {alignedColumns.map(({ parentColumn, detailColumn }) => {
                if (!detailColumn) {
                  return (
                    <div
                      key={parentColumn.key}
                      className="h-9 flex-shrink-0 border-l border-[#EEF3F7]"
                      style={{ width: parentColumn.width }}
                    />
                  );
                }
                const column = detailColumn;
                const value = detailLineValue(document, column, lineItem);
                const sharedLookup = {
                  Department: {
                    key: "departmentCode",
                    lineKey: "department" as keyof DocumentLineItem,
                    type: "department_code" as LookupType,
                  },
                  Object: {
                    key: "objectProject",
                    lineKey: "object" as keyof DocumentLineItem,
                    type: "object_project" as LookupType,
                  },
                  Series: {
                    key: "series",
                    lineKey: "series" as keyof DocumentLineItem,
                    type: "series" as LookupType,
                  },
                  Center: {
                    key: "costCenter",
                    lineKey: "center" as keyof DocumentLineItem,
                    type: "cost_center" as LookupType,
                  },
                  "GL account": {
                    key: "expenseAccount",
                    lineKey: "expense" as keyof DocumentLineItem,
                    type: "gl_account" as LookupType,
                  },
                  "VAT classifier": {
                    key: "vatClassifier",
                    lineKey: "vatClass" as keyof DocumentLineItem,
                    type: "vat_class" as LookupType,
                  },
                  "VAT Classifier": {
                    key: "vatClassifier",
                    lineKey: "vatClass" as keyof DocumentLineItem,
                    type: "vat_class" as LookupType,
                  },
                }[column];
                if (sharedLookup) {
                  return (
                    <div
                      key={parentColumn.key}
                      className="flex h-9 flex-shrink-0 items-center overflow-hidden border-l border-[#EEF3F7] px-2"
                      style={{ width: parentColumn.width }}
                    >
                      <LookupCellDropdown
                        docId={document.id}
                        companyId={document.companyId}
                        generalLedgerName={generalLedgerName}
                        colKey={sharedLookup.key}
                        value={value === "—" ? "" : value}
                        lookupType={sharedLookup.type}
                        onOpenGeneralLedger={onOpenGeneralLedger}
                        width={Math.max(24, parentColumn.width - 16)}
                        tableSelect
                        onSave={
                          effectiveMode === "quantity" && lineItem
                            ? (_, __, newVal) =>
                                onLineLookupSave(
                                  document.id,
                                  lineItem.id,
                                  sharedLookup.lineKey,
                                  newVal,
                                )
                            : onSharedSave
                        }
                      />
                    </div>
                  );
                }
                if (column === "Product group" && lineItem) {
                  return (
                    <div
                      key={parentColumn.key}
                      className="flex h-9 flex-shrink-0 items-center overflow-hidden border-l border-[#EEF3F7] px-2"
                      style={{ width: parentColumn.width }}
                    >
                      <LookupCellDropdown
                        docId={document.id}
                        companyId={document.companyId}
                        colKey="productGroup"
                        value={value === "—" ? "" : value}
                        lookupType="product_group"
                        width={Math.max(24, parentColumn.width - 16)}
                        tableSelect
                        onSave={(_, __, newVal) =>
                          onProductGroupSave(document.id, lineItem.id, newVal)
                        }
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={parentColumn.key}
                    className="flex-shrink-0 truncate border-l border-[#EEF3F7] px-3 font-montserrat text-[12px] font-medium text-[#10233A]"
                    style={{ width: parentColumn.width }}
                    title={value}
                  >
                    {value}
                  </div>
                );
              })}
              <div className="w-[168px] flex-shrink-0" />
            </div>
          ))}
      </div>
    </section>
  );
}

const FIXED_FILTER_KEYS = new Set(["status", "clientCounterparty", "currency"]);

const PRIMARY_FILTER_COLUMNS = [
  { key: "period", label: "Period" },
  { key: "clientCounterparty", label: "Client/Counterparty" },
  { key: "currency", label: "Currency" },
  { key: "rangeAmount", label: "Range amount" },
  { key: "status", label: "Status" },
] as const;

function SystemDocumentFilterDropdown({
  label,
  value,
  displayValue,
  options,
  open,
  onOpenChange,
  onChange,
  minWidth = 210,
}: {
  label: string;
  value: string;
  displayValue?: string;
  options: Array<{ value: string; label: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  minWidth?: number;
}) {
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#DCE7F6]"
      >
        <span className="truncate whitespace-nowrap">
          {label}
          {value && (
            <span className="text-[#10233A]">: {displayValue || value}</span>
          )}
        </span>
        {value ? (
          <X
            size={14}
            className="flex-shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
              onOpenChange(false);
            }}
          />
        ) : (
          <ChevronDown
            size={14}
            className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && (
        <div
          className="absolute left-0 top-[32px] z-50 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
          style={{ minWidth }}
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              onOpenChange(false);
            }}
            className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-[#F2F7FC]"
          >
            <span
              className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${!value ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
            >
              {!value && (
                <Check size={12} strokeWidth={2.5} className="text-white" />
              )}
            </span>
            <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
              All
            </span>
          </button>
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => {
              const checked = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    onOpenChange(false);
                  }}
                  className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[#F2F7FC]"
                >
                  <span
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                  >
                    {checked && (
                      <Check
                        size={12}
                        strokeWidth={2.5}
                        className="text-white"
                      />
                    )}
                  </span>
                  <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const FILTERABLE_COLUMNS: { key: keyof Document; label: string }[] =
  DOCUMENT_BASE_COLUMNS.filter(
    (c) => !FIXED_FILTER_KEYS.has(c.key) && c.key !== "status",
  ).map((c) => ({ key: c.key as keyof Document, label: c.label }));

type LookupType =
  | "cost_center"
  | "series"
  | "object_project"
  | "department_code"
  | "vat_class"
  | "gl_account"
  | "product_group";

const LOOKUP_COL_MAP: Partial<Record<keyof Document, LookupType>> = {
  series: "series",
  departmentCode: "department_code",
  objectProject: "object_project",
  costCenter: "cost_center",
  expenseAccount: "gl_account",
  vatClassifier: "vat_class",
  productGroup: "product_group",
};

const DB_COL_MAP: Partial<Record<keyof Document, string>> = {
  clientCounterparty: "client_counterparty",
  series: "series",
  departmentCode: "department_code",
  objectProject: "object_project",
  costCenter: "cost_center",
  expenseAccount: "expense_account",
  vatClassifier: "vat_classifier",
};

const LINE_ITEM_COL_MAP: Partial<
  Record<keyof Document, keyof DocumentLineItem>
> = {
  series: "series",
  departmentCode: "department",
  objectProject: "object",
  costCenter: "center",
  expenseAccount: "expense",
  vatClassifier: "vatClass",
  productGroup: "productGroup",
  vatPercent: "vatPct",
};

const COUNTERPARTIES_STORAGE_KEY =
  "finansu-harmonija:v7:settings:counterparties";

function loadDocumentCounterparties(): Company[] {
  try {
    const stored = window.localStorage.getItem(COUNTERPARTIES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as Company[]) : [];
  } catch {
    return [];
  }
}

function counterpartyCodeForName(counterparties: Company[], name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  return (
    counterparties.find(
      (counterparty) =>
        counterparty.name.trim().toLocaleLowerCase() === normalizedName,
    )?.company_code ?? ""
  );
}

function LookupCellDropdown({
  docId,
  companyId,
  generalLedgerName,
  colKey,
  value,
  lookupType,
  width,
  onSave,
  tableSelect = false,
  disabled = false,
  onOpenGeneralLedger,
}: {
  docId: string;
  companyId: string;
  generalLedgerName?: string;
  colKey: string;
  value: string;
  lookupType: LookupType;
  width: number;
  onSave: (docId: string, colKey: string, newVal: string) => Promise<void>;
  tableSelect?: boolean;
  disabled?: boolean;
  onOpenGeneralLedger?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [newVal, setNewVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scopedLookupType =
    ["department_code", "cost_center", "object_project", "product_group", "series"].includes(lookupType) && companyId
      ? `${lookupType}::company::${companyId}`
      : lookupType;
  const filteredOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    supabase
      .from("lookup_values")
      .select("value")
      .eq("type", scopedLookupType)
      .order("value")
      .then(({ data }) => {
        const managedGlAccounts =
          lookupType === "gl_account"
            ? loadCompanyGeneralLedgerAccountOptions(
                companyId,
                generalLedgerName,
              )
            : [];
        setOptions(
          Array.from(new Set(
            lookupType === "gl_account"
              ? managedGlAccounts
              : (data ?? []).map((record) => String(record.value ?? "")),
          )).sort((left, right) =>
            left.localeCompare(right, undefined, { numeric: true }),
          ),
        );
      });
  }, [companyId, generalLedgerName, lookupType, open, scopedLookupType]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    const anchor = containerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = Math.max(width, 180);
    const estimatedHeight = 250;
    const availableBelow = window.innerHeight - rect.bottom;
    const top =
      availableBelow >= estimatedHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - estimatedHeight - 4);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - menuWidth - 8),
    );
    setMenuPosition({ top, left });
  }, [width]);

  useEffect(() => {
    if (!open || !tableSelect) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, tableSelect, updateMenuPosition]);

  async function handleSelect(val: string) {
    setSaving(true);
    if (lookupType === "product_group") {
      await ensureOrganizationProductGroup(companyId, val);
    }
    await onSave(docId, colKey, val);
    setOpen(false);
    setQuery("");
    setSaving(false);
  }

  async function handleAdd() {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    setSaving(true);
    await supabase
      .from("lookup_values")
      .upsert(
        { type: scopedLookupType, value: trimmed },
        { onConflict: "type,value" },
      );
    if (lookupType === "product_group") {
      await ensureOrganizationProductGroup(companyId, trimmed);
    }
    await onSave(docId, colKey, trimmed);
    setOptions((prev) => [...new Set([...prev, trimmed])].sort());
    setNewVal("");
    setSaving(false);
    setOpen(false);
  }

  if (lookupType === "gl_account") {
    return (
      <GeneralLedgerAccountSelect
        value={value}
        companyId={companyId}
        generalLedgerName={generalLedgerName}
        width={width}
        compact
        borderless={tableSelect}
        disabled={disabled}
        ariaLabel={`Select ${colKey}`}
        onChange={(nextValue) => onSave(docId, colKey, nextValue)}
        onOpenGeneralLedger={onOpenGeneralLedger}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        role="combobox"
        disabled={disabled}
        aria-label={`Select ${colKey}`}
        aria-expanded={open}
        value={open ? query : value}
        autoComplete="off"
        onFocus={(event) => {
          if (disabled) return;
          if (!open && tableSelect) updateMenuPosition();
          setQuery("");
          setOpen(true);
          event.currentTarget.select();
        }}
        onClick={() => { if (!disabled) setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        className={
          tableSelect
            ? `h-7 w-[calc(100%-8px)] border border-transparent bg-transparent px-2 pr-6 font-montserrat text-[11px] font-normal text-[#10233A] outline-none transition-colors ${disabled ? "cursor-not-allowed opacity-60" : "hover:text-[#007EA7]"}`
            : "h-7 w-full bg-transparent pr-6 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none"
        }
      />
      <button type="button" tabIndex={-1} disabled={disabled} aria-label={`Open ${colKey} options`} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!open && tableSelect) updateMenuPosition(); setQuery(""); setOpen((current) => !current); }} className={`absolute right-0 top-0 flex items-center justify-center text-[#7288A3] disabled:hidden ${tableSelect ? "h-7 w-6" : "h-7 w-5"}`}>
        <ChevronDown
          size={tableSelect ? 12 : 11}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && !disabled &&
        (tableSelect ? createPortal(
        <div
          ref={menuRef}
          data-table-lookup-menu="true"
          className="fixed z-[1000] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white shadow-[0_8px_24px_rgba(16,35,58,0.16)]"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            minWidth: Math.max(width, 180),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="max-h-44 overflow-y-auto">
            {value && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSelect("")}
                className="flex w-full items-center gap-2 border-b border-[#E5EDF9] px-3 py-2 text-left font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#F0F8FC] disabled:opacity-50"
              >
                <X size={13} />
                <span>Clear value</span>
              </button>
            )}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-[#A1B6C6] font-montserrat">
                No options yet
              </div>
            )}
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={saving}
                onClick={() => handleSelect(opt)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left text-[12px] font-montserrat font-medium hover:bg-[#F0F8FC] transition-colors disabled:opacity-50"
                style={{ color: opt === value ? "#007EA7" : "#10233A" }}
              >
                <span>{opt}</span>
                {opt === value && (
                  <Check size={11} className="text-[#007EA7] flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          {lookupType !== "series" && <div className="border-t border-[#D3E1EC] p-2 flex gap-1">
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                e.stopPropagation();
              }}
              placeholder="Add new..."
              className="flex-1 min-w-0 px-2 py-1 text-[11px] font-montserrat border border-[#D3E1EC] rounded focus:outline-none focus:border-[#007EA7] transition-colors"
            />
            <button
              data-system-action="true"
              type="button"
              onClick={handleAdd}
              disabled={!newVal.trim() || saving}
              className="flex items-center justify-center w-6 h-6 rounded bg-[#007EA7] hover:bg-[#006a8e] disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {saving ? (
                <Loader2 size={10} className="text-white animate-spin" />
              ) : (
                <Plus size={10} className="text-white" />
              )}
            </button>
          </div>}
        </div>,
        document.body,
      ) : (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-[100] mt-1 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white shadow-lg"
          style={{ minWidth: Math.max(width, 160) }}
        >
          <div className="max-h-44 overflow-y-auto">
            {value && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSelect("")}
                className="flex w-full items-center gap-2 border-b border-[#E5EDF9] px-3 py-2 text-left font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#F0F8FC] disabled:opacity-50"
              >
                <X size={13} />
                <span>Clear value</span>
              </button>
            )}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 font-montserrat text-[11px] text-[#A1B6C6]">
                No options yet
              </div>
            )}
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={saving}
                onClick={() => handleSelect(opt)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left font-montserrat text-[12px] font-medium transition-colors hover:bg-[#F0F8FC] disabled:opacity-50"
                style={{ color: opt === value ? "#007EA7" : "#10233A" }}
              >
                <span>{opt}</span>
                {opt === value && <Check size={11} className="flex-shrink-0 text-[#007EA7]" />}
              </button>
            ))}
          </div>
          {lookupType !== "series" && <div className="flex gap-1 border-t border-[#D3E1EC] p-2">
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                e.stopPropagation();
              }}
              placeholder="Add new..."
              className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-montserrat text-[11px] transition-colors focus:border-[#007EA7] focus:outline-none"
            />
            <button
              data-system-action="true"
              type="button"
              onClick={handleAdd}
              disabled={!newVal.trim() || saving}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-[#007EA7] transition-colors hover:bg-[#006a8e] disabled:opacity-40"
            >
              {saving ? <Loader2 size={10} className="animate-spin text-white" /> : <Plus size={10} className="text-white" />}
            </button>
          </div>}
        </div>
      ))}
    </div>
  );
}

interface DocumentsProps {
  companyId?: string;
  companyName?: string;
  company?: Company;
  generalLedgerName?: string;
  title?: string;
  allCompanies?: boolean;
  editOnlyActions?: boolean;
  hideRowActions?: boolean;
  documentTypeFilter?: string;
  initialViewDocumentId?: string | null;
  onInitialViewConsumed?: () => void;
  onInitialViewBack?: () => void;
  onOpenGeneralLedger?: () => void;
  onStartChat?: (context: InvoiceChatContext) => void;
}

type SavedDocumentFilters = {
  primaryKeys: string[];
  dynamicFilters: Record<string, string>;
};

function loadSavedDocumentFilters(key: string): SavedDocumentFilters | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const parsed = JSON.parse(stored) as Partial<SavedDocumentFilters>;
    const primaryKeys = Array.isArray(parsed.primaryKeys)
      ? parsed.primaryKeys.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const dynamicFilters =
      parsed.dynamicFilters && typeof parsed.dynamicFilters === "object"
        ? Object.fromEntries(
            Object.entries(parsed.dynamicFilters).filter(
              ([key, value]) =>
                typeof key === "string" && typeof value === "string",
            ),
          )
        : {};
    const isLegacyAutomaticDefault =
      primaryKeys.length === PRIMARY_FILTER_COLUMNS.length &&
      PRIMARY_FILTER_COLUMNS.every((filter) =>
        primaryKeys.includes(filter.key),
      ) &&
      Object.keys(dynamicFilters).length === 0;
    return {
      primaryKeys: isLegacyAutomaticDefault ? [] : primaryKeys,
      dynamicFilters,
    };
  } catch {
    return null;
  }
}

export default function Documents({
  companyId = "",
  companyName = "",
  company,
  generalLedgerName = "",
  title = "Documents",
  allCompanies = false,
  editOnlyActions = false,
  hideRowActions = false,
  documentTypeFilter = "",
  initialViewDocumentId = null,
  onInitialViewConsumed,
  onInitialViewBack,
  onOpenGeneralLedger,
  onStartChat,
}: DocumentsProps) {
  const filterPersistenceKey = `finansu-harmonija:v12:documents:filters:${
    allCompanies ? "all-companies" : companyId || companyName || title
  }`;
  const initialSavedFilters = useRef(
    loadSavedDocumentFilters(filterPersistenceKey),
  );
  const [docs, setDocs] = useState<Document[]>([]);
  const [counterparties, setCounterparties] = useState<Company[]>(() =>
    loadDocumentCounterparties(),
  );
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [activeColumns, setActiveColumns] = useState<ColConfig[]>(
    DOCUMENT_BASE_COLUMNS,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [presetCreateDocumentType, setPresetCreateDocumentType] = useState("");
  const [duplicateSource, setDuplicateSource] = useState<Document | null>(null);
  const [openDoc, setOpenDoc] = useState<Document | null>(null);
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const initialViewHandledRef = useRef(false);
  const entryDocumentIdRef = useRef(initialViewDocumentId);
  const [viewActionPanel, setViewActionPanel] = useState<
    "send" | "preview" | null
  >(null);
  const [uploadDocType] = useState("");
  const [uploadCompany] = useState("");
  const [uploadDatePeriod] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<
    string | null
  >(null);
  const [showCounterpartyMenu, setShowCounterpartyMenu] = useState(false);
  const counterpartyRef = useRef<HTMLDivElement>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string>>(
    () => initialSavedFilters.current?.dynamicFilters ?? {},
  );
  const [openDynamicMenu, setOpenDynamicMenu] = useState<string | null>(null);
  const [showAddFilterMenu, setShowAddFilterMenu] = useState(false);
  const [pendingDynamicFilterKeys, setPendingDynamicFilterKeys] = useState<
    string[]
  >([]);
  const [activePrimaryFilterKeys, setActivePrimaryFilterKeys] = useState<
    string[]
  >(
    () => initialSavedFilters.current?.primaryKeys ?? [],
  );
  const addFilterRef = useRef<HTMLDivElement>(null);
  const dynamicFilterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rangeAmountMin, setRangeAmountMin] = useState("");
  const [rangeAmountMax, setRangeAmountMax] = useState("");
  const [appliedRangeMin, setAppliedRangeMin] = useState<number | null>(null);
  const [appliedRangeMax, setAppliedRangeMax] = useState<number | null>(null);
  const [showRangeAmountMenu, setShowRangeAmountMenu] = useState(false);
  const rangeAmountRef = useRef<HTMLDivElement>(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(
    new Set(),
  );
  const [statusDropdownDocId, setStatusDropdownDocId] = useState<string | null>(
    null,
  );

  const [, setShowPerPageMenu] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(
      filterPersistenceKey,
      JSON.stringify({
        primaryKeys: activePrimaryFilterKeys,
        dynamicFilters,
      } satisfies SavedDocumentFilters),
    );
  }, [activePrimaryFilterKeys, dynamicFilters, filterPersistenceKey]);

  const applyFilterSelection = () => {
    const primaryKeys = pendingDynamicFilterKeys.filter((key) =>
      PRIMARY_FILTER_COLUMNS.some((filter) => filter.key === key),
    );
    const dynamicKeys = pendingDynamicFilterKeys.filter(
      (key) => !PRIMARY_FILTER_COLUMNS.some((filter) => filter.key === key),
    );
    setActivePrimaryFilterKeys(primaryKeys);
    setDynamicFilters((current) =>
      Object.fromEntries(
        dynamicKeys.map((key) => [key, current[key] ?? ""]),
      ),
    );
    if (!primaryKeys.includes("period")) setSelectedPeriod(null);
    if (!primaryKeys.includes("clientCounterparty"))
      setSelectedCounterparty(null);
    if (!primaryKeys.includes("currency")) setSelectedCurrency(null);
    if (!primaryKeys.includes("status")) setSelectedStatus(null);
    if (!primaryKeys.includes("rangeAmount")) {
      setRangeAmountMin("");
      setRangeAmountMax("");
      setAppliedRangeMin(null);
      setAppliedRangeMax(null);
    }
    setShowAddFilterMenu(false);
    setOpenDynamicMenu(null);
    setCurrentPage(1);
  };

  const updateDocField = useCallback(
    async (docId: string, colKey: string, newVal: string) => {
      const dbCol = DB_COL_MAP[colKey as keyof Document];
      const lineItemKey = LINE_ITEM_COL_MAP[colKey as keyof Document];
      if (!dbCol && !lineItemKey) return;
      let syncedLineItems: DocumentLineItem[] | undefined;
      let syncedSummaryLineItems: DocumentLineItem[] | undefined;
      if (lineItemKey) {
        const { data } = await supabase
          .from("documents")
          .select("line_items,summary_line_items")
          .eq("id", docId);
        const storedItems = data?.[0]?.line_items;
        if (Array.isArray(storedItems)) {
          syncedLineItems = (storedItems as DocumentLineItem[]).map((item) => ({
            ...item,
            [lineItemKey]: newVal,
          }));
        }
        if (colKey === "productGroup") {
          const storedSummaryItems = data?.[0]?.summary_line_items;
          if (Array.isArray(storedSummaryItems)) {
            syncedSummaryLineItems = (
              storedSummaryItems as DocumentLineItem[]
            ).map((item) => ({
              ...item,
              [lineItemKey]: newVal,
            }));
          }
        }
      }
      const updatePayload: Record<string, unknown> = {
        ...(dbCol ? { [dbCol]: newVal } : {}),
        ...(syncedLineItems ? { line_items: syncedLineItems } : {}),
        ...(syncedSummaryLineItems
          ? { summary_line_items: syncedSummaryLineItems }
          : {}),
      };
      if (Object.keys(updatePayload).length > 0) {
        await supabase.from("documents").update(updatePayload).eq("id", docId);
      }
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                [colKey]: newVal,
                ...(lineItemKey
                  ? {
                      lineItems: d.lineItems.map((item) => ({
                        ...item,
                        [lineItemKey]: newVal,
                      })),
                      ...(colKey === "productGroup"
                        ? {
                            summaryLineItems: d.summaryLineItems.map((item) => ({
                              ...item,
                              [lineItemKey]: newVal,
                            })),
                          }
                        : {}),
                    }
                  : {}),
              }
            : d,
        ),
      );
      if (lineItemKey) {
        setOpenDoc((prev) =>
          prev && prev.id === docId
            ? {
                ...prev,
                [colKey]: newVal,
                lineItems: prev.lineItems.map((item) => ({
                  ...item,
                  [lineItemKey]: newVal,
                })),
                ...(colKey === "productGroup"
                  ? {
                      summaryLineItems: prev.summaryLineItems.map((item) => ({
                        ...item,
                        [lineItemKey]: newVal,
                      })),
                    }
                  : {}),
              }
            : prev,
        );
      }
    },
    [],
  );

  const updateLineItemProductGroup = useCallback(
    async (docId: string, lineItemId: string, newVal: string) => {
      const { data } = await supabase
        .from("documents")
        .select("line_items")
        .eq("id", docId);
      const storedItems = data?.[0]?.line_items;
      if (!Array.isArray(storedItems)) return;

      const updatedItems = (storedItems as DocumentLineItem[]).map((item) =>
        item.id === lineItemId ? { ...item, productGroup: newVal } : item,
      );
      await supabase
        .from("documents")
        .update({ line_items: updatedItems })
        .eq("id", docId);
      setDocs((prev) =>
        prev.map((doc) =>
          doc.id === docId ? { ...doc, lineItems: updatedItems } : doc,
        ),
      );
      setOpenDoc((prev) =>
        prev && prev.id === docId ? { ...prev, lineItems: updatedItems } : prev,
      );
    },
    [],
  );

  const updateDocumentLineLookup = useCallback(
    async (
      docId: string,
      lineItemId: string,
      key: keyof DocumentLineItem,
      newVal: string,
    ) => {
      const target = docs.find((document) => document.id === docId);
      if (!target) return;
      const updatedItems = target.lineItems.map((item) =>
        item.id === lineItemId ? { ...item, [key]: newVal } : item,
      );
      const parentValues = {
        expenseAccount: commonLineValue(updatedItems, "expense", ""),
        vatClassifier: commonLineValue(updatedItems, "vatClass", ""),
        vatPercent: commonLineValue(updatedItems, "vatPct", ""),
        departmentCode: commonLineValue(updatedItems, "department", ""),
        objectProject: commonLineValue(updatedItems, "object", ""),
        costCenter: commonLineValue(updatedItems, "center", ""),
      };
      const { error } = await supabase
        .from("documents")
        .update({
          line_items: updatedItems,
          expense_account: parentValues.expenseAccount,
          vat_classifier: parentValues.vatClassifier,
          vat_percent: parentValues.vatPercent,
          department_code: parentValues.departmentCode,
          object_project: parentValues.objectProject,
          cost_center: parentValues.costCenter,
        })
        .eq("id", docId);
      if (error) return;
      setDocs((current) =>
        current.map((document) =>
          document.id === docId
            ? { ...document, ...parentValues, lineItems: updatedItems }
            : document,
        ),
      );
      setOpenDoc((current) =>
        current?.id === docId
          ? { ...current, ...parentValues, lineItems: updatedItems }
          : current,
      );
    },
    [docs],
  );

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("documents").select("*");
    if (!allCompanies) query = query.eq("company_id", companyId);
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (!error && data) {
      const normalizedTypeFilter = documentTypeFilter
        .trim()
        .toLocaleLowerCase();
      const availableCounterparties = loadDocumentCounterparties();
      setCounterparties(availableCounterparties);
      const mappedDocuments = (data as unknown as DbDocument[])
        .map(mapRow)
        .map((document) => {
          const linkedCounterparty = availableCounterparties.find(
            (counterparty) =>
              (document.counterpartyId &&
                counterparty.id === document.counterpartyId) ||
              (!document.counterpartyId &&
                counterparty.name.trim().toLocaleLowerCase() ===
                  document.clientCounterparty.trim().toLocaleLowerCase()),
          );
          if (linkedCounterparty && !document.counterpartyId) {
            void supabase
              .from("documents")
              .update({ counterparty_id: linkedCounterparty.id })
              .eq("id", document.id);
          }
          return {
            ...document,
            counterpartyId:
              linkedCounterparty?.id ?? document.counterpartyId,
            clientCounterparty:
              linkedCounterparty?.name ?? document.clientCounterparty,
            counterpartyCode:
              linkedCounterparty?.company_code ??
              counterpartyCodeForName(
                availableCounterparties,
                document.clientCounterparty,
              ),
          };
        })
        .filter(
          (document) =>
            !normalizedTypeFilter ||
            document.documentType
              .trim()
              .toLocaleLowerCase()
              .includes(normalizedTypeFilter),
        );
      setDocs(mappedDocuments);

      const productGroupsByCompany = new Map<string, string[]>();
      mappedDocuments.forEach((document) => {
        const assignedGroups = [
          ...document.lineItems,
          ...document.summaryLineItems,
        ]
          .map((line) => line.productGroup?.trim() ?? "")
          .filter(Boolean);
        if (assignedGroups.length === 0) return;
        productGroupsByCompany.set(document.companyId, [
          ...(productGroupsByCompany.get(document.companyId) ?? []),
          ...assignedGroups,
        ]);
      });
      await Promise.all(
        [...productGroupsByCompany.entries()].map(([organizationId, groups]) =>
          ensureOrganizationProductGroups(organizationId, groups),
        ),
      );
    }
    setLoading(false);
  }, [allCompanies, companyId, documentTypeFilter]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    if (!initialViewDocumentId || initialViewHandledRef.current || docs.length === 0) return;
    const documentToView = docs.find((document) => document.id === initialViewDocumentId);
    if (!documentToView) return;
    initialViewHandledRef.current = true;
    setViewDoc(documentToView);
    onInitialViewConsumed?.();
  }, [docs, initialViewDocumentId, onInitialViewConsumed]);

  useEffect(() => {
    const refreshCounterparties = () => {
      const next = loadDocumentCounterparties();
      setCounterparties(next);
      setDocs((current) =>
        current.map((document) => {
          const linkedCounterparty = next.find(
            (counterparty) =>
              (document.counterpartyId &&
                counterparty.id === document.counterpartyId) ||
              (!document.counterpartyId &&
                counterparty.name.trim().toLocaleLowerCase() ===
                  document.clientCounterparty.trim().toLocaleLowerCase()),
          );
          return {
            ...document,
            counterpartyId:
              linkedCounterparty?.id ?? document.counterpartyId,
            clientCounterparty:
              linkedCounterparty?.name ?? document.clientCounterparty,
            counterpartyCode:
              linkedCounterparty?.company_code ??
              counterpartyCodeForName(next, document.clientCounterparty),
          };
        }),
      );
    };
    window.addEventListener("counterparties-updated", refreshCounterparties);
    window.addEventListener("storage", refreshCounterparties);
    return () => {
      window.removeEventListener(
        "counterparties-updated",
        refreshCounterparties,
      );
      window.removeEventListener("storage", refreshCounterparties);
    };
  }, []);

  const { startResize } = useColumnResize(activeColumns, setActiveColumns);

  const visibleColumns = activeColumns.filter((c) => c.visible);
  const showExpandableDetails = !allCompanies && !editOnlyActions;

  async function handleStatusChange(
    doc: Document,
    newStatus: Document["status"],
  ) {
    if (newStatus === doc.status) {
      setStatusDropdownDocId(null);
      return;
    }
    const { error } = await supabase
      .from("documents")
      .update({ status: newStatus })
      .eq("id", doc.id);
    if (!error) {
      await supabase.from("document_history").insert({
        document_id: doc.id,
        action: newStatus,
        user_name: getCurrentUserName(),
        details: `Status changed from ${doc.status} to ${newStatus}`,
      });
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: newStatus } : d)),
      );
      if (openDoc?.id === doc.id)
        setOpenDoc((prev) => (prev ? { ...prev, status: newStatus } : prev));
    }
    setStatusDropdownDocId(null);
  }

  async function importDocuments(documentsToImport: Document[]) {
    if (documentsToImport.length === 0) return;
    importMenuRecords(
      `company:${companyId}:documents`,
      documentsToImport.map((document) => document.id),
    );
    const importedIds = new Set<string>();

    await Promise.all(
      documentsToImport.map(async (document) => {
        const { error } = await supabase
          .from("documents")
          .update({ status: "Transferred" })
          .eq("id", document.id);
        if (error) return;

        importedIds.add(document.id);
        await supabase.from("document_history").insert({
          document_id: document.id,
          action: documentsToImport.length === 1 ? "IMPORT1" : "IMPORTDATA",
          user_name: getCurrentUserName(),
          details:
            documentsToImport.length === 1
              ? "One document imported"
              : "All documents in the menu imported",
        });
      }),
    );

    if (importedIds.size === 0) return;
    setDocs((current) =>
      current.map((document) =>
        importedIds.has(document.id)
          ? { ...document, status: "Transferred" }
          : document,
      ),
    );
    setSelectedIds(new Set());
  }

  const handleExport = () => {
    if (!exportFormat) return;
    const cols = visibleColumns;
    const headers = cols.map((c) => c.label);
    const dataRows = docs.map((doc) =>
      cols.map((c) => {
        const val = (doc as Record<string, unknown>)[c.key];
        return val?.toString() ?? "";
      }),
    );
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    if (exportFormat === "csv") {
      const lines = [
        headers.map(escape).join(","),
        ...dataRows.map((r) => r.map(escape).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documents.csv";
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === "xlsx") {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Documents");
      XLSX.writeFile(workbook, "documents.xlsx");
    } else if (exportFormat === "pdf") {
      const lines = [
        "Documents Export",
        "",
        headers.join(" | "),
        headers.map(() => "---").join("-|-"),
        ...dataRows.map((r) => r.join(" | ")),
      ];
      const blob = new Blob([lines.join("\n")], {
        type: "text/plain;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documents.txt";
      a.click();
      URL.revokeObjectURL(url);
    }
    setExportOpen(false);
  };

  function parseDate(d: string): number {
    if (!d) return 0;
    const [day, mon, yr] = d.split(".");
    if (!day || !mon || !yr) return 0;
    return new Date(Number(yr), Number(mon) - 1, Number(day)).getTime();
  }

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  function formatPeriod(ym: string) {
    const [yr, mo] = ym.split("-");
    return `${MONTH_NAMES[Number(mo) - 1]} ${yr}`;
  }

  const availablePeriods: string[] = Array.from(
    new Set(
      docs.map((doc) => {
        const [, mon, yr] = doc.receiveDate.split(".");
        return yr && mon ? `${yr}-${mon}` : "";
      }),
    ),
  )
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  const {
    sortedRows: baseDocs,
    changeSort,
    directionFor,
  } = useMultiColumnSort(docs, (document, key) => {
    const value = document[key as keyof Document];
    return key === "receiveDate"
      ? parseDate(String(value))
      : typeof value === "boolean"
        ? String(value)
        : (value as string | number | undefined);
  });

  const sortedDocs = (
    selectedPeriod
      ? baseDocs.filter((doc) => {
          const [, mon, yr] = doc.receiveDate.split(".");
          return Boolean(yr && mon) && `${yr}-${mon}` === selectedPeriod;
        })
      : baseDocs
  )
    .filter((doc) => !selectedCurrency || doc.currency === selectedCurrency)
    .filter(
      (doc) =>
        !selectedCounterparty ||
        doc.clientCounterparty === selectedCounterparty,
    )
    .filter((doc) => !selectedStatus || doc.status === selectedStatus)
    .filter((doc) => {
      return Object.entries(dynamicFilters).every(([key, val]) => {
        if (!val) return true;
        return (
          String(doc[key as keyof Document] ?? "").toLowerCase() ===
          val.toLowerCase()
        );
      });
    })
    .filter((doc) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return Object.values(doc).some(
        (v) => v != null && String(v).toLowerCase().includes(q),
      );
    })
    .filter((doc) => {
      if (appliedRangeMin === null && appliedRangeMax === null) return true;
      const val = parseFloat(
        doc.amountWithoutVat.replace(/[^\d.,-]/g, "").replace(",", "."),
      );
      if (isNaN(val)) return false;
      if (appliedRangeMin !== null && val < appliedRangeMin) return false;
      if (appliedRangeMax !== null && val > appliedRangeMax) return false;
      return true;
    });

  const totalDocs = sortedDocs.length;
  const totalPages = Math.ceil(totalDocs / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, totalDocs);
  const pageDocs = sortedDocs.slice(startIdx, endIdx);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setShowPeriodMenu(false);
      }
      if (
        currencyRef.current &&
        !currencyRef.current.contains(e.target as Node)
      ) {
        setShowCurrencyMenu(false);
      }
      if (
        counterpartyRef.current &&
        !counterpartyRef.current.contains(e.target as Node)
      ) {
        setShowCounterpartyMenu(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
      if (
        addFilterRef.current &&
        !addFilterRef.current.contains(e.target as Node)
      ) {
        setShowAddFilterMenu(false);
      }
      Object.entries(dynamicFilterRefs.current).forEach(([key, el]) => {
        if (el && !el.contains(e.target as Node)) {
          setOpenDynamicMenu((prev) => (prev === key ? null : prev));
        }
      });
      if (
        rangeAmountRef.current &&
        !rangeAmountRef.current.contains(e.target as Node)
      ) {
        setShowRangeAmountMenu(false);
      }
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfoPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
    setSelectedIds(new Set());
  }

  function changeItemsPerPage(n: number) {
    setItemsPerPage(n);
    setCurrentPage(1);
    setSelectedIds(new Set());
    setShowPerPageMenu(false);
  }

  function toggleAll() {
    const pageIds = pageDocs.map((d) => d.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelectedIds(next);
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleDocumentDetails(id: string) {
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const viewedCounterparty = viewDoc
    ? counterparties.find(
        (counterparty) =>
          counterparty.id === viewDoc.counterpartyId ||
          counterparty.name.trim().toLocaleLowerCase() ===
            viewDoc.clientCounterparty.trim().toLocaleLowerCase(),
      )
    : undefined;
  const viewedDocumentTotal = viewDoc
    ? documentAmount(viewDoc.totalAmount)
    : 0;

  return (
    <div className="flex flex-col gap-8 px-4 sm:px-8 lg:px-[72px] py-14 min-w-0">
      {/* Title row */}
      <PageHeader
        title={title}
        className="lg:flex-nowrap lg:gap-2"
        actions={
          editOnlyActions ? undefined : (
            <div className="flex flex-nowrap items-center gap-1">
              <PageActionButton className="!px-1" onClick={() => {
                setPresetCreateDocumentType("");
                setShowCreateModal(true);
              }}>
                Create document manually
              </PageActionButton>
              {!documentTypeFilter && (
                <PageActionButton className="!px-1" onClick={() => {
                  setDuplicateSource(null);
                  setPresetCreateDocumentType("ACCOUNTING_NOTE");
                  setShowCreateModal(true);
                }}>
                  Create accounting note
                </PageActionButton>
              )}
              <div className="flex flex-row items-center gap-1.5">
                <PageActionButton className="!px-1" onClick={() => setShowUploadPanel(true)}>
                  Upload document
                </PageActionButton>
                <div className="relative" ref={infoRef}>
                  <button
                    onClick={() => setShowInfoPanel((v) => !v)}
                    className="flex items-center justify-center"
                  >
                    <Info
                      size={24}
                      className={`flex-shrink-0 transition-colors ${showInfoPanel ? "text-[#007EA7]" : "text-[#A1B6C6] hover:text-[#007EA7]"}`}
                    />
                  </button>
                  {showInfoPanel && (
                    <div
                      className="absolute right-0 top-full mt-2 z-50 flex flex-col items-end"
                      style={{ filter: "drop-shadow(2px 0px 16px #E3EEFF)" }}
                    >
                      {/* Arrow */}
                      <div
                        className="mr-[4px] w-0 h-0"
                        style={{
                          borderLeft: "7px solid transparent",
                          borderRight: "7px solid transparent",
                          borderBottom: "8px solid #ffffff",
                        }}
                      />
                      {/* Panel */}
                      <div className="w-[706px] max-h-[calc(100vh-140px)] overflow-y-auto bg-white rounded-3xl p-6 flex flex-col gap-4">
                        {/* Warning box */}
                        <div
                          className="flex flex-row items-center justify-center px-4 py-3 gap-2.5 rounded-lg"
                          style={{
                            background: "rgba(204,79,0,0.1)",
                            border: "1px solid #CC4F00",
                          }}
                        >
                          <p className="font-montserrat font-semibold text-[14px] leading-5 text-[#CC4F00]">
                            Important: the system processes purchase invoices by
                            default. If the subject line does not contain any
                            keyword, the document will still be interpreted as a
                            purchase invoice.
                          </p>
                        </div>
                        {/* Body */}
                        <div className="flex flex-col gap-2">
                          <p className="font-montserrat font-normal text-[14px] leading-5 text-black">
                            When sending documents, you may use the following
                            keywords in the email subject line (using keywords
                            is optional; the system will process documents even
                            without them):
                          </p>
                          <p className="font-montserrat font-normal text-[14px] leading-5 text-black">
                            To assign an analytical code (project, department,
                            or object) to all documents in the email, include
                            the code in round brackets in the subject line, e.g.
                            (PROJ001) or (ADMIN).
                          </p>
                          <div className="font-montserrat font-semibold text-[14px] leading-5 text-black flex flex-col gap-1 mt-2">
                            {[
                              {
                                kw: "PAY",
                                desc: "– after the document is processed, a payment draft will be created. You will later receive a prepared payment order. If bank integration is enabled, you may also specify the bank using SWED, SEB, or PAYSERA. In this case, the payment draft will be created directly in the selected internet bank.",
                              },
                              {
                                kw: "PERSONAL",
                                desc: "– the document relates to personal expenses paid by the sender and will be processed as reimbursable expenses.",
                              },
                              {
                                kw: "INVOICE",
                                desc: "– the document will be processed as a purchase invoice.",
                              },
                              {
                                kw: "@XXX",
                                desc: "– receiving goods into a warehouse with code XXX, e.g. @WH, @MAIN, @STO.",
                              },
                              {
                                kw: "QTY",
                                desc: "– the document will be processed based on quantities.",
                              },
                              {
                                kw: "AMOUNT",
                                desc: "– the document will be processed based on amounts only (without quantities).",
                              },
                              {
                                kw: "COMPANY",
                                desc: "– the document relates to company expenses.",
                              },
                              {
                                kw: "PIT",
                                desc: "– this keyword is used when submitting a document that is not a purchase invoice, but must be recorded as a personal income tax (PIT/GPM) transaction.",
                              },
                              {
                                kw: "NOSPLIT",
                                desc: "– this keyword is used when a PDF file contains several pages but must not be split. The entire PDF will be treated as a single document.",
                              },
                            ].map(({ kw, desc }) => (
                              <p key={kw}>
                                <span className="text-[#007EA7]">{kw}</span>{" "}
                                {desc}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }
      />
      {companyId && companyName && (
        <CompanyBreadcrumb companyName={companyName} items={["Documents"]} />
      )}
      {allCompanies && (
        <OcrBreadcrumb items={["All documents", title]} />
      )}

      {/* Filter bar */}
      <div className="flex flex-row items-end gap-4 flex-wrap">
        <div
          data-native-system-filters="true"
          className={`flex flex-row items-center gap-1 flex-wrap ${hideRowActions ? "min-w-0 flex-1" : ""}`}
        >
          {/* Period dropdown */}
          {activePrimaryFilterKeys.includes("period") && (
            <div ref={periodRef}>
              <SystemDocumentFilterDropdown
                label="Period"
                value={selectedPeriod ?? ""}
                displayValue={selectedPeriod ? formatPeriod(selectedPeriod) : ""}
                options={availablePeriods.map((period) => ({
                  value: period,
                  label: formatPeriod(period),
                }))}
                open={showPeriodMenu}
                onOpenChange={setShowPeriodMenu}
                onChange={(value) => {
                  setSelectedPeriod(value || null);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
              />
            </div>
          )}
          {/* Client/Counterparty filter */}
          {activePrimaryFilterKeys.includes("clientCounterparty") && (
            <div ref={counterpartyRef}>
              <SystemDocumentFilterDropdown
                label="Client/Counterparty"
                value={selectedCounterparty ?? ""}
                options={Array.from(
                  new Set(
                    docs.map((document) => document.clientCounterparty).filter(Boolean),
                  ),
                )
                  .sort()
                  .map((counterparty) => ({
                    value: counterparty,
                    label: counterparty,
                  }))}
                open={showCounterpartyMenu}
                onOpenChange={setShowCounterpartyMenu}
                onChange={(value) => {
                  setSelectedCounterparty(value || null);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
              />
            </div>
          )}
          {/* Currency filter */}
          {activePrimaryFilterKeys.includes("currency") && (
            <div ref={currencyRef}>
              <SystemDocumentFilterDropdown
                label="Currency"
                value={selectedCurrency ?? ""}
                options={Array.from(
                  new Set(docs.map((document) => document.currency).filter(Boolean)),
                )
                  .sort()
                  .map((currency) => ({ value: currency, label: currency }))}
                open={showCurrencyMenu}
                onOpenChange={setShowCurrencyMenu}
                onChange={(value) => {
                  setSelectedCurrency(value || null);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
          {/* Range amount filter */}
          {activePrimaryFilterKeys.includes("rangeAmount") && (
          <div className="relative" ref={rangeAmountRef}>
            <button
              type="button"
              aria-label="Filter by Range amount"
              aria-expanded={showRangeAmountMenu}
              onClick={() => setShowRangeAmountMenu((v) => !v)}
              className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#DCE7F6]"
            >
              <span className="truncate whitespace-nowrap">
                Range amount
                {appliedRangeMin !== null || appliedRangeMax !== null
                  ? `: ${appliedRangeMin ?? ""}–${appliedRangeMax ?? ""}`
                  : ""}
              </span>
              {appliedRangeMin !== null || appliedRangeMax !== null ? (
                <X
                  size={14}
                  className="flex-shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRangeAmountMin("");
                    setRangeAmountMax("");
                    setAppliedRangeMin(null);
                    setAppliedRangeMax(null);
                    setShowRangeAmountMenu(false);
                    setCurrentPage(1);
                  }}
                />
              ) : (
                <ChevronDown
                  size={14}
                  className={`flex-shrink-0 transition-transform ${showRangeAmountMenu ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {showRangeAmountMenu && (
              <div className="absolute left-0 top-[32px] z-50 min-w-[230px] rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                <p className="mb-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Amount without VAT range
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="font-montserrat text-[11px] text-[#7288A3]">
                      From
                    </label>
                    <input
                      type="number"
                      value={rangeAmountMin}
                      onChange={(e) => setRangeAmountMin(e.target.value)}
                      placeholder="Min"
                      className="w-full px-2 py-1.5 border border-[#D3E1EC] rounded text-[13px] font-montserrat text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="font-montserrat text-[11px] text-[#7288A3]">
                      To
                    </label>
                    <input
                      type="number"
                      value={rangeAmountMax}
                      onChange={(e) => setRangeAmountMax(e.target.value)}
                      placeholder="Max"
                      className="w-full px-2 py-1.5 border border-[#D3E1EC] rounded text-[13px] font-montserrat text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setAppliedRangeMin(
                          rangeAmountMin !== ""
                            ? parseFloat(rangeAmountMin)
                            : null,
                        );
                        setAppliedRangeMax(
                          rangeAmountMax !== ""
                            ? parseFloat(rangeAmountMax)
                            : null,
                        );
                        setCurrentPage(1);
                        setShowRangeAmountMenu(false);
                      }}
                      className="h-8 flex-1 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006D91]"
                    >
                      Apply
                    </button>
                    {(appliedRangeMin !== null || appliedRangeMax !== null) && (
                      <button
                        onClick={() => {
                          setRangeAmountMin("");
                          setRangeAmountMax("");
                          setAppliedRangeMin(null);
                          setAppliedRangeMax(null);
                          setCurrentPage(1);
                          setShowRangeAmountMenu(false);
                        }}
                        className="h-8 rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:bg-[#F8FDFF]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
          {/* Status filter */}
          {activePrimaryFilterKeys.includes("status") && (
            <div ref={statusRef}>
              <SystemDocumentFilterDropdown
                label="Status"
                value={selectedStatus ?? ""}
                options={Array.from(
                  new Set(docs.map((document) => document.status).filter(Boolean)),
                )
                  .sort()
                  .map((status) => ({ value: status, label: status }))}
                open={showStatusMenu}
                onOpenChange={setShowStatusMenu}
                onChange={(value) => {
                  setSelectedStatus(value || null);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
              />
            </div>
          )}
          <OcrSearchField
            ariaLabel="Search documents"
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              setCurrentPage(1);
            }}
          />
          {/* Dynamic filter chips */}
          {Object.entries(dynamicFilters).map(([key, val]) => {
            const col = FILTERABLE_COLUMNS.find((c) => c.key === key);
            if (!col) return null;
            const uniqueVals = Array.from(
              new Set(
                docs
                  .map((d) => String(d[key as keyof Document] ?? ""))
                  .filter(Boolean),
              ),
            ).sort();
            return (
              <div
                key={key}
                ref={(el) => {
                  dynamicFilterRefs.current[key] = el;
                }}
              >
                <SystemDocumentFilterDropdown
                  label={col.label}
                  value={val}
                  options={uniqueVals.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                  open={openDynamicMenu === key}
                  onOpenChange={(open) =>
                    setOpenDynamicMenu(open ? key : null)
                  }
                  onChange={(value) => {
                    setDynamicFilters((current) => ({
                      ...current,
                      [key]: value,
                    }));
                    setCurrentPage(1);
                    setSelectedIds(new Set());
                  }}
                />
              </div>
            );
          })}
          {/* Add filters */}
          <div className="relative" ref={addFilterRef}>
            <button
              type="button"
              aria-label="Add filters"
              onClick={() =>
                setShowAddFilterMenu((v) => {
                  if (!v)
                    setPendingDynamicFilterKeys([
                      ...activePrimaryFilterKeys,
                      ...Object.keys(dynamicFilters),
                    ]);
                  return !v;
                })
              }
              className="flex flex-row items-center gap-1 px-2 py-[5px] bg-[#E5EDF9] rounded"
            >
              <Plus size={16} className="text-[#7288A3]" />
              <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3]">
                Add filters
              </span>
            </button>
            {showAddFilterMenu && (
              <div
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyFilterSelection();
                  }
                }}
                className="absolute top-full mt-1 left-0 bg-white border border-[#D3E1EC] rounded-lg shadow-lg z-20 min-w-[230px] p-1.5"
              >
                <div className="max-h-[280px] overflow-y-auto">
                  {[...PRIMARY_FILTER_COLUMNS, ...FILTERABLE_COLUMNS].map((col) => {
                    const checked = pendingDynamicFilterKeys.includes(col.key);
                    return (
                      <button
                        key={col.key}
                        onClick={() => {
                          setPendingDynamicFilterKeys((current) =>
                            checked
                              ? current.filter((key) => key !== col.key)
                              : [...current, col.key],
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left font-montserrat font-medium text-[13px] text-[#10233A] hover:bg-[#F0F7FA] transition-colors"
                      >
                        <span
                          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                        >
                          {checked && (
                            <Check
                              size={13}
                              strokeWidth={2.5}
                              className="text-white"
                            />
                          )}
                        </span>
                        {col.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-[#E5EDF9] px-2 pt-2">
                  <span className="font-montserrat text-[11px] text-[#7288A3]">
                    Enter to apply
                  </span>
                  <button
                    type="button"
                    onClick={applyFilterSelection}
                    className="h-8 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006D91]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActivePrimaryFilterKeys([]);
              setDynamicFilters({});
              setPendingDynamicFilterKeys([]);
              setSelectedPeriod(null);
              setSelectedCounterparty(null);
              setSelectedCurrency(null);
              setSelectedStatus(null);
              setRangeAmountMin("");
              setRangeAmountMax("");
              setAppliedRangeMin(null);
              setAppliedRangeMax(null);
              setShowAddFilterMenu(false);
              setOpenDynamicMenu(null);
              setShowRangeAmountMenu(false);
              setCurrentPage(1);
              setSelectedIds(new Set());
            }}
            className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
          >
            <X size={15} />
            <span>Clear filters</span>
          </button>
        </div>
        <div className="ml-auto flex h-7 flex-row items-center gap-4 rounded bg-white">
          <ColumnSettingsButton onClick={() => setShowColumnPanel((v) => !v)} />
          <ImportDataButton
            disabled={docs.length === 0}
            onClick={() => importDocuments(docs)}
          />
          <RefreshAllButton onRefresh={() => { void fetchDocs(); }} />
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableRef}
        className="flex flex-col gap-0 overflow-x-auto scrollbar-hide"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg
              className="animate-spin h-6 w-6 text-[#007EA7]"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className={hideRowActions ? "mb-3 flex h-6 min-w-max items-center" : "mb-1 flex min-w-max flex-row items-center gap-0 py-0 pr-2"}>
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 self-start items-center justify-center">
                <input
                  type="checkbox"
                  checked={
                    pageDocs.length > 0 &&
                    pageDocs.every((d) => selectedIds.has(d.id))
                  }
                  onChange={toggleAll}
                  className="w-[18px] h-[18px] rounded border border-[#A1B6C6] accent-[#007EA7] cursor-pointer"
                />
              </div>
              {visibleColumns.map((col, visibleIndex) => {
                const colIdx = activeColumns.findIndex(
                  (c) => c.key === col.key,
                );
                return (
                  <div
                    key={col.key}
                    className={hideRowActions ? `relative flex flex-shrink-0 items-center gap-1 px-3 ${visibleIndex ? "border-l border-[#D3E1EC]" : ""}` : showExpandableDetails && visibleIndex === 0 ? "relative flex flex-shrink-0 items-center px-3" : "flex flex-row items-center flex-shrink-0"}
                    style={hideRowActions || (showExpandableDetails && visibleIndex === 0) ? { width: col.width } : undefined}
                  >
                    <div
                      style={hideRowActions || (showExpandableDetails && visibleIndex === 0) ? undefined : { width: col.width, position: "relative" }}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <span
                        className={`font-montserrat font-medium text-[12px] leading-[18px] truncate ${directionFor(col.key) ? "text-[#10233A]" : "text-[#7288A3]"}`}
                      >
                        {col.label}
                      </span>
                      <ColumnSortButton
                        columnLabel={col.label}
                        direction={directionFor(col.key)}
                        onDirectionChange={(direction) => {
                          changeSort(col.key, direction);
                          setCurrentPage(1);
                        }}
                      />
                      <ResizeHandle
                        onMouseDown={(e) => startResize(colIdx, e)}
                      />
                    </div>
                  </div>
                );
              })}
              {!hideRowActions && (
                <div
                  className={`flex-shrink-0 ${editOnlyActions ? "w-[74px]" : "w-[160px]"}`}
                />
              )}
            </div>

            {/* Rows */}
            <div className="flex flex-col gap-0 min-w-max">
              {pageDocs.map((doc, i) => {
                const isSelected = selectedIds.has(doc.id);
                const isEven = i % 2 === 0;
                return (
                  <Fragment key={doc.id}>
                    <div
                      className={`${hideRowActions ? "group flex h-10 items-center rounded-lg" : "group flex flex-row items-center gap-0 rounded-lg pr-2"} transition-colors ${
                        isSelected
                          ? "bg-[#EEF6FA]"
                          : isEven
                            ? "bg-[#F8FDFF]"
                            : "bg-white"
                      } hover:bg-[#EEF6FA]`}
                    >
                      <div className="flex w-[42px] flex-shrink-0 items-center justify-center py-[9px]">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(doc.id)}
                          className="w-[18px] h-[18px] rounded border border-[#A1B6C6] accent-[#007EA7] cursor-pointer"
                        />
                      </div>
                      {visibleColumns.map((col, visibleIndex) => (
                        <div
                          key={col.key}
                          className={hideRowActions ? "flex-shrink-0 overflow-hidden px-3" : showExpandableDetails && visibleIndex === 0 ? "flex flex-shrink-0 items-center px-3" : "flex flex-row items-center flex-shrink-0"}
                          style={hideRowActions || (showExpandableDetails && visibleIndex === 0) ? { width: col.width } : undefined}
                        >
                          {showExpandableDetails && visibleIndex === 0 && doc.hasProductDetails && (
                            <button
                              type="button"
                              title={expandedDocumentIds.has(doc.id) ? "Collapse document details" : "Expand document details"}
                              aria-label={`${expandedDocumentIds.has(doc.id) ? "Collapse" : "Expand"} document details ${doc.fileCase}`}
                              aria-expanded={expandedDocumentIds.has(doc.id)}
                              onClick={() => toggleDocumentDetails(doc.id)}
                              className="-ml-2 mr-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[#8AA0B8] transition-colors hover:bg-[#EAF4F8] hover:text-[#007EA7]"
                            >
                              <ChevronRight
                                size={15}
                                strokeWidth={1.8}
                                className={`transition-transform ${expandedDocumentIds.has(doc.id) ? "rotate-90" : ""}`}
                              />
                            </button>
                          )}
                          <div
                            style={hideRowActions || (showExpandableDetails && visibleIndex === 0) ? undefined : { width: col.width }}
                            className={hideRowActions ? "min-w-0" : showExpandableDetails && visibleIndex === 0 ? "min-w-0 flex-1 py-[9px]" : "py-[9px]"}
                          >
                            {col.key === "status" ? (
                              hideRowActions ? (
                                <span className="flex min-w-0 items-center gap-2 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                                  <span
                                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                    style={{ background: STATUS_COLORS[doc.status] }}
                                  />
                                  <span className="truncate">{doc.status}</span>
                                </span>
                              ) : (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStatusDropdownDocId((prev) =>
                                      prev === doc.id ? null : doc.id,
                                    );
                                  }}
                                  className="flex flex-row items-center gap-1 hover:opacity-75 transition-opacity"
                                >
                                  <div
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{
                                      background: STATUS_COLORS[doc.status],
                                    }}
                                  />
                                  <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
                                    {doc.status}
                                  </span>
                                </button>
                                {statusDropdownDocId === doc.id && (
                                  <div
                                    className="absolute top-full mt-1 left-0 bg-white border border-[#D3E1EC] rounded-lg shadow-lg z-30 overflow-hidden"
                                    style={{ minWidth: 160 }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {STATUSES.map((s) => (
                                      <button
                                        key={s}
                                        onClick={() =>
                                          handleStatusChange(doc, s)
                                        }
                                        className={`w-full flex items-center gap-2 px-3 py-2 font-montserrat text-[12px] hover:bg-[#F0F7FA] transition-colors text-left ${doc.status === s ? "text-[#007EA7] font-semibold" : "text-[#10233A]"}`}
                                      >
                                        <div
                                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                          style={{
                                            background: STATUS_COLORS[s],
                                          }}
                                        />
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              )
                            ) : col.key === "fileCase" ? (
                              <a
                                href="#"
                                className="font-montserrat font-normal text-[12px] leading-[18px] text-[#007EA7] underline block truncate"
                              >
                                {doc[col.key as keyof Document] as string}
                              </a>
                            ) : col.key === "number" ? (
                              <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] block truncate">
                                {numberWithoutSeries(doc.number, doc.series)}
                              </span>
                            ) : col.key === "clientCounterparty" ||
                              col.key === "counterpartyCode" ? (
                              <span className="block truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                                {(col.key === "clientCounterparty"
                                  ? doc.clientCounterparty
                                  : doc.counterpartyCode) || "—"}
                              </span>
                            ) : LOOKUP_COL_MAP[col.key as keyof Document] ? (
                              <LookupCellDropdown
                                docId={doc.id}
                                companyId={doc.companyId}
                                generalLedgerName={generalLedgerName}
                                colKey={col.key}
                                value={String(
                                  documentCellValue(
                                    doc,
                                    col.key as keyof Document,
                                  ) ?? "",
                                )}
                                lookupType={
                                  LOOKUP_COL_MAP[col.key as keyof Document]!
                                }
                                width={col.width}
                                onSave={updateDocField}
                                tableSelect
                                disabled={doc.hasProductDetails}
                                onOpenGeneralLedger={onOpenGeneralLedger}
                              />
                            ) : (
                              <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] block truncate">
                                {String(
                                  documentCellValue(
                                    doc,
                                    col.key as keyof Document,
                                  ) ?? "",
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {hideRowActions ? null : editOnlyActions ? (
                        <div className="ml-2 flex w-[74px] flex-shrink-0 items-center justify-end gap-1">
                          <button
                            type="button"
                            title="EDIT"
                            aria-label={`EDIT ${doc.fileCase}`}
                            onClick={() => {
                              setViewDoc(null);
                              setOpenDoc(doc);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="VIEW"
                            aria-label={`VIEW ${doc.fileCase}`}
                            onClick={() => {
                              setOpenDoc(null);
                              setViewDoc(doc);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="ml-2 flex w-[160px] flex-shrink-0 flex-row items-center justify-end gap-1">
                          <button
                            type="button"
                            title="EDIT"
                            aria-label={`EDIT ${doc.fileCase}`}
                            onClick={() => {
                              setViewDoc(null);
                              setOpenDoc(doc);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="VIEW"
                            aria-label={`VIEW ${doc.fileCase}`}
                            onClick={() => {
                              setOpenDoc(null);
                              setViewDoc(doc);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            title="COPY"
                            aria-label={`COPY ${doc.fileCase || doc.number || doc.id}`}
                            onClick={() => {
                              setDuplicateSource(doc);
                              setPresetCreateDocumentType("");
                              setShowCreateModal(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                          >
                            <Copy size={14} />
                          </button>
                          <ImportOneButton
                            recordLabel={doc.fileCase || doc.id}
                            onClick={() => importDocuments([doc])}
                          />
                        </div>
                      )}
                    </div>
                    {showExpandableDetails &&
                      doc.hasProductDetails &&
                      expandedDocumentIds.has(doc.id) && (
                        <ExpandedDocumentLines
                          document={doc}
                          parentColumns={visibleColumns}
                          generalLedgerName={generalLedgerName}
                          onOpenGeneralLedger={onOpenGeneralLedger}
                          onSharedSave={updateDocField}
                          onProductGroupSave={updateLineItemProductGroup}
                          onLineLookupSave={updateDocumentLineLookup}
                        />
                      )}
                  </Fragment>
                );
              })}
            </div>
          </>
        )}
      </div>

      <HorizontalTableScrollbar scrollRef={tableRef} />

      {/* Pagination */}
      <div className="flex flex-row items-center justify-between mt-2">
        {/* Page numbers */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          itemCount={totalDocs}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onShowMore={() => changeItemsPerPage(itemsPerPage === 8 ? 15 : 8)}
          showMoreLabel={itemsPerPage === 8 ? "Show more" : "Default"}
        />
      </div>

      {/* Column settings overlay + panel */}
      {showColumnPanel && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowColumnPanel(false)}
          />
          <ColumnSettingsPanel
            columns={activeColumns}
            onSave={(cols) => setActiveColumns(cols)}
            onClose={() => setShowColumnPanel(false)}
          />
        </>
      )}

      {/* Upload document panel */}
      {showUploadPanel && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setShowUploadPanel(false)}
          />
          <div
            className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white overflow-y-auto"
            style={{
              width: 340,
              boxShadow: "-2px 0px 0px #E5EDF9",
              padding: "24px 24px 32px",
              gap: 24,
              display: "flex",
            }}
          >
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-2 flex-shrink-0">
              <div className="flex flex-row items-center gap-1">
                <span className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
                  Upload new file
                </span>
                <AlertCircle
                  size={24}
                  className="text-[#A1B6C6] flex-shrink-0"
                />
              </div>
              <button onClick={() => setShowUploadPanel(false)}>
                <X
                  size={24}
                  className="text-[#7288A3] hover:text-[#10233A] transition-colors"
                />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-8 flex-1">
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length)
                    setUploadFiles((prev) => [...prev, ...files]);
                }}
                className="flex flex-col items-center justify-center gap-6 rounded-lg cursor-pointer transition-colors"
                style={{
                  padding: 32,
                  border: `1px dashed ${dragOver ? "#007EA7" : "#7288A3"}`,
                  background: dragOver ? "#F0F9FF" : "#FFFFFF",
                  minHeight: 164,
                }}
              >
                <Upload size={28} className="text-[#7288A3] flex-shrink-0" />
                <span className="font-montserrat font-medium italic text-[16px] leading-6 text-[#7288A3] text-center">
                  {uploadFiles.length > 0
                    ? uploadFiles.map((f) => f.name).join(", ")
                    : "Click to browse files or drag & drop files here"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length)
                    setUploadFiles((prev) => [...prev, ...files]);
                  e.target.value = "";
                }}
              />

              {/* Selects */}
              <div className="flex flex-col gap-6">
                {/* Document type */}
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">
                    Document type
                  </span>
                  <div className="flex flex-row justify-between items-center px-[14px] py-[11px] border border-[#D3E1EC] rounded-lg bg-white cursor-pointer">
                    <span
                      className={`font-montserrat font-medium text-[14px] leading-5 ${uploadDocType ? "text-[#10233A]" : "text-[#A1B6C6]"}`}
                    >
                      {uploadDocType || "Select document type"}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-[#7288A3] flex-shrink-0"
                    />
                  </div>
                </div>

                {/* Company */}
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">
                    Company
                  </span>
                  <div className="flex flex-row justify-between items-center px-[14px] py-[11px] border border-[#D3E1EC] rounded-lg bg-white cursor-pointer">
                    <span
                      className={`font-montserrat font-medium text-[14px] leading-5 ${uploadCompany ? "text-[#10233A]" : "text-[#A1B6C6]"}`}
                    >
                      {uploadCompany || "Select company"}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-[#7288A3] flex-shrink-0"
                    />
                  </div>
                </div>

                {/* Date period */}
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">
                    Operation type
                  </span>
                  <div className="flex flex-row justify-between items-center px-[14px] py-[11px] border border-[#D3E1EC] rounded-lg bg-white cursor-pointer">
                    <span
                      className={`font-montserrat font-medium text-[14px] leading-5 ${uploadDatePeriod ? "text-[#10233A]" : "text-[#A1B6C6]"}`}
                    >
                      {uploadDatePeriod || "Select operation type"}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-[#7288A3] flex-shrink-0"
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-4 mt-auto">
                <button
                  disabled={uploadFiles.length === 0}
                  className="flex flex-row justify-center items-center px-4 py-[9px] rounded-lg font-montserrat font-semibold text-[16px] leading-6 transition-colors"
                  style={{
                    background: uploadFiles.length > 0 ? "#007EA7" : "#F5F5F5",
                    color: uploadFiles.length > 0 ? "#FFFFFF" : "#B4B6B8",
                  }}
                >
                  Upload document
                </button>
                <button
                  onClick={() => setShowUploadPanel(false)}
                  className="flex flex-row justify-center items-center px-4 py-[9px] rounded-lg font-montserrat font-semibold text-[16px] leading-6 border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#7288A3] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {openDoc && (
        <DocumentDetailPanel
          doc={openDoc}
          companyName={companyName}
          generalLedgerName={generalLedgerName}
          onOpenGeneralLedger={onOpenGeneralLedger}
          onClose={() => setOpenDoc(null)}
          onImageUpload={(docId, imageUrl) => {
            setDocs((prev) =>
              prev.map((d) => (d.id === docId ? { ...d, imageUrl } : d)),
            );
            setOpenDoc((prev) =>
              prev && prev.id === docId ? { ...prev, imageUrl } : prev,
            );
          }}
          onSaved={(docId, values) => {
            setDocs((prev) =>
              prev.map((d) => (d.id === docId ? { ...d, ...values } : d)),
            );
            setOpenDoc((prev) =>
              prev && prev.id === docId ? { ...prev, ...values } : prev,
            );
          }}
        />
      )}
      {viewDoc && (
          <CreateDocumentModal
            companyId={companyId}
            companyName={companyName}
            sectionName={title}
            generalLedgerName={generalLedgerName}
            onOpenGeneralLedger={onOpenGeneralLedger}
            initialData={documentFormData(viewDoc, true)}
            initialFinancialLines={documentFinancialLines(viewDoc)}
            initialLineItems={viewDoc.lineItems}
            initialSummaryLineItems={viewDoc.summaryLineItems}
            initialFinancialLineMode={
              viewDoc.lineItems.length > 0 ? "quantity" : "summary"
            }
            initialImageUrl={viewDoc.imageUrl}
            viewOnly
            viewActions={
              /accounting[\s_-]*note/i.test(viewDoc.documentType)
                ? undefined
                : {
                    onSend: () => setViewActionPanel("send"),
                    onPreview: () => setViewActionPanel("preview"),
                    onStartChat: () =>
                      onStartChat?.({
                        storageKey: `${companyName}:${viewDoc.number || viewDoc.fileCase || "document"}`,
                        title: `${companyName} / ${viewDoc.number || viewDoc.fileCase || "Document"}`,
                        companyName,
                        subject:
                          viewDoc.number || viewDoc.fileCase || "Document",
                        sourceType: "Document",
                      }),
                  }
            }
            onClose={() => {
              setViewActionPanel(null);
              setViewDoc(null);
              if (viewDoc.id === entryDocumentIdRef.current) {
                entryDocumentIdRef.current = null;
                onInitialViewBack?.();
              }
            }}
            onCreated={() => undefined}
          />
      )}

      {viewDoc && viewActionPanel === "preview" && (
        <InvoicePaymentPreviewPanel
          invoiceNumber={viewDoc.number || viewDoc.fileCase || "Document"}
          total={viewedDocumentTotal}
          currency={viewDoc.currency || "EUR"}
          onClose={() => setViewActionPanel(null)}
        />
      )}

      {viewDoc && viewActionPanel === "send" && (
        <SendInvoicePanel
          invoice={{
            id: viewDoc.id,
            number: viewDoc.number || viewDoc.fileCase || "Document",
            buyer: viewDoc.clientCounterparty,
            totalAmount: viewedDocumentTotal,
            currency: viewDoc.currency || "EUR",
          }}
          organizationId={companyId}
          senderName={companyName}
          senderEmail={company?.email}
          senderDetails={{
            name: company?.name || companyName,
            companyCode: company?.company_code,
            vatCode: company?.vat_code,
            address: company?.address,
            email: company?.email,
            phone: company?.phone,
          }}
          recipientName={
            viewedCounterparty?.name || viewDoc.clientCounterparty
          }
          recipientEmail={viewedCounterparty?.email || ""}
          recipientDetails={{
            name: viewedCounterparty?.name || viewDoc.clientCounterparty,
            companyCode:
              viewedCounterparty?.company_code || viewDoc.counterpartyCode,
            vatCode: viewedCounterparty?.vat_code,
            address: viewedCounterparty?.address,
            email: viewedCounterparty?.email,
            phone: viewedCounterparty?.phone,
          }}
          reconciliationDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setViewActionPanel(null)}
        />
      )}

      {/* Export drawer */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="relative h-full w-[340px] bg-white flex flex-col gap-6 px-6 pt-6 pb-8 overflow-y-auto"
            style={{ boxShadow: "-2px 0px 0px #E5EDF9" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-row justify-between items-center">
              <span className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
                EXPORTDATA
              </span>
              <button
                onClick={() => setExportOpen(false)}
                className="text-[#7288A3] hover:text-[#10233A] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 bg-[#F2F5F9] rounded-lg p-3">
                <div className="flex flex-col gap-2">
                  {[
                    {
                      label: "Records to export",
                      value: docs.length.toLocaleString(),
                    },
                    {
                      label: "Visible columns",
                      value: visibleColumns.length.toLocaleString(),
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col">
                      <span className="font-montserrat font-semibold text-[12px] leading-[140%] text-[#10233A]">
                        {item.label}
                      </span>
                      <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] mt-[2px]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                  File format type <span className="text-red-500">*</span>
                </span>
                <SearchableSelect ariaLabel="File format type" value={exportFormat} onChange={setExportFormat} placeholder="Select format" options={[{ value: "csv", label: "CSV" }, { value: "xlsx", label: "XLSX" }, { value: "pdf", label: "PDF" }]} />
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-auto">
              <button
                data-system-action="true"
                className="w-full h-[42px] flex items-center justify-center bg-[#007EA7] rounded-lg hover:bg-[#006b8f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleExport}
                disabled={!exportFormat}
              >
                <span className="font-montserrat font-semibold text-[16px] leading-6 text-white">
                  EXPORT
                </span>
              </button>
              <button
                onClick={() => setExportOpen(false)}
                className="w-full h-[42px] flex items-center justify-center bg-white border-2 border-[#D3E1EC] rounded-lg hover:border-[#007EA7] transition-colors"
              >
                <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3]">
                  Cancel
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateDocumentModal
          companyId={companyId}
          companyName={companyName}
          sectionName={title}
          generalLedgerName={generalLedgerName}
          onOpenGeneralLedger={onOpenGeneralLedger}
          presetDocumentType={presetCreateDocumentType}
          initialData={
            duplicateSource ? documentFormData(duplicateSource) : undefined
          }
          initialFinancialLines={
            duplicateSource
              ? documentFinancialLines(duplicateSource)
              : undefined
          }
          initialLineItems={duplicateSource?.lineItems}
          initialSummaryLineItems={duplicateSource?.summaryLineItems}
          initialFinancialLineMode={
            duplicateSource
              ? duplicateSource.lineItems.length > 0
                ? "quantity"
                : "summary"
              : undefined
          }
          initialImageUrl={duplicateSource?.imageUrl}
          onClose={() => {
            setShowCreateModal(false);
            setDuplicateSource(null);
            setPresetCreateDocumentType("");
          }}
          onCreated={() => {
            setShowCreateModal(false);
            setDuplicateSource(null);
            setPresetCreateDocumentType("");
            fetchDocs();
          }}
        />
      )}
    </div>
  );
}
