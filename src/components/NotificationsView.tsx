import React, { useMemo, useState } from "react";
import { RefreshCw, ChevronDown, X, Check, Pencil, Trash2 } from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { PageActionButton, PageHeader } from "./PageHeader";
import { SystemBreadcrumb } from "./SystemNavigation";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import OcrSearchField from "./OcrSearchField";
import { useColumnResize, ResizeHandle } from "./useColumnResize";
import { ColumnSettingsButton, SaveButton } from "./ScopedActionButtons";
import ImportButton from "./ImportButton";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { matchesTextSearch } from "../utils/textSearch";
import { usePersistentState } from "../hooks/usePersistentState";
import SystemAddFilters from "./SystemAddFilters";

import { SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS, type NotificationRow, type ReminderRow, type NotificationTab as Tab } from "../lib/notifications";

const NOTIF_INITIAL_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", width: 280, visible: true },
  { key: "type", label: "Type", width: 180, visible: true },
  { key: "message", label: "Description", width: 280, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
];
const REMIND_INITIAL_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", width: 200, visible: true },
  { key: "type", label: "Type", width: 150, visible: true },
  {
    key: "daysTillRemind",
    label: "Days till remind",
    width: 150,
    visible: true,
  },
  { key: "message", label: "Description", width: 250, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
];

type PanelMode =
  | null
  | "add-notification"
  | "edit-notification"
  | "add-reminder"
  | "edit-reminder";

