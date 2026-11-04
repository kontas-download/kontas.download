import type { Suggestion } from '@/lib/suggestions';

/** Renders HTML datalists for autocomplete: { 'datalist-id': values }. Inputs refer to them with list="datalist-id". */
export function SuggestionLists({ lists }: { lists: Record<string, Suggestion[] | undefined> }) {
  return (
    <>
      {Object.entries(lists).map(([id, values]) => (
        <datalist key={id} id={id}>
          {(values || []).map(v => typeof v === 'string' ? <option key={v} value={v} /> : <option key={v.value} value={v.value}>{v.label}</option>)}
        </datalist>
      ))}
    </>
  );
}
