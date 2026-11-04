import { getDb } from './db';
import { HttpError } from './errors';

export const LOGO_MAX_BYTES = 512 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

/** Only PNG and JPEG are accepted (checked by file signature, not by the client's claim); SVG is refused on purpose. */
export function logoMime(data: Buffer): 'image/png' | 'image/jpeg' | null {
  if (PNG.every((b, i) => data[i] === b)) return 'image/png';
  if (JPEG.every((b, i) => data[i] === b)) return 'image/jpeg';
  return null;
}

export function saveCompanyLogo(companyId: number, data: Buffer) {
  if (data.length === 0) throw new HttpError(400, 'Failas tuščias');
  if (data.length > LOGO_MAX_BYTES) throw new HttpError(413, 'Logotipas per didelis (daugiausia 512 KB)');
  const mime = logoMime(data);
  if (!mime) throw new HttpError(415, 'Leidžiami tik PNG arba JPEG failai');
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM Company WHERE id=?').get(companyId)) throw new HttpError(404, 'Įmonė nerasta');
  db.prepare("INSERT INTO CompanyLogo (companyId,mime,data,updatedAt) VALUES (?,?,?,datetime('now')) ON CONFLICT(companyId) DO UPDATE SET mime=excluded.mime,data=excluded.data,updatedAt=excluded.updatedAt").run(companyId, mime, data);
}

export function getCompanyLogo(companyId: number): { mime: string; data: Buffer } | undefined {
  return getDb().prepare('SELECT mime,data FROM CompanyLogo WHERE companyId=?').get(companyId) as { mime: string; data: Buffer } | undefined;
}

export function deleteCompanyLogo(companyId: number) {
  getDb().prepare('DELETE FROM CompanyLogo WHERE companyId=?').run(companyId);
}

export function companyLogoDataUrl(companyId: number): string | undefined {
  const logo = getCompanyLogo(companyId);
  return logo ? `data:${logo.mime};base64,${Buffer.from(logo.data).toString('base64')}` : undefined;
}
