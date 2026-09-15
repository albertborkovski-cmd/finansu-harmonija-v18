import { useEffect, useState } from "react";
import { getAttentionNotifications, SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS } from "../lib/notifications";
import { startTaskReminderScheduler } from "../lib/taskReminderRuntime";

const NOTIFICATIONS_KEY = "finansu-harmonija:v7:notifications";
const REMINDERS_KEY = "finansu-harmonija:v7:reminders";

function readAttentionNotifications(includeInactive = false) {
  function read<T>(key: string, fallback: T[]): T[] {
    try {
      const stored = localStorage.getItem(key);
      const rows = stored === null ? fallback : JSON.parse(stored);
      return Array.isArray(rows) ? rows : fallback;
    } catch {
      return fallback;
    }
  }
  return getAttentionNotifications(
    read(NOTIFICATIONS_KEY, SAMPLE_NOTIFICATIONS),
    read(REMINDERS_KEY, SAMPLE_REMINDERS),
    includeInactive,
  );
}

/** Shared records and one browser-local scheduler for explicitly configured task reminders. */
export function useAttentionNotifications(includeInactive = false) {
  const [rows, setRows] = useState(() => readAttentionNotifications(includeInactive));
  useEffect(() => {
    const refresh = (event: Event) => {
      const key = event instanceof StorageEvent
        ? event.key
        : (event as CustomEvent<{ storageKey?: string }>).detail?.storageKey;
      if (!key || key === NOTIFICATIONS_KEY || key === REMINDERS_KEY) {
        setRows(readAttentionNotifications(includeInactive));
      }
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("finansu-harmonija:persistent-state-changed", refresh);
    const stopReminders = startTaskReminderScheduler();
    setRows(readAttentionNotifications(includeInactive));
    return () => {
      stopReminders();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("finansu-harmonija:persistent-state-changed", refresh);
    };
  }, [includeInactive]);
  return rows;
}
