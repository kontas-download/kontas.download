import { ImapFlow } from 'imapflow';
import { InboxError, pollAllInboxes, type InboxConnection, type InboxDeps, type InboxSession } from './document-inbox';
import { recognizeDocument } from './purchase-recognition';
import { defaultRecognitionProvider } from './recognition/factory';

// The real IMAP client and the production wiring. Core code and tests receive deps as a parameter and never import this module.
function translateFailure(error: unknown): InboxError {
  const e = error as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  const text = `${e.code ?? ''} ${e.message ?? ''} ${e.responseText ?? ''}`;
  if (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(text)) return new InboxError('Prisijungti nepavyko: neteisingas naudotojo vardas ar slaptažodis. Gmail atveju naudokite programos slaptažodį ir įjunkite IMAP.');
  if (/ENOTFOUND|EAI_AGAIN/.test(text)) return new InboxError('Pašto serveris nerastas: patikrinkite serverio adresą.');
  if (/CERT|SSL|TLS|EPROTO|self.signed|wrong version number/i.test(text)) return new InboxError('Saugaus ryšio (SSL/TLS) klaida: patikrinkite prievadą ir SSL/TLS nustatymą arba serverio sertifikatą.');
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|timeout/i.test(text)) return new InboxError('Nepavyko prisijungti prie serverio: patikrinkite adresą, prievadą ir ugniasienę.');
  return new InboxError('Nepavyko prisijungti prie pašto dėžutės.');
}

export async function imapConnect(c: InboxConnection): Promise<InboxSession> {
  const client = new ImapFlow({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.username, pass: c.password }, logger: false, socketTimeout: 60_000, greetingTimeout: 20_000, connectionTimeout: 20_000 });
  client.on('error', () => undefined); // reported through the rejected call instead
  try { await client.connect(); } catch (error) { throw translateFailure(error); }
  let lock: { release: () => void } | null = null;
  return {
    async open(folder) {
      try { lock = await client.getMailboxLock(folder); } catch { throw new InboxError(`Aplankas "${folder}" nerastas pašto dėžutėje.`); }
      return { uidValidity: String(client.mailbox ? client.mailbox.uidValidity : '') };
    },
    async listUids(after, unseenOnly) {
      const found = await client.search(unseenOnly ? { seen: false } : { uid: `${after + 1}:*` }, { uid: true });
      return found || [];
    },
    async fetchSource(uid) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) throw new InboxError('Nepavyko nuskaityti laiško.');
      return message.source;
    },
    async markDone(uid, processedFolder) {
      if (processedFolder) {
        await client.mailboxCreate(processedFolder).catch(() => undefined); // already exists
        await client.messageMove(String(uid), processedFolder, { uid: true });
      } else await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    },
    async close() {
      lock?.release();
      await client.logout().catch(() => client.close());
    },
  };
}

export const defaultInboxDeps: InboxDeps = {
  connect: imapConnect,
  recognize: (companyId, id) => recognizeDocument(companyId, id, defaultRecognitionProvider),
};
export const pollEnabledInboxes = () => pollAllInboxes(defaultInboxDeps);
