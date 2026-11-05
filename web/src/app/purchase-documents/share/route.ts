import { checkOrigin, currentUser, isRole } from '@/lib/access';
import { getDb } from '@/lib/db';
import { withActor } from '@/lib/audit-actor';
import { currentErrorLang, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { recognizeDocument, storeDocument, getRecognitionSettings } from '@/lib/purchase-recognition';
import { defaultRecognitionProvider } from '@/lib/recognition/factory';
import { processSharedFiles, sharedFilesFrom } from '@/lib/share-target';

// Target of the Web Share Target declared in the manifest. Always answers with 303 so the browser follows with a GET.
// Not under /api, so the proxy lets it through without a session cookie and this handler does its own check (see proxy.ts).
// The Location is relative on purpose: behind a reverse proxy request.url is the internal address.
const see = (_request: Request, path: string) => new Response(null, { status: 303, headers: { Location: path } });

export async function POST(request: Request) {
  const forbidden = await checkOrigin(request);
  if (forbidden) return forbidden;
  const user = await currentUser();
  if (!user || !isRole(user.role)) return see(request, '/login?shared=1');
  let form: FormData;
  try { form = await request.formData(); } catch { return see(request, '/purchase-documents'); }
  const files = sharedFilesFrom(form);
  if (!files.length) return see(request, '/purchase-documents');
  const companyId = await getActiveCompanyId();
  const lang = await currentErrorLang();
  const settings = getRecognitionSettings(companyId);
  const result = await processSharedFiles(files, user.email, {
    store: input => withActor(getDb(), user.id, () => storeDocument(companyId, input)),
    recognize: settings.enabled && settings.hasKey ? id => recognizeDocument(companyId, id, defaultRecognitionProvider) : null,
  }, message => translateServerError(message, lang));
  return see(request, result.location);
}

export function GET(request: Request) {
  return see(request, '/purchase-documents');
}
