// Formatting helpers for showing times to patrons in their branch's time zone.
// Used by email templates.

export function formatLocalDateTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

// The calendar date at this instant in the given zone, as YYYY-MM-DD.
export function localDateKey(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function formatDateKey(key: string): string {
  // Date keys have no time zone; format the date itself, not an instant.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${key}T00:00:00Z`));
}
