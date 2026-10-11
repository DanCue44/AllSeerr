import type { EntityManager, QueryRunner } from 'typeorm';

// Work sent off from inside a transaction, such as a request on its way to
// Lidarr, must not write to the database before that transaction ends. If it
// does, the two write the same media and the later save puts back the values
// the other one replaced.
const waiters = new WeakMap<QueryRunner, (() => void)[]>();

// A transaction that never reports its end must not hold the work forever
const MAX_WAIT_MS = 60_000;

export function transactionSettled(manager: EntityManager): Promise<void> {
  const queryRunner = manager.queryRunner;
  if (!queryRunner?.isTransactionActive) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, MAX_WAIT_MS);
    timer.unref();

    const pending = waiters.get(queryRunner) ?? [];
    pending.push(() => {
      clearTimeout(timer);
      resolve();
    });
    waiters.set(queryRunner, pending);
  });
}

// Called by a subscriber once a transaction commits or rolls back
export function releaseTransactionWaiters(queryRunner?: QueryRunner): void {
  // A nested transaction ending leaves the outer one running
  if (!queryRunner || queryRunner.isTransactionActive) {
    return;
  }

  const pending = waiters.get(queryRunner);
  waiters.delete(queryRunner);
  pending?.forEach((release) => release());
}
