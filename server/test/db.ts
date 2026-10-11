import { settleBackgroundTasks } from '@server/utils/backgroundTasks';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import { afterEach, before, beforeEach } from 'node:test';

// A task still running after this long is stuck, not slow
const SETTLE_TIMEOUT_MS = 30_000;

// Waits for the work a test sent off in the background, such as a request
// on its way to Radarr, so it cannot touch the next test's database
export async function settleTestBackgroundTasks(): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Background tasks did not settle within ${SETTLE_TIMEOUT_MS}ms`
          )
        ),
      SETTLE_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([settleBackgroundTasks(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function setupTestDb() {
  before(async () => {
    await seedTestDb();
  });
  beforeEach(async () => {
    await settleTestBackgroundTasks();
    await resetTestDb();
  });
  afterEach(async () => {
    await settleTestBackgroundTasks();
  });
}
