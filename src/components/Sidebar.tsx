import { useState } from "react";
import {
  User,
  Menu,
  LogOut,
  Home,
  MessageSquare,
  Bell,
  Settings,
  FolderOpen,
  ChevronDown,
  ScanText,
  Monitor,
  BrainCircuit,
  LayoutDashboard,
  BarChart3,
  Cog,
  Files,
  ArrowLeft,
  ClipboardCheck,
  FileUp,
} from "lucide-react";

interface SidebarProps {
  notificationCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
  activeMenu: string;
  onMenuClick: (menu: string) => void;
  clientName: string;
  onLogout: () => void;
  visibleMainMenuIds: string[];
  canViewMenu: (menu: string) => boolean;
}

interface SubMenuItem {
  id: string;
  label: string;
}

const mainMenuItems = [
  { id: "global-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "uploaded-documents", label: "Uploaded documents", icon: FileUp },
  { id: "dashboard", label: "Companies", icon: Home },
  { id: "messages", label: "Chats", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings, hasDropdown: true },
  { id: "settings-analytics", label: "Analytics", icon: BarChart3 },
  { id: "info", label: "FAQ", icon: FolderOpen },
  { id: "ocr", label: "OCR", icon: ScanText },
];

const settingsGroups = [
  {
    id: "settings-internal",
    label: "Internal Users",
    children: [
      { id: "settings-internal-roles", label: "Roles" },
      { id: "settings-internal-users", label: "Users" },
    ],
  },
  {
    id: "settings-external",
    label: "External Users",
    children: [
      { id: "settings-external-roles", label: "Roles" },
      { id: "settings-external-users", label: "Users" },
    ],
  },
];

const settingsCatalogItems: SubMenuItem[] = [
  { id: "settings-organizations", label: "Organizations" },
  { id: "settings-counterparties", label: "Counterparties" },
  { id: "settings-general-ledger", label: "General ledger" },
];

const organizationReferenceItems: SubMenuItem[] = [
  { id: "settings-organizations-company-status", label: "Company status" },
  { id: "settings-organizations-tax-country", label: "Tax country" },
  { id: "settings-organizations-legal-form", label: "Legal form" },
  { id: "settings-organizations-base-currency", label: "Base currency" },
  { id: "settings-organizations-document-type", label: "Document type" },
  { id: "settings-organizations-document-status", label: "Document Status" },
  { id: "settings-organizations-unit", label: "Unit" },
  { id: "settings-organizations-operation-date-validation", label: "Operation date validation" },
  { id: "settings-organizations-email", label: "Email templates" },
  { id: "settings-vat-classifications", label: "VAT classifications" },
];

const ocrSubMenuItems = [
  {
    id: "ocr-all-documents",
    label: "All documents",
    icon: Files,
    hasDropdown: true,
  },
  { id: "ocr-workspace", label: "Workspace", icon: Monitor },
  {
    id: "ocr-ml",
    label: "Machine learning",
    icon: BrainCircuit,
  },
  { id: "ocr-review", label: "Review", icon: ClipboardCheck, hasDropdown: true },
  { id: "ocr-admin", label: "Administration", icon: Cog, hasDropdown: true },
];

const reviewSubItems: SubMenuItem[] = [
  { id: "ocr-review-approve-documents", label: "Approve documents" },
  { id: "ocr-review-analytics", label: "Analytics" },
];

const allDocumentsSubItems: SubMenuItem[] = [
  { id: "ocr-all-documents-processed", label: "Processed documents" },
  { id: "ocr-all-documents-uploaded", label: "Draft" },
];

const adminSubItems: SubMenuItem[] = [
  { id: "ocr-admin-human-task-types", label: "OCR Validation Settings" },
  { id: "ocr-admin-activity", label: "Activity Log" },
];

function isOcrSection(activeMenu: string) {
  return activeMenu === "ocr" || activeMenu.startsWith("ocr-");
}

function isMlActive(activeMenu: string) {
  return activeMenu === "ocr-ml" || activeMenu.startsWith("ocr-ml-");
}

function isReviewActive(activeMenu: string) {
  return activeMenu === "ocr-review" || activeMenu.startsWith("ocr-review-");
}

function isAllDocumentsActive(activeMenu: string) {
  return (
    activeMenu === "ocr-all-documents" ||
    activeMenu.startsWith("ocr-all-documents-")
  );
}

function isAdminActive(activeMenu: string) {
  return activeMenu === "ocr-admin" || activeMenu.startsWith("ocr-admin-");
}

function isSettingsActive(activeMenu: string) {
  return (
    activeMenu === "settings" ||
    (activeMenu.startsWith("settings-") && activeMenu !== "settings-analytics")
  );
}

function getProfileInitials(fullName: string) {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) return "";
  if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();

  return `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase();
}

function StepperDot({
  isActive,
  isFirst,
  isLast,
}: {
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col items-center w-1 self-stretch">
      <div
        className="flex-1 w-0"
        style={{
          borderLeft: "1px solid #007EA7",
          opacity: isFirst ? 0 : 0.2,
        }}
      />
      <div
        className="w-1 h-1 rounded-full flex-shrink-0"
        style={{
          background: "#007EA7",
          opacity: isActive ? 1 : 0.2,
        }}
      />
      <div
        className="flex-1 w-0"
        style={{
          borderLeft: "1px solid #007EA7",
          opacity: isLast ? 0 : 0.2,
        }}
      />
    </div>
  );
}

export default function Sidebar({
  notificationCount = 0,
  isExpanded,
  onToggle,
  activeMenu,
  onMenuClick,
  clientName,
  onLogout,
  visibleMainMenuIds,
  canViewMenu,
}: SidebarProps) {
  const [settingsExpanded, setSettingsExpanded] = useState(
    isSettingsActive(activeMenu),
  );
  const [internalUsersExpanded, setInternalUsersExpanded] = useState(
    activeMenu.startsWith("settings-internal"),
  );
  const [externalUsersExpanded, setExternalUsersExpanded] = useState(
    activeMenu.startsWith("settings-external"),
  );
  const [organizationsExpanded, setOrganizationsExpanded] = useState(false);
  const [allDocumentsExpanded, setAllDocumentsExpanded] = useState(
    isAllDocumentsActive(activeMenu),
  );
  const [reviewExpanded, setReviewExpanded] = useState(isReviewActive(activeMenu));
  const [adminExpanded, setAdminExpanded] = useState(isAdminActive(activeMenu));
  const menuItems = isOcrSection(activeMenu)
    ? ocrSubMenuItems.filter((item) => canViewMenu(item.id))
    : mainMenuItems.filter((item) =>
        item.id === "settings-analytics"
          ? visibleMainMenuIds.includes("settings") && canViewMenu(item.id)
          : visibleMainMenuIds.includes(
              item.id === "global-dashboard" || item.id === "uploaded-documents" ? "dashboard" : item.id,
            ),
      );

  const handleMenuClick = (id: string) => {
    if (id === "settings") {
      setSettingsExpanded(!settingsExpanded);
      if (!isSettingsActive(activeMenu)) {
      const target = [
          "settings-internal-roles", "settings-internal-users",
          "settings-external-roles", "settings-external-users",
          "settings-organizations", "settings-counterparties",
          "settings-general-ledger",
        ].find(canViewMenu);
        if (target) {
          setInternalUsersExpanded(target.startsWith("settings-internal"));
          setExternalUsersExpanded(target.startsWith("settings-external"));
          onMenuClick(target);
        }
      }
    } else if (id === "ocr-all-documents") {
      setAllDocumentsExpanded(!allDocumentsExpanded);
      if (!isAllDocumentsActive(activeMenu)) {
        onMenuClick("ocr-all-documents-processed");
      }
    } else if (id === "ocr-ml") {
      onMenuClick("ocr-ml");
    } else if (id === "ocr-review") {
      setReviewExpanded(!reviewExpanded);
      if (!isReviewActive(activeMenu)) {
        onMenuClick("ocr-review-approve-documents");
      }
    } else if (id === "ocr-admin") {
      setAdminExpanded(!adminExpanded);
      if (!isAdminActive(activeMenu)) {
        onMenuClick("ocr-admin-human-task-types");
      }
    } else if (id === "settings-analytics") {
      setSettingsExpanded(false);
      onMenuClick(id);
    } else {
      onMenuClick(id);
    }
  };

  return (
    <div className="flex">
      {/* Blue strip */}
      <div className="w-12 min-h-screen bg-[#E6F2F6] flex flex-col justify-between items-center py-4 z-10">
        <div className="group relative flex h-8 w-12 items-center justify-center">
          <button
            onClick={() => onMenuClick("profile")}
            aria-label="Profile settings"
            aria-current={activeMenu === "profile" ? "page" : undefined}
            aria-describedby="profile-settings-tooltip"
            className={`peer w-8 h-8 flex items-center justify-center rounded transition-colors ${
              activeMenu === "profile" ? "bg-[#007EA7]" : "hover:bg-[#D0E8EF]"
            }`}
          >
            <User
              size={16}
              className={activeMenu === "profile" ? "text-white" : "text-[#7288A3]"}
            />
          </button>
          <span
            id="profile-settings-tooltip"
            role="tooltip"
            className="pointer-events-none invisible absolute left-[44px] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#D3E1EC] bg-white px-3 py-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] opacity-0 shadow-[0_8px_24px_rgba(16,35,58,0.14)] transition-opacity duration-75 group-hover:visible group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
          >
            Profile settings
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="group relative flex h-8 w-12 items-center justify-center">
            <button
              onClick={onToggle}
              aria-label="Collapse sidebar"
              aria-describedby="collapse-sidebar-tooltip"
              className="peer w-12 h-8 flex items-center justify-center hover:bg-[#D0E8EF] rounded transition-colors"
            >
              <Menu size={16} className="text-[#006080]" />
            </button>
            <span
              id="collapse-sidebar-tooltip"
              role="tooltip"
              className="pointer-events-none invisible absolute left-[44px] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#D3E1EC] bg-white px-3 py-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] opacity-0 shadow-[0_8px_24px_rgba(16,35,58,0.14)] transition-opacity duration-75 group-hover:visible group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
            >
              Collapse
            </span>
          </div>
          <button
            className="w-12 h-8 flex items-center justify-center hover:bg-[#D0E8EF] rounded transition-colors"
            title="Logout"
            onClick={onLogout}
          >
            <LogOut size={16} className="text-[#006080] rotate-90" />
          </button>
        </div>
      </div>

      {/* White panel */}
      <div
        className="min-h-screen bg-white border-r-2 border-[#E6F2F6] flex flex-col transition-all duration-300 overflow-hidden flex-shrink-0"
        style={{ width: isExpanded ? "288px" : "36px" }}
      >
        <div
          className="flex flex-col h-full"
          style={{ width: isExpanded ? 288 : 36 }}
        >
          {/* Header */}
          <div
            className={`flex-shrink-0 pb-2 pt-4 ${isExpanded ? "px-4" : "px-0"}`}
          >
            <div
              className={`flex h-8 items-center ${isExpanded ? "px-[9px]" : "justify-center px-0"}`}
            >
              {isOcrSection(activeMenu) ? (
                <button
                  type="button"
                  onClick={() => onMenuClick("global-dashboard")}
                  title="Back to main menu"
                  aria-label="Back to main menu"
                  className={`flex h-8 items-center text-[#007EA7] transition-opacity hover:opacity-70 ${isExpanded ? "w-full gap-2" : "justify-center"}`}
                >
                  <ArrowLeft size={11} className="flex-shrink-0" strokeWidth={2.5} />
                  {isExpanded && (
                    <span className="whitespace-nowrap font-montserrat text-[14px] font-semibold leading-5">
                      Back
                    </span>
                  )}
                </button>
              ) : isExpanded ? (
                <span className="font-montserrat font-semibold text-[16px] leading-5 text-[#10233A] whitespace-nowrap">
                  {clientName}
                </span>
              ) : (
                <span
                  className="font-montserrat text-[11px] font-semibold leading-4 text-[#10233A]"
                  title={clientName}
                  aria-label={clientName}
                >
                  {getProfileInitials(clientName)}
                </span>
              )}
            </div>
          </div>

          {/* Menu items */}
          <nav
            className={`flex flex-col gap-0 ${isExpanded ? "px-4" : "px-0 pt-2"}`}
          >
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.id === "ocr-ml"
                  ? isMlActive(activeMenu)
                  : item.id === "ocr-all-documents"
                    ? isAllDocumentsActive(activeMenu)
                    : item.id === "ocr-review"
                      ? isReviewActive(activeMenu)
                    : item.id === "ocr-admin"
                      ? isAdminActive(activeMenu)
                      : item.id === "settings"
                        ? isSettingsActive(activeMenu)
                        : activeMenu === item.id;
              const hasDropdown = "hasDropdown" in item && item.hasDropdown;
              const showAllDocumentsSub =
                item.id === "ocr-all-documents" &&
                allDocumentsExpanded &&
                isExpanded;
              const showAdminSub =
                item.id === "ocr-admin" && adminExpanded && isExpanded;
              const showReviewSub =
                item.id === "ocr-review" && reviewExpanded && isExpanded;
              const showSettingsSub =
                item.id === "settings" && settingsExpanded && isExpanded;

              return (
                <div key={item.id}>
                  {isExpanded ? (
                    <button
                      onClick={() => handleMenuClick(item.id)}
                      className={`h-9 w-full flex flex-row items-center justify-between px-2 rounded transition-colors ${
                        isActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"
                      }`}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <Icon
                          size={16}
                          className={isActive ? "text-white" : "text-[#7288A3]"}
                        />
                        <span
                          className={`font-montserrat font-medium text-[14px] leading-5 whitespace-nowrap ${isActive ? "text-white" : "text-[#10233A]"}`}
                        >
                          {item.label}
                        </span>
                      </div>
                      {item.id === "notifications" && notificationCount > 0 ? (
                        <span aria-label={`${notificationCount} active notifications and reminders`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E34242] px-1.5 font-montserrat text-[11px] font-semibold leading-5 text-white">
                          {notificationCount}
                        </span>
                      ) : <ChevronDown
                        size={16}
                        className={`flex-shrink-0 transition-transform ${hasDropdown ? "opacity-100" : "opacity-0"} ${isActive ? "text-white" : "text-[#10233A]"} ${showAllDocumentsSub || showReviewSub || showAdminSub || showSettingsSub ? "rotate-180" : ""}`}
                      />}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMenuClick(item.id)}
                      title={item.label}
                      className={`w-9 h-9 flex items-center justify-center rounded transition-colors mx-auto ${
                        isActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"
                      }`}
                    >
                      <Icon
                        size={16}
                        className={isActive ? "text-white" : "text-[#7288A3]"}
                      />
                    </button>
                  )}

                  {showSettingsSub && (
                    <div className="mt-1.5 flex flex-col gap-1 pb-1 pl-[14px]">
                      {settingsGroups.filter((group) => canViewMenu(group.id)).map((group, groupIndex) => {
                        const groupActive = activeMenu.startsWith(group.id);
                        const groupExpanded =
                          group.id === "settings-internal"
                            ? internalUsersExpanded
                            : externalUsersExpanded;
                        const toggleGroup = () => {
                          if (group.id === "settings-internal") {
                            setInternalUsersExpanded(!internalUsersExpanded);
                          } else {
                            setExternalUsersExpanded(!externalUsersExpanded);
                          }
                        };

                        return (
                          <div key={group.id}>
                            <div className="flex h-8 flex-row items-center gap-[14px]">
                              <StepperDot
                                isActive={groupActive}
                                isFirst={groupIndex === 0}
                                isLast={false}
                              />
                              <button
                                onClick={toggleGroup}
                                className="flex h-8 min-w-0 flex-1 items-center justify-between rounded-md px-3 transition-colors hover:bg-[#F0F7FA]"
                              >
                                <span
                                  className={`truncate font-montserrat text-[13px] font-semibold leading-5 ${groupActive ? "text-[#007EA7]" : "text-[#10233A]"}`}
                                >
                                  {group.label}
                                </span>
                                <ChevronDown
                                  size={14}
                                  className={`flex-shrink-0 text-[#7288A3] transition-transform ${groupExpanded ? "rotate-180" : ""}`}
                                />
                              </button>
                            </div>

                            {groupExpanded && (
                              <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-[#D9E8F0] pl-[13px]">
                                {group.children.filter((child) => canViewMenu(child.id)).map((child) => {
                                  const childActive = activeMenu === child.id;
                                  return (
                                    <button
                                      key={child.id}
                                      onClick={() => onMenuClick(child.id)}
                                      className={`flex h-8 min-w-0 items-center rounded-md px-3 text-left transition-colors ${childActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"}`}
                                    >
                                      <span
                                        className={`truncate font-montserrat text-[13px] font-medium leading-5 ${childActive ? "text-white" : "text-[#10233A]"}`}
                                      >
                                        {child.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {settingsCatalogItems.filter((item) => canViewMenu(item.id)).map((item, itemIndex) => {
                        const isOrganizations =
                          item.id === "settings-organizations";
                        const itemActive = isOrganizations
                          ? activeMenu === item.id ||
                            activeMenu.startsWith("settings-organizations-") ||
                            activeMenu === "settings-vat-classifications"
                          : activeMenu === item.id;
                        return (
                          <div key={item.id}>
                            <div className="flex h-8 flex-row items-center gap-[14px]">
                              <StepperDot
                                isActive={itemActive}
                                isFirst={false}
                                isLast={
                                  itemIndex ===
                                    settingsCatalogItems.length - 1 &&
                                  !organizationsExpanded
                                }
                              />
                              <div
                                className={`flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors ${itemActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"}`}
                              >
                                <button
                                  onClick={() => onMenuClick(item.id)}
                                  className="flex h-8 min-w-0 flex-1 items-center px-3 text-left"
                                >
                                  <span
                                    className={`truncate font-montserrat text-[13px] leading-5 ${isOrganizations ? "font-semibold" : "font-medium"} ${itemActive ? "text-white" : "text-[#10233A]"}`}
                                  >
                                    {item.label}
                                  </span>
                                </button>
                                {isOrganizations && (
                                  <button
                                    type="button"
                                    aria-label="Expand organization settings"
                                    aria-expanded={organizationsExpanded}
                                    onClick={() =>
                                      setOrganizationsExpanded(
                                        (current) => !current,
                                      )
                                    }
                                    className={`mr-3 flex h-8 w-[14px] flex-shrink-0 appearance-none items-center justify-center border-0 bg-transparent p-0 leading-none ${itemActive ? "text-white" : "text-[#7288A3] hover:text-[#007EA7]"}`}
                                  >
                                    <ChevronDown
                                      size={14}
                                      className={`transition-transform ${organizationsExpanded ? "rotate-180" : ""}`}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isOrganizations && organizationsExpanded && (
                              <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-[#D9E8F0] pl-[13px]">
                                {organizationReferenceItems.filter((child) => canViewMenu(child.id)).map((child) => {
                                  const childActive = activeMenu === child.id;
                                  return (
                                    <button
                                      key={child.id}
                                      onClick={() => onMenuClick(child.id)}
                                      className={`flex h-8 min-w-0 items-center rounded-md px-3 text-left transition-colors ${childActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"}`}
                                    >
                                      <span
                                        className={`truncate font-montserrat text-[13px] font-medium leading-5 ${childActive ? "text-white" : "text-[#10233A]"}`}
                                      >
                                        {child.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showAllDocumentsSub && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {allDocumentsSubItems.filter((sub) => canViewMenu(sub.id)).map((sub, idx) => {
                        const isSubActive =
                          activeMenu === sub.id ||
                          (activeMenu === "ocr-all-documents" && idx === 0);
                        return (
                          <div
                            key={sub.id}
                            className="flex h-8 flex-row items-center gap-[14px]"
                          >
                            <StepperDot
                              isActive={isSubActive}
                              isFirst={idx === 0}
                              isLast={idx === allDocumentsSubItems.length - 1}
                            />
                            <button
                              onClick={() => onMenuClick(sub.id)}
                              className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${isSubActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"}`}
                            >
                              <span
                                className={`truncate font-montserrat text-[13px] font-medium leading-5 ${isSubActive ? "text-white" : "text-[#10233A]"}`}
                              >
                                {sub.label}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showReviewSub && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {reviewSubItems.filter((sub) => canViewMenu(sub.id)).map((sub, idx) => {
                        const isSubActive = activeMenu === sub.id || (activeMenu === "ocr-review" && idx === 0);
                        return (
                          <div key={sub.id} className="flex h-8 flex-row items-center gap-[14px]">
                            <StepperDot isActive={isSubActive} isFirst={idx === 0} isLast={idx === reviewSubItems.length - 1} />
                            <button onClick={() => onMenuClick(sub.id)} className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${isSubActive ? "bg-[#007EA7]" : "hover:bg-[#F0F7FA]"}`}>
                              <span className={`truncate font-montserrat text-[13px] font-medium leading-5 ${isSubActive ? "text-white" : "text-[#10233A]"}`}>{sub.label}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showAdminSub && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {adminSubItems.filter((sub) => canViewMenu(sub.id)).map((sub, idx) => {
                        const isSubActive =
                          activeMenu === sub.id ||
                          (activeMenu === "ocr-admin" && idx === 0);
                        return (
                          <div
                            key={sub.id}
                            className="flex h-8 flex-row items-center gap-[14px]"
                          >
                            <StepperDot
                              isActive={isSubActive}
                              isFirst={idx === 0}
                              isLast={idx === adminSubItems.length - 1}
                            />
                            <button
                              onClick={() => onMenuClick(sub.id)}
                              className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${
                                isSubActive
                                  ? "bg-[#007EA7]"
                                  : "hover:bg-[#F0F7FA]"
                              }`}
                            >
                              <span
                                className={`font-montserrat font-medium text-[14px] leading-5 whitespace-nowrap ${
                                  isSubActive ? "text-white" : "text-[#10233A]"
                                }`}
                              >
                                {sub.label}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
