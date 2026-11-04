import fs from 'node:fs';
import os from 'node:os';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/access';

const read = (file: string) => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; } };

// Resources visible to the app inside its container (cgroup limits), for checking the Cloudflare instance size.
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return NextResponse.json({
    cpus: os.cpus().length,
    totalMemMiB: Math.round(os.totalmem() / 1048576),
    cgroupMemoryMax: read('/sys/fs/cgroup/memory.max'),
    cgroupCpuMax: read('/sys/fs/cgroup/cpu.max'),
    uptimeS: Math.round(os.uptime()),
  });
}
