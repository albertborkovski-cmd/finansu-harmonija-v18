import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Sidebar from "./Sidebar";
import ProfileSettings from "./ProfileSettings";
import Companies from "./Companies";
import CompanyDetail from "./CompanyDetail";
import DashboardView from "./DashboardView";
import UploadedDocumentsView from "./UploadedDocumentsView";
import type { UploadedDocumentsGroup } from "../lib/uploadedDocuments";
import OcrView from "./OcrView";
import AllDocumentsView from "./AllDocumentsView";
import OcrProcessedDocumentsView from "./OcrProcessedDocumentsView";
import WorkspaceView, { type WorkspaceTask } from "./WorkspaceView";
import MachineLearningView from "./ml";
import NotificationsView from "./NotificationsView";
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
  type AppSession,
} from "../lib/accessControl";
import { userProfileStorageKey } from "../lib/currentUser";
import { useAttentionNotifications } from "../hooks/useAttentionNotifications";
import type { NotificationTab } from "../lib/notifications";

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
  "ocr-admin-activity",
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
      /\b(filter|columns|refresh|export|view|search|cancel|back|show more)\b/i.test(
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
  const attentionNotifications = useAttentionNotifications();
  const [notificationTarget, setNotificationTarget] = useState<{ tab: NotificationTab; query: string }>({ tab: "notifications", query: "" });
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
  const [selectedCompanyMenu, setSelectedCompanyMenu] = useState("overview");
  const [selectedCompanyDocumentId, setSelectedCompanyDocumentId] = useState<string | null>(null);
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
  const [userDirectoryCreateRequest, setUserDirectoryCreateRequest] = useState<
    "Internal users" | "External users" | null
  >(null);

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
    if (menu === "notifications") setNotificationTarget({ tab: "notifications", query: "" });
    if (menu !== "profile" && !canViewMenu(session, menu)) return;
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

  const openCompany = (company: Company, menu = "overview", documentId: string | null = null) => {
    setSelectedCompanyMenu(menu);
    setSelectedCompanyDocumentId(documentId);
    setSelectedCompany(company);
  };

  const openDocumentInOrganization = async (document: DbDocument) => {
    if (!document.company_id) return;
    const { data } = await supabase.from("companies").select("*");
    const company = (data as unknown as Company[] | null)?.find(
      (candidate) => candidate.id === document.company_id,
    );
    if (company) openCompany(company, "documents", document.id);
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

  const companyContent = selectedCompany ? (
      <ReadOnlyBoundary readOnly={!session.access.companies.edit}>
        <CompanyDetail
          company={selectedCompany}
          initialMenu={selectedCompanyMenu}
          initialDocumentId={selectedCompanyDocumentId}
          onLogout={onLogout}
          onOpenProfile={() => {
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setSelectedChat(null);
            setAutomationProcessFromNode(null);
            setAutomationRunIdFromNode(null);
            setSecurityAccessTarget(null);
            setActiveMenu("profile");
          }}
          onOpenChat={(context) => {
            setSelectedChat(context);
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
            setActiveMenu("messages");
          }}
          onBack={() => {
            setSelectedCompany(null);
            setSelectedCompanyMenu("overview");
            setSelectedCompanyDocumentId(null);
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
      return <Companies onViewDetails={(company) => openCompany(company)} />;
    if (activeMenu === "global-dashboard")
      return (
        <DashboardView
          clientName="All companies"
          allCompanies
          attentionNotifications={canViewMenu(session, "notifications") ? attentionNotifications : undefined}
          onOpenNotifications={canViewMenu(session, "notifications") ? (tab = "notifications", query = "") => {
            setNotificationTarget({ tab, query });
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
      return <ChatsView currentUserName={currentUserName} conversation={selectedChat} />;
    if (activeMenu === "notifications") return <NotificationsView key={`${notificationTarget.tab}:${notificationTarget.query}`} initialTab={notificationTarget.tab} initialQuery={notificationTarget.query} />;
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
    if (activeMenu === "settings-organizations")
      return (
        <SettingsOrganizationsView
          onNavigateToUserDirectory={(audience) => {
            setUserDirectoryCreateRequest(audience);
            handleMenuClick(
              audience === "Internal users"
                ? "settings-internal-users"
                : "settings-external-users",
            );
          }}
        />
      );
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
      "settings-organizations-company-status": "Company status",
      "settings-organizations-tax-country": "Tax country",
      "settings-organizations-legal-form": "Legal form",
      "settings-organizations-base-currency": "Base currency",
      "settings-organizations-document-type": "Document type",
      "settings-organizations-document-status": "Document Status",
      "settings-organizations-unit": "Unit",
    };
    if (organizationReferenceSections[activeMenu]) {
      return (
        <OrganizationReferenceValuesView
          key={activeMenu}
          section={organizationReferenceSections[activeMenu]}
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
    {companyContent}
    <div style={{ display: selectedCompany ? 'none' : undefined }} className="flex h-screen overflow-hidden">
      <div className="flex-shrink-0 overflow-y-auto">
        <Sidebar
          notificationCount={attentionNotifications.length}
          isExpanded={isMenuExpanded}
          onToggle={() => setIsMenuExpanded(!isMenuExpanded)}
          activeMenu={activeMenu}
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
        data-app-main
        data-active-menu={activeMenu}
        className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <OcrContextFilters contextKey={activeMenu} />
        <ReadOnlyBoundary
          readOnly={
            Boolean(moduleForMenu(activeMenu)) && !canEditMenu(session, activeMenu)
          }
        >
          {renderContent()}
        </ReadOnlyBoundary>
      </div>
    </div>
    </>
  );
}
