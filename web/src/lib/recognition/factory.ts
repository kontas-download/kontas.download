import { provider as anthropic } from './provider-anthropic';
import { provider as pollinations } from './provider-pollinations';
import type { RecognitionProvider, RecognitionProviderKind } from './types';

const byKind = (kind?: RecognitionProviderKind): RecognitionProvider => (kind === 'POLLINATIONS' ? pollinations : anthropic);

// Default provider used by the API routes: it routes every call to the adapter named in the options (the company setting).
// Core code and tests receive a provider as a parameter and never import this module.
export const defaultRecognitionProvider: RecognitionProvider = {
  recognize: (file, opts) => byKind(opts.provider).recognize(file, opts),
  testKey: (apiKey, model, kind) => byKind(kind).testKey(apiKey, model, kind),
};
