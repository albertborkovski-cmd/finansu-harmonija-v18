import { useState } from "react";
import type { Company } from "../lib/supabase";
import Companies from "./Companies";
import CompanyClientInformation from "./CompanyClientInformation";
import OrganizationSetupIntegration from './OrganizationSetupIntegration';
import { loadGeneralLedgerTemplateNames } from "./GeneralLedgerView";

/**
 * Organizations are the canonical records behind Companies. Both Settings
 * and the company client-information page intentionally read and update the
 * same `companies` table so organization data has a single source of truth.
 */
export default function SettingsOrganizationsView({
  onNavigateToUserDirectory,
  companiesMode = false,
  onViewCompany,
  onOpenRequiredActions,
}: {
  companiesMode?: boolean;
  onViewCompany?: (company: Company) => void;
  onOpenRequiredActions?: (company: Company) => void;
  onNavigateToUserDirectory: (
    audience: "Internal users" | "External users",
  ) => void;
}) {
  const [selectedOrganization, setSelectedOrganization] =
    useState<Company | null>(null);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [setupOrganization, setSetupOrganization] = useState<Company | null>(null);

  const newOrganization = (): Company => ({
    id: `new-organization-${Date.now()}`,
    name: "",
    company_code: "",
    vat_code: "",
    client_since: new Date().getFullYear(),
    action_required: 0,
    company_status: "Active",
    tax_country: "Lithuania",
    legal_form: "UAB",
    base_currency: "EUR",
    general_ledger: loadGeneralLedgerTemplateNames()[0] ?? "",
    product_groups: "",
    allow_document_duplicates: "No",
    invoice_digitization: "Summary",
    document_splitting: "Split",
    reject_non_invoices: "Do not reject",
    primary_export_format: "Rivilė",
    two_factor_authentication: "No",
    address: "",
    email: "",
    phone: "",
    website: "",
    client_notes: "",
  });

  if (setupOrganization) return <OrganizationSetupIntegration company={setupOrganization} onBack={() => setSetupOrganization(null)} onOpenCard={() => { setSelectedOrganization(setupOrganization); setCreatingOrganization(false); setSetupOrganization(null); }} />;

  if (selectedOrganization) {
    return (
      <CompanyClientInformation
        company={selectedOrganization}
        activeTab="Client information"
        organizationMode
        createMode={creatingOrganization}
        onBack={() => {
          setCreatingOrganization(false);
          setSelectedOrganization(null);
        }}
        onCompanyUpdated={(organization) => {
          setCreatingOrganization(false);
          setSelectedOrganization(organization);
        }}
        onNavigateToUserDirectory={onNavigateToUserDirectory}
        onOpenSetupIntegration={() => setSetupOrganization(selectedOrganization)}
      />
    );
  }

  return (
    <Companies
      title={companiesMode ? 'Companies' : 'Organizations'}
      entityLabel={companiesMode ? 'company' : 'organization'}
      allowCreate
      breadcrumbs={companiesMode ? ['Companies'] : ["Settings", "Organizations"]}
      onViewDetails={companiesMode ? onViewCompany : setSelectedOrganization}
      onOpenRequiredActions={onOpenRequiredActions}
      onOpenOrganizationSetup={setSetupOrganization}
      onCreate={() => {
        setCreatingOrganization(true);
        setSelectedOrganization(newOrganization());
      }}
    />
  );
}
