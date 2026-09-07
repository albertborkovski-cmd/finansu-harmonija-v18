import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Trash2, X } from "lucide-react";
import type { Company } from "../lib/supabase";
import { usePersistentState } from "../hooks/usePersistentState";
import OcrSearchField from "./OcrSearchField";
import SystemAddFilters from "./SystemAddFilters";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton, CancelButton, SaveButton } from "./ScopedActionButtons";
import RefreshAllButton from "./RefreshAllButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

type ClientRow = {
  id: string;
  registrationNumber: string;
  companyCode: string;
  vatCode: string;
  name: string;
  email: string;
};

type ClientColumnKey =
  | "registrationNumber"
  | "companyCode"
  | "vatCode"
  | "name"
  | "email";

const DEFAULT_COLUMNS: ColConfig[] = [
  {
    key: "registrationNumber",
    label: "Registration number",
    width: 190,
    visible: true,
  },
  { key: "companyCode", label: "Company code", width: 160, visible: true },
  { key: "vatCode", label: "VAT code", width: 150, visible: true },
  { key: "name", label: "Name", width: 210, visible: true },
  { key: "email", label: "Email", width: 220, visible: true },
];

const EMPTY_CLIENT: Omit<ClientRow, "id"> = {
  registrationNumber: "",
  companyCode: "",
  vatCode: "",
  name: "",
  email: "",
};

