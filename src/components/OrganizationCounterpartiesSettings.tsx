import { useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

type FieldRule = {
  required: boolean;
  autoAssign: boolean;
  defaultValue: string;
};

type ExportIntegration = {
  id: string;
  name: string;
  apiUrl: string;
};

type CounterpartiesSettings = {
  exportFormat: string;
  exportIntegrations: ExportIntegration[];
  apiKey: string;
  databaseName: string;
  productAccountRelationCode: string;
  productType: string;
  automaticUpdates: string[];
  salesPaymentAccountCode: string;
  purchasePaymentAccountCode: string;
  operationType: string;
  physicalBuyerCodeMode: string;
  physicalBuyerFixedValue: string;
  primaryLineCode: string;
  automaticFieldAssignment: string;
  vatSeparation: string;
  otherSettings: string[];
  fieldSettings: Record<string, FieldRule>;
};

const FIELD_NAMES = [
  "Department",
  "Object",
  "Series",
  "Cost center",
  "Responsible person",
  "Product group",
  "General ledger account",
  "VAT classifier",
];

const DEFAULT_SETTINGS: CounterpartiesSettings = {
  exportFormat: "Rivilė",
  exportIntegrations: [
    { id: "rivile", name: "Rivilė", apiUrl: "" },
    { id: "rivile-api", name: "Rivilė API", apiUrl: "" },
    { id: "agnum", name: "Agnum", apiUrl: "" },
  ],
  apiKey: "",
  databaseName: "",
  productAccountRelationCode: "",
  productType: "",
  automaticUpdates: [],
  salesPaymentAccountCode: "",
  purchasePaymentAccountCode: "",
  operationType: "Waybill",
  physicalBuyerCodeMode: "Unique value per person",
  physicalBuyerFixedValue: "",
  primaryLineCode: "Barcode, then line code",
  automaticFieldAssignment: "During digitization",
  vatSeparation: "Automatic",
  otherSettings: [],
  fieldSettings: Object.fromEntries(
    FIELD_NAMES.map((name) => [
      name,
      { required: false, autoAssign: false, defaultValue: "" },
    ]),
  ),
};

function parseSettings(value: string): CounterpartiesSettings {
  try {
    const parsed = JSON.parse(value || "{}") as Partial<CounterpartiesSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      exportIntegrations:
        parsed.exportIntegrations ?? DEFAULT_SETTINGS.exportIntegrations,
      automaticUpdates: parsed.automaticUpdates ?? [],
      otherSettings: parsed.otherSettings ?? [],
      fieldSettings: {
        ...DEFAULT_SETTINGS.fieldSettings,
        ...(parsed.fieldSettings ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function SystemSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
      {label}
      <SearchableSelect ariaLabel={label} value={value} options={options} onChange={onChange} placeholder="Select export format" />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
      {label}
      <input
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        className={`h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[14px] font-medium outline-none focus:border-[#007EA7] ${readOnly ? "bg-[#F7FBFC] text-[#7288A3]" : "bg-white text-[#10233A]"}`}
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  hideLabel = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 font-montserrat text-[13px] font-medium text-[#10233A]">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${checked ? "border-[#007EA7] bg-[#007EA7] text-white" : "border-[#AFC5D6] bg-white"}`}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </button>
      {!hideLabel && label}
    </label>
  );
}

export default function OrganizationCounterpartiesSettings({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [apiStatus, setApiStatus] = useState("");
  const [checkingApi, setCheckingApi] = useState(false);
  const [manageFormatsOpen, setManageFormatsOpen] = useState(false);
  const settings = useMemo(() => parseSettings(value), [value]);
  const update = (patch: Partial<CounterpartiesSettings>) =>
    onChange(JSON.stringify({ ...settings, ...patch }));
  const toggleList = (
    key: "automaticUpdates" | "otherSettings",
    item: string,
    checked: boolean,
  ) =>
    update({
      [key]: checked
        ? [...settings[key], item]
        : settings[key].filter((entry) => entry !== item),
    });

  const retrieveDatabaseName = async () => {
    if (!settings.apiKey.trim()) {
      setApiStatus("Enter an API key first.");
      return;
    }
    const selectedIntegration = settings.exportIntegrations.find(
      (integration) => integration.name === settings.exportFormat,
    );
    const apiUrl =
      selectedIntegration?.apiUrl.trim() ||
      (import.meta.env.VITE_RIVILE_API_URL as string | undefined);
    if (!apiUrl) {
      setApiStatus("The selected export API connection is not configured.");
      return;
    }
    setCheckingApi(true);
    setApiStatus("");
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/database`, {
        headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
      });
      if (!response.ok)
        throw new Error(`API request failed (${response.status})`);
      const result = (await response.json()) as Record<string, unknown>;
      const databaseName = String(
        result.databaseName ?? result.dbName ?? result.name ?? "",
      ).trim();
      if (!databaseName) throw new Error("API did not return a database name");
      update({ databaseName });
      setApiStatus("Database name retrieved successfully.");
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Database name could not be retrieved.",
      );
    } finally {
      setCheckingApi(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-4">
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-[#DDE7F0] bg-white p-5 md:grid-cols-2">
        <h3 className="col-span-full font-montserrat text-[16px] font-semibold text-[#10233A]">
          Export settings
        </h3>
        <div className="flex flex-col gap-2">
          <SystemSelect
            label="Export format"
            value={settings.exportFormat}
            options={settings.exportIntegrations
              .map((integration) => integration.name.trim())
              .filter(Boolean)}
            onChange={(exportFormat) => update({ exportFormat })}
          />
          <button
            type="button"
            onClick={() => setManageFormatsOpen(true)}
            className="self-start font-montserrat text-[12px] font-semibold text-[#007EA7] hover:underline"
          >
            Manage export formats
          </button>
        </div>
        <TextField
          label="API key"
          value={settings.apiKey}
          placeholder="Enter API key"
          onChange={(apiKey) => update({ apiKey })}
        />
        <div className="col-span-full flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={retrieveDatabaseName}
            disabled={checkingApi}
            className="h-9 rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[13px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7] disabled:opacity-50"
          >
            {checkingApi ? "Checking API..." : "Retrieve database name"}
          </button>
          {apiStatus && (
            <span
              role="status"
              className="font-montserrat text-[12px] font-medium text-[#7288A3]"
            >
              {apiStatus}
            </span>
          )}
        </div>
        <TextField
          label="Database name (retrieved via API)"
          value={settings.databaseName}
          readOnly
          placeholder="Returned after API validation"
        />
        <TextField
          label="Product account relation code"
          value={settings.productAccountRelationCode}
          onChange={(productAccountRelationCode) =>
            update({ productAccountRelationCode })
          }
        />
        <TextField
          label="Product type"
          value={settings.productType}
          onChange={(productType) => update({ productType })}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-[#DDE7F0] bg-white p-5 md:grid-cols-2">
        <h3 className="col-span-full font-montserrat text-[16px] font-semibold text-[#10233A]">
          Accounting and operation settings
        </h3>
        <TextField
          label="Sales payment account code"
          value={settings.salesPaymentAccountCode}
          onChange={(salesPaymentAccountCode) =>
            update({ salesPaymentAccountCode })
          }
        />
        <TextField
          label="Purchase payment account code"
          value={settings.purchasePaymentAccountCode}
          onChange={(purchasePaymentAccountCode) =>
            update({ purchasePaymentAccountCode })
          }
        />
        <SystemSelect
          label="Operation type"
          value={settings.operationType}
          options={["Waybill", "Order", "Reservation", "Offer"]}
          onChange={(operationType) => update({ operationType })}
        />
        <SystemSelect
          label="Physical buyer code"
          value={settings.physicalBuyerCodeMode}
          options={["Unique value per person", "Fixed value"]}
          onChange={(physicalBuyerCodeMode) =>
            update({ physicalBuyerCodeMode })
          }
        />
        {settings.physicalBuyerCodeMode === "Fixed value" && (
          <TextField
            label="Fixed physical buyer code"
            value={settings.physicalBuyerFixedValue}
            onChange={(physicalBuyerFixedValue) =>
              update({ physicalBuyerFixedValue })
            }
          />
        )}
        <SystemSelect
          label="Primary line code"
          value={settings.primaryLineCode}
          options={["Barcode, then line code", "Line code, then barcode"]}
          onChange={(primaryLineCode) => update({ primaryLineCode })}
        />
        <SystemSelect
          label="Automatic field assignment"
          value={settings.automaticFieldAssignment}
          options={["During digitization", "During export"]}
          onChange={(automaticFieldAssignment) =>
            update({ automaticFieldAssignment })
          }
        />
        <SystemSelect
          label="VAT separation"
          value={settings.vatSeparation}
          options={[
            "Automatic",
            "Separate VAT for non-VAT payers",
            "Do not separate VAT for VAT payers",
          ]}
          onChange={(vatSeparation) => update({ vatSeparation })}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 rounded-xl border border-[#DDE7F0] bg-white p-5 md:grid-cols-2">
        <div>
          <h3 className="mb-3 font-montserrat text-[15px] font-semibold text-[#10233A]">
            Expense update settings
          </h3>
          {[
            "Automatically update products",
            "Automatically update services",
            "Automatically update codes",
            "Automatically transfer document in Rivilė",
          ].map((item) => (
            <CheckRow
              key={item}
              label={item}
              checked={settings.automaticUpdates.includes(item)}
              onChange={(checked) =>
                toggleList("automaticUpdates", item, checked)
              }
            />
          ))}
        </div>
        <div>
          <h3 className="mb-3 font-montserrat text-[15px] font-semibold text-[#10233A]">
            Other settings
          </h3>
          {[
            "Use company code as VAT code for foreign companies",
            "Use document date as payment term when missing",
            "Create new companies during export",
            "Create new products during export",
            "Export invoices immediately after digitization",
          ].map((item) => (
            <CheckRow
              key={item}
              label={item}
              checked={settings.otherSettings.includes(item)}
              onChange={(checked) => toggleList("otherSettings", item, checked)}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#DDE7F0] bg-white">
        <div className="border-b border-[#DDE7F0] px-5 py-4">
          <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">
            Field settings
          </h3>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <div className="grid grid-cols-[minmax(100px,1.25fr)_74px_112px_minmax(120px,1.5fr)] items-center bg-[#F7FBFC] px-3 py-3 font-montserrat text-[11px] font-semibold text-[#7288A3] sm:px-5 sm:text-[12px]">
              <span>Field</span>
              <span>Required</span>
              <span>Assign automatically</span>
              <span>Default value</span>
            </div>
            {FIELD_NAMES.map((name) => {
              const rule = settings.fieldSettings[name];
              const updateRule = (patch: Partial<FieldRule>) =>
                update({
                  fieldSettings: {
                    ...settings.fieldSettings,
                    [name]: { ...rule, ...patch },
                  },
                });
              return (
                <div
                  key={name}
                  className="grid grid-cols-[minmax(100px,1.25fr)_74px_112px_minmax(120px,1.5fr)] items-center border-t border-[#EEF3F7] px-3 py-2 sm:px-5"
                >
                  <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                    {name}
                  </span>
                  <CheckRow
                    label={`${name} required`}
                    checked={rule.required}
                    onChange={(required) => updateRule({ required })}
                    hideLabel
                  />
                  <CheckRow
                    label={`Assign ${name} automatically`}
                    checked={rule.autoAssign}
                    onChange={(autoAssign) => updateRule({ autoAssign })}
                    hideLabel
                  />
                  <input
                    aria-label={`${name} default value`}
                    value={rule.defaultValue}
                    onChange={(event) =>
                      updateRule({ defaultValue: event.target.value })
                    }
                    className="h-9 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {manageFormatsOpen && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-[#10233A]/20 p-6"
          onMouseDown={() => setManageFormatsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Manage export formats"
            className="flex max-h-[82vh] w-[760px] max-w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_16px_44px_rgba(16,35,58,0.18)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#DDE7F0] px-6 py-5">
              <div>
                <h2 className="font-montserrat text-[20px] font-semibold text-[#10233A]">
                  Export formats and API connections
                </h2>
                <p className="mt-1 font-montserrat text-[12px] font-medium text-[#7288A3]">
                  Add or remove export systems and configure their API address.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close export formats"
                onClick={() => setManageFormatsOpen(false)}
                className="flex h-8 w-8 items-center justify-center text-[#7288A3] hover:text-[#10233A]"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex items-center justify-end px-6 py-4">
              <button
                type="button"
                onClick={() =>
                  update({
                    exportIntegrations: [
                      ...settings.exportIntegrations,
                      {
                        id: crypto.randomUUID(),
                        name: `New format ${settings.exportIntegrations.length + 1}`,
                        apiUrl: "",
                      },
                    ],
                  })
                }
                className="flex h-9 items-center gap-2 rounded-lg bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white hover:bg-[#006D91]"
              >
                <Plus size={16} /> Add format
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-6">
              <div className="grid grid-cols-[1fr_1.5fr_44px] gap-3 border-b border-[#DDE7F0] px-2 pb-2 font-montserrat text-[12px] font-semibold text-[#7288A3]">
                <span>Export format</span>
                <span>API base URL</span>
                <span />
              </div>
              {settings.exportIntegrations.length === 0 ? (
                <div className="flex h-32 items-center justify-center font-montserrat text-[13px] font-medium text-[#7288A3]">
                  No export formats. Use “Add format” to create one.
                </div>
              ) : (
                settings.exportIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="grid grid-cols-[1fr_1.5fr_44px] items-center gap-3 border-b border-[#EEF3F7] px-2 py-2"
                  >
                    <input
                      aria-label={`Export format ${integration.name}`}
                      value={integration.name}
                      onChange={(event) => {
                        const previousName = integration.name;
                        const exportIntegrations =
                          settings.exportIntegrations.map((item) =>
                            item.id === integration.id
                              ? { ...item, name: event.target.value }
                              : item,
                          );
                        update({
                          exportIntegrations,
                          exportFormat:
                            settings.exportFormat === previousName
                              ? event.target.value
                              : settings.exportFormat,
                        });
                      }}
                      className="h-9 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                    <input
                      aria-label={`${integration.name} API URL`}
                      value={integration.apiUrl}
                      placeholder="https://api.example.com"
                      onChange={(event) =>
                        update({
                          exportIntegrations: settings.exportIntegrations.map(
                            (item) =>
                              item.id === integration.id
                                ? { ...item, apiUrl: event.target.value }
                                : item,
                          ),
                        })
                      }
                      className="h-9 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${integration.name}`}
                      onClick={() => {
                        const exportIntegrations =
                          settings.exportIntegrations.filter(
                            (item) => item.id !== integration.id,
                          );
                        update({
                          exportIntegrations,
                          exportFormat:
                            settings.exportFormat === integration.name
                              ? (exportIntegrations[0]?.name ?? "")
                              : settings.exportFormat,
                        });
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#FFF1F1] hover:text-[#E45858]"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end border-t border-[#DDE7F0] px-6 py-4">
              <button
                type="button"
                onClick={() => setManageFormatsOpen(false)}
                className="h-[42px] rounded-lg bg-[#007EA7] px-6 font-montserrat text-[14px] font-semibold text-white hover:bg-[#006D91]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
