import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Sidebar from "./Sidebar";
import { Bell, X, ArrowRight } from 'lucide-react';
import NotificationDetailsPanel from './NotificationDetailsPanel';
import NotificationRelativeTime from './NotificationRelativeTime';
import { ensureImportantNotificationExamples, linkImportantNotificationExamples } from '../lib/importantNotificationExamples';
import { getNotificationModuleLabel, getNotificationRelatedObjectLabel, notificationMessage } from '../lib/notificationPresentation';
import RelatedObjectLink from './RelatedObjectLink';
import { canAccessAssignedOrganization } from '../lib/linkedSettingsData';
import { useOrganizationAccessRevision } from './useOrganizationAccessRevision';
import ProfileSettings from "./ProfileSettings";
import Companies from "./Companies";
import CompanyActionHistoryView from './CompanyActionHistoryView';
import CompanyDetail from "./CompanyDetail";
import DashboardView from "./DashboardView";
import UploadedDocumentsView from "./UploadedDocumentsView";
import type { UploadedDocumentsGroup } from "../lib/uploadedDocuments";
import OcrView from "./OcrView";
import AllDocumentsView from "./AllDocumentsView";
import OcrProcessedDocumentsView from "./OcrProcessedDocumentsView";
import WorkspaceView, { type WorkspaceTask } from "./WorkspaceView";
import MachineLearningView from "./ml";
import OrganizationRequiredActionsView from './OrganizationRequiredActionsView';
import ChatsView from "./ChatsView";
import type { InvoiceChatContext } from "./invoices/invoiceChat";
import HelpFaqView from "./HelpFaqView";
import VatClassificationsView from "./VatClassificationsView";
import GeneralLedgerView from "./GeneralLedgerView";
import SettingsIdentityManagementView from "./SettingsIdentityManagementView";
import OrganizationReferenceValuesView, {
  type OrganizationReferenceSection,
} from "./OrganizationReferenceValuesView";
import SettingsOrganizationsView from "./SettingsOrganizationsView";
import OrganizationEmailSettingsView from "./OrganizationEmailSettingsView";
import AdministratorSettings from './AdministratorSettings';
import OperationDateValidationView from "./OperationDateValidationView";
import AutomationSecurityAccessView from "./AutomationSecurityAccessView";
import ResourceSecurityAccessView, {
  type SecurityAccessTarget,
} from "./ResourceSecurityAccessView";
import AdministrationView, {
  type AdministrationSection,
} from "./AdministrationView";
import AutomationProcessDetailView, {
  type OcrProcess,
} from "./AutomationProcessDetailView";
import OcrContextFilters from "./OcrContextFilters";
import SettingsUserAnalyticsView from "./SettingsUserAnalyticsView";
import OcrReviewView from "./OcrReviewView";
import { supabase, type Company, type DbDocument } from "../lib/supabase";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  APP_MODULES,
  canEditMenu,
  canViewMenu,
  moduleForMenu,
  parseSession,
  type AppSession,
} from "../lib/accessControl";
import { userProfileStorageKey } from "../lib/currentUser";
import { useAttentionNotifications } from "../hooks/useAttentionNotifications";
import { useVisibleNotificationRecords } from '../hooks/useVisibleNotificationRecords';
import { getDashboardAttentionNotifications } from '../lib/notificationAttention';
import { getNotificationTabCounts, getRelevantActionsForTab, isImportantNotification, isNotificationRead, type AttentionNotification, type NotificationTab, type RelatedObject } from "../lib/notifications";
import { resolveRelatedObject, loadRelatedObjectChats, loadRelatedObjects } from '../lib/relatedObjects';

interface DashboardProps {
  onLogout: () => void;
  session: AppSession;
}

const MENU_FALLBACK_ORDER = [
  "global-dashboard", "uploaded-documents", "dashboard", "messages", "notifications",
  "settings-internal-roles", "settings-internal-users",
  "settings-external-roles", "settings-external-users",
  "settings-organizations", "settings-counterparties", "settings-general-ledger",
  "settings-analytics", "info", "ocr-all-documents-processed",
  "ocr-all-documents-uploaded", "ocr-workspace",
  "ocr-ml", "ocr-review-approve-documents", "ocr-review-analytics", "ocr-admin-human-task-types",
  "ocr-admin-document-type", "ocr-admin-activity",
];

function firstAccessibleMenu(session: AppSession) {
  return MENU_FALLBACK_ORDER.find(menu => canViewMenu(session, menu)) ?? "profile";
}