function seedClients(company: Company): ClientRow[] {
  if (company.name.toLocaleLowerCase() === "alice stone") {
    return [
      {
        id: "alice-client-001",
        registrationNumber: "305499987",
        companyCode: "305499987",
        vatCode: "—",
        name: "Nord 1, UAB",
        email: "—",
      },
      {
        id: "alice-client-002",
        registrationNumber: "305499987",
        companyCode: "305499987",
        vatCode: "—",
        name: "Nord 1, UAB",
        email: "—",
      },
    ];
  }
  return [];
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(fileName: string, rows: Array<Array<unknown>>) {
  const blob = new Blob(
    [`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): ClientRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const values = (line: string) =>
    line.split(separator).map((value) => value.trim().replace(/^"|"$/g, ""));
  const headers = values(lines[0]).map((header) =>
    header.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const at = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? row[index] ?? "" : "";
  };
  return lines.slice(1).map((line) => {
    const row = values(line);
    return {
      id: makeId(),
      registrationNumber: at(row, ["registrationnumber", "registrationno"]),
      companyCode: at(row, ["companycode", "code"]),
      vatCode: at(row, ["vatcode", "vatnumber"]) || "—",
      name: at(row, ["name", "companyname"]),
      email: at(row, ["email", "emailaddress"]) || "—",
    };
  }).filter((row) => row.name || row.companyCode || row.registrationNumber);
}

export default function CompanyClientsView({ company }: { company: Company }) {
  const [clients, setClients] = usePersistentState<ClientRow[]>(
    `finansu-harmonija:v12:company-clients:${company.id}`,
    () => seedClients(company),
  );
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:columns:company-clients:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const [query, setQuery] = useState("");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_CLIENT);
  const [deleteClient, setDeleteClient] = useState<ClientRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [refreshing, setRefreshing] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  const visibleColumns = columns.filter((column) => column.visible);
  const filterColumns = DEFAULT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(
      new Set(
        clients
          .map((client) => String(client[column.key as ClientColumnKey]))
          .filter(Boolean),
      ),
    ).sort(),
  }));

  const filteredClients = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return clients.filter((client) => {
      if (
        needle &&
        !Object.values(client).some((value) =>
          String(value).toLocaleLowerCase().includes(needle),
        )
      ) return false;
      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        return (
          selected.length === 0 ||
          selected.includes(String(client[key as ClientColumnKey]))
        );
      });
    });
  }, [clients, filterKeys, filterValues, query]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    ClientRow,
    ClientColumnKey
  >(filteredClients, (row, key) => row[key]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = sortedRows.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );

  const startCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_CLIENT);
    setEditorOpen(true);
  };

  const startEdit = (client: ClientRow) => {
    setEditingId(client.id);
    setDraft({
      registrationNumber: client.registrationNumber,
      companyCode: client.companyCode,
      vatCode: client.vatCode === "—" ? "" : client.vatCode,
      name: client.name,
      email: client.email === "—" ? "" : client.email,
    });
    setEditorOpen(true);
  };

  const saveClient = () => {
    if (!draft.registrationNumber.trim() || !draft.companyCode.trim() || !draft.name.trim()) return;
    const normalized: ClientRow = {
      id: editingId ?? makeId(),
      registrationNumber: draft.registrationNumber.trim(),
      companyCode: draft.companyCode.trim(),
      vatCode: draft.vatCode.trim() || "—",
      name: draft.name.trim(),
      email: draft.email.trim() || "—",
    };
    setClients((current) =>
      editingId
        ? current.map((client) => (client.id === editingId ? normalized : client))
        : [...current, normalized],
    );
    setEditorOpen(false);
  };

  const exportClients = () => {
    const headers = visibleColumns.map((column) => column.label);
    const data = sortedRows.map((client) =>
      visibleColumns.map((column) => client[column.key as ClientColumnKey]),
    );
    exportCsv(
      `${company.name.replace(/\s+/g, "-").toLocaleLowerCase()}-clients.csv`,
      [headers, ...data],
    );
  };

  return (
    <section className="flex min-h-[650px] min-w-0 w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <OcrSearchField
            ariaLabel="Search clients"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setCurrentPage(1);
            }}
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v12:filters:company-clients:${company.id}`}
            columns={filterColumns}
            activeKeys={filterKeys}
            values={filterValues}
            onActiveKeysChange={(keys) => {
              setFilterKeys(keys);
              setCurrentPage(1);
            }}
            onValuesChange={(values) => {
              setFilterValues(values);
              setCurrentPage(1);
            }}
            onClearFilters={() => {
              setQuery("");
              setCurrentPage(1);
            }}
          />
          <button
            type="button"
            onClick={startCreate}
            className="flex h-7 items-center rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
          >
            Create new
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="flex h-7 items-center rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
          >
            Import clients
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                const imported = parseCsv(text);
                if (imported.length) setClients((current) => [...current, ...imported]);
                event.target.value = "";
              });
            }}
          />
        </div>
        <div className="flex items-center gap-4 rounded bg-white p-1.5">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <button
            type="button"
            aria-label="EXPORT DATA"
            title="EXPORT DATA"
            onClick={exportClients}
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"
          >
            <Download size={16} />
          </button>
          <RefreshAllButton
            onRefresh={() => {
              setRefreshing(true);
              window.setTimeout(() => setRefreshing(false), 420);
            }}
          />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-[260px] flex-1 overflow-x-auto scrollbar-hide">
        <div
          className="min-w-max"
          style={{
            width: visibleColumns.reduce((total, column) => total + column.width, 0) + 100,
          }}
        >
          <div className="mb-3 flex min-h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
            {visibleColumns.map((column, index) => (
              <div
                key={column.key}
                style={{ width: column.width }}
                className={`relative flex min-h-6 flex-shrink-0 items-center gap-1 px-3 ${index > 0 ? "border-l border-[#D3E1EC]" : ""}`}
              >
                <span className="min-w-0 whitespace-normal leading-4">{column.label}</span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key as ClientColumnKey)}
                  onDirectionChange={(direction) =>
                    changeSort(column.key as ClientColumnKey, direction)
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
            <div className="w-[100px] flex-shrink-0 px-3 text-right">Actions</div>
          </div>

          <div className={`flex flex-col gap-0.5 transition-opacity ${refreshing ? "opacity-35" : "opacity-100"}`}>
            {pageRows.map((client, index) => (
              <div
                key={client.id}
                className={`flex min-h-10 items-center rounded-lg font-montserrat text-[12px] text-[#10233A] transition-colors ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
              >
                {visibleColumns.map((column) => (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className="flex flex-shrink-0 items-center overflow-hidden px-3"
                  >
                    <span className="truncate">{client[column.key as ClientColumnKey]}</span>
                  </div>
                ))}
                <div className="flex w-[100px] flex-shrink-0 items-center justify-end gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => startEdit(client)}
                    className="flex h-7 items-center rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${client.name}`}
                    onClick={() => setDeleteClient(client)}
                    className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#E45858] hover:text-[#E45858]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {pageRows.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileSpreadsheet size={30} />
                <span className="font-montserrat text-[13px] font-semibold">No clients found</span>
                {clients.length === 0 && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="flex h-8 items-center rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
                  >
                    Create new
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={safePage}
        totalPages={totalPages}
        itemCount={sortedRows.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onShowMore={() => {
          setItemsPerPage((current) =>
            current === 4 ? Math.max(4, sortedRows.length) : 4,
          );
          setCurrentPage(1);
        }}
        showMoreLabel={itemsPerPage === 4 ? "Show more" : "Default"}
        allItemsVisible={itemsPerPage !== 4}
      />

      {showColumns && (
        <>
          <button
            type="button"
            aria-label="Close column settings"
            className="fixed inset-0 z-40 bg-[#10233A]/10"
            onClick={() => setShowColumns(false)}
          />
          <ColumnSettingsPanel
            columns={columns}
            defaultColumns={DEFAULT_COLUMNS}
            onSave={setColumns}
            onClose={() => setShowColumns(false)}
          />
        </>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-[#10233A]/20" onMouseDown={() => setEditorOpen(false)}>
          <aside
            className="flex h-full w-[420px] max-w-full flex-col overflow-y-auto bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-7 flex items-center justify-between">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                {editingId ? "Edit client" : "Create client"}
              </h2>
              <button type="button" aria-label="Close client editor" onClick={() => setEditorOpen(false)} className="text-[#7288A3] hover:text-[#10233A]">
                <X size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-5">
              {([
                ["registrationNumber", "Registration number", true],
                ["companyCode", "Company code", true],
                ["vatCode", "VAT code", false],
                ["name", "Name", true],
                ["email", "Email", false],
              ] as const).map(([key, label, required]) => (
                <label key={String(key)} className="flex flex-col gap-2">
                  <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                    {label}{required && <span className="text-[#E45858]"> *</span>}
                  </span>
                  <input
                    value={draft[key as keyof typeof draft]}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                    className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] text-[#10233A] outline-none focus:border-[#007EA7]"
                  />
                </label>
              ))}
            </div>
            <div className="mt-auto flex justify-end gap-2 pt-8">
              <CancelButton onClick={() => setEditorOpen(false)} />
              <SaveButton
                onClick={saveClient}
                disabled={!draft.registrationNumber.trim() || !draft.companyCode.trim() || !draft.name.trim()}
              />
            </div>
          </aside>
        </div>
      )}

      {deleteClient && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#10233A]/20 p-6" onMouseDown={() => setDeleteClient(null)}>
          <div className="w-[420px] rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Delete client</h2>
            <p className="mt-4 font-montserrat text-[14px] leading-5 text-[#10233A]">
              Delete {deleteClient.name} from {company.name} clients?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <CancelButton onClick={() => setDeleteClient(null)} />
              <button
                type="button"
                onClick={() => {
                  setClients((current) => current.filter((client) => client.id !== deleteClient.id));
                  setDeleteClient(null);
                }}
                className="h-[42px] rounded-lg bg-[#E45858] px-4 font-montserrat text-[16px] font-semibold text-white hover:bg-[#CC4C4C]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
