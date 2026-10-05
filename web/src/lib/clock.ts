/**
 * Tablet and PC clocks drift - a real one measured 7.4 seconds behind the
 * server. Timestamps come from the server, so measuring elapsed time with the
 * device clock makes the stopwatch sit at 0:00 for the whole difference (or
 * jump ahead, if the device is fast).
 *
 * Every board response carries the server's own clock; we keep the difference
 * and use it wherever "now" is compared against a server timestamp.
 */
let skewMs = 0;

/** Called with the `now` field of any API response that carries one. */
export function syncClock(serverNowIso: string): void {
  const serverMs = new Date(serverNowIso).getTime();
  if (!Number.isNaN(serverMs)) skewMs = serverMs - Date.now();
}

/** Current time on the server's clock. Network latency (~30ms) is ignored. */
export function serverNow(): number {
  return Date.now() + skewMs;
}
