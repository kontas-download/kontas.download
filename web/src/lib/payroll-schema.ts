import type Database from 'better-sqlite3';

// Employees and monthly payroll calculations (darbo užmokesčio skaičiavimas). Additive only: new tables and triggers, existing
// rows and tables are never changed. A run is posted to the ledger through the existing Payroll/PayrollEmployee tables and their
// ledger triggers (6304 against 4480, 4481, 4482), so the general ledger keeps one code path for payroll.
export function migratePayroll(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-payroll-v1')) return;
    db.exec(`CREATE TABLE Employee(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        personalCode TEXT,
        position TEXT,
        baseSalary REAL NOT NULL DEFAULT 0 CHECK(baseSalary>=0),
        contractType TEXT NOT NULL DEFAULT 'OPEN' CHECK(contractType IN ('OPEN','FIXED')),
        applyNpd INTEGER NOT NULL DEFAULT 1 CHECK(applyNpd IN (0,1)),
        pensionAccumulation INTEGER NOT NULL DEFAULT 0 CHECK(pensionAccumulation IN (0,1)),
        accidentRate REAL,
        startDate TEXT,
        endDate TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_employee_company ON Employee(companyId,active,name);
      CREATE TABLE PayrollRun(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100),
        month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED')),
        paramsJson TEXT NOT NULL,
        rulesProvisional INTEGER NOT NULL DEFAULT 1,
        verifiedAt TEXT,
        verifiedBy INTEGER,
        payrollId INTEGER REFERENCES Payroll(id) ON DELETE SET NULL,
        createdBy INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(companyId,year,month));
      CREATE TABLE PayrollRunLine(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        runId INTEGER NOT NULL REFERENCES PayrollRun(id) ON DELETE CASCADE,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        employeeId INTEGER NOT NULL REFERENCES Employee(id) ON DELETE CASCADE,
        employeeName TEXT NOT NULL,
        employeeCode TEXT,
        gross REAL NOT NULL CHECK(gross>=0),
        ytdGrossBefore REAL NOT NULL DEFAULT 0,
        ytdSodraBaseBefore REAL NOT NULL DEFAULT 0,
        settingsJson TEXT NOT NULL,
        calcJson TEXT NOT NULL,
        overridesJson TEXT NOT NULL DEFAULT '{}',
        resultJson TEXT NOT NULL,
        sodraBase REAL NOT NULL DEFAULT 0,
        npd REAL NOT NULL DEFAULT 0,
        gpm REAL NOT NULL DEFAULT 0,
        employeeContributions REAL NOT NULL DEFAULT 0,
        net REAL NOT NULL DEFAULT 0,
        employerContributions REAL NOT NULL DEFAULT 0,
        UNIQUE(runId,employeeId));
      CREATE INDEX idx_payroll_line_employee ON PayrollRunLine(companyId,employeeId);
      CREATE TRIGGER payroll_line_company BEFORE INSERT ON PayrollRunLine
        WHEN NOT EXISTS(SELECT 1 FROM PayrollRun r JOIN Employee e ON e.companyId=r.companyId WHERE r.id=NEW.runId AND e.id=NEW.employeeId AND r.companyId=NEW.companyId)
        BEGIN SELECT RAISE(ABORT,'PAYROLL_COMPANY_MISMATCH'); END;
      CREATE TRIGGER payroll_line_posted BEFORE UPDATE ON PayrollRunLine
        WHEN EXISTS(SELECT 1 FROM PayrollRun WHERE id=OLD.runId AND status='POSTED')
        BEGIN SELECT RAISE(ABORT,'PAYROLL_RUN_POSTED'); END;
      CREATE TRIGGER payroll_run_posted_delete BEFORE DELETE ON PayrollRun
        WHEN OLD.status='POSTED' AND EXISTS(SELECT 1 FROM Company WHERE id=OLD.companyId)
        BEGIN SELECT RAISE(ABORT,'PAYROLL_RUN_POSTED'); END;
      CREATE TABLE PayrollLog(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        runId INTEGER,
        lineId INTEGER,
        employeeName TEXT,
        action TEXT NOT NULL,
        field TEXT,
        calculatedValue REAL,
        oldValue REAL,
        newValue REAL,
        reason TEXT,
        actorId INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_payroll_log_run ON PayrollLog(companyId,runId,id);
      CREATE TRIGGER payroll_log_immutable BEFORE UPDATE ON PayrollLog BEGIN SELECT RAISE(ABORT,'PAYROLL_LOG_IMMUTABLE'); END;
      CREATE TRIGGER payroll_log_nodelete BEFORE DELETE ON PayrollLog WHEN EXISTS(SELECT 1 FROM Company WHERE id=OLD.companyId) BEGIN SELECT RAISE(ABORT,'PAYROLL_LOG_IMMUTABLE'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-payroll-v1');
  })();
}

export function migratePayrollPayoutDate(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-payroll-payout-v1')) return;
    const cols = db.prepare('PRAGMA table_info(PayrollRun)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'payoutDate')) {
      db.exec('ALTER TABLE PayrollRun ADD COLUMN payoutDate TEXT;');
    }
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-payroll-payout-v1');
  })();
}
