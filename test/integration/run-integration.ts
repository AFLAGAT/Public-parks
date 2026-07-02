/**
 * Integration test orchestrator.
 *
 * A standalone Node.js script that:
 * 1. Checks Docker availability
 * 2. Validates TEST_DB_PORT (must be integer 1–65535)
 * 3. Sets APP_NODE_ENV=test and DB_PRIMARY_URL in process.env BEFORE the
 *    guard, Vitest, and migrations — no shell-level interpolation needed
 * 4. Starts the test database via Docker Compose with a unique project name
 * 5. Waits for the database to accept connections (using pg.Pool, not shell
 *    string interpolation)
 * 6. Runs the safety guard (reads process.env.DB_PRIMARY_URL)
 * 7. Runs Drizzle migrations
 * 8. Executes integration tests via Vitest
 * 9. Always tears down: `docker compose down --volumes --remove-orphans`
 *    in an idempotent teardown that runs exactly once
 * 10. Preserves the original exit code; teardown failure causes non-zero exit
 * 11. Does NOT call process.exit() — sets process.exitCode and lets the
 *     event loop drain naturally
 *
 * Signal safety:
 * - Installs SIGINT and SIGTERM handlers at startup
 * - On signal: forwards the signal to the active child process, runs
 *   teardown once, then exits with the conventional signal code (128 + signum)
 * - Handlers are removed after teardown completes
 *
 * Uses a unique Compose project name (`parks-test-<random>` by default)
 * to prevent collisions. Override via TEST_COMPOSE_PROJECT env var.
 *
 * Usage: node -r tsx test/integration/run-integration.ts
 * Or:    npm run test:integration
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { validateTestDatabaseUrl } from './helpers/test-database.guard';
import { Pool } from 'pg';

const PROJECT_ROOT = resolve(__dirname, '../..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'docker-compose.test.yml');
const VITEST_BINARY = resolve(PROJECT_ROOT, 'node_modules/.bin/vitest');
const MIGRATE_SCRIPT = resolve(PROJECT_ROOT, 'src/migrate.ts');
const VITEST_INTEGRATION_CONFIG = resolve(PROJECT_ROOT, 'vitest.config.integration.ts');

// --- Configuration ---

/** Resolve and validate the Compose project name. */
function resolveProjectName(): string {
  const override = process.env.TEST_COMPOSE_PROJECT;
  if (override) {
    if (!/^[a-zA-Z0-9_-]+$/.test(override)) {
      console.error(
        `[run-integration] ERROR: TEST_COMPOSE_PROJECT="${override}" contains invalid characters.\n` +
          '  Compose project names may only contain [a-zA-Z0-9_-].',
      );
      process.exitCode = 1;
      throw new Error(`Invalid TEST_COMPOSE_PROJECT: ${override}`);
    }
    return override;
  }
  const suffix = randomBytes(4).toString('hex');
  return `parks-test-${suffix}`;
}

/** Resolve and validate TEST_DB_PORT (1–65535). Defaults to 5433. */
function resolveTestDbPort(): number {
  const raw = process.env.TEST_DB_PORT || '5433';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      `[run-integration] ERROR: TEST_DB_PORT must be an integer between 1 and 65535, got "${raw}".`,
    );
    process.exitCode = 1;
    throw new Error(`Invalid TEST_DB_PORT: ${raw}`);
  }
  return port;
}

// --- State ---

let teardownCalled = false;
let activeChild: ReturnType<typeof spawn> | null = null;
let composeProjectName: string;
let testDbPort: number;
let dbUrl: string;


// --- Signal handlers ---

const SIGNAL_HANDLERS: Record<string, NodeJS.SignalsListener> = {};

