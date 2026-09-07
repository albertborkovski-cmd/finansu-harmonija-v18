import { useState } from "react";
import type { Company } from "../lib/supabase";
import Companies from "./Companies";
import CompanyClientInformation from "./CompanyClientInformation";
import { loadGeneralLedgerTemplateNames } from "./GeneralLedgerView";

/**
 * Organizations are the canonical records behind Companies. Both Settings
 * and the company client-information page intentionally read and update the
 * same `companies` table so organization data has a single source of truth.
 */
export default function SettingsOrganizationsView({
  onNavigateToUserDirectory,
}: {
  onNavigateToUserDirectory: (
    audience: "Internal users" | "External users",
  ) => void;
}) {
  const [selectedOrganization, setSelectedOrganization] =
    useState<Company | null>(null);
  const [creatingOrganization, setCreatingOrganization] = useState(false);

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
      />
    );
  }

  return (
    <Companies
      title="Organizations"
      entityLabel="organization"
      allowCreate
      breadcrumbs={["Settings", "Organizations"]}
      onViewDetails={setSelectedOrganization}
      onCreate={() => {
        setCreatingOrganization(true);
        setSelectedOrganization(newOrganization());
      }}
    />
  );
}
