import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  UserRound,
} from "lucide-react";
import { PageHeader } from "./PageHeader";
import { SystemBreadcrumb } from "./SystemNavigation";
import OcrSearchField from "./OcrSearchField";
import RefreshAllButton from "./RefreshAllButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ScheduleDatePicker from "./ScheduleDatePicker";
import {
  isActiveLinkedOrganization,
  reconcileOrganizationUserLinks,
  SETTINGS_DATA_CHANGED_EVENT,
} from "../lib/linkedSettingsData";

const ANALYTICS_ROWS_PER_PAGE = 6;

type DirectoryUser = {
  id: string;
  fullName?: string;
  username?: string;
  email?: string;
  roles?: string;
  organizations?: string;
  status?: string;
};
type Company = {
  id: string;
  name: string;
  company_status?: string;
  status?: string;
};
type Document = {
  id: string;
  company_id?: string;
  status?: string;
  created_at?: string;
  receive_date?: string;
  document_date?: string;
};
type Message = {
  id: string;
  author: string;
  direction: "incoming" | "outgoing";
  company_id?: string;
  companyId?: string;
  organization_id?: string;
  organizationId?: string;
  read?: boolean;
  is_read?: boolean;
  readAt?: string | null;
  timestamp?: string;
  created_at?: string;
};
type UserAnalytics = {
  user: DirectoryUser;
  audience: "Internal";
  companies: Company[];
  inProgress: number;
  accepted: number;
  rejected: number;
  unreadChats: number;
  companyStats: Array<{
    company: Company;
    inProgress: number;
    accepted: number;
    rejected: number;
    unreadChats: number;
  }>;
};

const COMPANY_KEY = "finansu-harmonija-v4:data:companies";
const DOCUMENT_KEY = "finansu-harmonija-v4:data:documents";
const MESSAGE_KEY = "finansu-harmonija:v7:chat:messages";
const acceptedStatuses = new Set([
  "paid",
  "accepted",
  "accept",
  "processed",
  "completed",
  "transferred",
]);
const rejectedStatuses = new Set(["rejected", "reject", "declined"]);

function readList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function userLabel(user: DirectoryUser) {
  return user.fullName || user.username || user.email || "Unnamed user";
}

function messageCompanyId(message: Message) {
  return (
    message.company_id ??
    message.companyId ??
    message.organization_id ??
    message.organizationId
  );
}

function isUnreadIncomingMessage(message: Message) {
  return (
    message.direction === "incoming" &&
    message.read !== true &&
    message.is_read !== true &&
    !message.readAt
  );
}

function parseRecordDate(value?: string) {
  if (!value) return null;
  const normalized = value.trim();
  const lithuanianDate = normalized.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (lithuanianDate) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] =
      lithuanianDate;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitDateTime(value: string) {
  const [date = "", time = ""] = value.split("T");
  return { date, time };
}

function joinDateTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function SystemTimePicker({
  value,
  onChange,
  disabled,
  ariaLabel,
  align = "right",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [selectedHour = "--", selectedMinute = "--"] = value.split(":");
  const hours = Array.from({ length: 24 }, (_, index) =>
    String(index).padStart(2, "0"),
  );
  const minutes = Array.from({ length: 60 }, (_, index) =>
    String(index).padStart(2, "0"),
  );

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const selectPart = (part: "hour" | "minute", nextValue: string) => {
    const hour = part === "hour" ? nextValue : selectedHour === "--" ? "00" : selectedHour;
    const minute =
      part === "minute"
        ? nextValue
        : selectedMinute === "--"
          ? "00"
          : selectedMinute;
    onChange(`${hour}:${minute}`);
  };

  return (
    <div ref={ref} className="relative h-full w-[68px] flex-shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-full w-full items-center justify-between border-l border-[#DDE7F0] bg-white px-1.5 font-montserrat text-[9px] font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed text-[#A1B6C6]"
            : open
              ? "text-[#007EA7]"
              : "text-[#10233A] hover:bg-[#F7FAFC]"
        }`}
      >
        <span>{value || "--:--"}</span>
        <Clock3 size={12} className="flex-shrink-0 text-[#7288A3]" />
      </button>
      {open && !disabled && (
        <div
          role="dialog"
          aria-label={`${ariaLabel} time selector`}
          className={`absolute top-[34px] z-50 w-[184px] rounded-xl border border-[#D3E1EC] bg-white p-3 shadow-[0_8px_24px_rgba(16,35,58,0.16)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center justify-between font-montserrat text-[10px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
            <span>Hour</span>
            <span>Minute</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="max-h-[184px] overflow-y-auto rounded-lg border border-[#E5EDF9] p-1 scrollbar-thin">
              {hours.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  onClick={() => selectPart("hour", hour)}
                  className={`flex h-7 w-full items-center justify-between rounded px-2 font-montserrat text-[11px] font-medium transition-colors ${selectedHour === hour ? "bg-[#007EA7] text-white" : "text-[#10233A] hover:bg-[#E5EDF9]"}`}
                >
                  {hour}
                  {selectedHour === hour && <Check size={12} />}
                </button>
              ))}
            </div>
            <div className="max-h-[184px] overflow-y-auto rounded-lg border border-[#E5EDF9] p-1 scrollbar-thin">
              {minutes.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  onClick={() => selectPart("minute", minute)}
                  className={`flex h-7 w-full items-center justify-between rounded px-2 font-montserrat text-[11px] font-medium transition-colors ${selectedMinute === minute ? "bg-[#007EA7] text-white" : "text-[#10233A] hover:bg-[#E5EDF9]"}`}
                >
                  {minute}
                  {selectedMinute === minute && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 flex h-7 w-full items-center justify-center rounded-md bg-[#007EA7] font-montserrat text-[11px] font-semibold text-white hover:bg-[#006F94]"
          >
            Apply time
          </button>
        </div>
      )}
    </div>
  );
}

