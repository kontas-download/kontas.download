import { LANGS, type Lang } from '../config';
import type { Namespace } from './types';
import common from './common';
import nav from './nav';
import docLang from './docLang';
import invoices from './invoices';
import recurring from './recurring';
import receivables from './receivables';
import creditNote from './creditNote';
import delivery from './delivery';
import purchases from './purchases';
import clients from './clients';
import stock from './stock';
import bank from './bank';
import reconciliation from './reconciliation';
import payroll from './payroll';
import employees from './employees';
import mail from './mail';
import automation from './automation';
import tax from './tax';
import ledger from './ledger';
import trialBalance from './trialBalance';
import statements from './statements';
import accounts from './accounts';
import companies from './companies';
import login from './login';
import dashboard from './dashboard';
import table from './table';
import help from './help';
import dataTransfer from './dataTransfer';
import users from './users';
import demo from './demo';
import rules from './rules';
import assets from './assets';
import inventory from './inventory';
import settings from './settings';
import docs from './docs';
import api from './api';
// Each page or feature owns one namespace file; register it here.
export const namespaces: Record<string, Namespace> = { docs, api, settings, assets, inventory, common, nav, docLang, invoices, recurring, receivables, creditNote, delivery, purchases, clients, stock, bank, reconciliation, payroll, employees, mail, automation, tax, ledger, trialBalance, statements, accounts, companies, login, dashboard, table, help, dataTransfer, users, demo, rules };

function flatten(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ns, dict] of Object.entries(namespaces)) for (const [key, value] of Object.entries(dict[lang])) out[`${ns}.${key}`] = value;
  return out;
}
export const dictionaries = Object.fromEntries(LANGS.map(lang => [lang, flatten(lang)])) as Record<Lang, Record<string, string>>;
