import { requireAdminPage } from '@/lib/access';
import { getDb } from '@/lib/db';
import { listUsers } from '@/lib/users';
import { UsersClient } from './UsersClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.users') }; }

export default async function UsersPage() {
  const user = await requireAdminPage();
  return <UsersClient initialUsers={listUsers(getDb())} currentUserId={user.id} />;
}
