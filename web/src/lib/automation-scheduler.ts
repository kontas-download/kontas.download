import { getDb } from './db';
import { runAutomation } from './automation';

// In-process clock of the automation robot: every 30 minutes after 07:00 Vilnius time it runs the jobs that have not run today
// (the runner itself keeps them to once a day). AUTOMATION=off disables it, for example when only the external cron should run.
let started = false;
const vilniusHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', hour: '2-digit', hour12: false }).format(new Date()));

export function startAutomationScheduler() {
  if (started || process.env.AUTOMATION === 'off') return;
  started = true;
  const tick = () => {
    if (vilniusHour() < 7) return;
    runAutomation(getDb(), { trigger: 'schedule' }).catch(err => console.error('[automation]', err instanceof Error ? err.message : err));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 30 * 60_000).unref?.();
}
