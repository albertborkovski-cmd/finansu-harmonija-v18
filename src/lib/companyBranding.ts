const COMPANY_LOGO_KEY_PREFIX = "finansu-harmonija:v12:company-logo:";

export function loadCompanyLogo(companyId: string): string {
  if (typeof window === "undefined" || !companyId) return "";
  return window.localStorage.getItem(`${COMPANY_LOGO_KEY_PREFIX}${companyId}`) ?? "";
}

export function saveCompanyLogo(companyId: string, logo: string): void {
  if (typeof window === "undefined" || !companyId) return;
  const key = `${COMPANY_LOGO_KEY_PREFIX}${companyId}`;
  if (logo) window.localStorage.setItem(key, logo);
  else window.localStorage.removeItem(key);
  window.dispatchEvent(
    new CustomEvent("finansu-harmonija:company-logo-updated", {
      detail: { companyId, logo },
    }),
  );
}