function isWithinPeriod(
  value: string | undefined,
  from: Date | null,
  to: Date | null,
) {
  if (!from && !to) return true;
  const date = parseRecordDate(value);
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function messageBelongsToCompany(message: Message, company: Company) {
  const linkedCompanyId = messageCompanyId(message);
  if (linkedCompanyId) return linkedCompanyId === company.id;
  return message.author.trim().toLowerCase() === company.name.trim().toLowerCase();
}

function createAnalytics(from: Date | null, to: Date | null): UserAnalytics[] {
  const companies = readList<Company>(COMPANY_KEY).filter(
    isActiveLinkedOrganization,
  );
  const linked = reconcileOrganizationUserLinks(
    companies,
    "Internal users",
    false,
  );
  const internal = linked.users as DirectoryUser[];
  const documents = readList<Document>(DOCUMENT_KEY).filter((document) =>
    isWithinPeriod(
      document.created_at ?? document.receive_date ?? document.document_date,
      from,
      to,
    ),
  );
  const messages = readList<Message>(MESSAGE_KEY).filter((message) =>
    isWithinPeriod(message.created_at ?? message.timestamp, from, to),
  );
  const users = internal
    .map((user) => ({ user, audience: "Internal" as const }))
    .filter(({ user }) => user.status !== "Disabled");
  const uniqueUsers = users.filter(
    ({ user }, index, values) =>
      values.findIndex(
        ({ user: candidate }) =>
          candidate.id === user.id ||
          (candidate.email &&
            candidate.email.toLowerCase() === user.email?.toLowerCase()),
      ) === index,
  );
  const unreadMessages = messages.filter(isUnreadIncomingMessage);

  return uniqueUsers.map(({ user, audience }) => {
    const assignedCompanies = companies.filter((company) =>
      linked.assignments.get(company.id)?.has(user.id),
    );
    const companyIds = new Set(assignedCompanies.map((company) => company.id));
    const scopedDocuments = documents.filter(
      (document) => document.company_id && companyIds.has(document.company_id),
    );
    const companyStats = assignedCompanies.map((company) => {
      const items = scopedDocuments.filter(
        (document) => document.company_id === company.id,
      );
      const accepted = items.filter((document) =>
        acceptedStatuses.has((document.status ?? "").trim().toLowerCase()),
      ).length;
      const rejected = items.filter((document) =>
        rejectedStatuses.has((document.status ?? "").trim().toLowerCase()),
      ).length;
      return {
        company,
        accepted,
        rejected,
        inProgress: Math.max(0, items.length - accepted - rejected),
        unreadChats: unreadMessages.filter(
          (message) => messageBelongsToCompany(message, company),
        ).length,
      };
    });
    const accepted = companyStats.reduce(
      (sum, item) => sum + item.accepted,
      0,
    );
    const rejected = companyStats.reduce(
      (sum, item) => sum + item.rejected,
      0,
    );
    const inProgress = companyStats.reduce(
      (sum, item) => sum + item.inProgress,
      0,
    );
    const unreadChats = companyStats.reduce(
      (sum, item) => sum + item.unreadChats,
      0,
    );
    return {
      user,
      audience,
      companies: assignedCompanies,
      inProgress,
      accepted,
      rejected,
      unreadChats,
      companyStats,
    };
  });
}

function createOrganizationSummary() {
  const companies = readList<Company>(COMPANY_KEY);
  const linked = reconcileOrganizationUserLinks(
    companies,
    "Internal users",
    false,
  );
  const internalUsers = linked.users as DirectoryUser[];
  const enabledInternalUsers = internalUsers.filter(
    (user) => user.status !== "Disabled",
  );
  const active = companies.filter((company) => {
    const status = (company.company_status ?? company.status ?? "Active")
      .trim()
      .toLowerCase();
    return status === "active" || status === "enabled";
  });
  const unassigned = companies.filter(
    (company) =>
      !enabledInternalUsers.some((user) =>
        linked.assignments.get(company.id)?.has(user.id),
      ),
  );
  return {
    total: companies.length,
    active: active.length,
    unassigned: unassigned.length,
  };
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E7F4F9] text-[#007EA7]">
        {icon}
      </span>
      <span>
        <span className="block font-montserrat text-[11px] font-medium text-[#7288A3]">
          {label}
        </span>
        <span className="block font-montserrat text-[20px] font-semibold text-[#10233A]">
          {value}
        </span>
      </span>
    </div>
  );
}

