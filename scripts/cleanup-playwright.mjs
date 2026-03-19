import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PLAYWRIGHT_PROCESS_PATTERNS = [
  'chromium_headless_shell-.*/chrome-headless-shell',
  'playwright_chromiumdev_profile-',
];

const SMOKE_PROCESS_PATTERN = 'node scripts/smoke-test.mjs';

function runCommand(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.status === 1) {
      return '';
    }

    throw error;
  }
}

function listMatchingProcesses(pattern) {
  const result = runCommand('pgrep', ['-fal', pattern]).trim();
  if (!result) {
    return [];
  }

  return result
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function killMatchingProcesses(pattern) {
  runCommand('pkill', ['-f', pattern]);
}

export function cleanupPlaywrightProcesses({
  includeSmokeScript = false,
  logger = () => {},
} = {}) {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    logger(`[cleanup-playwright] Unsupported platform: ${process.platform}. Skipping.`);
    return { totalMatched: 0, patterns: [] };
  }

  const patterns = includeSmokeScript
    ? [...PLAYWRIGHT_PROCESS_PATTERNS, SMOKE_PROCESS_PATTERN]
    : [...PLAYWRIGHT_PROCESS_PATTERNS];
  let totalMatched = 0;

  for (const pattern of patterns) {
    const matches = listMatchingProcesses(pattern);
    totalMatched += matches.length;

    if (matches.length === 0) {
      continue;
    }

    killMatchingProcesses(pattern);
    logger(`[cleanup-playwright] Killed ${matches.length} process(es) for pattern: ${pattern}`);
  }

  if (totalMatched === 0) {
    logger('[cleanup-playwright] No stale Playwright processes found.');
  }

  return { totalMatched, patterns };
}

const executedAsScript = import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedAsScript) {
  try {
    const result = cleanupPlaywrightProcesses({
      includeSmokeScript: true,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
    process.stdout.write(`[cleanup-playwright] Done. Total matches: ${result.totalMatched}\n`);
  } catch (error) {
    process.stderr.write(`[cleanup-playwright] Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
