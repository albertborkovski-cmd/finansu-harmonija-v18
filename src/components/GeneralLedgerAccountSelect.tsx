import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ListTree,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  addCompanyGeneralLedgerAccount,
  loadCompanyGeneralLedgerAccountHierarchy,
} from "./GeneralLedgerView";

interface GeneralLedgerAccountSelectProps {
  value: string;
  companyId: string;
  generalLedgerName?: string;
  onChange: (value: string) => void | Promise<void>;
  onOpenGeneralLedger?: () => void;
  width?: number | string;
  compact?: boolean;
  formField?: boolean;
  borderless?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  addButtonLabel?: string;
}

export default function GeneralLedgerAccountSelect({
  value,
  companyId,
  generalLedgerName,
  onChange,
  onOpenGeneralLedger,
  width = "100%",
  compact = false,
  formField = false,
  borderless = false,
  ariaLabel = "GL account",
  placeholder = "Enter GL code",
  disabled = false,
  addButtonLabel = "Add new GL account",
}: GeneralLedgerAccountSelectProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadOptions = useCallback(
    () =>
      loadCompanyGeneralLedgerAccountHierarchy(companyId, generalLedgerName),
    [companyId, generalLedgerName],
  );
  const [options, setOptions] = useState(loadOptions);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const refresh = () => setOptions(loadOptions());
    refresh();
    window.addEventListener("organization-reference-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("organization-reference-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [loadOptions]);

  const updateMenuPosition = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = Math.min(440, Math.max(340, rect.width));
    const estimatedHeight = 330;
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
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
        setDraft(value);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, value]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter(
            (account) =>
              account.code.toLocaleLowerCase().includes(normalizedQuery) ||
              account.name.toLocaleLowerCase().includes(normalizedQuery),
          )
        : options,
    [normalizedQuery, options],
  );
  const parentCodes = useMemo(
    () => new Set(options.map((account) => account.parentCode).filter(Boolean)),
    [options],
  );

  const selectValue = async (nextValue: string) => {
    setSaving(true);
    await onChange(nextValue);
    setDraft(nextValue);
    setQuery("");
    setSaving(false);
    setOpen(false);
  };

  const commitTypedCode = () => {
    const normalizedDraft = draft.trim().toLocaleLowerCase();
    const exact = options.find(
      (account) => account.code.toLocaleLowerCase() === normalizedDraft,
    );
    const candidate = exact ?? (filteredOptions.length === 1 ? filteredOptions[0] : undefined);
    if (candidate) void selectValue(candidate.code);
  };

  const createAccount = async () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) return;
    setSaving(true);
    setCreateError("");
    const created = addCompanyGeneralLedgerAccount(
      companyId,
      generalLedgerName,
      { code, name },
    );
    if (!created) {
      setCreateError("Enter a unique GL code and account name.");
      setSaving(false);
      return;
    }
    setOptions(loadOptions());
    await onChange(code);
    setDraft(code);
    setQuery("");
    setNewCode("");
    setNewName("");
    setCreating(false);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      style={{ width }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={`flex w-full items-center transition-colors ${
          borderless
            ? `rounded-none border border-transparent bg-transparent ${
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : "hover:text-[#007EA7]"
              }`
            : `rounded-md border ${
                disabled
                  ? `cursor-not-allowed border-[#D3E1EC] ${formField ? "bg-[#F3F6F8] text-[#7288A3]" : "bg-[#F3F6FC] opacity-60"}`
                  : open
                    ? "border-[#007EA7] bg-white ring-1 ring-[#007EA7]"
                    : "border-[#D3E1EC] bg-white hover:border-[#A1B6C6]"
              }`
        } ${formField ? "h-[26px] rounded" : compact ? "h-7" : "h-9"}`}
      >
        <input
          value={draft}
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onFocus={(event) => {
            if (disabled) return;
            setQuery("");
            setOpen(true);
            requestAnimationFrame(updateMenuPosition);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            if (disabled) return;
            setDraft(event.target.value);
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitTypedCode();
            }
            if (event.key === "Escape") {
              setOpen(false);
              setDraft(value);
              setQuery("");
            }
          }}
          className={`min-w-0 flex-1 bg-transparent px-2 font-montserrat font-medium outline-none placeholder:text-[#A1B6C6] ${disabled ? "text-[#7288A3]" : "text-[#10233A]"} ${
            formField ? "text-[12px]" : compact ? "text-[11px]" : "text-[13px]"
          }`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Open ${ariaLabel} list`}
          aria-expanded={open}
          onClick={() => {
            if (disabled) return;
            setQuery("");
            setOpen((current) => !current);
            requestAnimationFrame(updateMenuPosition);
          }}
          className={`flex flex-shrink-0 items-center justify-center text-[#7288A3] ${
            formField ? "h-[26px] w-[26px]" : compact ? "h-6 w-6" : "h-8 w-8"
          }`}
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : !disabled ? (
            <ChevronDown
              size={13}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          ) : null}
        </button>
      </div>

      {open && !disabled &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="GL account hierarchy"
            className="fixed z-[1400] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white shadow-[0_10px_30px_rgba(16,35,58,0.18)]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: Math.min(
                440,
                Math.max(340, rootRef.current?.getBoundingClientRect().width ?? 340),
              ),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#E5EDF9] bg-[#F8FDFF] px-3 py-2">
              <Search size={13} className="flex-shrink-0 text-[#7288A3]" />
              <span className="font-montserrat text-[11px] text-[#7288A3]">
                Type a GL code and press Enter, or choose from the hierarchy
              </span>
            </div>
            <div className="max-h-[235px] overflow-y-auto p-1.5">
              {value && !normalizedQuery && (
                <button
                  type="button"
                  onClick={() => void selectValue("")}
                  className="mb-1 flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left font-montserrat text-[12px] font-medium text-[#7288A3] hover:bg-[#F2F7FC]"
                >
                  <X size={13} />
                  Clear value
                </button>
              )}
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-5 text-center font-montserrat text-[12px] text-[#A1B6C6]">
                  No matching GL account
                </div>
              ) : (
                filteredOptions.map((account) => {
                  const selected = account.code === value;
                  const hasChildren = parentCodes.has(account.code);
                  return (
                    <button
                      key={account.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => void selectValue(account.code)}
                      className={`flex min-h-9 w-full items-center rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-[#F2F7FC] ${
                        selected ? "bg-[#EAF5F9]" : ""
                      }`}
                      style={{ paddingLeft: 8 + account.depth * 18 }}
                    >
                      <span className="mr-1 flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#A1B6C6]">
                        {hasChildren ? <ChevronRight size={12} /> : <span className="h-1 w-1 rounded-full bg-[#D3E1EC]" />}
                      </span>
                      <span className="w-[64px] flex-shrink-0 font-montserrat text-[12px] font-semibold text-[#10233A]">
                        {account.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-montserrat text-[12px] font-medium text-[#7288A3]">
                        {account.name}
                      </span>
                      {selected && <Check size={13} className="ml-2 flex-shrink-0 text-[#007EA7]" />}
                    </button>
                  );
                })
              )}
            </div>
            {companyId && (
              <div className="border-t border-[#D3E1EC] bg-white p-2">
                {creating ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                      <input
                        autoFocus
                        value={newCode}
                        onChange={(event) => setNewCode(event.target.value)}
                        placeholder="GL code"
                        className="h-8 rounded-md border border-[#D3E1EC] px-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                      />
                      <input
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void createAccount();
                          }
                        }}
                        placeholder="Account name"
                        className="h-8 rounded-md border border-[#D3E1EC] px-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                      />
                    </div>
                    {createError && (
                      <span className="font-montserrat text-[11px] font-medium text-[#D90310]">
                        {createError}
                      </span>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setCreateError("");
                        }}
                        className="h-8 rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#A1B6C6]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!newCode.trim() || !newName.trim() || saving}
                        onClick={() => void createAccount()}
                        className="flex h-8 items-center gap-1.5 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006A8E] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Add account
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCode(query.trim());
                      setNewName("");
                      setCreateError("");
                      setCreating(true);
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 font-montserrat text-[12px] font-semibold text-[#007EA7] hover:bg-[#F2F7FC]"
                  >
                    <Plus size={14} />
                    {addButtonLabel}
                  </button>
                )}
              </div>
            )}
            {onOpenGeneralLedger && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenGeneralLedger();
                }}
                className="flex h-10 w-full items-center gap-2 border-t border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] font-semibold text-[#007EA7] hover:bg-[#F2F7FC]"
              >
                <ListTree size={14} />
                Open full GL account list
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
