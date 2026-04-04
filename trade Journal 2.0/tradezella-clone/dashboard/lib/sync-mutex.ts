/**
 * lib/sync-mutex.ts — In-memory mutex for serializing VPS access.
 *
 * PROBLEM:
 *   The VPS runs a single MT5 session at a time. If two sync requests arrive
 *   concurrently, one might call /connect (switching the active account) while
 *   the other is mid-way through /history — fetching the wrong account's data.
 *
 * SOLUTION:
 *   A simple promise-based queue. Every sync operation must acquire the mutex
 *   before touching the VPS. The second caller waits until the first completes.
 *   This guarantees that connect → history always runs atomically for one account.
 *
 * LIMITATIONS:
 *   - This only works for a single Node.js process. If the Next.js app runs
 *     multiple workers (e.g. Vercel serverless), each worker has its own mutex.
 *     For multi-worker deployments, replace this with a Redis-based lock.
 *   - The mutex does NOT time out. If a sync hangs, subsequent syncs wait forever.
 *     The VPS fetch already has its own timeout (60s for /history), so a stuck
 *     sync will eventually throw and release the lock.
 *
 * USAGE:
 *   import { withSyncMutex } from "@/lib/sync-mutex";
 *   const result = await withSyncMutex(async () => {
 *     await vpsConnect(...);
 *     return await vpsHistory(...);
 *   });
 */

// The pending promise chain — each caller chains onto the previous one.
// Starts as resolved so the first caller runs immediately.
let queue: Promise<void> = Promise.resolve();

/**
 * Executes `fn` while holding the sync mutex. Only one `fn` runs at a time.
 * Additional callers wait in FIFO order until the previous one finishes.
 *
 * @param fn — async function that needs exclusive VPS access
 * @returns whatever `fn` returns
 * @throws whatever `fn` throws (the mutex is released either way)
 */
export async function withSyncMutex<T>(fn: () => Promise<T>): Promise<T> {
  // Wrap our work in a promise that we chain onto the queue
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Wait for any previously queued work to finish
  const previous = queue;

  // Add ourselves to the end of the queue. The NEXT caller will wait
  // until our `gate` resolves (which happens in the finally block below).
  queue = gate;

  // Wait for the previous sync to complete before we start
  await previous;

  try {
    // We now have exclusive access to the VPS — run the caller's function
    return await fn();
  } finally {
    // Release the mutex so the next queued caller can proceed.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    release!();
  }
}
