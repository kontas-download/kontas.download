// "Today" for tax and invoicing purposes is the date in Lithuania, not in UTC: between 00:00 and 03:00 local time UTC is still the previous day.
export function todayVilnius(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
