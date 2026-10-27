import type { Lang } from '../config';

// One namespace: the same keys in every language. Values may contain {name} placeholders.
export type Namespace = Record<Lang, Record<string, string>>;
