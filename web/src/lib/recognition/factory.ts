import { provider } from './provider-anthropic';
import type { RecognitionProvider } from './types';

// Default provider used by the API routes. Core code and tests receive a provider as a parameter and never import this module.
export const defaultRecognitionProvider: RecognitionProvider = provider;
