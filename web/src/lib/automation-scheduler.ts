import { getDb } from './db';
import { runAutomation } from './automation';

// In-process clock of the automation robot: every 30 minutes after 07:00 Vilnius time it runs the jobs that have not run today
// (the runner itself keeps them to once a day). AUTOMATION=off disables it, for example when only the external cron should run.
let started = false;
const vilniusHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', hour: '2-digit', hour12: false }).format(new Date()));

// Cloudflare Containers: uploads document files that exist on this disk but not yet in R2 (once per start).
export function startDocumentSync() {
  if (process.env.APP_ENV !== 'cloudflare-containers') return;
  setTimeout(() => {
    import('./document-inbox').then(m => m.publishInboxMarker()).catch(err => console.error('[document-inbox] marker', err instanceof Error ? err.message : err));
    Promise.all([import('./document-remote'), import('./document-files')]).then(([remote, files]) => {
      const root = files.documentsRootFor(getDb().name);
      return remote.syncLocalDocumentsToR2(root, files.listDocumentFiles(root));
    }).then(r => console.log(`[documents] R2 sync: ${r.uploaded} uploaded, ${r.failed} failed`)).catch(err => console.error('[documents]', err instanceof Error ? err.message : err));
  }, 45_000).unref?.();
}

export function startAutomationScheduler() {
  if (started || process.env.AUTOMATION === 'off') return;
  started = true;
  const tick = () => {
    if (vilniusHour() < 7) return;
    runAutomation(getDb(), { trigger: 'schedule' }).catch(err => console.error('[automation]', err instanceof Error ? err.message : err));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 30 * 60_000).unref?.();
  // Mailboxes for received purchase documents: every enabled one is read every 5 minutes, at any hour.
  const pollMail = () => {
    import('./document-inbox-runtime').then(m => m.pollEnabledInboxes()).catch(err => console.error('[document-inbox]', err instanceof Error ? err.message : err));
  };
  setTimeout(pollMail, 90_000).unref?.();
  setInterval(pollMail, 5 * 60_000).unref?.();
}