function installSignalHandlers(): void {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    const handler: NodeJS.SignalsListener = (signal: string) => {
      console.log(`[run-integration] ${signal} received — cleaning up...`);

      // Forward signal to active child process
      if (activeChild && activeChild.exitCode === null) {
        try {
          activeChild.kill(signal as NodeJS.Signals);
        } catch {
          // ignore if child already dead
        }
      }

      // Run teardown; exit with conventional signal code after it completes
      void runTeardown().finally(() => {
        removeSignalHandlers();
        const signalCode = 128 + (signal === 'SIGINT' ? 2 : 15);
        process.exitCode = signalCode;
      });
    };
    SIGNAL_HANDLERS[sig] = handler;
    process.on(sig, handler);
  }
}

function removeSignalHandlers(): void {
  for (const [sig, handler] of Object.entries(SIGNAL_HANDLERS)) {
    process.removeListener(sig, handler);
  }
}

// --- Helper functions ---

function log(message: string): void {
  console.log(`[run-integration] ${message}`);
}

function errorLog(message: string): void {
  console.error(`[run-integration] ERROR: ${message}`);
}

/**
 * Run a command and return its exit code and signal.
 * Inherits stdio so the user sees output in real time.
 * Sets APP_NODE_ENV=test and DB_PRIMARY_URL in the child's environment.
 */
function runCommand(
  command: string,
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<{ exitCode: number; signal: string | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        APP_NODE_ENV: 'test',
        DB_PRIMARY_URL: dbUrl,
        ...extraEnv,
      },
    });

    activeChild = child;

    child.on('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }
      resolvePromise({ exitCode: code ?? 1, signal });
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (activeChild === child) {
        activeChild = null;
      }
      errorLog(`Failed to spawn "${command}": ${err.message}`);
      resolvePromise({ exitCode: 1, signal: null });
    });
  });
}

/**
 * Wait for the database to accept connections by using pg.Pool directly.
 * No shell string interpolation — the connection string is read from
 * process.env.DB_PRIMARY_URL which is set before this function runs.
 */
