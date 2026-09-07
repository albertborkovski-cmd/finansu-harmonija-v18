export type OcrFieldValidationLevel = "red" | "yellow" | "green";

export type OcrFieldValidationRule = {
  key: string;
  label: string;
  type: string;
  subtype: string;
  level: OcrFieldValidationLevel;
  description?: string;
  confidenceThreshold?: number;
};

export const DEFAULT_OCR_CONFIDENCE_THRESHOLD = 90;

export function ocrConfidenceThreshold(rule: OcrFieldValidationRule) {
  const value = Number(rule.confidenceThreshold);
  if (!Number.isFinite(value)) return DEFAULT_OCR_CONFIDENCE_THRESHOLD;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function requiresMesoWorkerReview(
  rule: OcrFieldValidationRule,
  confidence: number,
) {
  return rule.level === "red" && confidence < ocrConfidenceThreshold(rule);
}

export const OCR_FIELD_VALIDATION_STORAGE_KEY = "finansu-harmonija:v12:ocr:field-validation";
export const OCR_FIELD_VALIDATION_DELETED_KEY = "finansu-harmonija:v12:ocr:field-validation:deleted";
export const OCR_FIELD_VALIDATION_CHANGED_EVENT = "finansu-harmonija:ocr-field-validation-changed";

export const DEFAULT_OCR_FIELD_VALIDATION_RULES: OcrFieldValidationRule[] = [
  { key: "documentType", label: "Type", type: "OCR", subtype: "OCR", level: "red" },
  { key: "invoice", label: "Invoice", type: "OCR", subtype: "OCR", level: "red" },
  { key: "documentDate", label: "Document date", type: "OCR", subtype: "OCR", level: "red" },
  { key: "documentPurpose", label: "Document purpose", type: "OCR", subtype: "OCR", level: "yellow" },
  { key: "operationDate", label: "Operation date", type: "OCR", subtype: "OCR", level: "red" },
  { key: "number", label: "Number / series", type: "OCR", subtype: "OCR", level: "red" },
  { key: "clientCounterparty", label: "Client / Counterparty", type: "OCR", subtype: "OCR", level: "red" },
  { key: "counterpartyCode", label: "Counterparty code", type: "OCR", subtype: "OCR", level: "red" },
  { key: "amountWithoutVat", label: "Amount without VAT", type: "OCR", subtype: "OCR", level: "red" },
  { key: "vat", label: "VAT", type: "OCR", subtype: "OCR", level: "red" },
  { key: "vatPercent", label: "VAT %", type: "OCR", subtype: "OCR", level: "red" },
  { key: "totalAmount", label: "Total amount with VAT", type: "OCR", subtype: "OCR", level: "red" },
  { key: "dueEndDate", label: "Due / End date", type: "OCR", subtype: "OCR", level: "yellow" },
  { key: "validFrom", label: "Valid from", type: "OCR", subtype: "OCR", level: "yellow" },
  { key: "orderNo", label: "Order number", type: "OCR", subtype: "OCR", level: "yellow" },
  { key: "departmentCode", label: "Department code", type: "OCR", subtype: "OCR", level: "green" },
  { key: "objectProject", label: "Object / Project", type: "OCR", subtype: "OCR", level: "green" },
  { key: "series", label: "Series", type: "OCR", subtype: "OCR", level: "green" },
  { key: "costCenter", label: "Cost center", type: "OCR", subtype: "OCR", level: "green" },
  { key: "accountablePerson", label: "Accountable person", type: "OCR", subtype: "OCR", level: "green" },
  { key: "approvedBy", label: "Approved by", type: "OCR", subtype: "OCR", level: "green" },
  { key: "glAccount", label: "GL account", type: "OCR", subtype: "OCR", level: "green" },
  { key: "vatClassifier", label: "VAT classifier", type: "OCR", subtype: "OCR", level: "yellow" },
  { key: "productGroup", label: "Product Group", type: "OCR", subtype: "OCR", level: "green" },
  { key: "source", label: "Source", type: "OCR", subtype: "OCR", level: "green" },
  { key: "fileCase", label: "Document link", type: "OCR", subtype: "OCR", level: "green" },
  { key: "currency", label: "Currency", type: "OCR", subtype: "OCR", level: "red" },
  { key: "status", label: "Status", type: "OCR", subtype: "OCR", level: "yellow" },
];

export function loadOcrFieldValidationRules(): OcrFieldValidationRule[] {
  try {
    const deletedKeys = new Set<string>(JSON.parse(
      window.localStorage.getItem(OCR_FIELD_VALIDATION_DELETED_KEY) ?? "[]",
    ));
    const stored = window.localStorage.getItem(OCR_FIELD_VALIDATION_STORAGE_KEY);
    if (!stored) return DEFAULT_OCR_FIELD_VALIDATION_RULES.filter((rule) => !deletedKeys.has(rule.key));
    const parsed = JSON.parse(stored) as OcrFieldValidationRule[];
    if (!Array.isArray(parsed)) return DEFAULT_OCR_FIELD_VALIDATION_RULES;
    const savedByKey = new Map(parsed.map((rule) => [rule.key, rule]));
    const defaultKeys = new Set(DEFAULT_OCR_FIELD_VALIDATION_RULES.map((rule) => rule.key));
    const mergedDefaults = DEFAULT_OCR_FIELD_VALIDATION_RULES
      .filter((rule) => !deletedKeys.has(rule.key))
      .map((defaultRule) => ({
      ...defaultRule,
      ...savedByKey.get(defaultRule.key),
      confidenceThreshold: ocrConfidenceThreshold({
        ...defaultRule,
        ...savedByKey.get(defaultRule.key),
      }),
      }));
    const customRules = parsed
      .filter((rule) => !defaultKeys.has(rule.key) && !deletedKeys.has(rule.key))
      .map((rule) => ({ ...rule, confidenceThreshold: ocrConfidenceThreshold(rule) }));
    return [...mergedDefaults, ...customRules];
  } catch {
    return DEFAULT_OCR_FIELD_VALIDATION_RULES;
  }
}

export function saveOcrFieldValidationRules(rules: OcrFieldValidationRule[]) {
  const normalizedRules = rules.map((rule) => ({
    ...rule,
    confidenceThreshold: ocrConfidenceThreshold(rule),
  }));
  window.localStorage.setItem(OCR_FIELD_VALIDATION_STORAGE_KEY, JSON.stringify(normalizedRules));
  window.dispatchEvent(new CustomEvent(OCR_FIELD_VALIDATION_CHANGED_EVENT));
}

export function markOcrFieldValidationRulesDeleted(keys: string[]) {
  try {
    const current = JSON.parse(
      window.localStorage.getItem(OCR_FIELD_VALIDATION_DELETED_KEY) ?? "[]",
    ) as string[];
    const deletedKeys = new Set(Array.isArray(current) ? current : []);
    keys.forEach((key) => deletedKeys.add(key));
    window.localStorage.setItem(OCR_FIELD_VALIDATION_DELETED_KEY, JSON.stringify([...deletedKeys]));
    window.dispatchEvent(new CustomEvent(OCR_FIELD_VALIDATION_CHANGED_EVENT));
  } catch {
    // The current view still removes records when browser storage is unavailable.
  }
}
