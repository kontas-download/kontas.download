import { rules } from './rules';
import { todayVilnius } from './dates';

export interface StatementEntry { date: string; debitAccount: string; creditAccount: string; amount: number }
export interface StatementLine { code: string; name: string; amount: number }
export interface StatementGroup { sum: number; list: StatementLine[] }
type NameOf = (code: string) => string;

export function pnlTurnover(entries: StatementEntry[]) {
  const debits = new Map<string, number>();
  const credits = new Map<string, number>();
  entries.forEach(e => {
    debits.set(e.debitAccount, (debits.get(e.debitAccount) || 0) + e.amount);
    credits.set(e.creditAccount, (credits.get(e.creditAccount) || 0) + e.amount);
  });
  return { debits, credits };
}

export function balanceNet(entries: StatementEntry[]) {
  const net = new Map<string, number>();
  entries.forEach(e => {
    net.set(e.debitAccount, (net.get(e.debitAccount) || 0) + e.amount);
    net.set(e.creditAccount, (net.get(e.creditAccount) || 0) - e.amount);
  });
  return net;
}

// Iterates the union of credit and debit codes, so an account with turnover on one side only is kept.
function turnoverSum(t: ReturnType<typeof pnlTurnover>, prefix: string, nameOf: NameOf, creditNatural: boolean): StatementGroup {
  let sum = 0;
  const list: StatementLine[] = [];
  const codes = new Set<string>([...t.credits.keys(), ...t.debits.keys()]);
  codes.forEach(code => {
    if (!code.startsWith(prefix)) return;
    const credit = t.credits.get(code) || 0;
    const debit = t.debits.get(code) || 0;
    const net = creditNatural ? credit - debit : debit - credit;
    if (Math.abs(net) > 0.001) {
      sum += net;
      list.push({ code, name: nameOf(code), amount: net });
    }
  });
  return { sum, list };
}

// year: selected financial year ('2025'); anything else (all years, unknown) uses today's date for the corporate income tax rate.
export function computePnl(entries: StatementEntry[], nameOf: NameOf, year?: string) {
  const t = pnlTurnover(entries);
  const getAccountSum = (p: string) => turnoverSum(t, p, nameOf, true);
  const getExpenseSum = (p: string) => turnoverSum(t, p, nameOf, false);
  const salesRevenue = getAccountSum('50');
  const otherRevenue = getAccountSum('52');
  const totalRevenue = salesRevenue.sum + otherRevenue.sum;
  const cogs = getExpenseSum('60');
  const grossProfit = totalRevenue - cogs.sum;
  const adminExpenses = getExpenseSum('61');
  const sellingExpenses = getExpenseSum('62');
  const payrollExpenses = getExpenseSum('63');
  const otherExpenses = getExpenseSum('64');
  const totalOperatingExpenses = adminExpenses.sum + sellingExpenses.sum + payrollExpenses.sum + otherExpenses.sum;
  const operatingProfit = grossProfit - totalOperatingExpenses;
  const finIncome = getAccountSum('58');
  const finExpense = getExpenseSum('68');
  const finResult = finIncome.sum - finExpense.sum;
  const profitBeforeTax = operatingProfit + finResult;
  const taxRate = rules.number('cit.rate.standard', /^\d{4}$/.test(year || '') ? `${year}-12-31` : todayVilnius()) / 100;
  const estimatedTax = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;
  const netProfit = profitBeforeTax - estimatedTax;
  return { salesRevenue, otherRevenue, totalRevenue, cogs, grossProfit, adminExpenses, sellingExpenses, payrollExpenses, otherExpenses, totalOperatingExpenses, operatingProfit, finIncome, finExpense, finResult, profitBeforeTax, taxRate, estimatedTax, netProfit };
}

const ASSET_PREFIXES = ['1', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'];
const LIAB_EQUITY_PREFIXES = ['30', '31', '32', '33', '34', '40', '41', '42', '43', '440', '441', '442', '443', '444', '445', '446', '447', '448', '449', '45', '46', '47', '48', '49'];

export function computeBalance(net: Map<string, number>, nameOf: NameOf) {
  const group = (prefixes: string[], sign: 1 | -1): StatementGroup => {
    let sum = 0;
    const list: StatementLine[] = [];
    net.forEach((n, code) => {
      if (prefixes.some(p => code.startsWith(p))) {
        const value = sign * n;
        if (Math.abs(value) > 0.001) {
          sum += value;
          list.push({ code, name: nameOf(code), amount: value });
        }
      }
    });
    return { sum, list };
  };
  const getAssetSum = (p: string[]) => group(p, 1);
  const getLiabilityEquitySum = (p: string[]) => group(p, -1);

  const nonCurrentAssets = getAssetSum(['1']);
  const inventory = getAssetSum(['20', '21']);
  const receivables = getAssetSum(['24']);
  const cash = getAssetSum(['27']);
  const otherCurrent = getAssetSum(['22', '23', '25', '26', '28', '29']);
  const totalCurrentAssets = inventory.sum + receivables.sum + cash.sum + otherCurrent.sum;
  const totalAssets = nonCurrentAssets.sum + totalCurrentAssets;

  const paidCapital = getLiabilityEquitySum(['30']);
  const reserves = getLiabilityEquitySum(['31', '32', '33']);
  const retainedEarningsPrev = getLiabilityEquitySum(['34']);
  let cumulativeNetProfit = 0;
  net.forEach((n, code) => {
    if (code.startsWith('5')) cumulativeNetProfit += -n;
    if (code.startsWith('6')) cumulativeNetProfit -= n;
  });
  const totalEquity = paidCapital.sum + reserves.sum + retainedEarningsPrev.sum + cumulativeNetProfit;

  const longTermLiabilities = getLiabilityEquitySum(['40', '41', '42']);
  const tradePayables = getLiabilityEquitySum(['443']);
  const payrollLiabilities = getLiabilityEquitySum(['448']);
  const taxLiabilities = getLiabilityEquitySum(['449']);
  const otherShortTerm = getLiabilityEquitySum(['43', '440', '441', '442', '444', '445', '446', '447', '45', '46', '47', '48', '49']);
  const totalShortTermLiabilities = tradePayables.sum + payrollLiabilities.sum + taxLiabilities.sum + otherShortTerm.sum;

  // Catch-all: a balance outside the known groups (and outside P&L classes 5-6) must not vanish silently.
  const known = [...ASSET_PREFIXES, ...LIAB_EQUITY_PREFIXES, '5', '6'];
  const unclassified: StatementGroup = { sum: 0, list: [] };
  net.forEach((n, code) => {
    if (!known.some(p => code.startsWith(p)) && Math.abs(n) > 0.001) {
      unclassified.sum += -n;
      unclassified.list.push({ code, name: nameOf(code), amount: -n });
    }
  });
  const totalLiabilities = longTermLiabilities.sum + totalShortTermLiabilities + unclassified.sum;

  const totalEquityAndLiabilities = totalEquity + totalLiabilities;
  const balanceDiff = Math.abs(totalAssets - totalEquityAndLiabilities);
  const isBalanced = balanceDiff < 0.01;
  return { nonCurrentAssets, inventory, receivables, cash, otherCurrent, totalCurrentAssets, totalAssets, paidCapital, reserves, retainedEarningsPrev, cumulativeNetProfit, totalEquity, longTermLiabilities, tradePayables, payrollLiabilities, taxLiabilities, otherShortTerm, unclassified, totalShortTermLiabilities, totalLiabilities, totalEquityAndLiabilities, isBalanced, balanceDiff };
}
