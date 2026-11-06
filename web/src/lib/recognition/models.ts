// The only place (besides the provider adapter) that names the cloud vendor's models. The UI and the settings API import the list from here.
// Name of the cloud vendor, shown on the Settings -> API card (the only UI text that names it).
export const RECOGNITION_VENDOR = 'Anthropic';
export const RECOGNITION_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'accurate' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'balanced' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'fast' },
] as const;
export type RecognitionModelId = (typeof RECOGNITION_MODELS)[number]['id'];
export const DEFAULT_RECOGNITION_MODEL: RecognitionModelId = 'claude-opus-5-5';

// Approximate list prices, USD per 1M tokens. The cost shown in the UI is an estimate ("apytiksle kaina"), not an invoice.
export const RECOGNITION_PRICES_USD: Record<RecognitionModelId, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
// Fixed USD -> EUR factor for the monthly limit and the displayed estimate. Override with RECOGNITION_USD_TO_EUR; stored costs stay in USD.
export const DEFAULT_USD_TO_EUR = 0.92;

// A custom model name that is not in the table is priced as the default (most expensive) model, so the limit errs on the safe side.
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const known = (Object.keys(RECOGNITION_PRICES_USD) as RecognitionModelId[]).find(id => model === id || model.startsWith(`${id}-`));
  const price = RECOGNITION_PRICES_USD[known || DEFAULT_RECOGNITION_MODEL];
  return (Math.max(0, inputTokens) * price.input + Math.max(0, outputTokens) * price.output) / 1_000_000;
}
