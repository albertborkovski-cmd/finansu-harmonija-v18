import { useEffect, useState } from "react";
import { getAttentionNotifications, SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS } from "../lib/notifications";

const NOTIFICATIONS_KEY = "finansu-harmonija:v7:notifications";
const REMINDERS_KEY = "finansu-harmonija:v7:reminders";

function readAttentionNotifications() {
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
  );
}

/** Read the same records as Notifications & Reminders without writing to them. */
export function useAttentionNotifications() {
  const [rows, setRows] = useState(readAttentionNotifications);
  useEffect(() => {
    const refresh = (event: Event) => {
      const key = event instanceof StorageEvent
        ? event.key
        : (event as CustomEvent<{ storageKey?: string }>).detail?.storageKey;
      if (!key || key === NOTIFICATIONS_KEY || key === REMINDERS_KEY) {
        setRows(readAttentionNotifications());
      }
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("finansu-harmonija:persistent-state-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("finansu-harmonija:persistent-state-changed", refresh);
    };
  }, []);
  return rows;
}
