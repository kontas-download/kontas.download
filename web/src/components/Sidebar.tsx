'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Receipt, 
  ShoppingCart, 
  Users, 
  Package, 
  Landmark, 
  Wallet, 
  BookOpen,
  FileSpreadsheet,
  TrendingUp,
  FileCheck,
  FileCheck2,
  Building2,
  LogOut,
  UserCheck,
  UserCog,
  KeyRound,
  CircleHelp
} from 'lucide-react';
import { CompanySwitcher } from './CompanySwitcher';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useT } from '@/lib/i18n/client';

const operationItems = [
  { name: 'nav.overview', href: '/', icon: LayoutDashboard },
  { name: 'nav.sales', href: '/invoices', icon: Receipt },
  { name: 'nav.recurring', href: '/recurring', icon: Receipt },
  { name: 'nav.purchases', href: '/purchases', icon: ShoppingCart },
  { name: 'nav.clients', href: '/clients', icon: Users },
  { name: 'nav.stock', href: '/stock', icon: Package },
  { name: 'nav.bank', href: '/bank', icon: Landmark },
  { name: 'nav.receivables', href: '/receivables', icon: Wallet },
  { name: 'nav.payroll', href: '/payrolls', icon: Wallet },
];

const accountingItems = [
  { name: 'nav.ledger', href: '/ledger', icon: BookOpen },
  { name: 'nav.trialBalance', href: '/trial-balance', icon: FileSpreadsheet },
  { name: 'nav.statements', href: '/financial-statements', icon: TrendingUp },
  { name: 'nav.taxReports', href: '/tax-reports', icon: FileCheck },
  { name: 'nav.taxCalendar', href: '/tax-calendar', icon: FileCheck2 },
  { name: 'nav.reconciliation', href: '/reconciliation', icon: FileCheck2 },
];

const systemItems = [
  { name: 'nav.accounts', href: '/accounts', icon: BookOpen },
  { name: 'nav.companies', href: '/companies', icon: Building2 },
];

export function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  // Menu entries of optional add-ons; the list is empty unless an add-on is installed and visible to this user.
  const [profile, setProfile] = useState<{ name: string; email: string; role: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [extraItems, setExtraItems] = useState<{ name: string; href: string }[]>([]);
  const onLogin = pathname === '/login';
  useEffect(() => {
    if (onLogin) return;
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setProfile(d && d.email ? { name: d.name || d.email, email: d.email, role: d.role } : null)).catch(() => setProfile(null));
  }, [onLogin]);
  useEffect(() => {
    if (pathname === '/login') return;
    fetch('/api/extensions/nav').then(r => r.ok ? r.json() : { items: [] }).then(d => setExtraItems(Array.isArray(d.items) ? d.items : [])).catch(() => setExtraItems([]));
  }, [pathname]);

  // Do not render sidebar on login page
  if (pathname === '/login') {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      window.location.href = '/login';
    }
  };

  const renderNavGroup = (title: string, items: typeof operationItems) => (
    <div className="space-y-1 mb-4">
      <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        {title}
      </div>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">{t(item.name)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 min-h-screen shrink-0">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-lg shadow-md shadow-emerald-500/20">
            K
          </div>
          <div>
            <div className="font-bold text-base leading-tight tracking-tight">kontas.download</div>
            <div className="text-xs text-emerald-400 font-medium">{t('nav.tagline')}</div>
          </div>
        </Link>
      </div>

      {/* Multi-Company Selector */}
      <CompanySwitcher />

      <nav className="flex-1 p-3 overflow-y-auto">
        {renderNavGroup(t('nav.groupOperations'), [...operationItems, ...extraItems.map(item => ({ ...item, icon: Wallet }))])}
        {renderNavGroup(t('nav.groupAccounting'), accountingItems)}
        {renderNavGroup(t('nav.groupSystem'), [...systemItems, ...(profile?.role === 'admin' ? [{ name: 'nav.users', href: '/users', icon: UserCog }] : []), { name: 'nav.help', href: '/help', icon: CircleHelp }])}
      </nav>

      <LanguageSwitcher />

      {/* User profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-bold text-slate-200 truncate">{profile?.name || ''}</div>
            <div className="text-[10px] text-emerald-400 font-medium truncate">{profile?.email || ''}</div>
            {profile && <div className="text-[10px] text-slate-400 truncate">{t(profile.role === 'admin' ? 'nav.roleAdmin' : 'nav.roleAccountant')}</div>}
          </div>
        </div>

        <div className="flex items-center shrink-0">
        <button
          onClick={() => setChangingPassword(true)}
          title={t('users.changePassword')}
          aria-label={t('users.changePassword')}
          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
        >
          <KeyRound className="w-4 h-4" />
        </button>
        <button
          onClick={handleLogout}
          title={t('common.logout')}
          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
        </div>
      </div>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </aside>
  );
}
