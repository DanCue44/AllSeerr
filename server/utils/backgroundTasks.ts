// Work that runs detached from the request that started it, such as sending
// a request to a service. The caller does not wait for it, but tests have to:
// a detached task that is still running when the next test resets the
// database writes into that test's data or breaks the reset.
const pending = new Set<Promise<unknown>>();

export function runInBackground(task: Promise<unknown>): void {
  pending.add(task);
  task
    .catch(() => {
      // The task handles its own errors, this only keeps the set tidy
    })
    .finally(() => {
      pending.delete(task);
    });
}

// Waits for every detached task, including the ones those tasks start
export async function settleBackgroundTasks(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
