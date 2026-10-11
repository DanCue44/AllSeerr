import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Preloaded before anything else, because the settings, logger and image
// cache read CONFIG_DIRECTORY when they are first imported. Each test file
// runs in its own process and gets its own throwaway config directory, so
// test files never share settings.json or logs with each other, and a test
// run never writes into the developer's real config directory.
const configDirectory = mkdtempSync(join(tmpdir(), 'seerr-test-'));
mkdirSync(join(configDirectory, 'db'));
mkdirSync(join(configDirectory, 'logs'));
process.env.CONFIG_DIRECTORY = configDirectory;

process.on('exit', () => {
  rmSync(configDirectory, { recursive: true, force: true });
});
