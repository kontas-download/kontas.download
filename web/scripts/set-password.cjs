// Sets or resets the password of a user (all sessions of that user are ended).
//   docker exec -it kontas-app node scripts/set-password.cjs admin@example.com [new password]
// Without a password a random one is generated and printed once.
const Database = require('better-sqlite3');
const { hashPassword, randomPassword, validPassword, databasePath } = require('./bootstrap.cjs');

function setPassword(file, email, password, options = {}) {
  const db = new Database(file);
  try {
    // The disabledAt column is added by the application's first start; a brand-new database does not have it yet.
    const hasDisabled = Boolean(db.prepare("SELECT 1 FROM pragma_table_info('User') WHERE name='disabledAt'").get());
    const user = db.prepare(`SELECT id, ${hasDisabled ? 'disabledAt' : 'NULL AS disabledAt'} FROM User WHERE LOWER(email)=LOWER(?)`).get(String(email).trim());
    if (!user) throw new Error('No user with this e-mail address');
    let value = password, generated = false;
    if (!value) { value = randomPassword(); generated = true; }
    if (!validPassword(value)) throw new Error('The password must have at least 10 characters');
    db.transaction(() => {
      db.prepare('UPDATE User SET passwordHash=? WHERE id=?').run(hashPassword(value), user.id);
      if (hasDisabled && options.enable && user.disabledAt != null) db.prepare('UPDATE User SET disabledAt=NULL WHERE id=?').run(user.id);
      // These tables are created by the application on first start; a brand-new database may not have them yet.
      for (const [sql, arg] of [['DELETE FROM AuthSession WHERE userId=?', user.id], ['DELETE FROM LoginAttempt WHERE LOWER(email)=LOWER(?)', String(email).trim()]]) {
        try { db.prepare(sql).run(arg); } catch (error) { if (!/no such table/.test(String(error.message))) throw error; }
      }
    }).immediate();
    return { password: generated ? value : null, disabled: user.disabledAt != null && !options.enable };
  } finally { db.close(); }
}

module.exports = { setPassword };

if (require.main === module) {
  const args = process.argv.slice(2);
  const enable = args.includes('--enable');
  const [email, password] = args.filter(a => a !== '--enable');
  if (!email) { console.error('Usage: node scripts/set-password.cjs <email> [new password] [--enable]'); process.exit(2); }
  try {
    const result = setPassword(databasePath(), email, password, { enable });
    console.log('Password changed; the user has been signed out everywhere.');
    if (result.password) console.log('New one-time password: ' + result.password);
    if (result.disabled) console.log('WARNING: this user is disabled and still cannot sign in. Run again with --enable, or enable the user on the Users page.');
  } catch (error) { console.error(error.message); process.exit(1); }
}
