// Writes THIRD-PARTY-NOTICES.md (repository root) from web/package-lock.json: every production dependency with its version and licence.
//   cd web && node scripts/third-party-notices.cjs
// Needs the dependencies installed (the licence of a package is read from its own package.json when the lock file does not carry it).
const fs = require('node:fs');
const path = require('node:path');

const web = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(web, 'package-lock.json'), 'utf8'));
// Packages whose package.json has no licence field; verified by hand against the LICENSE file shipped inside the package.
const VERIFIED = { 'png-js': 'MIT' };

const rows = [];
for (const [location, info] of Object.entries(lock.packages)) {
  if (!location || info.dev || info.optional && info.dev) continue;
  const name = location.split('node_modules/').pop();
  let license = info.license;
  if (!license) {
    try { license = JSON.parse(fs.readFileSync(path.join(web, location, 'package.json'), 'utf8')).license; } catch { /* not installed */ }
  }
  if (license && typeof license === 'object') license = license.type;
  rows.push({ name, version: info.version, license: license || VERIFIED[name] || 'UNKNOWN' });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const unknown = rows.filter(r => r.license === 'UNKNOWN');
if (unknown.length) { console.error('Licence unknown for: ' + unknown.map(r => r.name).join(', ')); process.exit(1); }

const text = [
  '# Trečiųjų šalių komponentai / Third-party components / Компоненты третьих лиц',
  '',
  'LT: kontas.download naudoja toliau išvardytus atvirojo kodo komponentus. Jie lieka savo autorių licencijų galioje; kontas.download licencija (LICENSE) jų nekeičia. Šis archyvas jų nesiūlo: jie įdiegiami per `npm ci` iš viešų registrų.',
  '',
  'EN: kontas.download uses the open-source components listed below. They remain under their authors\' licences; the kontas.download licence (LICENSE) does not change them. This archive does not contain them: they are installed with `npm ci` from public registries.',
  '',
  'RU: kontas.download использует перечисленные ниже компоненты с открытым кодом. Они остаются под лицензиями своих авторов; лицензия kontas.download (LICENSE) их не меняет. В этом архиве их нет: они устанавливаются командой `npm ci` из публичных реестров.',
  '',
  'Sugeneruota / generated / сгенерировано: `node web/scripts/third-party-notices.cjs` (' + rows.length + ' packages).',
  '',
  '| Package | Version | Licence |',
  '|---|---|---|',
  ...rows.map(r => `| ${r.name} | ${r.version} | ${r.license} |`),
  '',
  'Pastaba / Note / Примечание: `@img/sharp-*` ir `@img/sharp-libvips-*` (LGPL-3.0-or-later) naudoja Next.js vaizdų apdorojimui kaip atskirus, nekeistus dinaminius dvejetainius paketus; jų šaltinis ir licencijos tekstas yra tų paketų viduje. / are used by Next.js for image processing as separate, unmodified binary packages; their source and licence text are inside those packages. / используются Next.js для обработки изображений как отдельные неизменённые бинарные пакеты; их исходный код и текст лицензии находятся внутри этих пакетов.',
  '',
].join('\n');
fs.writeFileSync(path.join(web, '..', 'THIRD-PARTY-NOTICES.md'), text, 'utf8');
console.log(`THIRD-PARTY-NOTICES.md written: ${rows.length} packages`);
