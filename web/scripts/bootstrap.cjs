// First-run preparation of the database. Runs before the server starts (see the Dockerfile) and is safe to run every time:
//  - an empty database gets the base schema and the standard Lithuanian chart of accounts;
//  - when there is no user yet, an administrator is created (ADMIN_EMAIL / ADMIN_PASSWORD, otherwise a random password printed once);
//  - a database that already holds data is never changed here (the application applies its own migrations on first use).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const root = path.resolve(__dirname, '..');

function databasePath() {
  const configured = process.env.DATABASE_URL;
  const file = configured && configured.startsWith('file:') ? configured.slice(5) : path.join('prisma', 'dev.db');
  return path.isAbsolute(file) ? file : path.resolve(root, file);
}

// Same format as lib/auth.ts: scrypt:<salt hex>:<key hex>.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return ['scrypt', salt, crypto.scryptSync(password, salt, 64, SCRYPT).toString('hex')].join(':');
}

function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(16), b => alphabet[b % alphabet.length]).join('');
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

function ensureAdmin(db, env, log) {
  const users = db.prepare('SELECT COUNT(*) AS n FROM User').get().n;
  if (users > 0) return null;
  const email = (env.ADMIN_EMAIL || 'admin@kontas.local').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL is not a valid e-mail address');
  let password = env.ADMIN_PASSWORD;
  let generated = false;
  if (password) {
    if (!validPassword(password)) throw new Error('ADMIN_PASSWORD must have at least 10 characters');
  } else { password = randomPassword(); generated = true; }
  db.prepare("INSERT INTO User(email,name,passwordHash,role,createdAt) VALUES(?,?,?,'admin',datetime('now'))").run(email, 'Administrator', hashPassword(password));
  log(`Administrator created: ${email}`);
  if (generated) {
    log('One-time password (shown only now, change it after the first sign-in or reset it with scripts/set-password.cjs):');
    log('    ' + password);
  }
  log('To try the program with fictional data: Companies -> "Create demonstration company" (Įmonės -> „Sukurti demonstracinę įmonę“).');
  return { email, password: generated ? password : null };
}

function bootstrap(options = {}) {
  const env = options.env || process.env;
  const log = options.log || (message => console.log('[bootstrap] ' + message));
  const file = options.file || databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.accessSync(path.dirname(file), fs.constants.W_OK); } catch { throw new Error(`The database folder ${path.dirname(file)} is not writable for this user. On Linux run: chown -R 1000:1000 <folder>`); }
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    const has = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    let created = false;
    if (!has('Sale') && !has('Company')) {
      db.transaction(() => {
        db.exec(fs.readFileSync(path.join(__dirname, 'base-schema.sql'), 'utf8'));
        const insert = db.prepare('INSERT OR IGNORE INTO ChartOfAccount(code,name) VALUES(?,?)');
        for (const [code, name] of JSON.parse(fs.readFileSync(path.join(__dirname, 'chart-of-accounts.json'), 'utf8'))) insert.run(code, name);
      }).immediate();
      created = true;
      log('New database created (base schema and the standard chart of accounts).');
    } else if (!has('User')) {
      throw new Error('The database has tables but no User table: refusing to touch it.');
    }
    const admin = ensureAdmin(db, env, log);
    return { file, created, admin };
  } finally { db.close(); }
}

module.exports = { bootstrap, hashPassword, randomPassword, validPassword, databasePath };

if (require.main === module) {
  try { bootstrap(); } catch (error) { console.error('[bootstrap] ' + (error && error.message ? error.message : error)); process.exit(1); }
}
