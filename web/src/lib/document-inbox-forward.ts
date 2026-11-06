import { addressesOf } from './document-inbox-senders';

// Original sender of a forwarded message written inline in the body ("---------- Forwarded message ----------", "From: ...").
// Headers are matched in Lithuanian, English, Russian and German; the first address that is not one of the forwarder's own is returned.
const MARKER = /^[\s>]*(?:[-_=*#\s]{2,})?\s*(?:forwarded message|begin forwarded message|original message|persi[uų]stas laiškas|persi[uų]stas pranešimas|pradinis laiškas|переслан\w*\s+(?:сообщение|письмо)|исходное сообщение|weitergeleitete nachricht|urspr[uü]ngliche nachricht)/i;
const FROM = /^[\s>]*(?:from|nuo|от|von|de)\s*:\s*(.*)$/i;
const SUBJECT = /^[\s>]*(?:subject|tema|тема|betreff|asunto|objet)\s*:/i;

export function originalSenderFromText(text: string | null | undefined, own: Set<string> = new Set()): string | null {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const pick = (value: string) => addressesOf(value).find(a => !own.has(a)) ?? null;
  for (let i = 0; i < lines.length; i++) {
    if (!MARKER.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 14); j++) {
      const from = FROM.exec(lines[j]);
      if (from) return pick(from[1] || lines[j + 1] || '');
    }
  }
  // Mail programs that write only a header block (From / Sent / To / Subject) without a marker line: From followed by a Subject line close by.
  for (let i = 0; i < lines.length; i++) {
    const from = FROM.exec(lines[i]);
    if (from && lines.slice(i + 1, i + 7).some(l => SUBJECT.test(l))) return pick(from[1]);
  }
  return null;
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'" };
/** Body text of a parsed message: the text part, else the HTML part reduced to lines of text. */
export function bodyText(parsed: { text?: string | null; html?: string | false | null }): string {
  if (parsed.text && parsed.text.trim()) return parsed.text;
  if (typeof parsed.html !== 'string') return '';
  return parsed.html
    .replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi, '')
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:lt|gt|amp|quot|nbsp|#39);/g, e => ENTITIES[e]);
}