function ReadOnlyBoundary({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  const preventMutation = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button) return;
    const action =
      `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""}`.trim();
    if (
      /\b(filters?|columns|refresh|export|view|search|cancel|back|show more)\b/i.test(
        action,
      )
    )
      return;
    if (
      /\b(create|edit|delete|save|update|upload|import|add|remove|approve|send|process|train|run|stop|restart|enable|disable|security access)\b/i.test(
        action,
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <div
      className="min-h-full"
      data-access-mode={readOnly ? "read-only" : "edit"}
      onClickCapture={preventMutation}
    >
      {children}
    </div>
  );
}

export default function Dashboard({ onLogout, session }: DashboardProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);
  const [notificationDetails, setNotificationDetails] = useState<AttentionNotification | null>(null);
  const [notificationNavigationError, setNotificationNavigationError] = useState('');
  const organizationAccessRevision = useOrganizationAccessRevision();
  const notificationRecords = useAttentionNotifications(true);
  const visibleNotifications = useVisibleNotificationRecords(notificationRecords, session);
  const demoAlertCompany = visibleNotifications.organizations.find(company => company.name === 'Alice Stone') ?? visibleNotifications.organizations[0];
  useEffect(() => {
    let cancelled = false;
    if (import.meta.env.DEV && demoAlertCompany && visibleNotifications.session && canViewMenu(visibleNotifications.session, 'notifications')) {
      ensureImportantNotificationExamples(demoAlertCompany, visibleNotifications.session.email);
      const current = visibleNotifications.session;
      void loadRelatedObjects(demoAlertCompany, current).then(objects => {
        if (!cancelled) linkImportantNotificationExamples(demoAlertCompany.id, current.email, objects);
      }).catch(() => { /* Keep alerts readable if their source catalog is unavailable. */ });
    }
    return () => { cancelled = true; };
  }, [demoAlertCompany, visibleNotifications.session]);
  const notificationCounts = getNotificationTabCounts(visibleNotifications.records, visibleNotifications.session ?? session);
  const activeImportantNotifications = getRelevantActionsForTab(visibleNotifications.records, visibleNotifications.session ?? session, 'notifications')
    .filter(isImportantNotification);
  const importantNotificationCount = notificationCounts.notifications;
  const importantNotificationBadge = String(importantNotificationCount);
  const recentNotifications = [...activeImportantNotifications]
    .sort((left, right) => {
      const leftRank = 'severity' in left && left.severity === 'Critical' ? 0 : 1;
      const rightRank = 'severity' in right && right.severity === 'Critical' ? 0 : 1;
      return leftRank - rightRank || (Date.parse(right.createdAt ?? '') || 0) - (Date.parse(left.createdAt ?? '') || 0);
    })
    .slice(0, 5);
  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setNotificationsOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [notificationsOpen]);
  const attentionNotifications = visibleNotifications.session
    ? getDashboardAttentionNotifications(visibleNotifications.records, visibleNotifications.session) : [];
  const [notificationTarget, setNotificationTarget] = useState<{ tab: NotificationTab; query: string; organization?: { id: string; name: string }; requiresAction?: boolean; openTasksOnly?: boolean; returnCompany?: { company: Company; menu: string } }>({ tab: "notifications", query: "" });
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [activeMenu, setActiveMenu] = useState(() => firstAccessibleMenu(session));
  const [uploadedDocumentsGroup, setUploadedDocumentsGroup] =
    useState<UploadedDocumentsGroup>("All");
  const [userProfile, setUserProfile] = usePersistentState(
    userProfileStorageKey(session.email),
    {
      fullName: session.fullName,
      email: session.email,
      phone: "",
      role: session.roleNames.join(", "),
    },
  );
  const currentUserName = userProfile.fullName.trim() || session.fullName;
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  useEffect(() => {
    if (selectedCompany && !canAccessAssignedOrganization(selectedCompany, session)) {
      setSelectedCompany(null);
      setActiveMenu('dashboard');
    }
  }, [selectedCompany, session, organizationAccessRevision]);
  const [selectedCompanyMenu, setSelectedCompanyMenu] = useState("overview");
  const [selectedCompanyDocumentId, setSelectedCompanyDocumentId] = useState<string | null>(null);
  const [selectedCompanyDocumentMode, setSelectedCompanyDocumentMode] = useState<'view' | 'edit' | 'original-view'>('view');
  const [selectedCompanyRelatedObject, setSelectedCompanyRelatedObject] = useState<RelatedObject | undefined>();
  const [relatedChat, setRelatedChat] = useState<InvoiceChatContext | null>(null);
  const displayedMenu = relatedChat ? 'messages' : activeMenu;
  const mainContentRef = useRef<HTMLDivElement>(null);
  const relatedChatReturnScroll = useRef<number | null>(null);
  const [selectedChat, setSelectedChat] = useState<InvoiceChatContext | null>(null);
  const [automationProcessFromNode, setAutomationProcessFromNode] =
    useState<OcrProcess | null>(null);
  const [automationRunIdFromNode, setAutomationRunIdFromNode] = useState<
    string | null
  >(null);
  const [automationReturnMenu, setAutomationReturnMenu] = useState("ocr-ml-documents");
  const [securityAccessTarget, setSecurityAccessTarget] =
    useState<SecurityAccessTarget | null>(null);
  const [securityAccessReturnMenu, setSecurityAccessReturnMenu] =
    useState("ocr");
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<string | undefined>();
  const [userDirectoryCreateRequest, setUserDirectoryCreateRequest] = useState<
    "Internal users" | "External users" | null
  >(null);

  useLayoutEffect(() => {
    if (relatedChatReturnScroll.current === null) return;
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = relatedChat ? 0 : relatedChatReturnScroll.current;
    }
    if (!relatedChat) relatedChatReturnScroll.current = null;
  }, [relatedChat]);

  useEffect(() => {
    const showRefreshFeedback = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button");
      if (!button || button.disabled) return;

      const title = button.title.trim().toUpperCase();
      const ariaLabel = (button.getAttribute("aria-label") ?? "")
        .trim()
        .toUpperCase();
      const isRefreshAll =
        button.dataset.buttonFamily === "refresh-all" ||
        title === "REFRESH ALL" ||
        ariaLabel === "REFRESH ALL" ||
        ariaLabel.startsWith("REFRESH ALL ");

      if (!isRefreshAll) return;

      // Most refresh handlers replace their row objects immediately. Apply the
      // feedback on the next frame so the animation lands on the new DOM rows,
      // rather than on elements React has just removed.
      window.requestAnimationFrame(() => {
        const appMain =
          button.closest<HTMLElement>("[data-app-main]") ??
          document.querySelector<HTMLElement>("[data-app-main]");
        if (!appMain) return;

        document
          .querySelectorAll(".refresh-all-record-text")
          .forEach((element) =>
            element.classList.remove("refresh-all-record-text"),
          );

        const recordRows = Array.from(
          appMain.querySelectorAll<HTMLElement>(
            "[data-refresh-row], tbody tr, [role='row'], [class]",
          ),
        ).filter((element) => {
          if (element.closest("nav, header") || element.contains(button))
            return false;
          const className = element.className;
          if (typeof className !== "string") return false;
          const looksLikeRecord =
            element.matches("[data-refresh-row], tbody tr, [role='row']") ||
            className.includes("hover:bg") ||
            className.includes("bg-[#F8FDFF]");
          if (!looksLikeRecord || !element.textContent?.trim()) return false;
          const bounds = element.getBoundingClientRect();
          return bounds.width > 220 && bounds.height >= 24 && bounds.height <= 96;
        });

        const textElements = new Set<HTMLElement>();
        recordRows.forEach((row) => {
          row
            .querySelectorAll<HTMLElement>("span, a, p, td, div")
            .forEach((element) => {
              if (
                !element.textContent?.trim() ||
                element.closest("button") ||
                element.querySelector("span, a, p, td, div")
              ) {
                return;
              }
              textElements.add(element);
            });
        });

        textElements.forEach((element) => {
          element.classList.remove("refresh-all-record-text");
          void element.offsetWidth;
          element.classList.add("refresh-all-record-text");
        });

        window.setTimeout(() => {
          textElements.forEach((element) =>
            element.classList.remove("refresh-all-record-text"),
          );
        }, 520);
      });
    };

    document.addEventListener("click", showRefreshFeedback, true);
    return () =>
      document.removeEventListener("click", showRefreshFeedback, true);
  }, []);

  useEffect(() => {
    let interceptingMouseBack = false;
    let resetTimer: number | undefined;

    const visibleBackButton = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      )
        .filter((button) => {
          if (button.disabled) return false;
          const action = `${button.textContent ?? ""} ${
            button.getAttribute("aria-label") ?? ""
          } ${button.title}`.trim();
          if (!/\bback\b/i.test(action)) return false;
          const bounds = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        })
        .sort((first, second) => {
          const firstBounds = first.getBoundingClientRect();
          const secondBounds = second.getBoundingClientRect();
          return secondBounds.left - firstBounds.left || firstBounds.top - secondBounds.top;
        });

      return candidates[0];
    };

    const handleMouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return;

      const backButton = visibleBackButton();
      if (!backButton && !interceptingMouseBack) return;

      event.preventDefault();
      event.stopPropagation();

      if (!interceptingMouseBack && backButton) {
        interceptingMouseBack = true;
        backButton.click();
      }

      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        interceptingMouseBack = false;
      }, 250);
    };

    window.addEventListener("mousedown", handleMouseBack, true);
    window.addEventListener("mouseup", handleMouseBack, true);
    window.addEventListener("auxclick", handleMouseBack, true);

    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("mousedown", handleMouseBack, true);
      window.removeEventListener("mouseup", handleMouseBack, true);
      window.removeEventListener("auxclick", handleMouseBack, true);
    };
  }, []);

  useEffect(() => {
    if (activeMenu === "profile" || canViewMenu(session, activeMenu)) return;
    setActiveMenu(firstAccessibleMenu(session));
  }, [activeMenu, session]);

  const handleMenuClick = (menu: string) => {
    setDirectoryRoleFilter(undefined);
    if (menu === "notifications") setNotificationTarget({ tab: "reminders", query: "" });
    if (menu !== "profile" && !canViewMenu(session, menu)) return;
    relatedChatReturnScroll.current = null;
    setRelatedChat(null);
    const targetMenu =
      menu === "ocr"
        ? [
            "ocr-all-documents-processed",
            "ocr-all-documents-uploaded",
            "ocr-workspace",
            "ocr-ml",
            "ocr-review-approve-documents",
            "ocr-review-analytics",
            "ocr-admin-human-task-types",
            "ocr-admin-document-type",
            "ocr-admin-activity",
          ].find((candidate) => canViewMenu(session, candidate)) ?? "profile"
        : menu;
    if (menu === "messages") setSelectedChat(null);
    if (targetMenu === "uploaded-documents") setUploadedDocumentsGroup("All");
    setAutomationProcessFromNode(null);
    setAutomationRunIdFromNode(null);
    setSecurityAccessTarget(null);
    setActiveMenu(targetMenu);
  };

  const openSecurityAccess = (
    target: SecurityAccessTarget,
    returnMenu: string,
  ) => {
    setSecurityAccessTarget(target);
    setSecurityAccessReturnMenu(returnMenu);
    setActiveMenu("ocr-admin-groups");
  };

  const openCompany = (company: Company, menu = "overview", documentId: string | null = null, mode: 'view' | 'edit' | 'original-view' = 'view') => {
    setSelectedCompanyRelatedObject(undefined);
    setSelectedCompanyDocumentMode(mode);
    setSelectedCompanyMenu(menu);
    setSelectedCompanyDocumentId(documentId);
    setSelectedCompany(company);
  };

  const openRelatedObject = async (object: RelatedObject, editDocument = false) => {
    let currentSession = parseSession(JSON.stringify(session));
    if (!currentSession) throw new Error('Your session is no longer valid.');
    const { data, error } = await supabase.from('companies').select('*');
    const company = !error && (data as unknown as Company[] | null)?.find(candidate => candidate.id === object.organizationId);
    if (!company || !canAccessAssignedOrganization(company, currentSession)) throw new Error('This organization is no longer accessible.');
    const resolved = await resolveRelatedObject(object, company, currentSession);
    if (!resolved) throw new Error('The related object was removed or is no longer accessible.');
    currentSession = parseSession(JSON.stringify(session));
    if (!currentSession?.access.companies.view || !canAccessAssignedOrganization(company, currentSession)) throw new Error('This organization is no longer accessible.');
    if (resolved.type === 'Chat') {
      const { data: documents, error: documentError } = await supabase.from('documents').select('*').eq('company_id', company.id);
      if (documentError) throw new Error('This chat is no longer available.');
      currentSession = parseSession(JSON.stringify(session));
      if (!currentSession || !canViewMenu(currentSession, 'messages') || !canAccessAssignedOrganization(company, currentSession)) throw new Error('This chat is no longer accessible.');
      const conversation = loadRelatedObjectChats(company, currentSession, (documents ?? []) as unknown as DbDocument[]).find(chat => chat.storageKey === resolved.recordId);
      if (!conversation) throw new Error('This chat is no longer available.');
      relatedChatReturnScroll.current = mainContentRef.current?.scrollTop ?? 0;
      setRelatedChat({ ...conversation, organizationId: company.id, companyName: company.name });
      return;
    }
    if (resolved.type === 'Document' || resolved.type === 'Invoice') {
      openCompany(company, 'documents', resolved.recordId ?? resolved.id, editDocument && canEditMenu(currentSession, 'dashboard') ? 'edit' : 'view');
      return;
    }
    openCompany(company);
    setSelectedCompanyRelatedObject(resolved);
  };

  const openDocumentInOrganization = async (document: DbDocument, mode: 'view' | 'edit' | 'original-view' = 'view') => {
    if (!document.company_id) return;
    const { data } = await supabase.from("companies").select("*");
    const company = (data as unknown as Company[] | null)?.find(
      (candidate) => candidate.id === document.company_id,
    );
    if (company) openCompany(company, "documents", document.id, mode);
  };

  const completeWorkspaceTask = async (task: WorkspaceTask) => {
    const companyName = task.fields.companyName.trim();
    const { data: companyRows } = await supabase.from("companies").select("*");
    let company = (companyRows as unknown as Company[] | null)?.find(
      (row) =>
        row.name.trim().toLocaleLowerCase() === companyName.toLocaleLowerCase(),
    );

    if (!company) {
      const companyId = `ocr-company-${
        companyName
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || task.id
      }`;
      company = {
        id: companyId,
        name: companyName,
        company_code: task.fields.invoiceNumber || `OCR-${task.id}`,
        vat_code: "",
        client_since: new Date().getFullYear(),
        action_required: 0,
      };
      await supabase
        .from("companies")
        .upsert(company as unknown as Record<string, unknown>, {
          onConflict: "id",
        });
    }

    const numericTotal =
      Number(
        task.fields.totalAmount.replace(/[^\d.,-]/g, "").replace(",", "."),
      ) || 0;
    const taxRate =
      Number(task.fields.taxRate.replace(/[^\d.,-]/g, "").replace(",", ".")) ||
      0;
    const amountWithoutVat =
      taxRate > 0 ? numericTotal / (1 + taxRate / 100) : numericTotal;
    const vat = numericTotal - amountWithoutVat;
    const purpose = task.products
      .map((product) =>
        [product.name, product.description].filter(Boolean).join(" — "),
      )
      .filter(Boolean)
      .join("; ");

    await supabase.from("documents").upsert(
      {
        id: `workspace-document-${task.id}`,
        company_id: company.id,
        receive_date: new Date().toLocaleDateString("lt-LT"),
        client_counterparty: company.name,
        document_type: task.documentType || "Invoice",
        source: "OCR Workspace",
        total_amount: `${numericTotal.toFixed(2)} €`,
        due_end_date: task.fields.dueDate,
        file_case: task.name,
        order_no: task.sourceRunId,
        number: task.fields.invoiceNumber,
        type: "Invoice",
        document_date: task.fields.invoiceDate,
        document_purpose: purpose || task.description,
        invoice_contract_date: task.fields.invoiceDate,
        operation_date: task.fields.invoiceDate,
        expense_account: "",
        vat_classifier: "",
        currency: "EUR",
        amount_without_vat: `${amountWithoutVat.toFixed(2)} €`,
        vat: `${vat.toFixed(2)} €`,
        vat_percent: `${taxRate.toFixed(2)}%`,
        department_code: "",
        object_project: task.sourceRunId,
        valid_form: "OCR validated",
        accountable_responsible: task.createdBy,
        cost_center: "",
        series: "OCR",
        status: "Pending",
        created_at: new Date().toISOString(),
        image_url: null,
      },
      { onConflict: "id" },
    );

    openCompany(company, "documents");
  };

  const companyContent = selectedCompany && canAccessAssignedOrganization(selectedCompany, session) ? (
      <ReadOnlyBoundary readOnly={!session.access.companies.edit}>
        <CompanyDetail
          key={`${selectedCompany.id}:${selectedCompanyRelatedObject?.id ?? selectedCompanyDocumentId ?? selectedCompanyMenu}`}
          company={selectedCompany}
          canEditReconciliation={session.access.companies.edit}
          initialMenu={selectedCompanyMenu}
          initialDocumentId={selectedCompanyDocumentId}
          initialDocumentMode={selectedCompanyDocumentMode}
          initialRelatedObject={selectedCompanyRelatedObject}
          notificationsContent={canViewMenu(session, 'notifications') ? <OrganizationRequiredActionsView
            organization={{ id: selectedCompany.id, name: selectedCompany.name }}
            session={session}
            initialTab="reminders"
            initialOpenTasksOnly={selectedCompanyMenu === 'notifications' && notificationTarget.organization?.id === selectedCompany.id && notificationTarget.openTasksOnly}
            onOpenRelatedObject={openRelatedObject}
          /> : undefined}
          onLogout={onLogout}
          onOpenProfile={() => {
            relatedChatReturnScroll.current = null;
            setRelatedChat(null);
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setSelectedCompanyRelatedObject(undefined);
            setSelectedChat(null);
            setAutomationProcessFromNode(null);
            setAutomationRunIdFromNode(null);
            setSecurityAccessTarget(null);
            setActiveMenu("profile");
          }}
          onOpenChat={(context) => {
            relatedChatReturnScroll.current = null;
            setRelatedChat(null);
            setSelectedChat({ ...context, organizationId: selectedCompany.id });
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setActiveMenu("messages");
          }}
          onBack={() => {
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setSelectedCompanyRelatedObject(undefined);
          }}
        />
      </ReadOnlyBoundary>
    ) : null;

  const renderContent = () => {
    if (securityAccessTarget) {
      return (
        <ResourceSecurityAccessView
          target={securityAccessTarget}
          onBack={() => {
            setSecurityAccessTarget(null);
            setActiveMenu(securityAccessReturnMenu);
          }}
        />
      );
    }
    if (automationProcessFromNode) {
      return (
        <AutomationProcessDetailView
          process={automationProcessFromNode}
          initialRunId={automationRunIdFromNode ?? undefined}
          onBack={() => {
            setAutomationProcessFromNode(null);
            setAutomationRunIdFromNode(null);
            setActiveMenu(automationReturnMenu);
          }}
        />
      );
    }
    if (activeMenu === "profile")
      return (
        <ProfileSettings
          user={{
            name: currentUserName,
            email: session.email,
            phone: userProfile.phone,
            role: session.roleNames.join(", "),
          }}
          onProfileSaved={setUserProfile}
          onOpenCompanies={() => {
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setActiveMenu("dashboard");
          }}
        />
      );
    if (activeMenu === "dashboard")
      return <SettingsOrganizationsView companiesMode onNavigateToUserDirectory={audience => {
        setUserDirectoryCreateRequest(audience);
        handleMenuClick(audience === 'Internal users' ? 'settings-internal-users' : 'settings-external-users');
      }} onViewCompany={(company) => openCompany(company)} onOpenRequiredActions={company => {
        if (!canViewMenu(session, 'notifications') || !visibleNotifications.canAccessOrganization(company.id)) return;
        setNotificationTarget({ tab: 'reminders', query: '', organization: { id: company.id, name: company.name }, openTasksOnly: true });
        openCompany(company, 'notifications');
      }} />;
    if (activeMenu === 'audit-history') return <CompanyActionHistoryView company={{ id: 'all', name: 'All organizations', company_code: '', vat_code: '', client_since: 0, action_required: 0 }} global />;
    if (activeMenu === "global-dashboard")
      return (
        <DashboardView
          clientName="All companies"
          allCompanies
          attentionNotifications={canViewMenu(session, "notifications") ? attentionNotifications : undefined}
          onOpenNotifications={canViewMenu(session, "notifications") ? (tab = "reminders", query = "") => {
            if (tab === 'notifications') { setNotificationsOpen(true); return; }
            setNotificationTarget({ tab, query, openTasksOnly: tab === 'reminders' && !query });
            setActiveMenu("notifications");
          } : undefined}
          roleNames={session.roleNames}
          access={session.access}
          onOpenDocument={openDocumentInOrganization}
          onOpenUploadedDocuments={(group) => {
            setUploadedDocumentsGroup(group);
            setActiveMenu("uploaded-documents");
          }}
        />
      );
    if (activeMenu === "uploaded-documents")
      return (
        <UploadedDocumentsView
          initialGroup={uploadedDocumentsGroup}
          onOpenDocument={openDocumentInOrganization}
        />
      );
    if (activeMenu === "messages")
      return <ChatsView currentUserName={currentUserName} conversation={selectedChat} onOpenDocument={openDocumentInOrganization} />;
    if (activeMenu === "notifications") return <OrganizationRequiredActionsView key={`${notificationTarget.organization?.id ?? 'all'}:${notificationTarget.tab}:${notificationTarget.query}:${Boolean(notificationTarget.requiresAction)}:${Boolean(notificationTarget.openTasksOnly)}`} organization={notificationTarget.organization} session={session} initialTab="reminders" initialQuery={notificationTarget.query} initialRequiresAction={notificationTarget.requiresAction} initialOpenTasksOnly={notificationTarget.openTasksOnly} onOpenRelatedObject={openRelatedObject} onBack={notificationTarget.organization ? () => {
      setActiveMenu('dashboard');
      if (notificationTarget.returnCompany) openCompany(notificationTarget.returnCompany.company, notificationTarget.returnCompany.menu);
    } : undefined} />;
    if (activeMenu === "info") return <HelpFaqView />;
    const settingsSections = {
      "settings-internal-roles": {
        audience: "Internal users",
        section: "Roles",
      },
      "settings-internal-users": {
        audience: "Internal users",
        section: "Users",
      },
      "settings-external-roles": {
        audience: "External users",
        section: "Roles",
      },
      "settings-external-users": {
        audience: "External users",
        section: "Users",
      },
    } as const;
    if (activeMenu === 'settings-administrator') return <AdministratorSettings session={session} />;
    if (activeMenu === "settings-organizations")
      return <GeneralLedgerView />;
    if (activeMenu === "settings-vat-classifications")
      return <VatClassificationsView />;
    if (activeMenu === "settings-organizations-operation-date-validation")
      return <OperationDateValidationView />;
    if (activeMenu === "settings-organizations-email")
      return <OrganizationEmailSettingsView />;
    if (activeMenu === "settings-counterparties")
      return (
        <Companies
          title="Counterparties"
          entityLabel="counterparty"
          dataSource="counterparties"
          allowCreate
          breadcrumbs={["Settings", "Counterparties"]}
        />
      );
    if (activeMenu === "settings-general-ledger") return <GeneralLedgerView />;
    if (activeMenu === "settings-analytics")
      return <SettingsUserAnalyticsView />;
    const organizationReferenceSections: Record<
      string,
      OrganizationReferenceSection
    > = {
      "settings-organizations-tax-country": "Tax country",
      "settings-organizations-legal-form": "Legal form",
      "settings-organizations-base-currency": "Base currency",
      "ocr-admin-document-type": "Document type",
      "settings-organizations-document-status": "Document Status",
      "settings-organizations-unit": "Unit",
    };
    if (organizationReferenceSections[activeMenu]) {
      return (
        <OrganizationReferenceValuesView
          key={activeMenu}
          section={organizationReferenceSections[activeMenu]}
          breadcrumbParents={activeMenu === "ocr-admin-document-type" ? ["OCR", "Administration"] : undefined}
        />
      );
    }
    const settingsSection =
      settingsSections[activeMenu as keyof typeof settingsSections];
    if (settingsSection) {
      if (
        settingsSection.section === "Roles" ||
        settingsSection.section === "Users"
      ) {
        return (
          <SettingsIdentityManagementView
            key={activeMenu}
            audience={settingsSection.audience}
            section={settingsSection.section}
            createOnOpen={
              settingsSection.section === "Users" &&
              userDirectoryCreateRequest === settingsSection.audience
            }
            onCreateOpened={() => setUserDirectoryCreateRequest(null)}
            initialRoleFilter={settingsSection.section === 'Users' ? directoryRoleFilter : undefined}
            onOpenRoleUsers={roleName => {
              handleMenuClick(settingsSection.audience === 'Internal users' ? 'settings-internal-users' : 'settings-external-users');
              setDirectoryRoleFilter(roleName);
            }}
          />
        );
      }
    }
    if (
      activeMenu === "ocr-all-documents" ||
      activeMenu === "ocr-all-documents-processed"
    )
      return <OcrProcessedDocumentsView />;
    if (activeMenu === "ocr-all-documents-uploaded")
      return (
        <AllDocumentsView mode="uploaded" scope="global" />
      );
    if (activeMenu === "ocr-workspace")
      return <WorkspaceView onCompleteToCompany={completeWorkspaceTask} />;
    if (activeMenu === "ocr-review" || activeMenu === "ocr-review-approve-documents")
      return <OcrReviewView section="approve-documents" />;
    if (activeMenu === "ocr-review-analytics")
      return <OcrReviewView section="analytics" />;
    if (activeMenu === "ocr-ml" || activeMenu === "ocr-ml-documents" || activeMenu === "ocr-ml-models")
      return (
        <MachineLearningView
          openInvoiceProcessingDocuments={activeMenu === "ocr-ml" || activeMenu === "ocr-ml-documents"}
          onOpenAutomationProcess={(processId, processName, runId) => {
            setAutomationProcessFromNode({
              id: processId,
              name: processName,
              description: "Automation process",
              capabilities: "—",
              createdBy: "RPA platform",
              creationDate: "10.04.2026 12:22",
              modifiedBy: "RPA platform",
              modifiedDate: "10.04.2026 12:22",
            });
            setAutomationRunIdFromNode(runId ?? null);
            setAutomationReturnMenu("ocr-ml-documents");
            setActiveMenu("ocr");
          }}
        />
      );
    if (activeMenu === "ocr-admin-groups")
      return <AutomationSecurityAccessView />;
    const administrationSections: Record<string, AdministrationSection> = {
      "ocr-admin": "human-task-types",
      "ocr-admin-human-task-types": "human-task-types",
      "ocr-admin-activity": "activity",
    };
    if (administrationSections[activeMenu])
      return (
        <AdministrationView section={administrationSections[activeMenu]} />
      );
    if (activeMenu === "ocr" || activeMenu.startsWith("ocr-")) {
      return (
        <OcrView
          onNavigateToAdministration={(target) =>
            openSecurityAccess(target, "ocr")
          }
        />
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center text-[#7288A3] font-montserrat font-medium text-[14px]">
        Coming soon
      </div>
    );
  };

  return (
    <>
    {canViewMenu(session, 'notifications') && <button type="button" aria-expanded={notificationsOpen} aria-label={`Notifications, ${importantNotificationCount} active notifications`} title="Notifications" onClick={() => { setNotificationsExpanded(false); setNotificationsOpen(value => !value); }} className="fixed right-4 top-2 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#7288A3] shadow-sm hover:text-[#007EA7]">
      <Bell size={20} />
      {importantNotificationCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#E65050] px-1 font-montserrat text-[10px] leading-4 text-white">{importantNotificationBadge}</span>}
    </button>}
    {notificationDetails && <NotificationDetailsPanel notification={notificationDetails} organizationName={notificationDetails.organizationName ?? '—'} read={isNotificationRead(notificationDetails, session.email)} onClose={() => setNotificationDetails(null)} />}
    {notificationsOpen && !notificationsExpanded && <div className="fixed inset-0 z-[100]" onClick={() => setNotificationsOpen(false)}>
      <section role="dialog" aria-label="Recent notifications" onClick={event => event.stopPropagation()} className="absolute right-4 top-12 flex max-h-[calc(100dvh-64px)] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-[#D3E1EC] bg-white font-montserrat shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#E5EDF9] px-4 py-3">
          <div><h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#10233A]">Notifications{importantNotificationCount > 0 && <span className="rounded-full bg-[#E65050] px-1.5 text-[11px] leading-5 text-white">{importantNotificationBadge}</span>}</h2><p className="mt-1 text-[11px] text-[#7288A3]">Active alerts requiring attention</p></div>
          <button type="button" onClick={() => setNotificationsExpanded(true)} className="whitespace-nowrap pt-1 text-[12px] font-semibold text-[#007EA7] hover:underline">View all</button>
        </header>
        <div className="min-h-0 overflow-y-auto p-2">
          {recentNotifications.map(row => <article key={`${row.organizationId}:${row.id}`} className="mb-2 rounded-lg border border-[#E5EDF9] p-3 last:mb-0 hover:bg-[#F8FDFF]">
            <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F2F6] text-[#007EA7]"><Bell size={15} /></span><div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] leading-4 text-[#7288A3]"><span className="font-medium">{getNotificationModuleLabel(row)}</span><span>{row.organizationName || '—'}</span></div>
              <span className={`mt-1 inline-flex rounded px-1.5 text-[10px] font-semibold leading-5 ${'severity' in row && row.severity === 'Critical' ? 'bg-[#FDEBEC] text-[#B93846]' : 'bg-[#FFF3DE] text-[#966000]'}`}>{'severity' in row ? row.severity : ''}</span>
              <p className="mt-1 break-words text-[12px] font-semibold leading-[18px] text-[#10233A]">{row.name}</p>
              {notificationMessage(row) !== row.name && <p className="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-[#7288A3]">{notificationMessage(row)}</p>}
              {getNotificationRelatedObjectLabel(row) !== '—' && <p className="mt-1 truncate text-[11px] text-[#7288A3]" title={getNotificationRelatedObjectLabel(row)}>Related object: {getNotificationRelatedObjectLabel(row)}</p>}
              <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px]"><NotificationRelativeTime row={row} /></span>{row.relatedObject && row.relatedObject.organizationId === row.organizationId ? <RelatedObjectLink object={row.relatedObject} organizationId={row.organizationId} variant="button" onError={setNotificationNavigationError} onOpen={async object => { await openRelatedObject(object, true); setNotificationsOpen(false); }} /> : <button type="button" onClick={() => { setNotificationsOpen(false); setNotificationDetails(row); }} className="h-7 rounded-md border border-[#D3E1EC] bg-white px-3 text-[11px] font-semibold text-[#007EA7] hover:bg-[#E6F2F6]">View details</button>}</div>
            </div></div>
          </article>)}
          {!recentNotifications.length && <p className="px-4 py-8 text-center text-[12px] text-[#7288A3]">No active critical or warning notifications.</p>}
          {notificationNavigationError && <p role="alert" className="px-3 py-2 text-[12px] text-[#B93846]">{notificationNavigationError}</p>}
        </div>
        <footer className="border-t border-[#E5EDF9] p-3"><button type="button" onClick={() => setNotificationsExpanded(true)} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#E5EDF9] text-[12px] font-semibold text-[#007EA7] hover:bg-[#D3E1EC]">View all notifications <ArrowRight size={15} /></button></footer>
      </section>
    </div>}
    {notificationsOpen && notificationsExpanded && <div className="fixed inset-0 z-[100] flex justify-end bg-[#10233A]/25" onClick={() => setNotificationsOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Notifications" className="relative h-full w-full max-w-[1400px] overflow-y-auto bg-white shadow-xl" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} className="absolute right-4 top-3 z-50 rounded-md p-2 text-[#7288A3] hover:bg-[#E5EDF9]"><X size={20} /></button>
        <OrganizationRequiredActionsView organization={selectedCompany ?? undefined} session={session} initialTab="notifications" onOpenModule={async (organizationId, menu) => {
          const company = visibleNotifications.organizations.find(candidate => candidate.id === organizationId);
          const current = parseSession(JSON.stringify(session));
          if (!company || !current || !current.access.companies.view || !canAccessAssignedOrganization(company, current)) throw new Error('This organization is no longer accessible.');
          openCompany(company, menu);
          setNotificationsOpen(false);
        }} onOpenRelatedObject={async object => { await openRelatedObject(object, true); setNotificationsOpen(false); }} />
      </div>
    </div>}
    {companyContent}
    <div style={{ display: selectedCompany ? 'none' : undefined }} className="flex h-screen overflow-hidden">
      <div className="flex-shrink-0 overflow-y-auto">
        <Sidebar
          notificationCount={notificationCounts.reminders}
          isExpanded={isMenuExpanded}
          onToggle={() => setIsMenuExpanded(!isMenuExpanded)}
          activeMenu={displayedMenu}
          onMenuClick={handleMenuClick}
          clientName={currentUserName}
          onLogout={onLogout}
          visibleMainMenuIds={APP_MODULES.filter(
            (module) => session.access[module.id].view,
          ).map(
            (module) =>
              ({
                companies: "dashboard",
                chats: "messages",
                notifications: "notifications",
                settings: "settings",
                faq: "info",
                ocr: "ocr",
              })[module.id],
          )}
          canViewMenu={(menu) => canViewMenu(session, menu)}
        />
      </div>
      <div
        ref={mainContentRef}
        data-app-main
        data-active-menu={displayedMenu}
        className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <OcrContextFilters contextKey={displayedMenu} />
        <ReadOnlyBoundary
          readOnly={
            Boolean(moduleForMenu(displayedMenu)) && !canEditMenu(session, displayedMenu)
          }
        >
          <div style={{ display: relatedChat ? 'none' : undefined }}>
            {renderContent()}
          </div>
          {relatedChat && <ChatsView key={relatedChat.storageKey} preserveConversationMetadata currentUserName={currentUserName} conversation={relatedChat} onOpenDocument={openDocumentInOrganization} onBack={() => setRelatedChat(null)} />}
        </ReadOnlyBoundary>
      </div>
    </div>
    </>
  );
}
