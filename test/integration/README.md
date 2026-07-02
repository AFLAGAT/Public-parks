# Integration Tests

Integration tests connect to a real PostgreSQL/PostGIS database, run queries,
and verify the Drizzle ORM stack works correctly. They are **not** unit tests —
they require a live database and are separated from the fast `npm test` path.

## File naming

Integration test files must use the pattern `**/*.integration.spec.ts` inside
`test/integration/`. This distinguishes them from unit tests (which use
`*.spec.ts` or `*.test.ts` inside `src/`).

```
test/integration/
  smoke/
    drizzle-stack.integration.spec.ts     # PostGIS + migration smoke test
  helpers/
    test-database.guard.ts                # Database safety guard
    test-database.guard.spec.ts           # Unit tests for the guard
  README.md
```

## Commands

| Command | Description |
|---|---|
| `npm run test:unit` | Run only unit tests (fast, no database) |
| `npm run test:integration` | Provision DB → migrate → run integration tests → teardown |
| `npm run test:all` | Run unit tests AND integration tests |

## How `npm run test:integration` works

The `test/integration/run-integration.ts` orchestrator script:

1. **Checks Docker availability** — fails fast with a clear error if Docker is
   not running.
2. **Starts the test database** — `docker compose -f docker-compose.test.yml -p parks-test up -d`
3. **Waits for health** — polls `pg_isready` until the database accepts connections.
4. **Validates the database URL** — runs `validateTestDatabaseUrl()` to ensure the
   target is a local test database, not production or development.
5. **Runs Drizzle migrations** — applies all pending migrations to the test database.
6. **Runs integration tests** — `vitest run --config vitest.config.integration.ts`
7. **Tears down** — `docker compose down --volumes --remove-orphans` always runs,
   even on failure or interrupt.

## Troubleshooting

### Docker not available

```
ERROR: Docker is not available or the Docker daemon is not running.
```

Install [Docker Desktop](https://docs.docker.com/desktop/) and ensure the daemon
is running:

```shell
docker info
```

### Port conflict

If port 5433 (the default test database port) is already in use:

```shell
# Use a different port
TEST_DB_PORT=5434 npm run test:integration
```

### Leftover containers or volumes

If a previous run was interrupted before teardown completed:

```shell
docker compose -f docker-compose.test.yml -p parks-test down --volumes --remove-orphans
```

### Database not becoming healthy

```shell
# Check container logs
docker compose -f docker-compose.test.yml -p parks-test logs postgres

# Check if container is running
docker compose -f docker-compose.test.yml -p parks-test ps
```

## Writing integration tests

1. **Place files in `test/integration/`** with `.integration.spec.ts` extension.
2. **Use `DB_PRIMARY_URL` from `process.env`** — the orchestrator sets this.
3. **Create your own `Pool` in `beforeAll`** — close it in `afterAll`.
4. **Prefer transaction rollback** for data isolation (see `test/fixtures/README.md`).
5. **Use explicit cleanup** only for concurrency tests that need committed rows.
6. **Keep tests focused** — each test should verify one behavior.
