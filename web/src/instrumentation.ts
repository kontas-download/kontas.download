// Starts the automation robot's clock once per server instance (Node.js runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startAutomationScheduler } = await import('./lib/automation-scheduler');
  startAutomationScheduler();
}
