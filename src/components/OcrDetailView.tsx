import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { PageActionButton, PageHeader } from "./PageHeader";
import TablePagination from "./TablePagination";
import { TABLE_BATCH_SIZE } from "../lib/tablePaging";
import OcrSearchField from "./OcrSearchField";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import ImportButton from "./ImportButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { usePersistentState } from "../hooks/usePersistentState";
import SystemAddFilters from "./SystemAddFilters";
import MultiSelectField from "./MultiSelectField";
import { isInactiveRecord, isRecordLinked, removeOrDeactivateRecords } from "../lib/recordLifecycle";

const CONFIG_COLUMNS: ColConfig[] = [
  { key: "name", label: "Key", width: 286, visible: true },
  { key: "value", label: "Value", width: 360, visible: true },
];

const CONFIG_PARAMS_DATA = [
  { id: "1", name: "Main processor", value: "node-processor-01" },
  { id: "2", name: "Secondary handler", value: "node-handler-02" },
  { id: "3", name: "Backup worker", value: "node-worker-03" },
  { id: "4", name: "Queue timeout", value: "30000" },
  { id: "5", name: "Max retries", value: "5" },
  { id: "6", name: "Log level", value: "INFO" },
  { id: "7", name: "Batch size", value: "100" },
  { id: "8", name: "Connection pool", value: "10" },
  { id: "9", name: "Cache TTL", value: "3600" },
  { id: "10", name: "Heartbeat interval", value: "15000" },
  { id: "11", name: "Output format", value: "JSON" },
  { id: "12", name: "Compression", value: "gzip" },
];

function CfgCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="w-[18px] h-[18px] flex-shrink-0 rounded-[6px] flex items-center justify-center transition-colors"
      style={{
        background: checked ? "#007EA7" : "#FFFFFF",
        border: checked ? "none" : "1px solid #A1B6C6",
      }}
    >
      {checked && (
        <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
          <path
            d="M1 3L3.5 5.5L9 1"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function ConfigParamsTab() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v7:ocr-configuration-columns",
    CONFIG_COLUMNS,
  );
  const [parameters, setParameters] = usePersistentState(
    "finansu-harmonija:v7:ocr-configuration-parameters",
    CONFIG_PARAMS_DATA,
  );
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>(
    {},
  );
  const { startResize } = useColumnResize(columns, setColumns);
  useEffect(() => setPage(1), [search, activeFilterKeys, filterValues]);
  const visibleColumns = columns.filter((column) => column.visible);

  const searched = search
    ? parameters.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.value.toLowerCase().includes(search.toLowerCase()),
      )
    : parameters;
  const filtered = searched.filter((row) =>
    activeFilterKeys.every((key) => {
      const selected = filterValues[key] ?? [];
      return (
        selected.length === 0 ||
        selected.includes(String(row[key as "name" | "value"]))
      );
    }),
  );
  const filterColumns = CONFIG_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(
      new Set(
        parameters.map((row) => String(row[column.key as "name" | "value"])),
      ),
    ).sort(),
  }));
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filtered,
    (row, key) => row[key as "name" | "value"],
  );

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const n = new Set(prev);
        filtered.forEach((r) => n.delete(r.id));
        return n;
      });
    } else {
      setSelectedIds((prev) => {
        const n = new Set(prev);
        filtered.forEach((r) => n.add(r.id));
        return n;
      });
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-row justify-between items-center flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField
            ariaLabel="Search configuration parameters"
            value={search}
            onChange={setSearch}
          />
          <SystemAddFilters
            persistenceKey="finansu-harmonija:v7:filters:ocr-detail"
            columns={filterColumns}
            activeKeys={activeFilterKeys}
            values={filterValues}
            onActiveKeysChange={setActiveFilterKeys}
            onValuesChange={setFilterValues}
          />
        </div>

        {/* Icon actions */}
        <div className="flex flex-row items-center px-[6px] py-[6px] gap-4 bg-white rounded-[4px]">
          <BulkDeleteButton
            linked={parameters.some(row => selectedIds.has(row.id) && isRecordLinked(row, "finansu-harmonija:v7:ocr-configuration-parameters"))}
            selectedCount={selectedIds.size}
            onDelete={() => {
              setParameters((current) =>
                removeOrDeactivateRecords(current, selectedIds, "finansu-harmonija:v7:ocr-configuration-parameters"),
              );
              setSelectedIds(new Set());
            }}
          />
          <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
          <ImportButton scope="Automation process configuration parameters" />
          <button
            onClick={() =>
              setParameters((current) =>
                current.map((parameter) => ({ ...parameter })),
              )
            }
            className="hover:opacity-70 transition-opacity"
            title="REFRESH ALL"
          >
            <RefreshCw size={16} className="text-[#7288A3]" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div ref={tableScrollRef} className="flex flex-col gap-4 overflow-x-auto">
        {/* Header */}
        <div className="flex flex-row items-center h-5 pl-3 gap-3">
          {visibleColumns.map((column) => {
            const realIndex = columns.findIndex(
              (item) => item.key === column.key,
            );
            return (
              <div
                data-table-header-select={column.key === "name" ? "true" : undefined}
                key={column.key}
                className="relative flex flex-shrink-0 items-center gap-[6px]"
                style={{ width: column.width }}
              >
                {column.key === "name" && (
                  <CfgCheckbox checked={allSelected} onChange={toggleAll} />
                )}
                <span
                  className={`font-montserrat text-[12px] font-medium leading-[18px] ${column.key === "name" ? "text-[#10233A]" : "text-[#7288A3]"}`}
                >
                  {column.label}
                </span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key)}
                  onDirectionChange={(direction) => {
                    changeSort(column.key, direction);
                    setPage(1);
                  }}
                />
                <ResizeHandle
                  onMouseDown={(event) => startResize(realIndex, event)}
                />
              </div>
            );
          })}
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {sortedRows.slice(0, page * TABLE_BATCH_SIZE).map((row, i) => (
            <div
              key={row.id}
              data-record-inactive={isInactiveRecord(row) || undefined}
              className={`group flex flex-row items-center w-full h-9 rounded-lg transition-colors ${i % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
            >
              {visibleColumns.map((column, index) => (
                <div key={column.key} className="contents">
                  {index > 0 && <div className="h-9 w-px bg-[#E4F7FF]" />}
                  <div
                    className="flex flex-shrink-0 items-center gap-[6px] overflow-hidden px-3"
                    style={{ width: column.width }}
                  >
                    {column.key === "name" && (
                      <CfgCheckbox
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    )}
                    <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                      {row[column.key as "name" | "value"]}
                    </span>
                  </div>
                </div>
              ))}

              {/* Delete button */}
              <div className="table-row-actions flex flex-shrink-0 items-center p-1">
                <RowDeleteButton
                  linked={isRecordLinked(row, "finansu-harmonija:v7:ocr-configuration-parameters")}
                  inactive={isInactiveRecord(row)}
                  label={`Delete ${row.name}`}
                  className="opacity-0 group-hover:opacity-100"
                  onDelete={() => {
                    setParameters((current) =>
                      removeOrDeactivateRecords(current, new Set([row.id]), "finansu-harmonija:v7:ocr-configuration-parameters"),
                    );
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      next.delete(row.id);
                      return next;
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: pagination + scroll + count */}
      <div className="flex flex-row justify-between items-center flex-wrap gap-3">
        {/* Pagination */}
        <TablePagination
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(filtered.length / TABLE_BATCH_SIZE))}
          itemCount={filtered.length}
          onPageChange={setPage}
          scrollRef={tableScrollRef}
        />
      </div>
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={CONFIG_COLUMNS}
          onSave={setColumns}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
    </div>
  );
}

interface Props {
  onBack: () => void;
  onCreated: (process: {
    name: string;
    description: string;
    capabilities: string;
  }) => void;
}

function InputField({
  label,
  placeholder,
  required,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
        {label}
        {required && <span className="text-[#D64545] ml-0.5">*</span>}
      </span>
      <div className="box-border flex flex-row items-center px-[14px] py-[11px] gap-[2px] w-full h-[42px] bg-white border border-[#D3E1EC] rounded-lg">
        <input
          required={required}
          aria-required={required}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder || ""}
          className="font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] placeholder:text-[#A1B6C6] outline-none w-full bg-transparent"
        />
      </div>
    </div>
  );
}


function Toggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [internal, setInternal] = useState(false);
  const isActive = active !== undefined ? active : internal;
  const handleClick = () => {
    const next = !isActive;
    setInternal(next);
    onChange?.(next);
  };
  return (
    <div className="flex flex-row items-center gap-2">
      <button
        onClick={handleClick}
        className="w-[30px] h-[18px] rounded-[13px] relative transition-colors"
        style={{ background: isActive ? "#007EA7" : "#A1B6C6" }}
      >
        <div
          className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-[13px] transition-all"
          style={{ left: isActive ? "14px" : "2px" }}
        />
      </button>
      <span className="font-montserrat font-medium text-[14px] leading-5 text-[#7288A3]">
        {label}
      </span>
    </div>
  );
}

const TABS = ["Detail"] as const;
type Tab = (typeof TABS)[number] | "Configuration parameters";

type DetailFormState = {
  name: string;
  description: string;
  moduleClass: string;
  executionGroups: string[];
  dedicated: boolean;
  dedicatedNodes: string;
  logsSearchQuery: string[];
  capabilities: string[];
  groupId: string;
  artifactId: string;
  versionId: string;
  clasifier: string;
};

const DEFAULT_DETAIL_FORM: DetailFormState = {
  name: "",
  description: "",
  moduleClass: "",
  executionGroups: [],
  dedicated: false,
  dedicatedNodes: "",
  logsSearchQuery: [],
  capabilities: [],
  groupId: "",
  artifactId: "",
  versionId: "",
  clasifier: "",
};

function DetailTab({
  form,
  setForm,
}: {
  form: DetailFormState;
  setForm: React.Dispatch<React.SetStateAction<DetailFormState>>;
}) {
  return (
    <div className="flex flex-row items-start gap-8 flex-wrap">
      <div className="box-border flex flex-col items-start p-6 gap-8 w-[380px] bg-white border border-[#D3E1EC] rounded-lg">
        <div className="flex flex-col items-start gap-6 w-full">
          <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
            General
          </h2>
          <InputField
            label="Name"
            placeholder="Enter name"
            required
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <InputField
            label="Description"
            placeholder="Enter description"
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
          />
          <InputField
            label="Module class"
            placeholder="Enter module class"
            value={form.moduleClass}
            onChange={(v) => setForm((f) => ({ ...f, moduleClass: v }))}
          />
          <MultiSelectField
            label="Execution groups"
            placeholder="Choose roles"
            options={["Group A", "Group B", "Group C", "Production", "Staging"]}
            value={form.executionGroups}
            onChange={(v) => setForm((f) => ({ ...f, executionGroups: v }))}
          />
          <Toggle
            label="Dedicated"
            active={form.dedicated}
            onChange={(v) => setForm((f) => ({ ...f, dedicated: v }))}
          />
          {form.dedicated ? (
            <>
              <InputField
                label="Dedicated nodes"
                placeholder="Enter dedicated nodes"
                value={form.dedicatedNodes}
                onChange={(v) => setForm((f) => ({ ...f, dedicatedNodes: v }))}
              />
              <MultiSelectField
                label="Logs search query"
                placeholder="Choose search queries"
                options={[
                  "RpaPlatform",
                  "#digit",
                  "Error",
                  "Warning",
                  "Info",
                  "Debug",
                ]}
                value={form.logsSearchQuery}
                onChange={(v) => setForm((f) => ({ ...f, logsSearchQuery: v }))}
              />
            </>
          ) : (
            <MultiSelectField
              label="Capabilities"
              placeholder="Choose capabilities"
              options={[
                "AP_RUN",
                "SELENIUM",
                "DESKTOP",
                "JAVA",
                "SAP",
                "SCREEN",
                "MT",
                "TEST",
                "DM",
                "FINANCIAL_DEMO",
                "JOHN_DEMO",
              ]}
              value={form.capabilities}
              onChange={(v) => setForm((f) => ({ ...f, capabilities: v }))}
            />
          )}
        </div>
      </div>

      <div className="box-border flex flex-col items-start p-6 gap-8 w-[380px] bg-white border border-[#D3E1EC] rounded-lg">
        <div className="flex flex-col items-start gap-6 w-full">
          <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
            Repository ID components
          </h2>
          <InputField
            label="Group ID"
            placeholder="Enter group ID"
            required
            value={form.groupId}
            onChange={(v) => setForm((f) => ({ ...f, groupId: v }))}
          />
          <InputField
            label="Artifact ID"
            placeholder="Enter artifact ID"
            required
            value={form.artifactId}
            onChange={(v) => setForm((f) => ({ ...f, artifactId: v }))}
          />
          <InputField
            label="Version ID"
            placeholder="Enter version ID"
            required
            value={form.versionId}
            onChange={(v) => setForm((f) => ({ ...f, versionId: v }))}
          />
          <InputField
            label="Clasifier"
            placeholder="Enter clasifier"
            value={form.clasifier}
            onChange={(v) => setForm((f) => ({ ...f, clasifier: v }))}
          />
        </div>
      </div>
    </div>
  );
}

export default function OcrDetailView({ onBack, onCreated }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Detail");
  const [detailForm, setDetailForm] =
    useState<DetailFormState>(DEFAULT_DETAIL_FORM);
  const requiredFieldsFilled = Boolean(
    detailForm.name.trim() &&
    detailForm.groupId.trim() &&
    detailForm.artifactId.trim() &&
    detailForm.versionId.trim(),
  );

  const handleUpload = () => {
    if (!requiredFieldsFilled) return;
    onCreated({
      name: detailForm.name.trim(),
      description: detailForm.description.trim(),
      capabilities: detailForm.dedicated
        ? detailForm.dedicatedNodes.trim() || "\u2014"
        : detailForm.capabilities.join(", ") || "\u2014",
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "Detail":
        return <DetailTab form={detailForm} setForm={setDetailForm} />;
      case "Configuration parameters":
        return <ConfigParamsTab />;
    }
  };

  return (
    <div
      className="flex flex-col bg-white min-h-full"
      style={{ padding: "56px clamp(24px, 5vw, 72px)" }}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <PageHeader
          title="New automation processes"
          leading={
            <button
              onClick={onBack}
              className="flex items-center justify-center p-[9px] hover:opacity-70 transition-opacity"
            >
              <ArrowLeft size={18} className="text-[#7288A3]" />
            </button>
          }
          actions={
            <>
              <PageActionButton onClick={onBack}>Cancel</PageActionButton>
              <PageActionButton
                onClick={handleUpload}
                disabled={!requiredFieldsFilled}
              >
                Upload
              </PageActionButton>
            </>
          }
        />

        {/* Breadcrumbs */}
        <div className="flex flex-row items-start gap-2 pl-[48px]">
          <button
            onClick={onBack}
            className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3] hover:underline"
          >
            Automation processes
          </button>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">
            /
          </span>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">
            New automation processes
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-row items-start gap-6 border-b border-[#E5EDF9] mb-8 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex flex-col items-start gap-4 flex-shrink-0"
          >
            <span
              className={`font-montserrat font-medium text-[16px] leading-[22px] whitespace-nowrap ${activeTab === tab ? "text-[#007EA7]" : "text-[#7288A3]"} transition-colors`}
            >
              {tab}
            </span>
            <div
              className={`w-full h-[2px] ${activeTab === tab ? "bg-[#007EA7]" : "bg-transparent"}`}
            />
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1">{renderTabContent()}</div>
    </div>
  );
}