export default function NotificationsView({ initialTab = "notifications", initialQuery = "" }: { initialTab?: Tab; initialQuery?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [notificationRows, setNotificationRows] = usePersistentState<
    NotificationRow[]
  >("finansu-harmonija:v7:notifications", SAMPLE_NOTIFICATIONS);
  const [reminderRows, setReminderRows] = usePersistentState<ReminderRow[]>(
    "finansu-harmonija:v7:reminders",
    SAMPLE_REMINDERS,
  );
  const [query, setQuery] = useState(initialQuery);
  const [additionalFilters, setAdditionalFilters] = useState<
    Record<string, string[]>
  >({});
  const filteredNotificationRows = useMemo(
    () =>
      notificationRows.filter(
        (row) =>
          matchesTextSearch(row, query) &&
          Object.entries(additionalFilters).every(
            ([key, values]) =>
              values.length === 0 ||
              values.includes(String(row[key as keyof NotificationRow] ?? "")),
          ),
      ),
    [notificationRows, query, additionalFilters],
  );
  const filteredReminderRows = useMemo(
    () =>
      reminderRows.filter(
        (row) =>
          matchesTextSearch(row, query) &&
          Object.entries(additionalFilters).every(
            ([key, values]) =>
              values.length === 0 ||
              values.includes(String(row[key as keyof ReminderRow] ?? "")),
          ),
      ),
    [reminderRows, query, additionalFilters],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 5;

  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const [showNotifColSettings, setShowNotifColSettings] = useState(false);
  const [showRemindColSettings, setShowRemindColSettings] = useState(false);
  const [notifColumns, setNotifColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v7:notification-columns",
    NOTIF_INITIAL_COLUMNS,
  );
  const [remindColumns, setRemindColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v7:reminder-columns",
    REMIND_INITIAL_COLUMNS,
  );

  const { startResize: startResizeNotif } = useColumnResize(
    notifColumns,
    setNotifColumns,
  );
  const { startResize: startResizeRemind } = useColumnResize(
    remindColumns,
    setRemindColumns,
  );

  // Form fields
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [showNotificationTypeMenu, setShowNotificationTypeMenu] =
    useState(false);
  const [showReminderTypeMenu, setShowReminderTypeMenu] = useState(false);
  const [showReminderDaysMenu, setShowReminderDaysMenu] = useState(false);
  const [formDaysTillRemind, setFormDaysTillRemind] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formActive, setFormActive] = useState(true);

  const openAddNotification = () => {
    setFormName("");
    setFormType("");
    setFormDescription("");
    setFormActive(true);
    setPanelMode("add-notification");
    setEditId(null);
  };

  const openEditNotification = (row: NotificationRow) => {
    setFormName(row.name);
    setFormType(row.type);
    setFormDescription(row.message);
    setFormActive(row.status === "Active");
    setPanelMode("edit-notification");
    setEditId(row.id);
  };

  const openAddReminder = () => {
    setFormName("");
    setFormType("");
    setFormDaysTillRemind("");
    setFormDescription("");
    setFormActive(true);
    setPanelMode("add-reminder");
    setEditId(null);
  };

  const openEditReminder = (row: ReminderRow) => {
    setFormName(row.name);
    setFormType(row.type);
    setFormDaysTillRemind(row.daysTillRemind);
    setFormDescription(row.message);
    setFormActive(row.status === "Active");
    setPanelMode("edit-reminder");
    setEditId(row.id);
  };

  const closePanel = () => {
    setPanelMode(null);
    setEditId(null);
    setShowNotificationTypeMenu(false);
    setShowReminderTypeMenu(false);
    setShowReminderDaysMenu(false);
  };

  const notificationTypeOptions = [
    "Transaction",
    "System",
    "Billing",
    "Document",
  ];
  const reminderTypeOptions = [
    "Scheduled",
    "Deadline",
    "Recurring",
    "Maintenance",
  ];
  const reminderDaysOptions = ["1", "3", "7", "14", "30"];
  const selectNotificationType = (type: string) => {
    setFormType(type);
    setShowNotificationTypeMenu(false);
  };

  const savePanel = () => {
    const status: "Active" | "Inactive" = formActive ? "Active" : "Inactive";
    if (panelMode === "edit-notification" && editId) {
      setNotificationRows((current) =>
        current.map((row) =>
          row.id === editId
            ? {
                ...row,
                name: formName.trim(),
                type: formType,
                message: formDescription,
                status,
              }
            : row,
        ),
      );
    } else if (panelMode === "add-notification") {
      setNotificationRows((current) => [
        ...current,
        {
          id: `notification-${Date.now()}`,
          createdAt: new Date().toISOString(),
          name: formName.trim(),
          type: formType,
          message: formDescription,
          status,
        },
      ]);
    } else if (panelMode === "edit-reminder" && editId) {
      setReminderRows((current) =>
        current.map((row) =>
          row.id === editId
            ? {
                ...row,
                name: formName.trim(),
                type: formType,
                daysTillRemind: formDaysTillRemind,
                message: formDescription,
                status,
              }
            : row,
        ),
      );
    } else if (panelMode === "add-reminder") {
      setReminderRows((current) => [
        ...current,
        {
          id: `reminder-${Date.now()}`,
          createdAt: new Date().toISOString(),
          name: formName.trim(),
          type: formType,
          daysTillRemind: formDaysTillRemind,
          message: formDescription,
          status,
        },
      ]);
    }
    closePanel();
  };

  return (
    <div
      className="flex flex-col bg-white px-9 py-14 gap-8 min-h-full relative"
      style={{
        paddingLeft: "clamp(24px, 5vw, 72px)",
        paddingRight: "clamp(24px, 5vw, 72px)",
      }}
    >
      {/* Header */}
      <PageHeader
        title="Notifications & Reminders"
        actions={
          <PageActionButton
            onClick={
              activeTab === "notifications"
                ? openAddNotification
                : openAddReminder
            }
          >
            {activeTab === "notifications"
              ? "Add notification"
              : "Add reminder"}
          </PageActionButton>
        }
      />
      <SystemBreadcrumb items={["Notifications"]} />

      {/* Tabs */}
      <div className="flex flex-row border-b border-[#E5EDF9] flex-shrink-0">
        <button
          onClick={() => {
            setActiveTab("notifications");
            setAdditionalFilters({});
          }}
          className={`px-4 pb-3 font-montserrat font-medium text-[14px] leading-5 transition-colors relative ${
            activeTab === "notifications"
              ? "text-[#007EA7]"
              : "text-[#7288A3] hover:text-[#10233A]"
          }`}
        >
          Notifications
          {activeTab === "notifications" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#007EA7]" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("reminders");
            setAdditionalFilters({});
          }}
          className={`px-4 pb-3 font-montserrat font-medium text-[14px] leading-5 transition-colors relative ${
            activeTab === "reminders"
              ? "text-[#007EA7]"
              : "text-[#7288A3] hover:text-[#10233A]"
          }`}
        >
          Reminders
          {activeTab === "reminders" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#007EA7]" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6 flex-1">
        {/* Filter bar */}
        <div className="flex-shrink-0">
          <div className="flex flex-row flex-wrap justify-between items-center gap-2">
            <div className="flex flex-row items-center gap-1 flex-1 min-w-0">
              <SystemAddFilters
                persistenceKey={`finansu-harmonija:v7:filters:notifications:${activeTab}`}
                columns={(activeTab === "notifications"
                  ? notifColumns
                  : remindColumns
                )
                  .map((column) => ({
                    key: column.key,
                    label: column.label,
                    options: Array.from(
                      new Set(
                        (activeTab === "notifications"
                          ? notificationRows
                          : reminderRows
                        ).map((row) =>
                          String(row[column.key as keyof typeof row] ?? ""),
                        ),
                      ),
                    ).filter(Boolean),
                }))}
                activeKeys={Object.keys(additionalFilters)}
                values={additionalFilters}
                onActiveKeysChange={(keys) => {
                  setAdditionalFilters((current) =>
                    Object.fromEntries(
                      keys.map((key) => [key, current[key] ?? []]),
                    ),
                  );
                  setCurrentPage(1);
                }}
                onValuesChange={setAdditionalFilters}
              />

              {/* Search */}
              <OcrSearchField
                ariaLabel="Search notifications"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Toolbar icons */}
            <div className="flex flex-row items-center p-[6px] gap-4 bg-white rounded flex-shrink-0">
              <ColumnSettingsButton
                onClick={() =>
                  activeTab === "notifications"
                    ? setShowNotifColSettings(true)
                    : setShowRemindColSettings(true)
                }
              />
              <ImportButton
                scope={
                  activeTab === "notifications" ? "Notifications" : "Reminders"
                }
              />
              <button
                onClick={() =>
                  activeTab === "notifications"
                    ? setNotificationRows((current) =>
                        current.map((row) => ({ ...row })),
                      )
                    : setReminderRows((current) =>
                        current.map((row) => ({ ...row })),
                      )
                }
                className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors"
                title="REFRESH ALL"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Column Settings Panels */}
        {showNotifColSettings && (
          <ColumnSettingsPanel
            columns={notifColumns}
            onSave={(cols) => {
              setNotifColumns(cols);
              setShowNotifColSettings(false);
            }}
            onClose={() => setShowNotifColSettings(false)}
          />
        )}
        {showRemindColSettings && (
          <ColumnSettingsPanel
            columns={remindColumns}
            onSave={(cols) => {
              setRemindColumns(cols);
              setShowRemindColSettings(false);
            }}
            onClose={() => setShowRemindColSettings(false)}
          />
        )}

        {/* Table */}
        <div className="flex flex-col flex-1">
          <div className="overflow-x-auto scrollbar-hide">
            {activeTab === "notifications" ? (
              <NotificationsTable
                rows={filteredNotificationRows}
                onViewDetails={openEditNotification}
                onDelete={(row) =>
                  setNotificationRows((current) =>
                    current.filter((item) => item.id !== row.id),
                  )
                }
                columns={notifColumns}
                startResize={startResizeNotif}
              />
            ) : (
              <RemindersTable
                rows={filteredReminderRows}
                onViewDetails={openEditReminder}
                onDelete={(row) =>
                  setReminderRows((current) =>
                    current.filter((item) => item.id !== row.id),
                  )
                }
                columns={remindColumns}
                startResize={startResizeRemind}
              />
            )}
          </div>

          <HorizontalTableScrollbar />

          {/* Pagination */}
          <div className="mt-6 flex flex-row items-center justify-between pt-4">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemCount={
                activeTab === "notifications"
                  ? notificationRows.length
                  : reminderRows.length
              }
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {panelMode && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={closePanel}
        >
          <div
            className="relative h-full w-[340px] bg-white flex flex-col gap-6 px-6 pt-6 pb-8 overflow-y-auto"
            style={{ boxShadow: "-2px 0px 0px #E5EDF9" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="flex flex-row justify-between items-center flex-shrink-0">
              <span className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
                {panelMode === "add-notification" && "Add notification"}
                {panelMode === "edit-notification" && "Edit notification"}
                {panelMode === "add-reminder" && "Add reminder"}
                {panelMode === "edit-reminder" && "Edit reminder"}
              </span>
              <button
                onClick={closePanel}
                className="text-[#7288A3] hover:text-[#10233A] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Panel Form */}
            <div className="flex flex-col gap-6 flex-1">
              {/* Name */}
              <div className="flex flex-col gap-2">
                <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                  <span>Name</span>
                  <span className="ml-1 text-[#D64545]">*</span>
                </span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full h-[42px] px-[14px] bg-white border border-[#D3E1EC] rounded-lg font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none focus:border-[#007EA7] transition-colors"
                />
              </div>

              {/* Type */}
              {(panelMode === "add-notification" ||
                panelMode === "edit-notification") && (
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                    Notification type
                    <span className="ml-1 text-[#D64545]">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Notification type"
                      aria-expanded={showNotificationTypeMenu}
                      onClick={() =>
                        setShowNotificationTypeMenu((value) => !value)
                      }
                      className={`flex min-h-[42px] w-full items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium leading-[140%] transition-colors ${showNotificationTypeMenu ? "border-[#007EA7] ring-2 ring-[#007EA7]/10" : "border-[#D3E1EC]"}`}
                    >
                      <span
                        className={
                          formType ? "text-[#10233A]" : "text-[#A1B6C6]"
                        }
                      >
                        {formType || "Select type"}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`flex-shrink-0 text-[#7288A3] transition-transform ${showNotificationTypeMenu ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showNotificationTypeMenu && (
                      <div className="absolute left-0 right-0 top-[46px] z-40 rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                        {notificationTypeOptions.map((type) => {
                          const selected = formType === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => selectNotificationType(type)}
                              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${selected ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                            >
                              <span
                                className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                              >
                                {selected && (
                                  <Check
                                    size={13}
                                    strokeWidth={3}
                                    className="text-white"
                                  />
                                )}
                              </span>
                              <span className="font-montserrat text-[13px] font-medium text-[#7288A3]">
                                {type}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reminder type */}
              {(panelMode === "add-reminder" ||
                panelMode === "edit-reminder") && (
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                    Reminder type<span className="ml-1 text-[#D64545]">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Reminder type"
                      aria-expanded={showReminderTypeMenu}
                      onClick={() => {
                        setShowReminderTypeMenu((value) => !value);
                        setShowReminderDaysMenu(false);
                      }}
                      className={`flex h-[42px] w-full items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium leading-[140%] transition-colors ${showReminderTypeMenu ? "border-[#007EA7] ring-2 ring-[#007EA7]/10" : "border-[#D3E1EC]"}`}
                    >
                      <span
                        className={
                          formType ? "text-[#10233A]" : "text-[#A1B6C6]"
                        }
                      >
                        {formType || "Select reminder type"}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`flex-shrink-0 text-[#7288A3] transition-transform ${showReminderTypeMenu ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showReminderTypeMenu && (
                      <div className="absolute left-0 right-0 top-[46px] z-40 rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                        {reminderTypeOptions.map((option) => {
                          const selected = formType === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setFormType(option);
                                setShowReminderTypeMenu(false);
                              }}
                              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${selected ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                            >
                              <span
                                className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                              >
                                {selected && (
                                  <Check
                                    size={13}
                                    strokeWidth={3}
                                    className="text-white"
                                  />
                                )}
                              </span>
                              <span className="font-montserrat text-[13px] font-medium text-[#7288A3]">
                                {option}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Days till remind */}
              {(panelMode === "add-reminder" ||
                panelMode === "edit-reminder") && (
                <div className="flex flex-col gap-2">
                  <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                    Days till remind
                    <span className="ml-1 text-[#D64545]">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Days till remind"
                      aria-expanded={showReminderDaysMenu}
                      onClick={() => {
                        setShowReminderDaysMenu((value) => !value);
                        setShowReminderTypeMenu(false);
                      }}
                      className={`flex h-[42px] w-full items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium leading-[140%] transition-colors ${showReminderDaysMenu ? "border-[#007EA7] ring-2 ring-[#007EA7]/10" : "border-[#D3E1EC]"}`}
                    >
                      <span
                        className={
                          formDaysTillRemind
                            ? "text-[#10233A]"
                            : "text-[#A1B6C6]"
                        }
                      >
                        {formDaysTillRemind
                          ? `${formDaysTillRemind} ${formDaysTillRemind === "1" ? "day" : "days"}`
                          : "Select number of days"}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`flex-shrink-0 text-[#7288A3] transition-transform ${showReminderDaysMenu ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showReminderDaysMenu && (
                      <div className="absolute left-0 right-0 top-[46px] z-40 rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                        {reminderDaysOptions.map((option) => {
                          const selected = formDaysTillRemind === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setFormDaysTillRemind(option);
                                setShowReminderDaysMenu(false);
                              }}
                              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${selected ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                            >
                              <span
                                className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                              >
                                {selected && (
                                  <Check
                                    size={13}
                                    strokeWidth={3}
                                    className="text-white"
                                  />
                                )}
                              </span>
                              <span className="font-montserrat text-[13px] font-medium text-[#7288A3]">
                                {option} {option === "1" ? "day" : "days"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-2">
                <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                  Description<span className="ml-1 text-[#D64545]">*</span>
                </span>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter description"
                  className="w-full h-[100px] px-[14px] py-[11px] bg-white border border-[#D3E1EC] rounded-lg font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none focus:border-[#007EA7] transition-colors resize-y"
                />
              </div>

              {/* Active toggle */}
              <div className="flex flex-row items-center justify-between">
                <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                  Active
                </span>
                <button
                  type="button"
                  aria-label="Active"
                  aria-pressed={formActive}
                  onClick={() => setFormActive(!formActive)}
                  className="relative w-[30px] h-[18px] rounded-full transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: formActive ? "#007EA7" : "#A1B6C6",
                  }}
                >
                  <div
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
                    style={{ left: formActive ? "14px" : "2px" }}
                  />
                </button>
              </div>
            </div>

            {/* Panel Actions */}
            <div className="flex flex-col gap-4 flex-shrink-0 mt-auto">
              <SaveButton
                className="w-full"
                onClick={savePanel}
                disabled={
                  !formName.trim() ||
                  !formType ||
                  !formDescription.trim() ||
                  ((panelMode === "add-reminder" ||
                    panelMode === "edit-reminder") &&
                    !formDaysTillRemind)
                }
              />
              <button
                onClick={closePanel}
                className="w-full h-[42px] flex items-center justify-center bg-white border-2 border-[#D3E1EC] rounded-lg hover:border-[#007EA7] transition-colors"
              >
                <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3]">
                  Cancel
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsTable({
  rows,
  onViewDetails,
  onDelete,
  columns,
  startResize,
}: {
  rows: NotificationRow[];
  onViewDetails: (row: NotificationRow) => void;
  onDelete: (row: NotificationRow) => void;
  columns: ColConfig[];
  startResize: (index: number, e: React.MouseEvent) => void;
}) {
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    rows,
    (row, key) =>
      row[key as keyof NotificationRow] as string | number | undefined,
  );
  return (
    <>
      {/* Column headers */}
      <div className="flex h-9 flex-row items-center">
        {columns
          .filter((c) => c.visible)
          .map((col, i) => {
            const realIndex = columns.findIndex((c) => c.key === col.key);
            return (
              <React.Fragment key={col.key}>
                <div
                  className={`relative flex h-9 flex-shrink-0 flex-row items-center gap-[6px] px-3 ${i > 0 ? "border-l border-[#E5EDF9]" : ""}`}
                  style={{ width: col.width }}
                >
                  <span
                    className={`font-montserrat font-medium text-[12px] leading-[18px] ${col.key === "name" ? "text-[#10233A]" : "text-[#7288A3]"}`}
                  >
                    {col.label}
                  </span>
                  <ColumnSortButton
                    columnLabel={col.label}
                    direction={directionFor(col.key)}
                    onDirectionChange={(direction) =>
                      changeSort(col.key, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(e) => startResize(realIndex, e)}
                  />
                </div>
              </React.Fragment>
            );
          })}
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {sortedRows.map((row, rowIndex) => (
          <div
            key={row.id}
            className={`flex h-9 flex-row items-center rounded-lg ${
              rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"
            } group hover:bg-[#E7F4F9] transition-colors`}
          >
            {columns
              .filter((column) => column.visible)
              .map((column) => (
                <React.Fragment key={column.key}>
                  <div
                    className="flex h-9 flex-shrink-0 items-center gap-[6px] overflow-hidden px-3"
                    style={{ width: column.width }}
                  >
                    {column.key === "status" && (
                      <div
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${row.status === "Active" ? "bg-[#0ED8A8]" : "bg-[#A1B6C6]"}`}
                      />
                    )}
                    <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                      {String(row[column.key as keyof NotificationRow] ?? "—")}
                    </span>
                  </div>
                </React.Fragment>
              ))}

            {/* Row action */}
            <div
              className={`sticky right-0 z-10 ml-auto flex w-[76px] flex-shrink-0 items-center justify-center gap-1 ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} group-hover:bg-[#E7F4F9]`}
            >
              <button
                type="button"
                onClick={() => onViewDetails(row)}
                title="EDIT"
                aria-label={`EDIT ${row.name}`}
                className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(row)}
                title="DELETE"
                aria-label={`DELETE ${row.name}`}
                className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#D75B67] hover:text-[#D75B67]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RemindersTable({
  rows,
  onViewDetails,
  onDelete,
  columns,
  startResize,
}: {
  rows: ReminderRow[];
  onViewDetails: (row: ReminderRow) => void;
  onDelete: (row: ReminderRow) => void;
  columns: ColConfig[];
  startResize: (index: number, e: React.MouseEvent) => void;
}) {
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    rows,
    (row, key) => row[key as keyof ReminderRow] as string | number | undefined,
  );
  return (
    <>
      {/* Column headers */}
      <div className="flex h-9 flex-row items-center">
        {columns
          .filter((c) => c.visible)
          .map((col, i) => {
            const realIndex = columns.findIndex((c) => c.key === col.key);
            return (
              <React.Fragment key={col.key}>
                <div
                  className={`relative flex h-9 flex-shrink-0 flex-row items-center gap-[6px] px-3 ${i > 0 ? "border-l border-[#E5EDF9]" : ""}`}
                  style={{ width: col.width }}
                >
                  <span
                    className={`font-montserrat font-medium text-[12px] leading-[18px] ${col.key === "name" ? "text-[#10233A]" : "text-[#7288A3]"}`}
                  >
                    {col.label}
                  </span>
                  <ColumnSortButton
                    columnLabel={col.label}
                    direction={directionFor(col.key)}
                    onDirectionChange={(direction) =>
                      changeSort(col.key, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(e) => startResize(realIndex, e)}
                  />
                </div>
              </React.Fragment>
            );
          })}
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {sortedRows.map((row, rowIndex) => (
          <div
            key={row.id}
            className={`flex h-9 flex-row items-center rounded-lg ${
              rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"
            } group hover:bg-[#E7F4F9] transition-colors`}
          >
            {columns
              .filter((column) => column.visible)
              .map((column) => (
                <React.Fragment key={column.key}>
                  <div
                    className="flex h-9 flex-shrink-0 items-center gap-[6px] overflow-hidden px-3"
                    style={{ width: column.width }}
                  >
                    {column.key === "status" && (
                      <div
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${row.status === "Active" ? "bg-[#0ED8A8]" : "bg-[#A1B6C6]"}`}
                      />
                    )}
                    <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                      {String(row[column.key as keyof ReminderRow] ?? "—")}
                    </span>
                  </div>
                </React.Fragment>
              ))}

            {/* Row action */}
            <div
              className={`sticky right-0 z-10 ml-auto flex w-[76px] flex-shrink-0 items-center justify-center gap-1 ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} group-hover:bg-[#E7F4F9]`}
            >
              <button
                type="button"
                onClick={() => onViewDetails(row)}
                title="EDIT"
                aria-label={`EDIT ${row.name}`}
                className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(row)}
                title="DELETE"
                aria-label={`DELETE ${row.name}`}
                className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#D75B67] hover:text-[#D75B67]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
