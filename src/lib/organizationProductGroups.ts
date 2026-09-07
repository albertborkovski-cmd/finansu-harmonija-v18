import { supabase } from './supabase';

type ProductGroupConfig = {
  enabled: boolean;
  items: Array<{ code: string; name?: string }>;
};

function parseConfig(value: unknown): ProductGroupConfig {
  if (typeof value !== 'string' || !value.trim()) {
    return { enabled: false, items: [] };
  }
  try {
    const parsed = JSON.parse(value) as Partial<ProductGroupConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      items: Array.isArray(parsed.items)
        ? parsed.items
            .map((item) => ({
              code: String(item?.code ?? '').trim(),
              name: String(item?.name ?? '').trim(),
            }))
            .filter((item) => item.code)
        : [],
    };
  } catch {
    return { enabled: false, items: [] };
  }
}

export async function ensureOrganizationProductGroup(
  companyId: string,
  value: string,
) {
  await ensureOrganizationProductGroups(companyId, [value]);
}

export async function ensureOrganizationProductGroups(
  companyId: string,
  values: string[],
) {
  const productGroups = [...new Map(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => [value.toLocaleLowerCase(), value]),
  ).values()];
  if (!companyId || productGroups.length === 0) return;

  const { data } = await supabase
    .from('companies')
    .select('product_groups')
    .eq('id', companyId);
  const config = parseConfig(data?.[0]?.product_groups);
  const existingCodes = new Set(
    config.items.map((item) => item.code.toLocaleLowerCase()),
  );
  const missingGroups = productGroups.filter(
    (productGroup) => !existingCodes.has(productGroup.toLocaleLowerCase()),
  );
  if (missingGroups.length === 0) return;

  await supabase
    .from('companies')
    .update({
      product_groups: JSON.stringify({
        ...config,
        items: [
          ...config.items,
          ...missingGroups.map((code) => ({ code, name: '' })),
        ],
      }),
    })
    .eq('id', companyId);
  window.dispatchEvent(
    new CustomEvent('finansu-harmonija:settings-data-changed', {
      detail: { scope: 'organizations', companyId },
    }),
  );
}
