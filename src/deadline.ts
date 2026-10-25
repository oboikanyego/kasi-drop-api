/** Requests shorter than this are not worth starting: the provider cannot answer in time. */
export const minAttemptMs = 1_000;
const retryBackoffMs = 350;
/** Timeout for one provider request: its own cap, cut to what is left before the deadline. */
export function attemptTimeout(capMs: number, deadline: number, now = Date.now()): number | null {
  const left = Math.min(capMs, deadline - now);
  return left >= minAttemptMs ? left : null;
}
/** Whether a retry, after its backoff, would still get a useful amount of time. */
export const canRetry = (deadline: number, now = Date.now()) =>
  deadline - now - retryBackoffMs >= minAttemptMs;
