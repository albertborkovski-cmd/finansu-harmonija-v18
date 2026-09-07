import { supabase, type Company, type DbDocument } from './supabase';

/** Shared source for OCR processed documents and uploaded-document assignment. */
export async function loadOcrDocumentSource() {
  const [companyResult, documentResult] = await Promise.all([
    supabase.from('companies').select('*').order('name', { ascending: true }),
    supabase.from('documents').select('*').order('receive_date', { ascending: false }),
  ]);
  return {
    organizations: (companyResult.data ?? []) as unknown as Company[],
    documents: (documentResult.data ?? []) as unknown as DbDocument[],
  };
}