async function waitForDatabase(maxRetries = 30, intervalMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const checkPool = new Pool({
      connectionString: dbUrl,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    try {
      await checkPool.query('SELECT 1');
      log('Database is ready.');
      return;
    } catch {
      if (attempt < maxRetries) {
        log(`Waiting for database (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    } finally {
      await checkPool.end().catch(() => {});
    }
  }
  throw new Error(
    `Database did not become healthy after ${maxRetries} attempts (${(maxRetries * intervalMs) / 1000}s). Ensure Docker is running and the port (${String(testDbPort)}) is not in use.`,
  );
}

/**
 * Print actionable troubleshooting information for common failure modes.
 */
function printDockerTroubleshooting(): void {
  console.error(`
  Troubleshooting Docker issues:
    1. Check Docker is running:  docker info
    2. Check for port conflicts: lsof -i :${String(testDbPort)}
    3. Check for leftover volumes: docker volume ls | grep ${composeProjectName}
    4. Clean up leftovers: docker compose -f ${COMPOSE_FILE} -p ${composeProjectName} down --volumes --remove-orphans
    5. Try a different port: TEST_DB_PORT=5434 npm run test:integration
  `);
}

/** Idempotent teardown: runs `docker compose down --volumes --remove-orphans` exactly once. */
async function runTeardown(): Promise<void> {
  if (teardownCalled) return;
  teardownCalled = true;

  log('Tearing down test database...');
  try {
    const { exitCode } = await runCommand('docker', [
      'compose',
      '-f',
      COMPOSE_FILE,
      '-p',
      composeProjectName,
      'down',
      '--volumes',
      '--remove-orphans',
    ]);
    if (exitCode !== 0) {
      errorLog(
        `docker compose down exited with code ${exitCode}. You may need to clean up manually:`,
      );
      printDockerTroubleshooting();
      // Teardown failure must make a successful run fail
      if (process.exitCode === 0 || process.exitCode === undefined) {
        process.exitCode = exitCode;
      }
    } else {
      log('Test database torn down successfully — no volumes or containers remain.');
    }
  } catch (teardownErr) {
    errorLog(`Failed to tear down test database: ${String(teardownErr)}`);
    printDockerTroubleshooting();
    if (process.exitCode === 0 || process.exitCode === undefined) {
      process.exitCode = 1;
    }
  }
}

// --- Main ---

async function main(): Promise<void> {
  // Resolve config and validate early
  composeProjectName = resolveProjectName();
  testDbPort = resolveTestDbPort();
  dbUrl = `postgres://parks:parks_test@localhost:${String(testDbPort)}/parks_test`;

  // Set env vars BEFORE anything else — guard and migration both read process.env
  process.env.APP_NODE_ENV = 'test';
  process.env.DB_PRIMARY_URL = dbUrl;

  log(`Compose project: ${composeProjectName}`);
  log(`Test DB port: ${testDbPort}`);

  // Validate prerequisites
  if (!existsSync(COMPOSE_FILE)) {
    errorLog(`Compose file not found at ${COMPOSE_FILE}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(VITEST_BINARY)) {
    errorLog(`Vitest binary not found at ${VITEST_BINARY}. Did you run npm install?`);
    process.exitCode = 1;
    return;
  }

  // Step 1: Check Docker availability
  log('Checking Docker availability...');
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
  } catch {
    errorLog(
      'Docker is not available or the Docker daemon is not running.\n' +
        '  Integration tests require Docker to provision the test database.\n' +
        '  Install Docker Desktop (https://docs.docker.com/desktop/) or ensure\n' +
        '  the Docker daemon is running.',
    );
    printDockerTroubleshooting();
    process.exitCode = 1;
    return;
  }
  log('Docker is available.');

  const composeArgs = ['compose', '-f', COMPOSE_FILE, '-p', composeProjectName];

  try {
    // Step 2: Start the test database
    log('Starting test database (docker compose up -d)...');
    const { exitCode: upCode } = await runCommand('docker', [...composeArgs, 'up', '-d']);
    if (upCode !== 0) {
      errorLog(`Failed to start test database (exit code ${upCode})`);
      printDockerTroubleshooting();
      process.exitCode = upCode;
      return;
    }
    log('Test database container started.');

    // Step 3: Wait for health
    log('Waiting for database to become healthy...');
    await waitForDatabase();

    // Step 4: Run the safety guard (reads process.env which we already set)
    log('Validating test database URL...');
    validateTestDatabaseUrl(process.env.DB_PRIMARY_URL);
    log('Database URL validated.');

    // Step 5: Run migrations
    log('Running Drizzle migrations...');
    const { exitCode: migrateCode } = await runCommand('node', ['-r', 'tsx', MIGRATE_SCRIPT]);
    if (migrateCode !== 0) {
      errorLog(`Migration failed (exit code ${migrateCode})`);
      process.exitCode = migrateCode;
      return;
    }
    log('Migrations applied successfully.');

    // Step 6: Run integration tests
    log('Running integration tests...');
    const { exitCode: testCode, signal: testSignal } = await runCommand(VITEST_BINARY, [
      'run',
      '--config',
      VITEST_INTEGRATION_CONFIG,
    ]);
    if (testCode !== 0) {
      errorLog(
        `Integration tests failed (exit code ${testCode}, signal ${testSignal ?? 'none'})`,
      );
      process.exitCode = testCode;
    } else {
      log('All integration tests passed!');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorLog(`Integration test run failed: ${message}`);
    if (process.exitCode === 0 || process.exitCode === undefined) {
      process.exitCode = 1;
    }
  } finally {
    // Step 7 (ALWAYS): Teardown — runs exactly once via idempotent guard
    await runTeardown();
    removeSignalHandlers();
  }
}

// Install signal handlers before starting
installSignalHandlers();

void main().catch((err) => {
  errorLog(`Unhandled error: ${String(err)}`);
  process.exitCode = 1;
});
