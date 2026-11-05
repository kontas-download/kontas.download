// The only place (besides the provider adapter) that names the cloud vendor's models. The UI and the settings API import the list from here.
export const RECOGNITION_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'accurate' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'balanced' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'fast' },
] as const;
export type RecognitionModelId = (typeof RECOGNITION_MODELS)[number]['id'];
export const DEFAULT_RECOGNITION_MODEL: RecognitionModelId = 'claude-opus-5-5';