export default function SettingsUserAnalyticsView() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [periodDraft, setPeriodDraft] = useState({ from: "", to: "" });
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const refresh = () => setRefreshKey((current) => current + 1);
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
    window.addEventListener("organization-reference-updated", refresh);
    window.addEventListener("vat-classifications-updated", refresh);
    window.addEventListener("general-ledger-updated", refresh);
    window.addEventListener("finansu-harmonija:data-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("organization-reference-updated", refresh);
      window.removeEventListener("vat-classifications-updated", refresh);
      window.removeEventListener("general-ledger-updated", refresh);
      window.removeEventListener("finansu-harmonija:data-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const periodFrom = useMemo(
    () => (period.from ? new Date(period.from) : null),
    [period.from],
  );
  const periodTo = useMemo(
    () => (period.to ? new Date(period.to) : null),
    [period.to],
  );
  const analytics = useMemo(() => {
    void refreshKey;
    return createAnalytics(periodFrom, periodTo);
  }, [periodFrom, periodTo, refreshKey]);
  const organizationSummary = useMemo(() => {
    void refreshKey;
    return createOrganizationSummary();
  }, [refreshKey]);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? analytics.filter((item) =>
          [
            userLabel(item.user),
            item.user.email,
            item.user.roles,
            item.audience,
          ]
            .join(" ")
            .toLowerCase()
            .includes(value),
        )
      : analytics;
  }, [analytics, query]);
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / ANALYTICS_ROWS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleRows = showAll
    ? filtered
    : filtered.slice(
        (safePage - 1) * ANALYTICS_ROWS_PER_PAGE,
        safePage * ANALYTICS_ROWS_PER_PAGE,
      );

  const exportAll = () => {
    const escapeCsv = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const rows: Array<Array<string | number>> = [
      [
        "Internal User",
        "Email",
        "Organization",
        "Organization status",
        "In Progress",
        "Accept",
        "Reject",
        "Unread Chat",
        "Period From",
        "Period To",
      ],
    ];
    filtered.forEach((item) => {
      if (!item.companyStats.length) {
        rows.push([
          userLabel(item.user),
          item.user.email ?? "",
          "",
          "",
          0,
          0,
          0,
          0,
          period.from,
          period.to,
        ]);
        return;
      }
      item.companyStats.forEach((stat) => {
        rows.push([
          userLabel(item.user),
          item.user.email ?? "",
          stat.company.name,
          stat.company.company_status ?? stat.company.status ?? "Active",
          stat.inProgress,
          stat.accepted,
          stat.rejected,
          stat.unreadChats,
          period.from,
          period.to,
        ]);
      });
    });
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "user-workflow-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="flex min-h-full flex-col gap-7 bg-white px-9 py-14"
      style={{
        paddingLeft: "clamp(24px, 5vw, 72px)",
        paddingRight: "clamp(24px, 5vw, 72px)",
      }}
    >
      <PageHeader title="User workflow analytics" />
      <SystemBreadcrumb items={["Settings", "User workflow analytics"]} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={<Building2 size={18} />}
          label="All organizations"
          value={organizationSummary.total}
        />
        <MetricCard
          icon={<CheckCircle2 size={18} />}
          label="Active organizations"
          value={organizationSummary.active}
        />
        <MetricCard
          icon={<UserRound size={18} />}
          label="Without Internal User"
          value={organizationSummary.unassigned}
        />
      </div>
      <div className="relative z-30 flex w-full flex-nowrap items-center gap-2 overflow-visible pb-1">
        <OcrSearchField
          ariaLabel="Search user analytics"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
            setShowAll(false);
          }}
        />
        <div className="flex h-7 flex-nowrap items-center gap-2">
          <div className="flex h-7 w-[230px] flex-shrink-0 items-center rounded border border-[#D3E1EC] bg-white transition-colors focus-within:border-[#007EA7]">
            <span className="flex h-full items-center border-r border-[#DDE7F0] bg-[#F7FAFC] px-2 font-montserrat text-[10px] font-semibold text-[#7288A3]">
              From
            </span>
            <div className="min-w-0 flex-1 px-1">
              <ScheduleDatePicker
                value={splitDateTime(periodDraft.from).date}
                placeholder="dd/mm/yyyy"
                ariaLabel="Period from date"
                compact
                onChange={(date) =>
                  setPeriodDraft((current) => ({
                    ...current,
                    from: joinDateTime(date, splitDateTime(current.from).time),
                  }))
                }
              />
            </div>
            <SystemTimePicker
              ariaLabel="Period from time"
              value={splitDateTime(periodDraft.from).time}
              disabled={!splitDateTime(periodDraft.from).date}
              onChange={(time) =>
                setPeriodDraft((current) => ({
                  ...current,
                  from: joinDateTime(
                    splitDateTime(current.from).date,
                    time,
                  ),
                }))
              }
            />
          </div>
          <div className="flex h-7 w-[218px] flex-shrink-0 items-center rounded border border-[#D3E1EC] bg-white transition-colors focus-within:border-[#007EA7]">
            <span className="flex h-full items-center border-r border-[#DDE7F0] bg-[#F7FAFC] px-2 font-montserrat text-[10px] font-semibold text-[#7288A3]">
              To
            </span>
            <div className="min-w-0 flex-1 px-1">
              <ScheduleDatePicker
                value={splitDateTime(periodDraft.to).date}
                placeholder="dd/mm/yyyy"
                ariaLabel="Period to date"
                align="right"
                compact
                onChange={(date) =>
                  setPeriodDraft((current) => ({
                    ...current,
                    to: joinDateTime(date, splitDateTime(current.to).time || "23:59"),
                  }))
                }
              />
            </div>
            <SystemTimePicker
              ariaLabel="Period to time"
              value={splitDateTime(periodDraft.to).time}
              disabled={!splitDateTime(periodDraft.to).date}
              onChange={(time) =>
                setPeriodDraft((current) => ({
                  ...current,
                  to: joinDateTime(
                    splitDateTime(current.to).date,
                    time,
                  ),
                }))
              }
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setPeriod(periodDraft);
              setPage(1);
              setShowAll(false);
            }}
            className="flex h-7 flex-shrink-0 items-center justify-center rounded border border-[#D3E1EC] bg-white px-2.5 font-montserrat text-[11px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6] active:border-[#007EA7] active:bg-[#007EA7] active:text-white"
          >
            Apply period
          </button>
          {(period.from || period.to || periodDraft.from || periodDraft.to) && (
            <button
              type="button"
              onClick={() => {
                setPeriodDraft({ from: "", to: "" });
                setPeriod({ from: "", to: "" });
                setPage(1);
                setShowAll(false);
              }}
              className="flex h-7 flex-shrink-0 items-center justify-center rounded border border-[#D3E1EC] bg-white px-2.5 font-montserrat text-[11px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6] active:border-[#007EA7] active:bg-[#007EA7] active:text-white"
            >
              Clear period
            </button>
          )}
          <div className="ml-1 flex h-7 flex-shrink-0 items-center gap-3 px-1">
            <button
              type="button"
              title="EXPORT ALL"
              aria-label="EXPORT ALL user workflow analytics"
              onClick={exportAll}
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
            >
              <Download size={16} />
            </button>
            <RefreshAllButton
              onRefresh={() => setRefreshKey((value) => value + 1)}
            />
          </div>
        </div>
      </div>
      <div
        ref={tableScrollRef}
        className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
      >
        <div className="min-w-[1020px]">
          <div className="mb-2 grid min-h-10 grid-cols-[44px_220px_105px_120px_125px_110px_110px_130px] items-center border-b border-[#DDE7F0] font-montserrat text-[12px] font-semibold leading-4 text-[#10233A]">
            <span />
            <span className="px-2">User</span>
            <span className="border-l border-[#DDE7F0] px-2">Type</span>
            <span className="border-l border-[#DDE7F0] px-2 text-center">Companies</span>
            <span className="border-l border-[#DDE7F0] px-2 text-center">In Progress</span>
            <span className="border-l border-[#DDE7F0] px-2 text-center">Accept</span>
            <span className="border-l border-[#DDE7F0] px-2 text-center">Reject</span>
            <span className="border-l border-[#DDE7F0] px-2 text-center">Unread Chat</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {visibleRows.map((item, index) => {
              const isOpen = expanded.has(item.user.id);
              return (
                <div key={item.user.id}>
                  <div
                    className={`grid min-h-12 grid-cols-[44px_220px_105px_120px_125px_110px_110px_130px] items-center rounded-lg hover:bg-[#E7F4F9] ${index % 2 ? "bg-white" : "bg-[#F8FDFF]"}`}
                  >
                    <button
                      type="button"
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${userLabel(item.user)}`}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(item.user.id)) next.delete(item.user.id);
                          else next.add(item.user.id);
                          return next;
                        })
                      }
                      className="flex h-8 w-8 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"
                    >
                      {isOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                    <span className="min-w-0 px-2">
                      <span className="block truncate font-montserrat text-[12px] font-semibold text-[#10233A]">
                        {userLabel(item.user)}
                      </span>
                      <span className="block truncate font-montserrat text-[10px] text-[#7288A3]">
                        {item.user.email}
                      </span>
                    </span>
                    <span className="px-2 font-montserrat text-[12px] text-[#536D84]">
                      {item.audience}
                    </span>
                    <span className="px-2 text-center font-montserrat text-[12px] text-[#10233A]">
                      {item.companyStats.length}
                    </span>
                    <span className="px-2 text-center font-montserrat text-[12px] font-semibold text-[#C98916]">
                      {item.inProgress}
                    </span>
                    <span className="px-2 text-center font-montserrat text-[12px] font-semibold text-[#178B71]">
                      {item.accepted}
                    </span>
                    <span className="px-2 text-center font-montserrat text-[12px] font-semibold text-[#C45353]">
                      {item.rejected}
                    </span>
                    <span className="px-2 text-center font-montserrat text-[12px] font-semibold text-[#C45353]">
                      {item.unreadChats}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="mb-3 ml-11 mt-2 rounded-xl border border-[#DDE7F0] bg-white p-4">
                      <div className="mb-3 flex items-center gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                        <UserRound size={15} className="text-[#007EA7]" />
                        Document progress by organization
                      </div>
                      {item.companyStats.length ? (
                        <div className="overflow-hidden rounded-lg border border-[#E5EDF9]">
                          <div className="grid grid-cols-[minmax(240px,1fr)_110px_110px_100px_100px_120px] items-center bg-[#F1F7FA] px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
                            <span>Organization</span>
                            <span className="text-center">Status</span>
                            <span className="text-center">In Progress</span>
                            <span className="text-center">Accept</span>
                            <span className="text-center">Reject</span>
                            <span className="text-center">Unread Chat</span>
                          </div>
                          {item.companyStats.map((stat, companyIndex) => (
                            <div
                              key={`${stat.company.id}:${stat.company.name}:${companyIndex}`}
                              className={`grid min-h-9 grid-cols-[minmax(240px,1fr)_110px_110px_100px_100px_120px] items-center border-t border-[#E5EDF9] px-3 font-montserrat text-[11px] ${companyIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
                            >
                              <span className="truncate font-medium text-[#10233A]">
                                {stat.company.name}
                              </span>
                              <span className="text-center text-[#536D84]">
                                {stat.company.company_status ??
                                  stat.company.status ??
                                  "Active"}
                              </span>
                              <span className="text-center font-semibold text-[#C98916]">
                                {stat.inProgress}
                              </span>
                              <span className="text-center font-semibold text-[#178B71]">
                                {stat.accepted}
                              </span>
                              <span className="text-center font-semibold text-[#C45353]">
                                {stat.rejected}
                              </span>
                              <span className="text-center font-semibold text-[#C45353]">
                                {stat.unreadChats}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="font-montserrat text-[11px] text-[#7288A3]">
                          No organizations assigned.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={showAll ? 1 : safePage}
        totalPages={showAll ? 1 : totalPages}
        itemCount={filtered.length}
        itemsPerPage={
          showAll ? Math.max(1, filtered.length) : ANALYTICS_ROWS_PER_PAGE
        }
        onPageChange={showAll ? () => undefined : setPage}
        onShowMore={() => {
          setShowAll(true);
          setPage(1);
        }}
      />
    </section>
  );
}
