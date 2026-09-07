import React, { useMemo, useState } from "react";
import {
  RefreshCw,
  X,
  Copy,
  Eye,
  Trash2,
} from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import OcrSearchField from "./OcrSearchField";
import { useColumnResize, ResizeHandle } from "./useColumnResize";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import ImportButton from "./ImportButton";
import { matchesTextSearch } from "../utils/textSearch";
import { usePersistentState } from "../hooks/usePersistentState";
import SystemAddFilters from "./SystemAddFilters";
import { PageHeader } from "./PageHeader";
import { SystemBreadcrumb } from "./SystemNavigation";

interface ActionRow {
  id: string;
  date: string;
  user: string;
  role: string;
  actionType: string;
  objectType: string;
  objectId: string;
  status: "Active" | "Inactive";
  actionId: string;
}

const SAMPLE_ROWS: ActionRow[] = [
  {
    id: "1",
    date: "10.11.2025 - 12:15",
    user: "John Brick",
    role: "Client",
    actionType: "Invoice creation",
    objectType: "Invoice",
    objectId: "5478321996547",
    status: "Active",
    actionId: "ece861d8-aecc-44dd-8cef-fc8f34c06940",
  },
  {
    id: "2",
    date: "10.11.2025 - 12:15",
    user: "John Brick",
    role: "Client",
    actionType: "Invoice creation",
    objectType: "Invoice",
    objectId: "5478321996547",
    status: "Active",
    actionId: "f3a92b1c-7d4e-48f2-a5c1-9b2d6e8f4a71",
  },
  {
    id: "3",
    date: "10.11.2025 - 12:15",
    user: "John Brick",
    role: "Client",
    actionType: "Invoice creation",
    objectType: "Invoice",
    objectId: "5478321996547",
    status: "Active",
    actionId: "b7c45e2d-1a8f-4b3c-9d6e-2f5a8c7b4e91",
  },
  {
    id: "4",
    date: "10.11.2025 - 12:15",
    user: "John Brick",
    role: "Client",
    actionType: "Invoice creation",
    objectType: "Invoice",
    objectId: "5478321996547",
    status: "Active",
    actionId: "d4e72f9a-6b3c-41d8-8e5f-a9c2b7d6e3f1",
  },
];

interface FilterChip {
  id: string;
  label: string;
  width: number;
  column: keyof ActionRow;
}

const FILTERS: FilterChip[] = [
  { id: "date", label: "Date/Time", width: 128, column: "date" },
  { id: "user", label: "User", width: 112, column: "user" },
  { id: "role", label: "Role", width: 96, column: "role" },
  { id: "actionType", label: "Action type", width: 132, column: "actionType" },
  { id: "objectType", label: "Object type", width: 128, column: "objectType" },
  { id: "objectId", label: "Object ID/No.", width: 136, column: "objectId" },
  { id: "status", label: "Status", width: 104, column: "status" },
];

const DEFAULT_FILTER_IDS = FILTERS.filter(
  (filter) => filter.id !== "objectId",
).map((filter) => filter.id);

const INITIAL_COLUMNS: ColConfig[] = [
  { key: "date", label: "Date/Time", width: 142, visible: true },
  { key: "user", label: "User", width: 120, visible: true },
  { key: "role", label: "Role", width: 130, visible: true },
  { key: "actionType", label: "Action type", width: 120, visible: true },
  { key: "objectType", label: "Object type", width: 120, visible: true },
  { key: "objectId", label: "Object ID/No.", width: 120, visible: true },
  { key: "status", label: "Status", width: 120, visible: true },
];

