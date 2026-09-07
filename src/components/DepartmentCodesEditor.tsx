import { useRef, useState } from "react";
import { Check, FileUp, Plus, Trash2, X } from "lucide-react";
import * as XLSX from "xlsx";
import OcrSearchField from "./OcrSearchField";

interface DepartmentCodeItem {
  id: string;
  code: string;
  name: string;
}

interface DepartmentCodesConfig {
  enabled: boolean;
  items: DepartmentCodeItem[];
}

interface DepartmentCodesEditorProps {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  requiredLabel?: string;
  itemSingular?: string;
  itemPlural?: string;
  manageWhenNotRequired?: boolean;
}

function createItem(code = "", name = ""): DepartmentCodeItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    code,
    name,
  };
}

function parseConfig(value: string): DepartmentCodesConfig {
  if (!value.trim()) return { enabled: false, items: [] };

  try {
    const parsed = JSON.parse(value) as Partial<DepartmentCodesConfig>;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
      return {
        enabled: Boolean(parsed.enabled),
        items: parsed.items.map((item, index) => ({
          id: String(item?.id ?? `stored-${index}`),
          code: String(item?.code ?? ""),
          name: String(item?.name ?? ""),
        })),
      };
    }
  } catch {
    // Legacy values were stored as a comma-separated list.
  }

  const items = value
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code, index) => ({ id: `legacy-${index}`, code, name: "" }));
  return { enabled: items.length > 0, items };
}

