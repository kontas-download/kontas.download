import type { Lang } from '../i18n/config';

export type HelpGroup = 'start' | 'operations' | 'accounting' | 'tax' | 'system';
export const HELP_GROUPS: HelpGroup[] = ['start', 'operations', 'accounting', 'tax', 'system'];

// Text of one help page in one language. Section headings come from the `help` i18n namespace.
export interface HelpPageText {
  title: string;
  summary: string;
  purpose: string[];
  steps: string[];
  rules: string[];
  mistakes: string[];
  notes?: { title: string; items: string[] }[];
}

export interface HelpPage {
  slug: string;
  group: HelpGroup;
  // Screen of the application described by the page.
  appHref?: string;
  // Ids from `helpSources`.
  sources: string[];
  text: Record<Lang, HelpPageText>;
}

export interface HelpSource {
  id: string;
  title: Record<Lang, string>;
  url: string;
  issuer: string;
  // true when the URL is the official portal/search page and the act must be found there by the title given.
  portal: boolean;
  verifiedOn: string;
}
