import { requireAdminPage } from '@/lib/access';
import { getDb } from '@/lib/db';
import { listUsers } from '@/lib/users';
import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const user = await requireAdminPage();
  return <UsersClient initialUsers={listUsers(getDb())} currentUserId={user.id} />;
}