function serializeConfig(config: DepartmentCodesConfig) {
  return JSON.stringify({
    enabled: config.enabled,
    items: config.items.map(({ id, code, name }) => ({ id, code, name })),
  });
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

export default function DepartmentCodesEditor({
  value,
  onChange,
  title = "Department codes",
  requiredLabel = "Department code required",
  itemSingular = "department code",
  itemPlural = "department codes",
  manageWhenNotRequired = false,
}: DepartmentCodesEditorProps) {
  const config = parseConfig(value);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = normalizedSearch
    ? config.items.filter((item) =>
        `${item.code} ${item.name}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : config.items;

  const update = (next: DepartmentCodesConfig) => {
    onChange(serializeConfig(next));
  };

  const openManager = () => {
    setSearch("");
    setImportMessage("");
    setExpanded(true);
  };

  const closeManager = () => {
    setSearch("");
    setExpanded(false);
  };

  const importCodes = async (file?: File) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      const firstRow = rows[0] ?? [];
      const headers = firstRow.map(normalizeHeader);
      const codeHeaderIndex = headers.findIndex((header) =>
        ["code", "kodas", "department code"].includes(header),
      );
      const nameHeaderIndex = headers.findIndex((header) =>
        ["name", "pavadinimas", "department name"].includes(header),
      );
      const hasHeader = codeHeaderIndex >= 0 || nameHeaderIndex >= 0;
      const codeIndex = codeHeaderIndex >= 0 ? codeHeaderIndex : 0;
      const nameIndex = nameHeaderIndex >= 0 ? nameHeaderIndex : 1;
      const importedItems = rows
        .slice(hasHeader ? 1 : 0)
        .map((row) =>
          createItem(
            String(row[codeIndex] ?? "").trim(),
            String(row[nameIndex] ?? "").trim(),
          ),
        )
        .filter((item) => item.code || item.name);

      update({ enabled: true, items: [...config.items, ...importedItems] });
      setImportMessage(
        importedItems.length
          ? `${importedItems.length} ${itemPlural} imported`
          : `No ${itemPlural} found in the file`,
      );
    } catch {
      setImportMessage(`${title} could not be imported`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[#D3E1EC] bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <label className="flex cursor-pointer items-center gap-3 font-montserrat text-[14px] font-semibold text-[#10233A]">
          <input
            type="checkbox"
            className="sr-only"
            checked={config.enabled}
            onChange={(event) => {
              update({ ...config, enabled: event.target.checked });
              if (!event.target.checked) closeManager();
            }}
          />
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
              config.enabled
                ? "border-[#008AAF] bg-[#008AAF] text-white"
                : "border-[#AFC3D4] bg-white text-transparent"
            }`}
          >
            <Check size={14} strokeWidth={3} />
          </span>
          {requiredLabel}
        </label>

        {(config.enabled || (manageWhenNotRequired && config.items.length > 0)) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={openManager}
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-semibold text-[#007EA7] hover:border-[#008AAF] hover:bg-[#F2FAFC]"
          >
            Manage codes
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
        <span
          className={`h-2 w-2 rounded-full ${
            config.enabled ? "bg-[#2EA96B]" : "bg-[#AFC3D4]"
          }`}
        />
        {config.enabled
          ? config.items.length
            ? `${config.items.length} ${config.items.length === 1 ? itemSingular : itemPlural} configured`
            : `Required, but no ${itemPlural} have been added`
          : manageWhenNotRequired && config.items.length > 0
            ? `Not required · ${config.items.length} ${config.items.length === 1 ? itemSingular : itemPlural} configured`
            : "Not required"}
      </div>

      {(config.enabled || (manageWhenNotRequired && config.items.length > 0)) && expanded ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/25 p-6"
          onMouseDown={closeManager}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex min-h-[520px] max-h-[calc(100vh-32px)] w-[1000px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_60px_rgba(16,35,58,0.20)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5 px-6 pb-3 pt-5">
              <div>
                <h2 className="font-montserrat text-[19px] font-semibold text-[#10233A]">
                  {title}
                </h2>
                <p className="mt-0.5 font-montserrat text-[11px] font-medium text-[#7288A3]">
                  Add, import or update the {itemSingular} structure.
                </p>
              </div>
              <button
                type="button"
                aria-label={`Close ${title.toLocaleLowerCase()}`}
                onClick={closeManager}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F2F7FA] hover:text-[#10233A]"
              >
                <X size={21} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#E5EDF9] px-6 pb-3">
              <OcrSearchField
                ariaLabel={`Search ${itemPlural}`}
                value={search}
                onChange={setSearch}
                className="!w-[220px] !min-w-[220px] !max-w-[220px]"
              />
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[11px] font-semibold text-[#7288A3] hover:border-[#008AAF] hover:text-[#007EA7]"
                >
                  <FileUp size={15} />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      ...config,
                      items: [...config.items, createItem()],
                    })
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#008AAF] px-3 font-montserrat text-[11px] font-semibold text-white hover:bg-[#007A9B]"
                >
                  <Plus size={15} />
                  Add {itemSingular}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={(event) =>
                    void importCodes(event.target.files?.[0])
                  }
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-3">
              {config.items.length ? (
                <div className="overflow-hidden rounded-xl border border-[#E5EDF9]">
                  <div className="grid grid-cols-[minmax(160px,0.8fr)_minmax(240px,1.2fr)_44px] items-center bg-[#F7FAFC] px-4 py-2 font-montserrat text-[11px] font-semibold text-[#10233A]">
                    <span>Code</span>
                    <span>Name</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  {visibleItems.map((item) => {
                    const index = config.items.findIndex(
                      (current) => current.id === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(160px,0.8fr)_minmax(240px,1.2fr)_44px] items-center gap-2 border-t border-[#E5EDF9] px-3 py-1.5 hover:bg-[#F8FBFC]"
                      >
                        <input
                          aria-label={`${itemSingular} code ${index + 1}`}
                          value={item.code}
                          placeholder="Code"
                          onChange={(event) =>
                            update({
                              ...config,
                              items: config.items.map((current) =>
                                current.id === item.id
                                  ? { ...current, code: event.target.value }
                                  : current,
                              ),
                            })
                          }
                          className="h-8 min-w-0 rounded-md border border-[#D3E1EC] px-2.5 font-montserrat text-[11px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                        />
                        <input
                          aria-label={`${itemSingular} name ${index + 1}`}
                          value={item.name}
                          placeholder="Name"
                          onChange={(event) =>
                            update({
                              ...config,
                              items: config.items.map((current) =>
                                current.id === item.id
                                  ? { ...current, name: event.target.value }
                                  : current,
                              ),
                            })
                          }
                          className="h-8 min-w-0 rounded-md border border-[#D3E1EC] px-2.5 font-montserrat text-[11px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                        />
                        <button
                          type="button"
                          aria-label={`Delete ${itemSingular} ${index + 1}`}
                          onClick={() =>
                            update({
                              ...config,
                              items: config.items.filter(
                                (current) => current.id !== item.id,
                              ),
                            })
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#FFF2F2] hover:text-[#E45858]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                  {!visibleItems.length && (
                    <div className="flex min-h-32 items-center justify-center border-t border-[#E5EDF9] font-montserrat text-[11px] font-medium text-[#7288A3]">
                      No {itemPlural} match the search
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#D3E1EC] bg-[#FBFDFE] p-6 text-center">
                  <div>
                    <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                      No {itemPlural} added
                    </h3>
                    <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">
                      Add codes manually or import them from a CSV or Excel
                      file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => update({ ...config, items: [createItem()] })}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-[#008AAF] px-3 font-montserrat text-[11px] font-semibold text-white"
                  >
                    <Plus size={15} />
                    Add {itemSingular}
                  </button>
                </div>
              )}

              {importMessage && (
                <span
                  role="status"
                  className="mt-2 font-montserrat text-[10px] font-medium text-[#2E8B66]"
                >
                  {importMessage}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#E5EDF9] px-6 py-3">
              <span className="font-montserrat text-[10px] font-medium text-[#7288A3]">
                {config.items.length}{" "}
                {config.items.length === 1 ? "item" : "items"}
              </span>
              <button
                type="button"
                onClick={closeManager}
                className="h-9 rounded-lg bg-[#008AAF] px-4 font-montserrat text-[12px] font-semibold text-white hover:bg-[#007A9B]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
