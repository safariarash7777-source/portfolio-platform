/** Exclusive worker lock; never reclaims an existing or replaced lock. */
import { open, readFile, lstat, unlink } from 'node:fs/promises';
import type { Stats } from 'node:fs';
type Handle = { writeFile(content: string): Promise<void>; stat(): Promise<Stats>; close(): Promise<void> };
export async function withResearchLock(path: string, job: () => Promise<void>,
  acquire: (path: string) => Promise<Handle> = path => open(path, 'wx')): Promise<boolean> {
  let handle: Handle;
  try { handle = await acquire(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Absence of a process is not permission to delete/retry its outcome.
    try {
      const prior = JSON.parse(await readFile(path, 'utf8'));
      if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0) throw new Error();
      process.kill(prior.pid, 0);
      return false;
    } catch { throw new Error('worker_lock_requires_review'); }
  }
  let identity: Awaited<ReturnType<Handle['stat']>> | undefined;
  try {
    identity = await handle.stat();
    // Initialization belongs to the same finally as the job. A failed write
    // must not strand the lock this invocation just created.
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    await job();
    return true;
  } finally {
    await handle.close();
    if (identity) {
      let current;
      try { current = await lstat(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (current && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) await unlink(path);
      // A missing/replaced path is never reclaimed, even if its PID is stale.
    }
  }
}
