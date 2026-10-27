import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { I18nProvider } from '@/lib/i18n/client';
import { getLang } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'kontas.download — Self-Hosted ERP & Invoicing',
  description: 'Šiuolaikiška nepriklausoma apskaitos ir sąskaitų faktūrų valdymo sistema',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="bg-slate-950 text-slate-100 flex min-h-screen antialiased">
        <I18nProvider lang={lang}>
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-slate-950 min-h-screen">
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
