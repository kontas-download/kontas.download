// Pollinations: a gateway to several vision models. Host names and model ids live only in this module and in the provider
// (release_tree.py allows the word-boundary "ai" token only there); everything else imports these constants.
export const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai/v1';
export const POLLINATIONS_KEYS_URL = 'https://enter.pollinations.ai/keys';

export const POLLINATIONS_MODELS = [
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash', hint: 'cheapest', temperature: true },
  { id: 'qwen/qwen3.8-flash', label: 'Qwen 3.8 Flash', hint: 'balanced', temperature: true },
  { id: 'xiaomi/mimo-v2.6-flash', label: 'MiMo v2.6 Flash', hint: 'balanced', temperature: true },
  { id: 'moonshotai/kimi-k3.1-pro', label: 'Kimi K3.1 Pro', hint: 'accurate', temperature: false },
  { id: 'deepseek/deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision', hint: 'balanced', temperature: true },
] as const;
export const DEFAULT_POLLINATIONS_MODEL: string = POLLINATIONS_MODELS[0].id;

// Catalog prices, pollen per token (1 pollen = 1 USD); an image is priced like prompt text. An unknown id is priced as the default
// model; the UI calls every figure approximate.
const PRICES: Record<string, { input: number; output: number }> = {
  'z-ai/glm-5.3-flash': { input: 0.00000015, output: 0.0000005 },
  'qwen/qwen3.8-flash': { input: 0.00000015, output: 0.00000047 },
  'xiaomi/mimo-v2.6-flash': { input: 0.00000014, output: 0.00000028 },
  'moonshotai/kimi-k3.1-pro': { input: 0.000001725, output: 0.000008625 },
  'deepseek/deepseek-v4-flash-vision-exp': { input: 0.0000002156, output: 0.0000006468 },
};

export function estimatePollinationsCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] || PRICES[DEFAULT_POLLINATIONS_MODEL];
  return Math.max(0, inputTokens) * price.input + Math.max(0, outputTokens) * price.output;
}

// Sampling parameters are model specific: temperature 0 is sent only to models whose catalog entry lists it (unknown ids get none).
export const pollinationsAcceptsTemperature = (model: string) => POLLINATIONS_MODELS.some(m => m.id === model && m.temperature);
