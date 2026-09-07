import { useMemo, useRef, useState } from "react";
import { ChevronDown, Download, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import SystemAddFilters from "./SystemAddFilters";
import { HeaderBackButton } from "./SystemNavigation";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import { usePersistentState } from "../hooks/usePersistentState";

type TrialBalanceRow = {
  code: string;
  name: string;
  level: number;
  summary?: boolean;
  openingDebit: number;
  openingCredit: number;
  turnoverDebit: number;
  turnoverCredit: number;
  closingDebit: number;
  closingCredit: number;
};

type TrialBalanceColumnKey =
  | "account"
  | "openingDebit"
  | "openingCredit"
  | "turnoverDebit"
  | "turnoverCredit"
  | "closingDebit"
  | "closingCredit";

type ExportFormat = "PDF" | "CSV" | "Excel";

const TRIAL_BALANCE_COLUMNS: ColConfig[] = [
  { key: "account", label: "Account code / Name", width: 390, visible: true },
  { key: "openingDebit", label: "Opening balance / Debit", width: 168, visible: true },
  { key: "openingCredit", label: "Opening balance / Credit", width: 168, visible: true },
  { key: "turnoverDebit", label: "Turnover / Debit", width: 152, visible: true },
  { key: "turnoverCredit", label: "Turnover / Credit", width: 152, visible: true },
  { key: "closingDebit", label: "Closing balance / Debit", width: 168, visible: true },
  { key: "closingCredit", label: "Closing balance / Credit", width: 168, visible: true },
];

const row = (
  code: string,
  name: string,
  level: number,
  values: [number, number, number, number, number, number],
  summary = false,
): TrialBalanceRow => ({
  code,
  name,
  level,
  summary,
  openingDebit: values[0],
  openingCredit: values[1],
  turnoverDebit: values[2],
  turnoverCredit: values[3],
  closingDebit: values[4],
  closingCredit: values[5],
});

const TRIAL_BALANCE_ROWS: TrialBalanceRow[] = [
  row("1", "NON-CURRENT ASSETS", 0, [30954.35, 0, 0, 0, 30954.35, 0], true),
  row("11", "Intangible assets", 1, [12934.11, 0, 0, 0, 12934.11, 0], true),
  row("114", "Concessions, patents, licences, trademarks and similar rights", 2, [12934.11, 0, 0, 0, 12934.11, 0], true),
  row("1140", "Acquisition cost of concessions, patents, licences and trademarks", 3, [14795.89, 0, 0, 0, 14795.89, 0]),
  row("1148", "Amortisation of concessions, patents, licences and trademarks (-)", 3, [0, 1861.78, 0, 0, 0, 1861.78]),
  row("12", "Property, plant and equipment", 1, [2605.29, 0, 0, 0, 2605.29, 0], true),
  row("124", "Other equipment, devices and tools", 2, [2605.29, 0, 0, 0, 2605.29, 0], true),
  row("1240", "Acquisition cost of other equipment, devices and tools", 3, [2978, 0, 0, 0, 2978, 0]),
  row("1247", "Depreciation of other equipment, devices and tools (-)", 3, [0, 372.71, 0, 0, 0, 372.71]),
  row("17", "Other non-current assets", 1, [15414.95, 0, 0, 0, 15414.95, 0], true),
  row("171", "Deferred tax assets", 2, [15414.95, 0, 0, 0, 15414.95, 0]),
  row("2", "CURRENT ASSETS", 0, [888198.67, 0, 34, 7226.6, 881006.07, 0], true),
  row("20", "Inventories", 1, [439296.28, 0, 0, 0, 439296.28, 0], true),
  row("202", "Work in progress", 2, [364435.01, 0, 0, 0, 364435.01, 0], true),
  row("2021", "Work in progress", 3, [364435.01, 0, 0, 0, 364435.01, 0], true),
  row("20210", "Cost of work in progress", 4, [364435.01, 0, 0, 0, 364435.01, 0]),
  row("204", "Goods purchased for resale", 2, [64952.03, 0, 0, 0, 64952.03, 0], true),
  row("2040", "Acquisition cost of goods purchased for resale", 3, [64952.03, 0, 0, 0, 64952.03, 0]),
  row("208", "Prepayments", 2, [9909.24, 0, 0, 0, 9909.24, 0], true),
  row("2080", "Prepayments to suppliers", 3, [9909.24, 0, 0, 0, 9909.24, 0]),
  row("24", "Amounts receivable within one year", 1, [430563.98, 0, 34, 0, 430597.98, 0], true),
  row("241", "Trade receivables", 2, [425931.36, 0, 0, 0, 425931.36, 0], true),
  row("2410", "Trade receivables", 3, [425931.36, 0, 0, 0, 425931.36, 0]),
  row("244", "Other receivables", 2, [4632.62, 0, 34, 0, 4666.62, 0], true),
  row("2441", "Value added tax receivable", 3, [4598.62, 0, 0, 0, 4598.62, 0]),
  row("2442", "Corporate income tax paid in advance", 3, [34, 0, 34, 0, 68, 0]),
  row("27", "Cash and cash equivalents", 1, [0, 75907.62, 0, 0, 0, 75907.62], true),
  row("271", "SEB 5900", 2, [0, 80523.84, 0, 0, 0, 80523.84]),
  row("2710", "SEB 5734", 2, [1105.5, 0, 0, 0, 1105.5, 0]),
  row("2711", "PaySera", 2, [0, 95.97, 0, 0, 0, 95.97]),
  row("273", "Cash in transit", 2, [3606.69, 0, 0, 0, 3606.69, 0]),
  row("29", "Prepayments and accrued income", 1, [94246.03, 0, 0, 7226.6, 87019.43, 0], true),
  row("291", "Prepayments", 2, [94246.03, 0, 0, 7226.6, 87019.43, 0]),
  row("3", "EQUITY", 0, [0, 21999.95, 0, 0, 0, 21999.95], true),
  row("30", "Capital", 1, [0, 2500, 0, 0, 0, 2500], true),
  row("301", "Subscribed capital", 2, [0, 2500, 0, 0, 0, 2500], true),
  row("3011", "Ordinary shares", 3, [0, 2500, 0, 0, 0, 2500]),
  row("34", "Retained earnings (loss)", 1, [58958.23, 0, 0, 0, 58958.23, 0], true),
  row("342", "Retained earnings (loss) of previous years", 2, [58958.23, 0, 0, 0, 58958.23, 0], true),
  row("3421", "Profit (loss) recognised in the report of previous years", 3, [58958.23, 0, 0, 0, 58958.23, 0]),
  row("390", "General account summary", 1, [0, 78458.18, 0, 0, 0, 78458.18]),
  row("4", "LIABILITIES", 0, [0, 1037713.26, 0, 34, 0, 1037747.26], true),
  row("44", "Amounts payable within one year and other current liabilities", 1, [0, 1027213.26, 0, 34, 0, 1027247.26], true),
  row("441", "Amounts owed to credit institutions", 2, [0, 380000, 0, 0, 0, 380000], true),
  row("4412", "Loans (credit line)", 3, [0, 380000, 0, 0, 0, 380000]),
  row("442", "Advances received", 2, [0, 1156.94, 0, 0, 0, 1156.94], true),
  row("4420", "Advances received from customers", 3, [0, 1156.94, 0, 0, 0, 1156.94]),
  row("443", "Trade payables", 2, [0, 234800.68, 0, 0, 0, 234800.68], true),
  row("4430", "Amounts owed to suppliers for goods and services", 3, [0, 234800.68, 0, 0, 0, 234800.68]),
  row("447", "Corporate income tax liabilities", 2, [0, 19175, 0, 34, 0, 19209], true),
  row("4470", "Corporate income tax liabilities", 3, [0, 19141, 0, 0, 0, 19141]),
  row("4472", "Advance corporate income tax liabilities", 3, [0, 34, 0, 34, 0, 68]),
  row("448", "Employment-related liabilities", 2, [0, 357095.43, 0, 0, 0, 357095.43], true),
  row("4480", "Wages payable", 3, [0, 106843.53, 0, 0, 0, 106843.53]),
  row("4481", "Personal income tax payable", 3, [0, 72050.66, 0, 0, 0, 72050.66]),
  row("4482", "Social insurance contributions payable", 3, [0, 83415.47, 0, 0, 0, 83415.47]),
  row("4485", "Accrued holiday pay", 3, [0, 93137.24, 0, 0, 0, 93137.24]),
  row("4487", "Social insurance tax on accrued holiday pay", 3, [0, 1648.53, 0, 0, 0, 1648.53]),
  row("449", "Other amounts payable", 2, [0, 34985.21, 0, 0, 0, 34985.21], true),
  row("4492", "Value added tax payable", 3, [0, 34517.24, 0, 0, 0, 34517.24]),
  row("44921", "VAT payable, Article 96", 4, [0, 5.97, 0, 0, 0, 5.97]),
  row("44923", "Reverse charge VAT payable from the EU", 4, [0, 462, 0, 0, 0, 462]),
  row("49", "Accrued expenses and deferred income", 1, [0, 10500, 0, 0, 0, 10500], true),
  row("491", "Accrued expenses", 2, [0, 10500, 0, 0, 0, 10500]),
  row("5", "REVENUE", 0, [0, 1292773.98, 0, 0, 0, 1292773.98], true),
  row("50", "Sales revenue", 1, [0, 1292773.98, 0, 0, 0, 1292773.98], true),
  row("500", "Revenue from goods and services", 2, [0, 1294735.06, 0, 0, 0, 1294735.06], true),
  row("5000", "Revenue from goods sold", 3, [0, 224508.89, 0, 0, 0, 224508.89]),
  row("5001", "Revenue from services rendered", 3, [0, 988417.69, 0, 0, 0, 988417.69]),
  row("5002", "Revenue from rental services", 3, [0, 3681.17, 0, 0, 0, 3681.17]),
  row("5003", "Card revenue", 3, [0, 14590.63, 0, 0, 0, 14590.63]),
  row("5008", "Revenue from resold licences", 3, [0, 63536.68, 0, 0, 0, 63536.68]),
  row("509", "Discounts and returns (-)", 2, [1961.08, 0, 0, 0, 1961.08, 0]),
  row("6", "EXPENSES", 0, [1433334.17, 0, 7226.6, 0, 1440560.77, 0], true),
  row("60", "Cost of sales", 1, [1113160.35, 0, 5337.68, 0, 1118498.03, 0], true),
  row("600", "Cost of goods sold and services rendered", 2, [1113160.35, 0, 5337.68, 0, 1118498.03, 0], true),
  row("6000", "Cost of goods sold", 3, [210378.48, 0, 0, 0, 210378.48, 0]),
  row("60003", "Direct employee expenses", 3, [628023.41, 0, 0, 0, 628023.41, 0], true),
  row("600030", "Direct employee expenses - ITSM", 4, [581577.87, 0, 0, 0, 581577.87, 0], true),
  row("6003", "Direct employee salary costs - ITSM", 5, [542855.87, 0, 0, 0, 542855.87, 0]),
  row("60031", "Employer social insurance costs - ITSM", 5, [11002.63, 0, 0, 0, 11002.63, 0]),
  row("60033", "Employee bonus costs - ITSM", 5, [27719.37, 0, 0, 0, 27719.37, 0]),
  row("6001", "Cost of services rendered", 3, [151022.53, 0, 0, 0, 151022.53, 0]),
  row("6002", "Cost of purchased goods and services", 3, [40, 0, 0, 0, 40, 0]),
  row("63", "General and administrative expenses", 1, [309515.34, 0, 1888.92, 0, 311404.26, 0], true),
  row("6300", "Rental expenses", 2, [19368.44, 0, 0, 0, 19368.44, 0]),
  row("6301", "Repair and maintenance expenses", 2, [5598.55, 0, 0, 0, 5598.55, 0]),
  row("63040", "Employee remuneration and related expenses", 2, [209907.07, 0, 0, 0, 209907.07, 0], true),
  row("630402", "Employee remuneration - administration", 3, [116692.86, 0, 0, 0, 116692.86, 0], true),
  row("6304", "Employee salary costs - administration", 4, [110214.6, 0, 0, 0, 110214.6, 0]),
  row("63043", "Employer social insurance costs - administration", 4, [2153.26, 0, 0, 0, 2153.26, 0]),
  row("63044", "Bonus expenses - administration", 4, [4325, 0, 0, 0, 4325, 0]),
  row("63041", "Employee holiday expenses", 3, [49978.85, 0, 0, 0, 49978.85, 0]),
  row("630410", "Employee sick pay for the first two days", 3, [5524.44, 0, 0, 0, 5524.44, 0]),
  row("63042", "Employee family-day expenses", 3, [13670.38, 0, 0, 0, 13670.38, 0]),
  row("6314", "Accounting expenses", 2, [12037.27, 0, 0, 0, 12037.27, 0]),
  row("6317", "Advertising expenses", 2, [496.66, 0, 0, 0, 496.66, 0]),
  row("6319", "Bank commission expenses", 2, [330.45, 0, 0, 0, 330.45, 0]),
  row("6325", "Licence expenses", 2, [46333.23, 0, 1806.55, 0, 48139.78, 0]),
  row("68", "Interest and other similar expenses", 1, [10658.48, 0, 0, 0, 10658.48, 0], true),
  row("6802", "Interest expense on loans granted by other companies", 2, [10500, 0, 0, 0, 10500, 0]),
  row("6803", "Negative effect of foreign exchange rate changes", 2, [154.88, 0, 0, 0, 154.88, 0]),
  row("6804", "Fines and penalties expense", 2, [3.6, 0, 0, 0, 3.6, 0]),
];

const TOTALS = [2496260.8, 2496260.8, 7260.6, 7260.6, 2496948.8, 2496948.8];

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function reportFileStem(companyName: string, from: string, to: string) {
  return `${companyName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-trial-balance-${from}-${to}`;
}

function trialBalanceValue(row: TrialBalanceRow, key: TrialBalanceColumnKey) {
  return key === "account" ? `${row.code} ${row.name}` : row[key];
}

function trialBalanceDisplayValue(row: TrialBalanceRow, key: TrialBalanceColumnKey) {
  const value = trialBalanceValue(row, key);
  return typeof value === "number" ? formatAmount(value) : value;
}

function exportExcel(rows: TrialBalanceRow[], companyName: string, from: string, to: string) {
  const data: Array<Array<string | number>> = [
    ["Trial Balance", "", "", "", "", "", "", ""],
    ["Company", companyName],
    ["Period", `${displayDate(from)} - ${displayDate(to)}`],
    ["Currency", "EUR"],
    [],
    ["Account code", "Account name", "Opening balance", "", "Turnover during period", "", "Closing balance", ""],
    ["", "", "Debit", "Credit", "Debit", "Credit", "Debit", "Credit"],
    ...rows.map((item) => [
      item.code,
      item.name,
      item.openingDebit,
      item.openingCredit,
      item.turnoverDebit,
      item.turnoverCredit,
      item.closingDebit,
      item.closingCredit,
    ]),
    ["", "Total", ...TOTALS],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:H1"),
    XLSX.utils.decode_range("C6:D6"),
    XLSX.utils.decode_range("E6:F6"),
    XLSX.utils.decode_range("G6:H6"),
  ];
  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 58 },
    { wch: 17 },
    { wch: 17 },
    { wch: 17 },
    { wch: 17 },
    { wch: 17 },
    { wch: 17 },
  ];
  worksheet["!freeze"] = { xSplit: 2, ySplit: 7 };
  for (let rowIndex = 7; rowIndex < data.length; rowIndex += 1) {
    for (let columnIndex = 2; columnIndex <= 7; columnIndex += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell) cell.z = "#,##0.00";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trial Balance");
  XLSX.writeFile(workbook, `${reportFileStem(companyName, from, to)}.xlsx`);
}

