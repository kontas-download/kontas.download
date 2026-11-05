import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Toaster } from '@/components/Toaster';
import { ConfirmHost } from '@/components/ConfirmHost';
import { I18nProvider } from '@/lib/i18n/client';
import { getLang } from '@/lib/i18n/server';
import { makeT } from '@/lib/i18n/translate';
import { cookies } from 'next/headers';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'kontas.download — Self-Hosted ERP & Invoicing', template: '%s · kontas.download' },
  description: 'Šiuolaikiška nepriklausoma apskaitos ir sąskaitų faktūrų valdymo sistema',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  const t = makeT(lang);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={lang} data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-slate-950 text-slate-100 flex min-h-screen antialiased">
        <I18nProvider lang={lang}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white no-print">{t('common.skipToContent')}</a>
          <Sidebar />
          <main id="main" className="min-w-0 flex-1 overflow-x-clip bg-slate-950 min-h-screen">
            {children}
          </main>
          <Toaster />
          <ConfirmHost />
        </I18nProvider>
      </body>
    </html>
  );
}
