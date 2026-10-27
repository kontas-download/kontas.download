import type Database from 'better-sqlite3';
// Every column that stores a ChartOfAccount code as text. The chart is shared by all companies and no foreign key protects it,
// so renaming the code or deleting an account is allowed only when no row anywhere refers to it. Add new account columns here.
export const ACCOUNT_CODE_COLUMNS: readonly (readonly [table: string, column: string])[] = [
  ['GeneralEntry', 'debitAccount'], ['GeneralEntry', 'creditAccount'],
  ['Purchase', 'debitAccount'],
  ['BankTransaction', 'correspondenceAccountCode'],
  ['FixedAsset', 'assetAccount'], ['FixedAsset', 'accumulatedAccount'], ['FixedAsset', 'expenseAccount'], ['FixedAsset', 'disposalAccount'],
  ['FixedAssetPosting', 'debitAccount'], ['FixedAssetPosting', 'creditAccount'],
  ['InventorySettings', 'inventoryAccount'], ['InventorySettings', 'cogsAccount'],
  ['InventoryMovement', 'debitAccount'], ['InventoryMovement', 'creditAccount'],
];
// Returns "Table.column" of the first place that uses the code, or null when the code is unused.
export function accountCodeUsage(db: Database.Database, code: string): string | null {
  for (const [table, column] of ACCOUNT_CODE_COLUMNS) {
    if (db.prepare(`SELECT 1 FROM ${table} WHERE ${column}=? LIMIT 1`).get(code)) return `${table}.${column}`;
  }
  return null;
}
