// Purchases use the shared list period (see list-period.ts); the old names stay as aliases.
import { LIST_PERIODS, resolveListPeriod, dateRangeSql, type ListPeriod, type ListPeriodKey } from './list-period';
export { isIsoDate, oneYearBefore, periodQuery } from './list-period';
export const PURCHASE_PERIODS = LIST_PERIODS;
export type PurchasePeriodKey = ListPeriodKey;
export type PurchasePeriod = ListPeriod;
export const resolvePurchasePeriod = resolveListPeriod;

/** Purchase list SQL for a company within an inclusive date range (null bound = open). Dates compare on their first 10 characters. */
export function purchaseListQuery(companyId: number, from: string | null, to: string | null): { sql: string; args: (string | number)[] } {
  const range = dateRangeSql('p.purchaseDate', from, to);
  return {
    sql: `SELECT p.*, (SELECT COUNT(*) FROM PurchaseItem WHERE purchaseId = p.id) as itemCount
      FROM Purchase p WHERE p.companyId = ?${range.sql} ORDER BY p.purchaseDate DESC, p.id DESC`,
    args: [companyId, ...range.args],
  };
}
