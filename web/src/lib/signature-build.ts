// Signature configurator: the signature is built from these fields (pure function, used by the server and the live preview).
export interface SignatureConfig {
  personName: string; personTitle: string; phone: string; email: string; website: string; extra: string;
  show: { companyName: boolean; codes: boolean; address: boolean; contacts: boolean; bank: boolean };
}
export interface SignatureCompany { name: string; code: string | null; vatCode: string | null; address: string | null; email: string | null; phone: string | null; bankName: string | null; bankIban: string | null }

export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  personName: '', personTitle: '', phone: '', email: '', website: '', extra: '',
  show: { companyName: true, codes: true, address: true, contacts: true, bank: true },
};

export function normalizeSignatureConfig(value: unknown): SignatureConfig {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const show = (v.show && typeof v.show === 'object' ? v.show : {}) as Record<string, unknown>;
  const str = (key: keyof SignatureConfig, max: number) => (typeof v[key] === 'string' ? (v[key] as string).trim().slice(0, max) : '');
  const flag = (key: keyof SignatureConfig['show']) => (typeof show[key] === 'boolean' ? (show[key] as boolean) : DEFAULT_SIGNATURE_CONFIG.show[key]);
  return {
    personName: str('personName', 200), personTitle: str('personTitle', 200), phone: str('phone', 50), email: str('email', 200), website: str('website', 200), extra: str('extra', 1000),
    show: { companyName: flag('companyName'), codes: flag('codes'), address: flag('address'), contacts: flag('contacts'), bank: flag('bank') },
  };
}

/** Signature lines: person (name, position, own contacts), then the chosen company details, website and extra text. */
export function buildSignature(config: SignatureConfig, c: SignatureCompany | undefined) {
  const phone = config.phone || (config.show.contacts ? c?.phone || '' : '');
  const email = config.email || (config.show.contacts ? c?.email || '' : '');
  return [
    config.personName,
    config.personTitle,
    config.show.companyName && c?.name,
    config.show.codes && [c?.code && `Įm. k. ${c.code}`, c?.vatCode && `PVM k. ${c.vatCode}`].filter(Boolean).join(', '),
    config.show.address && c?.address,
    [phone && `Tel. ${phone}`, email].filter(Boolean).join(', '),
    config.website,
    config.show.bank && c?.bankIban && [c.bankName, c.bankIban].filter(Boolean).join(': '),
    config.extra,
  ].filter(Boolean).join('\n');
}
