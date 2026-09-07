import { getCurrentUserIdentity } from "../lib/currentUser";

export const OCR_DOCUMENT_WORK_LOG_KEY = "finansu-harmonija:v12:ocr:review-work-log";

export type OcrDocumentWorkEntry = {
  seconds: number;
  user: string;
  email?: string;
  documentName?: string;
  updatedAt: string;
};

export type OcrDocumentWorkLog = Record<string, OcrDocumentWorkEntry>;

export function recordOcrDocumentWorkTime(documentId: string, documentName: string, seconds: number) {
  if (typeof window === "undefined" || !documentId || seconds <= 0) return;

  try {
    const current = JSON.parse(window.localStorage.getItem(OCR_DOCUMENT_WORK_LOG_KEY) || "{}") as OcrDocumentWorkLog;
    const previous = current[documentId];
    const identity = getCurrentUserIdentity();
    const next: OcrDocumentWorkLog = {
      ...current,
      [documentId]: {
        seconds: (previous?.seconds ?? 0) + seconds,
        user: identity.fullName,
        email: identity.email,
        documentName,
        updatedAt: new Date().toISOString(),
      },
    };
    window.localStorage.setItem(OCR_DOCUMENT_WORK_LOG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("finansu-harmonija:persistent-state-changed", {
      detail: { storageKey: OCR_DOCUMENT_WORK_LOG_KEY },
    }));
  } catch {
    // Editing must stay usable even when browser storage is unavailable.
  }
}
