const MENU_IMPORT_HISTORY_KEY = "finansu-harmonija:v12:menu-import-history";

interface MenuImportBatch {
  scope: string;
  importedAt: string;
  recordIds: string[];
}

/** System-wide IMPORTDATA contract: import every record belonging to the current menu. */
export function importMenuRecords(scope: string, recordIds: string[]) {
  const uniqueIds = Array.from(new Set(recordIds.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  const batch: MenuImportBatch = {
    scope,
    importedAt: new Date().toISOString(),
    recordIds: uniqueIds,
  };

  try {
    const current = JSON.parse(
      window.localStorage.getItem(MENU_IMPORT_HISTORY_KEY) ?? "[]",
    ) as MenuImportBatch[];
    const history = Array.isArray(current) ? current : [];
    window.localStorage.setItem(
      MENU_IMPORT_HISTORY_KEY,
      JSON.stringify([...history.slice(-49), batch]),
    );
    window.dispatchEvent(
      new CustomEvent("finansu-harmonija:menu-imported", { detail: batch }),
    );
  } catch {
    // Importing must remain available even when browser storage is unavailable.
  }

  return uniqueIds.length;
}
