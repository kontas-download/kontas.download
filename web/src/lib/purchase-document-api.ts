import { currentErrorLang, translateServerError } from './errors';

// Server texts stored or produced in Lithuanian (recognition failures, warnings, field errors) are translated for the user's language
// on the way out; the database keeps the Lithuanian source.
export async function localizeDocuments<T extends { error?: string | null }>(rows: T[]): Promise<T[]> {
  const lang = await currentErrorLang();
  return rows.map(row => (row.error ? { ...row, error: translateServerError(row.error, lang) } : row));
}

export async function localizePreview<T extends { document: { error?: string | null }; warnings: string[]; missing: Record<string, string> }>(preview: T): Promise<T> {
  const lang = await currentErrorLang();
  return {
    ...preview,
    document: preview.document.error ? { ...preview.document, error: translateServerError(preview.document.error, lang) } : preview.document,
    warnings: preview.warnings.map(w => translateServerError(w, lang)),
    missing: Object.fromEntries(Object.entries(preview.missing).map(([k, v]) => [k, translateServerError(v, lang)])),
  };
}