export default function HelpFaqView() {
  const [rows, setRows] = usePersistentState<ActionRow[]>(
    "finansu-harmonija:v7:help-faq",
    SAMPLE_ROWS,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 10;
  const [selectedRow, setSelectedRow] = useState<ActionRow | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v7:help-faq-columns",
    INITIAL_COLUMNS,
  );
  const [query, setQuery] = useState("");
  const [visibleFilterIds, setVisibleFilterIds] =
    useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>(
    {},
  );
  const { startResize } = useColumnResize(columns, setColumns);
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesTextSearch(row, query) &&
          FILTERS.every(
            (filter) =>
              !filterValues[filter.id]?.length ||
              filterValues[filter.id].includes(String(row[filter.column])),
          ),
      ),
    [rows, query, filterValues],
  );
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filteredRows,
    (row, key) => row[key as keyof ActionRow] as string | number | undefined,
  );

  return (
    <div
      className="relative flex min-h-full flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]"
    >
      {/* Header */}
      <PageHeader title="Help/FAQ" />
      <SystemBreadcrumb items={["Help", "FAQ"]} />

      {/* Content */}
      <div className="flex flex-col gap-6 flex-1">
        {/* Filter bar */}
        <div className="system-table-toolbar relative h-7 min-h-7 flex-shrink-0">
          <div className="flex h-7 min-h-7 items-center">
            <div className="flex min-w-0 flex-1 flex-row flex-nowrap items-center gap-1 pr-[128px]">
              <SystemAddFilters
                persistenceKey="finansu-harmonija:v7:filters:help-faq"
                legacyDefaultKeys={DEFAULT_FILTER_IDS}
                columns={FILTERS.map((filter) => ({
                  key: filter.id,
                  label: filter.label,
                  options: Array.from(
                    new Set(rows.map((row) => String(row[filter.column]))),
                  ),
                }))}
                activeKeys={visibleFilterIds}
                values={filterValues}
                onActiveKeysChange={(keys) => {
                  setVisibleFilterIds(keys);
                  setCurrentPage(1);
                }}
                onValuesChange={setFilterValues}
              />

              {/* Search */}
              <OcrSearchField
                ariaLabel="Search FAQ"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Toolbar icons */}
            <div className="absolute right-0 top-0 flex h-7 flex-row items-center gap-4 rounded bg-white">
              <ColumnSettingsButton
                onClick={() => setShowColumnSettings(true)}
              />
              <ImportButton scope="FAQ" />
              <button
                type="button"
                className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors"
                title="REFRESH ALL"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex flex-col flex-1 gap-12">
          <div className="flex flex-col gap-0 overflow-x-auto scrollbar-hide">
            {/* Column headers */}
            <div className="flex flex-row items-center pl-3 gap-3 h-5 mb-2 min-w-fit">
              {columns
                .filter((c) => c.visible)
                .map((col, visIdx) => {
                  const realIndex = columns.findIndex((c) => c.key === col.key);
                  const isFirst = visIdx === 0;
                  return (
                    <React.Fragment key={col.key}>
                      <div
                        className="relative flex-shrink-0 flex flex-row items-center gap-[6px]"
                        style={{ width: col.width }}
                      >
                        <span
                          className={`font-montserrat font-medium text-[12px] leading-[18px] whitespace-nowrap ${isFirst ? "text-[#10233A]" : "text-[#7288A3]"}`}
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
                          onMouseDown={(e) => startResize(realIndex, e)}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
            </div>

            {/* Rows */}
            <div className="flex flex-col">
              {sortedRows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  className={`flex flex-row items-center pl-3 gap-3 h-9 rounded-lg min-w-fit ${
                    selectedRow?.id === row.id
                      ? "bg-[#E7F4F9]"
                      : rowIndex % 2 === 0
                        ? "bg-[#F8FDFF]"
                        : "bg-white"
                  } group hover:bg-[#E7F4F9] transition-colors`}
                >
                  {columns
                    .filter((column) => column.visible)
                    .map((column) => (
                      <React.Fragment key={column.key}>
                        <div
                          className="flex flex-shrink-0 items-center gap-1.5 overflow-hidden"
                          style={{ width: column.width }}
                        >
                          {column.key === "status" && (
                            <div
                              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${row.status === "Active" ? "bg-[#0ED8A8]" : "bg-[#A1B6C6]"}`}
                            />
                          )}
                          <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                            {String(row[column.key as keyof ActionRow] ?? "—")}
                          </span>
                        </div>
                      </React.Fragment>
                    ))}

                  {/* Row action buttons */}
                  <div className="ml-auto flex flex-shrink-0 flex-row items-center gap-1 px-1">
                    <button
                      onClick={() => setSelectedRow(row)}
                      title="VIEW"
                      aria-label={`VIEW ${row.actionType}`}
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRows((current) =>
                          current.filter((item) => item.id !== row.id),
                        );
                        setSelectedRow((current) =>
                          current?.id === row.id ? null : current,
                        );
                      }}
                      title="DELETE"
                      aria-label={`DELETE ${row.actionType}`}
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#D75B67] hover:text-[#D75B67]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <HorizontalTableScrollbar />

          {/* Bottom bar */}
          <div className="flex flex-row items-center gap-4">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemCount={rows.length}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columns}
          onSave={(cols) => setColumns(cols)}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Action Details Side Panel */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="relative h-full w-[340px] bg-white flex flex-col gap-6 px-6 pt-6 pb-8 overflow-y-auto"
            style={{ boxShadow: "-2px 0px 0px #E5EDF9" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-row justify-between items-center">
                <span className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
                  Action details
                </span>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="text-[#7288A3] hover:text-[#10233A] transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <button className="flex items-center justify-center px-3 py-[6px] gap-1 border-2 border-[#D3E1EC] rounded-md h-8 hover:border-[#007EA7] transition-colors self-start">
                <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#7288A3] whitespace-nowrap">
                  Copy link to clipboard
                </span>
                <Copy size={16} className="text-[#7288A3]" />
              </button>
            </div>

            {/* Details card */}
            <div className="flex flex-col gap-2 p-3 bg-[#F2F5F9] rounded-lg">
              <DetailField label="Action ID" value={selectedRow.actionId} />
              <DetailField
                label="Date"
                value={selectedRow.date.replace(" - ", " ")}
              />
              <DetailField label="Action type" value={selectedRow.actionType} />
              <DetailField label="Object type" value={selectedRow.objectType} />
              <DetailField label="Object ID/No." value={selectedRow.objectId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-montserrat font-semibold text-[12px] leading-[18px] text-[#10233A]">
        {label}
      </span>
      <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
        {value}
      </span>
    </div>
  );
}