function exportCsv(rows: TrialBalanceRow[], companyName: string, from: string, to: string) {
  const escapeCell = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;
  const csvRows: Array<Array<string | number>> = [
    ["Account code", "Account name", "Opening debit", "Opening credit", "Turnover debit", "Turnover credit", "Closing debit", "Closing credit"],
    ...rows.map((item) => [
      item.code,
      item.name,
      item.openingDebit,
      item.openingCredit,
      item.turnoverDebit,
      item.turnoverCredit,
      item.closingDebit,
      item.closingCredit,
    ]),
    ["", "Total", ...TOTALS],
  ];
  const csv = csvRows.map((csvRow) => csvRow.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reportFileStem(companyName, from, to)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPdf(rows: TrialBalanceRow[], companyName: string, from: string, to: string, companyLogo?: string) {
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const headingX = companyLogo ? 36 : 14;

  if (companyLogo) {
    const format = companyLogo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    document.addImage(companyLogo, format, 14, 5, 16, 12);
  }

  document.setTextColor(16, 35, 58);
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.text("Trial Balance", headingX, 10);
  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  document.setTextColor(114, 136, 163);
  document.text(companyName, headingX, 16);
  document.text(`${displayDate(from)} - ${displayDate(to)} | EUR`, pageWidth - 14, 16, { align: "right" });
  document.setDrawColor(211, 225, 236);
  document.setLineWidth(0.35);
  document.line(14, 22, pageWidth - 14, 22);

  const pdfRows = [
    ...rows.map((item) => [
      `${item.code}  ${item.name}`,
      formatAmount(item.openingDebit),
      formatAmount(item.openingCredit),
      formatAmount(item.turnoverDebit),
      formatAmount(item.turnoverCredit),
      formatAmount(item.closingDebit),
      formatAmount(item.closingCredit),
    ]),
    ["Total", ...TOTALS.map(formatAmount)],
  ];
  const rowsPerPage = 20;

  for (let rowOffset = 0; rowOffset < pdfRows.length; rowOffset += rowsPerPage) {
    if (rowOffset > 0) document.addPage();
    const pageRows = pdfRows.slice(rowOffset, rowOffset + rowsPerPage);

    autoTable(document, {
    startY: rowOffset === 0 ? 28 : 14,
    margin: { top: 14, left: 10, right: 10, bottom: 14 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    head: [[
      "Account code / Name",
      "Opening balance / Debit",
      "Opening balance / Credit",
      "Turnover / Debit",
      "Turnover / Credit",
      "Closing balance / Debit",
      "Closing balance / Credit",
    ]],
    body: pageRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.7,
      lineColor: [229, 237, 249],
      lineWidth: 0.2,
      textColor: [16, 35, 58],
      valign: "middle",
    },
    headStyles: {
      fillColor: [229, 237, 249],
      textColor: [16, 35, 58],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 92, halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (pageRows[data.row.index]?.[0] === "Total") {
        data.cell.styles.fillColor = [16, 35, 58];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "right";
        return;
      }
      data.cell.styles.fillColor =
        data.row.index % 2 === 0 ? [248, 253, 255] : [255, 255, 255];
      data.cell.styles.fontStyle = "normal";
    },
    });
  }

  for (let pageNumber = 1; pageNumber <= document.getNumberOfPages(); pageNumber += 1) {
    document.setPage(pageNumber);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(114, 136, 163);
    document.text(`Finansu Harmonija | Page ${pageNumber}`, pageWidth - 10, document.internal.pageSize.getHeight() - 6, { align: "right" });
  }

  document.save(`${reportFileStem(companyName, from, to)}.pdf`);
}

export default function TrialBalanceReportView({
  companyName,
  companyLogo,
  onBack,
}: {
  companyName: string;
  companyLogo?: string;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("2026-06-01");
  const [to, setTo] = useState("2026-06-30");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormatOpen, setExportFormatOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("PDF");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:columns:trial-balance:${companyName}`,
    TRIAL_BALANCE_COLUMNS,
  );
  const tableRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter((column) => column.visible);
  const filterColumns = useMemo(
    () =>
      TRIAL_BALANCE_COLUMNS.map((column) => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(
            TRIAL_BALANCE_ROWS.map((item) =>
              trialBalanceDisplayValue(item, column.key as TrialBalanceColumnKey),
            ),
          ),
        ).sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
        ),
      })),
    [],
  );
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return TRIAL_BALANCE_ROWS.filter((item) => {
      if (
        needle &&
        !TRIAL_BALANCE_COLUMNS.some((column) =>
          trialBalanceDisplayValue(
            item,
            column.key as TrialBalanceColumnKey,
          )
            .toLocaleLowerCase()
            .includes(needle),
        )
      ) return false;

      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        const value = trialBalanceDisplayValue(
          item,
          key as TrialBalanceColumnKey,
        );
        return selected.length === 0 || selected.includes(value);
      });
    });
  }, [filterKeys, filterValues, query]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    TrialBalanceRow,
    TrialBalanceColumnKey
  >(filteredRows, trialBalanceValue);

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Trial Balance"
        leading={<HeaderBackButton onClick={onBack} label="Back to reports" />}
        actions={
          <div>
            <PageActionButton
              icon={<Download size={15} />}
              onClick={() => setExportOpen(true)}
            >
              Export
            </PageActionButton>
            {exportOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close export panel"
                  className="fixed inset-0 z-40 cursor-default bg-transparent"
                  onClick={() => {
                    setExportOpen(false);
                    setExportFormatOpen(false);
                  }}
                />
                <aside className="fixed inset-y-0 right-0 z-50 flex w-[340px] flex-col overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]">
                  <div className="flex h-8 w-full items-center justify-between gap-2">
                    <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                      Export
                    </h2>
                    <button
                      type="button"
                      aria-label="Close export panel"
                      onClick={() => {
                        setExportOpen(false);
                        setExportFormatOpen(false);
                      }}
                      className="flex h-8 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="mt-6 rounded-lg bg-[#F2F5F9] p-3 font-montserrat text-[12px] leading-[18px] text-[#10233A]">
                    {[
                      ["Period", `${displayDate(from)} — ${displayDate(to)}`],
                      ["Company", companyName],
                      ["Report", "Trial Balance"],
                      ["Currency", "EUR"],
                      ["Records to export", String(sortedRows.length)],
                    ].map(([label, value]) => (
                      <div key={label} className="mb-2 last:mb-0">
                        <div className="font-semibold">{label}</div>
                        <div className="font-normal">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-6">
                    <label className="mb-2 block font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
                      Format
                    </label>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={exportFormatOpen}
                      onClick={() => setExportFormatOpen((current) => !current)}
                      className="flex h-[42px] w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none hover:border-[#A1B6C6] focus:border-[#007EA7]"
                    >
                      {exportFormat}
                      <ChevronDown
                        size={16}
                        className={`text-[#7288A3] transition-transform ${exportFormatOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {exportFormatOpen && (
                      <div
                        role="listbox"
                        aria-label="Export format"
                        className="absolute left-0 right-0 top-[72px] z-10 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_8px_20px_rgba(16,35,58,0.14)]"
                      >
                        {(["PDF", "CSV", "Excel"] as ExportFormat[]).map((format) => (
                          <button
                            key={format}
                            type="button"
                            role="option"
                            aria-selected={exportFormat === format}
                            onClick={() => {
                              setExportFormat(format);
                              setExportFormatOpen(false);
                            }}
                            className={`flex h-10 w-full items-center rounded-md px-3 text-left font-montserrat text-[14px] font-medium text-[#10233A] ${exportFormat === format ? "bg-[#E7F4F9]" : "hover:bg-[#F2F5F9]"}`}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-col gap-4 pt-8">
                    <button
                      type="button"
                      onClick={() => {
                        if (exportFormat === "PDF") exportPdf(sortedRows, companyName, from, to, companyLogo);
                        if (exportFormat === "CSV") exportCsv(sortedRows, companyName, from, to);
                        if (exportFormat === "Excel") exportExcel(sortedRows, companyName, from, to);
                        setExportOpen(false);
                        setExportFormatOpen(false);
                      }}
                      className="flex h-[42px] w-full items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006F93]"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportOpen(false);
                        setExportFormatOpen(false);
                      }}
                      className="flex h-[42px] w-full items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] hover:border-[#A1B6C6]"
                    >
                      Cancel
                    </button>
                  </div>
                </aside>
              </>
            )}
          </div>
        }
      />
      <CompanyBreadcrumb companyName={companyName} items={["Reports", "Trial Balance"]} />

      <section className="rounded-xl border border-[#D3E1EC] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            {companyLogo && (
              <img
                src={companyLogo}
                alt={`${companyName} company logo`}
                className="mb-3 max-h-12 max-w-[180px] object-contain"
              />
            )}
            <p className="font-montserrat text-[12px] font-semibold uppercase tracking-[0.08em] text-[#007EA7]">
              Accounting report
            </p>
            <h2 className="mt-1 font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
              {companyName}
            </h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-montserrat text-[11px] font-semibold text-[#7288A3]">
              From
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-8 w-[150px] rounded-md border border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
              />
            </label>
            <label className="flex flex-col gap-1 font-montserrat text-[11px] font-semibold text-[#7288A3]">
              To
              <input
                type="date"
                min={from}
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-8 w-[150px] rounded-md border border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <OcrSearchField value={query} onChange={setQuery} ariaLabel="Search trial balance" />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v12:filters:trial-balance:${companyName}`}
            columns={filterColumns}
            activeKeys={filterKeys}
            values={filterValues}
            onActiveKeysChange={setFilterKeys}
            onValuesChange={setFilterValues}
          />
        </div>
        <div className="flex items-center gap-4 rounded bg-white p-1.5">
          <span className="font-montserrat text-[12px] font-medium text-[#7288A3]">
            {sortedRows.length} accounts · EUR
          </span>
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
        </div>
      </div>

      <div ref={tableRef} className="min-h-[420px] flex-1 overflow-x-auto scrollbar-hide">
        <div
          className="min-w-max"
          style={{ width: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}
        >
          <div className="mb-3 flex min-h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
            {visibleColumns.map((column, visibleIndex) => (
              <div
                key={column.key}
                style={{ width: column.width }}
                className={`relative flex min-h-6 flex-shrink-0 items-center gap-1 px-3 ${visibleIndex > 0 ? "border-l border-[#D3E1EC]" : ""}`}
              >
                <span className="min-w-0 whitespace-normal leading-4">{column.label}</span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key as TrialBalanceColumnKey)}
                  onDirectionChange={(direction) =>
                    changeSort(column.key as TrialBalanceColumnKey, direction)
                  }
                />
                <ResizeHandle
                  onMouseDown={(event) =>
                    startResize(
                      columns.findIndex((item) => item.key === column.key),
                      event,
                    )
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            {sortedRows.map((item, index) => (
              <div
                key={`${item.code}-${item.name}`}
                className={`flex min-h-10 items-center rounded-lg font-montserrat text-[12px] font-normal text-[#10233A] transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
              >
                {visibleColumns.map((column) => (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className={`flex flex-shrink-0 items-center overflow-hidden px-3 ${column.key === "account" ? "text-left" : "justify-end tabular-nums"}`}
                  >
                    {column.key === "account" ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-16 flex-shrink-0 truncate text-[#10233A]">
                          {item.code}
                        </span>
                        <span className="block min-w-0 truncate">{item.name}</span>
                      </span>
                    ) : (
                      <span className="block truncate">
                        {formatAmount(item[column.key as Exclude<TrialBalanceColumnKey, "account">])}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {sortedRows.length === 0 && (
              <div className="flex min-h-[220px] items-center justify-center font-montserrat text-[13px] font-medium text-[#7288A3]">
                No accounts match the selected search and filters.
              </div>
            )}
          </div>

          <div className="mt-0.5 flex min-h-11 items-center rounded-lg bg-[#10233A] font-montserrat text-[12px] font-semibold text-white">
            {visibleColumns.map((column) => {
              const totalIndex = TRIAL_BALANCE_COLUMNS.findIndex(
                (item) => item.key === column.key,
              ) - 1;
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`flex flex-shrink-0 items-center overflow-hidden px-3 ${column.key === "account" ? "text-left" : "justify-end border-l border-white/20 tabular-nums"}`}
                >
                  {column.key === "account"
                    ? "Total"
                    : formatAmount(TOTALS[totalIndex])}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableRef} />

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={TRIAL_BALANCE_COLUMNS}
          onSave={(next) => {
            setColumns(next);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
    </main>
  );
}
