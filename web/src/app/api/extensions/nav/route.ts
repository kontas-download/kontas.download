import { requireApiAccess } from '@/lib/access';
import { extensions } from '@/extensions/registry';
import { NextResponse } from 'next/server';

// Menu entries of installed add-ons that are visible to the signed-in user.
export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  const items: { name: string; href: string }[] = [];
  for (const extension of extensions) {
    if (!extension.nav) continue;
    if (extension.visible && !(await extension.visible())) continue;
    items.push(extension.nav);
  }
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
