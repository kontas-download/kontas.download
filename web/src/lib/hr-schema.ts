import type Database from 'better-sqlite3';

// Personnel and payroll history carried over from a previous accounting system. Additive only: new tables and columns; no
// existing value is changed.
//
// Payroll.postedInJournal: the payroll is already posted in the general journal (an imported source journal holds its entries),
// so the payroll ledger triggers must not post it a second time. Payrolls created in this program keep 0 and post as before.
// PayrollEmployee gains the details a payroll slip shows (position, pay date, NPD, guarantee fund, amount paid out).
// PayrollDetail holds the individual additions and deductions per employee by payroll code; it is keyed by payroll and employee
// (not by PayrollEmployee.id), so editing a payroll's employees keeps the breakdown.
// HrPosition, PayrollCode (payroll and time-card codes) and WorkShift are reference books for later payroll features.
const PAYROLL_TRIGGERS = ['ledger_PayrollEmployee_INSERT', 'ledger_PayrollEmployee_UPDATE', 'ledger_PayrollEmployee_DELETE', 'ledger_Payroll_UPDATE'];

export function migrateHr(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-hr-v1')) return;
    const has = (table: string, column: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(c => c.name === column);
    const add = (table: string, column: string, type: string) => { if (!has(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); };

    add('Payroll', 'postedInJournal', 'INTEGER NOT NULL DEFAULT 0 CHECK(postedInJournal IN (0,1))');
    for (const name of PAYROLL_TRIGGERS) {
      const trigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
      if (!trigger) continue;
      const sql = trigger.sql.replaceAll(' GROUP BY p.id HAVING', ' AND p.postedInJournal=0 GROUP BY p.id HAVING');
      if (sql === trigger.sql) throw new Error(`HR migration: unexpected trigger ${name}`);
      db.exec('DROP TRIGGER ' + name);
      db.exec(sql);
    }

    add('PayrollEmployee', 'position', 'TEXT');
    add('PayrollEmployee', 'payDate', 'TEXT');
    add('PayrollEmployee', 'npd', 'REAL');
    add('PayrollEmployee', 'guaranteeFund', 'REAL');
    add('PayrollEmployee', 'payOut', 'REAL');
    add('Employee', 'externalId', 'INTEGER');
    add('Employee', 'agreementNumber', 'TEXT');
    add('Employee', 'agreementDate', 'TEXT');

    db.exec(`CREATE TABLE IF NOT EXISTS PayrollDetail(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payrollId INTEGER NOT NULL REFERENCES Payroll(id) ON DELETE CASCADE,
        employeeName TEXT NOT NULL,
        employeeCode TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('ADDITION','DEDUCTION')),
        code TEXT,
        name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        hours REAL,
        days REAL,
        payDate TEXT);
      CREATE INDEX IF NOT EXISTS idx_payroll_detail ON PayrollDetail(payrollId,employeeName,kind);
      CREATE TABLE IF NOT EXISTS HrPosition(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        UNIQUE(companyId,name));
      CREATE TABLE IF NOT EXISTS PayrollCode(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('PAY','TIMECARD')),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        printName TEXT,
        category TEXT,
        sortOrder INTEGER,
        UNIQUE(companyId,kind,code));
      CREATE TABLE IF NOT EXISTS WorkShift(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        weekJson TEXT NOT NULL DEFAULT '[]',
        UNIQUE(companyId,name));`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-hr-v1');
  })();
}

// Employee relations: kind of contract (employment or service contract), the counterparty that represents the person in
// bank payments and ledger entries, and the accumulated annual leave by work-year period. Additive only.
export function migrateHrLinks(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-hr-links-v1')) return;
    const has = (column: string) => (db.prepare('PRAGMA table_info(Employee)').all() as { name: string }[]).some(c => c.name === column);
    if (!has('employmentKind')) db.exec("ALTER TABLE Employee ADD COLUMN employmentKind TEXT NOT NULL DEFAULT 'EMPLOYMENT' CHECK(employmentKind IN ('EMPLOYMENT','SERVICE'))");
    if (!has('clientId')) db.exec('ALTER TABLE Employee ADD COLUMN clientId INTEGER REFERENCES Client(id) ON DELETE SET NULL');
    db.exec(`CREATE TABLE IF NOT EXISTS EmployeeLeave(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        employeeId INTEGER NOT NULL REFERENCES Employee(id) ON DELETE CASCADE,
        periodFrom TEXT NOT NULL,
        periodUntil TEXT NOT NULL,
        days REAL NOT NULL DEFAULT 0,
        note TEXT,
        UNIQUE(employeeId,periodFrom));
      CREATE INDEX IF NOT EXISTS idx_employee_leave ON EmployeeLeave(companyId,employeeId,periodFrom);
      CREATE TRIGGER IF NOT EXISTS employee_client_company BEFORE UPDATE OF clientId ON Employee
        WHEN NEW.clientId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Client WHERE id=NEW.clientId AND companyId=NEW.companyId)
        BEGIN SELECT RAISE(ABORT,'EMPLOYEE_CLIENT_COMPANY'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-hr-links-v1');
  })();
}

// Employee card: contact and payment details and free notes (personnel module). Additive only.
export function migrateHrContacts(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-hr-contacts-v1')) return;
    const has = (column: string) => (db.prepare('PRAGMA table_info(Employee)').all() as { name: string }[]).some(c => c.name === column);
    for (const column of ['email', 'phone', 'bankAccount', 'address', 'notes']) if (!has(column)) db.exec(`ALTER TABLE Employee ADD COLUMN ${column} TEXT`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-hr-contacts-v1');
  })();
}
