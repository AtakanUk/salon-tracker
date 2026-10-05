/** In-memory ring buffer of the last server errors, shown on the admin System page. */

export interface LoggedError {
  time: string;
  method: string;
  url: string;
  message: string;
}

const MAX = 50;
const MAX_LEN = 500; // keep entries readable, truncate long messages

const buffer: LoggedError[] = [];

export function pushError(entry: LoggedError) {
  buffer.push({ ...entry, message: entry.message.slice(0, MAX_LEN) });
  if (buffer.length > MAX) buffer.shift();
}

export function recentErrors(): LoggedError[] {
  return [...buffer].reverse(); // newest first
}
