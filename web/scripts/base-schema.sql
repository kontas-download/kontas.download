CREATE TABLE Client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  name TEXT NOT NULL,
  code TEXT,
  vatCode TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  countryName TEXT DEFAULT 'Lietuva',
  createdAt TEXT,
  updatedAt TEXT
, companyId INTEGER DEFAULT 1);
CREATE TABLE Sale (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  series TEXT,
  number TEXT,
  saleDate TEXT NOT NULL,
  payUntil TEXT,
  statusName TEXT DEFAULT 'Apmokėta',
  warehouseName TEXT DEFAULT 'Pagrindinis',
  clientId INTEGER,
  clientName TEXT,
  clientCode TEXT,
  clientVatCode TEXT,
  sumWithoutVat REAL DEFAULT 0,
  vat REAL DEFAULT 0,
  sumWithVat REAL DEFAULT 0,
  currencyCode TEXT DEFAULT 'EUR',
  operationTypeName TEXT,
  notes TEXT,
  createdAt TEXT, companyId INTEGER DEFAULT 1,
  FOREIGN KEY (clientId) REFERENCES Client(id)
);
CREATE TABLE SaleItem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saleId INTEGER NOT NULL,
  itemName TEXT NOT NULL,
  itemCode TEXT,
  quantity REAL DEFAULT 1,
  price REAL DEFAULT 0,
  priceWithVat REAL DEFAULT 0,
  vatRate REAL DEFAULT 0,
  sumWithoutVat REAL DEFAULT 0,
  sumWithVat REAL DEFAULT 0,
  warehouseName TEXT,
  FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE
);
CREATE TABLE Purchase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  series TEXT,
  number TEXT,
  purchaseDate TEXT NOT NULL,
  clientId INTEGER,
  clientName TEXT,
  clientCode TEXT,
  sumWithoutVat REAL DEFAULT 0,
  vat REAL DEFAULT 0,
  sumWithVat REAL DEFAULT 0,
  currencyCode TEXT DEFAULT 'EUR',
  notes TEXT,
  createdAt TEXT, companyId INTEGER DEFAULT 1,
  FOREIGN KEY (clientId) REFERENCES Client(id)
);
CREATE TABLE PurchaseItem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseId INTEGER NOT NULL,
  itemName TEXT NOT NULL,
  itemCode TEXT,
  quantity REAL DEFAULT 1,
  price REAL DEFAULT 0,
  sumWithoutVat REAL DEFAULT 0,
  sumWithVat REAL DEFAULT 0,
  FOREIGN KEY (purchaseId) REFERENCES Purchase(id) ON DELETE CASCADE
);
CREATE TABLE StockItem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  name TEXT NOT NULL,
  code TEXT,
  barcode TEXT,
  warehouseName TEXT DEFAULT 'Pagrindinis',
  stock REAL DEFAULT 0,
  remainder REAL DEFAULT 0,
  price REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  purchaseDate TEXT,
  clientName TEXT
, companyId INTEGER DEFAULT 1);
CREATE TABLE BankTransaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  date TEXT NOT NULL,
  number TEXT,
  clientName TEXT,
  clientCode TEXT,
  sum REAL DEFAULT 0,
  correspondenceAccountCode TEXT,
  accountingBankInternalName TEXT,
  notes TEXT
, companyId INTEGER DEFAULT 1);
CREATE TABLE Payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  externalId INTEGER UNIQUE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sumWithVat REAL DEFAULT 0,
  createdAt TEXT
, companyId INTEGER DEFAULT 1);
CREATE TABLE PayrollEmployee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payrollId INTEGER NOT NULL,
  employeeName TEXT NOT NULL,
  employeeCode TEXT,
  grossSalary REAL DEFAULT 0,
  netSalary REAL DEFAULT 0,
  gpm REAL DEFAULT 0,
  sodraEmployee REAL DEFAULT 0,
  sodraEmployer REAL DEFAULT 0,
  FOREIGN KEY (payrollId) REFERENCES Payroll(id) ON DELETE CASCADE
);
CREATE TABLE ChartOfAccount (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE User (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  createdAt TEXT
);
CREATE TABLE Company (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  vatCode TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  bankName TEXT,
  bankIban TEXT,
  bankSwift TEXT,
  currencyCode TEXT DEFAULT 'EUR',
  isDefault INTEGER DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT
);
CREATE TABLE GeneralEntry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  date TEXT NOT NULL,
  docNumber TEXT,
  debitAccount TEXT NOT NULL,
  creditAccount TEXT NOT NULL,
  amount REAL NOT NULL,
  clientId INTEGER,
  clientName TEXT,
  description TEXT,
  sourceType TEXT DEFAULT 'MANUAL',
  sourceId INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- Indexes of the general ledger (present in every production database).
CREATE INDEX IF NOT EXISTS idx_gen_company_date ON GeneralEntry(companyId, date);
CREATE INDEX IF NOT EXISTS idx_gen_debit ON GeneralEntry(debitAccount);
CREATE INDEX IF NOT EXISTS idx_gen_credit ON GeneralEntry(creditAccount);
