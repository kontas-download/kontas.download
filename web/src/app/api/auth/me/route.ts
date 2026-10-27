import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/access';

// The signed-in user, for the sidebar profile.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 });
  return NextResponse.json({ name: user.name, email: user.email, role: user.role }, { headers: { 'Cache-Control': 'no-store' } });
}
