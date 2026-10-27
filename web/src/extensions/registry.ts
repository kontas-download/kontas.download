import type Database from 'better-sqlite3';
import { local } from './local';

// Optional add-ons are installed outside the product tree and listed in the git-ignored ./local.ts (empty by default).
export interface Extension {
  id: string;
  migrate?: (db: Database.Database) => void;
  nav?: { name: string; href: string };
  // Evaluated on the server for the signed-in user; the entry is omitted from the menu when it returns false.
  visible?: () => Promise<boolean>;
}
export const extensions: Extension[] = local;
