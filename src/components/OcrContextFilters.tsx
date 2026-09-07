import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import SystemAddFilters, { type SystemFilterColumn } from "./SystemAddFilters";

type TableColumn = SystemFilterColumn & { x: number };
type TableRow = { element: HTMLElement; values: Record<string, string> };

const visible = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const cleanSortLabel = (label: string) =>
  label.replace(/^Sort\s+/i, "").replace(/\s+(ascending|descending)$/i, "").trim();

function inspectCurrentTable(root: HTMLElement) {
  const sortButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Sort "]'),
  ).filter((button) => !button.closest('[role="dialog"]') && visible(button));
  if (!sortButtons.length) return { columns: [] as TableColumn[], rows: [] as TableRow[] };

  const headerRow = sortButtons[0].closest<HTMLElement>(
    ".system-table-header-row, .mb-3.flex, .flex.h-5, .flex.h-6",
  );
  const body = headerRow?.nextElementSibling as HTMLElement | null;
  if (!headerRow || !body) return { columns: [] as TableColumn[], rows: [] as TableRow[] };

  const columns: TableColumn[] = sortButtons
    .filter((button) => headerRow.contains(button))
    .map((button, index) => {
      const cell = button.parentElement?.parentElement ?? button.parentElement ?? button;
      const rect = cell.getBoundingClientRect();
      const label = cleanSortLabel(button.getAttribute("aria-label") ?? `Column ${index + 1}`);
      return {
        key: `${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        options: [],
        x: rect.left + Math.min(rect.width / 2, 42),
      };
    });

  const minimumCellCount = Math.max(2, Math.min(columns.length, 3));
  const nestedRows = Array.from(body.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      visible(element) &&
      element.children.length >= minimumCellCount,
  );
  const parentChildren = Array.from(headerRow.parentElement?.children ?? []);
  const headerIndex = parentChildren.indexOf(headerRow);
  const siblingRows = parentChildren.slice(headerIndex + 1).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      visible(element) &&
      element.children.length >= minimumCellCount,
  );
  // Some tables wrap all records in a body element, while others render every
  // record as a direct sibling of the header. Support both system layouts.
  const rowElements = nestedRows.length ? nestedRows : siblingRows;
  const rows = rowElements.map((element) => {
    const candidates = Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const values: Record<string, string> = {};
    columns.forEach((column) => {
      const matching = candidates.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return column.x >= rect.left && column.x <= rect.right;
      });
      values[column.key] = (matching?.innerText ?? "").replace(/\s+/g, " ").trim();
    });
    return { element, values };
  });

  columns.forEach((column) => {
    column.options = Array.from(
      new Set(rows.map((row) => row.values[column.key]).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  });
  return { columns, rows };
}

/** Adds the standard filtering control to every OCR record table, including nested tabs. */
export default function OcrContextFilters({ contextKey }: { contextKey: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setActiveKeys([]);
    setValues({});
    const root = document.querySelector<HTMLElement>("[data-app-main]");
    if (!root) return;
    let frame = 0;
    let currentHost: HTMLElement | null = null;
    const inspect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const search = Array.from(root.querySelectorAll<HTMLElement>(".ocr-search-field"))
          .find((element) => !element.closest('[role="dialog"]') && visible(element));
        if (!search) {
          setHost(null);
          setColumns([]);
          setRows([]);
          return;
        }
        const searchToolbar = search.parentElement;
        const hasNativeSystemFilters = Boolean(
          searchToolbar?.hasAttribute("data-native-system-filters") ||
          Array.from(searchToolbar?.children ?? []).some(
            (child) =>
              child !== currentHost &&
              (child.matches('[data-system-add-filters="true"]') ||
                Boolean(child.querySelector('[data-system-add-filters="true"]')) ||
                (child instanceof HTMLElement && child.innerText.trim() === "Add filters") ||
                Array.from(child.querySelectorAll("button")).some(
                  (button) => button.textContent?.trim() === "Add filters",
                )),
          ),
        );
        if (hasNativeSystemFilters) {
          currentHost?.remove();
          currentHost = null;
          setHost(null);
          return;
        }
        if (!currentHost || !currentHost.isConnected) {
          const nextHost = document.createElement("div");
          nextHost.className = "ocr-context-filters flex flex-shrink-0 items-center";
          // OCR toolbars often use `justify-between`. Reserving the remaining
          // space after this host keeps Add filter attached to Search while
          // the independent action icons remain aligned on the far right.
          nextHost.style.marginLeft = "0";
          nextHost.style.marginRight = "auto";
          search.insertAdjacentElement("afterend", nextHost);
          currentHost = nextHost;
          setHost(nextHost);
        }

        if (!currentHost) return;
        // Automation processes uses a compact 4 px Search → Add filters gap.
        // Offset the toolbar's own (screen-specific) flex gap so every screen
        // keeps that same visual distance without moving the action group.
        const toolbarGap = searchToolbar
          ? Number.parseFloat(window.getComputedStyle(searchToolbar).columnGap) || 0
          : 0;
        currentHost.style.marginLeft = `${4 - toolbarGap}px`;
        const inspected = inspectCurrentTable(root);
        setColumns((current) => {
          const nextSignature = inspected.columns.map((column) => `${column.key}:${column.options.join("|")}`).join(";");
          const currentSignature = current.map((column) => `${column.key}:${column.options.join("|")}`).join(";");
          return nextSignature === currentSignature ? current : inspected.columns;
        });
        setRows(inspected.rows);
      });
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", inspect);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", inspect);
      currentHost?.remove();
    };
  }, [contextKey]);

  useEffect(() => {
    rows.forEach(({ element, values: rowValues }) => {
      const matches = activeKeys.every((key) => {
        const selected = values[key] ?? [];
        return selected.length === 0 || selected.includes(rowValues[key]);
      });
      element.style.display = matches ? "" : "none";
      element.dataset.ocrContextFiltered = "true";
    });
  }, [activeKeys, rows, values]);

  useEffect(
    () => () => {
      document
        .querySelectorAll<HTMLElement>("[data-ocr-context-filtered]")
        .forEach((element) => {
          element.style.display = "";
          delete element.dataset.ocrContextFiltered;
        });
    },
    [],
  );

  const filterColumns = useMemo<SystemFilterColumn[]>(
    () => columns.map(({ key, label, options }) => ({ key, label, options })),
    [columns],
  );

  if (!host || filterColumns.length === 0) return null;
  return createPortal(
    <SystemAddFilters
      columns={filterColumns}
      activeKeys={activeKeys}
      values={values}
      onActiveKeysChange={setActiveKeys}
      onValuesChange={setValues}
      persistenceKey={`finansu-harmonija:v7:filters:ocr:${contextKey}`}
    />,
    host,
  );
}
