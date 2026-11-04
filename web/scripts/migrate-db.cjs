/**
 * Applies the program's database migrations to a SQLite file without starting the server (data repairs, imports into a copy).
 *
 *   node web/scripts/migrate-db.cjs path/to/copy.db
 *
 * Development tool: needs the dev dependency `typescript` to load the TypeScript sources.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node web/scripts/migrate-db.cjs <database.db>');
  process.exit(2);
}
const ts = require('typescript');
const src = path.join(__dirname, '..', 'src');
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name.startsWith('@/')) name = path.join(src, name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);

process.env.DATABASE_URL = 'file:' + path.resolve(file);
const { getDb } = require(path.join(src, 'lib', 'db.ts'));
const db = getDb();
const versions = db.prepare('SELECT version FROM AppMigration ORDER BY appliedAt, version').all().map(r => r.version);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log(`Migrated ${file}: ${versions.length} migrations applied (latest ${versions.at(-1)}).`);
