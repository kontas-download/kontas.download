'use client';
import { DOC_LANGS } from '@/lib/doc-language';
import { useT } from '@/lib/i18n/client';

// Language of the customer-facing document. An empty value means "the customer's own language" (Lithuanian when none is set).
export function DocLanguageSelect({ value, onChange, disabled = false, className = '', defaultLabelKey = 'docLang.byClient' }: { value: string; onChange: (value: string) => void; disabled?: boolean; className?: string; defaultLabelKey?: string }) {
  const t = useT();
  return (
    <select aria-label={t('docLang.label')} title={t('docLang.hint')} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">{t(defaultLabelKey)}</option>
      {DOC_LANGS.map(code => <option key={code} value={code}>{t(`docLang.${code}`)}</option>)}
    </select>
  );
}
