# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Securo is a self-hosted personal finance manager. Stack:
- **Backend**: FastAPI + SQLAlchemy (async) + Celery + PostgreSQL + Redis
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query
- **Infrastructure**: Docker Compose (dev + prod), optional Helm chart (`charts/`)

## Commands

### Full stack
```bash
docker compose up --build          # db, redis, backend (runs alembic upgrade head), worker, beat, frontend
docker compose --profile agents up # also starts the built-in MCP server container
```

### Backend (`cd backend`)
```bash
uv sync --all-extras         # first time — builds .venv from uv.lock
source .venv/bin/activate

pytest                        # all tests (SQLite in-memory, no Postgres needed)
pytest tests/test_transactions_api.py          # single file
pytest tests/test_transactions_api.py::TestClass::test_method  # single test
pytest --cov=app --cov-report=term-missing     # with coverage
pytest -n auto --dist loadfile -W error        # what CI runs (warnings are errors)

ruff check .                  # lint
ty check .                    # type check

./scripts/lock.sh             # regenerate uv.lock after pyproject.toml changes
python3 scripts/check_migration_chain.py  # verify Alembic chain is linear
```

Processes, when running without Docker:
```bash
uvicorn app.main:app --port 8000               # API
celery -A app.worker worker --concurrency=2    # background jobs
celery -A app.worker beat                      # scheduler
uvicorn mcp_server.main:app --port 8765        # built-in MCP server (agents only)
python -m app.cli                              # admin CLI (create user, generate recurring)
```

### Frontend (`cd frontend`)
```bash
npm run dev          # dev server (proxies API to backend)
npm test             # vitest run (no watch)
npm run lint         # eslint — CI adds --max-warnings=0
npm run typecheck    # tsc
npm run build        # typecheck + vite build
```

`mise` tasks mirror these per-directory (`mise run install|lint|test|build`); `mise.toml` at the
root declares `backend/` and `frontend/` as monorepo config roots.

### Pre-commit hooks (optional, recommended)
```bash
prek install   # or: pip install pre-commit && pre-commit install
```
Runs `ruff check`, `ty check`, and the migration-chain check on staged backend files, using the
ruff/ty from `backend/.venv` so versions match CI.

## Architecture

### Backend layout
```
backend/
  app/
    api/          # FastAPI routers — one file per resource (accounts.py, transactions.py, …)
    core/         # Auth, config, DB session, clock, rate-limiting, workspace context, module gating
    models/       # SQLAlchemy ORM models
    schemas/      # Pydantic request/response schemas
    services/     # Business logic (transaction_service.py, rule_engine.py, …)
    tasks/        # Celery tasks (sync, fx rates, recurring, invoice schedules, assets)
    providers/    # Bank sync integrations (Pluggy, Enable Banking, SimpleFIN)
    fiscal/       # Country-specific fiscal validators
    agents/       # Optional LLM agents feature (gated by AGENTS_ENABLED)
    main.py       # App factory, middleware, router registration
    worker.py     # Celery app + beat_schedule (all periodic jobs live here)
    cli.py        # Admin CLI entry point
  mcp_server/     # Standalone MCP server app (separate uvicorn entry point, same venv)
  alembic/        # Migrations
```

Each resource follows the pattern: `api/` router → `services/` business logic → `models/` ORM.
Services are large and own their domain end to end; pure computation is split into DB-free modules
(`services/rule_engine.py`, `services/text_similarity.py`, `services/reconciliation_engine.py`) so it
can be unit-tested without a session. Keep that split when adding logic.

### Frontend layout
```
frontend/src/
  pages/        # One file per route (large, self-contained page components)
  components/   # Shared UI components; ui/ contains shadcn primitives
  contexts/     # React contexts: Auth, Workspace, Collection filter, Sidebar state
  hooks/        # Custom hooks
  lib/          # Utilities, API client (lib/api.ts has all API calls)
  locales/      # i18n strings (en/, pt-BR/)
  types/        # Shared TypeScript types
```

All API calls live in `lib/api.ts` (axios-based). TanStack Query handles caching — `staleTime` is 5 minutes by default.

### Multi-tenancy
All data is scoped to a **Workspace**. `core/workspace_context.py` resolves it from the
`X-Workspace-Id` header (falling back to the user's default workspace) and returns a
`WorkspaceContext` carrying workspace + membership + role. Services receive a `workspace_id`
parameter; never skip it.

Three checks are deliberately separate, and a mutating route may need all three:
- **Role** (`current_writable_workspace` / `require_write`) — may this user write?
- **Module** (`core/module_gate.py`) — does this workspace have this module at all? Never a
  permission check; hiding a nav entry is not enforcement.
- **Deployment flag** (`core/feature_flags.py`) — is the capability enabled on this install?

`core/workspace_autostamp.py` fills `workspace_id` from `user_id` on insert for pre-workspace code
paths. It is a compatibility shim — pass `workspace_id` explicitly rather than relying on it.

### Dates and timezones
Persisted timestamps are UTC, but "today" is a calendar question. Use `core/app_clock.py` instead of
`date.today()` / `datetime.now()`: it resolves workspace timezone → admin app setting → `TZ` → host
→ UTC, and each request, MCP call, CLI run, and Celery job snapshots one timezone for its whole
lifetime. Mixing in a raw `date.today()` reintroduces the two-calendar bug the module exists to
prevent.

### Agents (optional feature)
Gated by `AGENTS_ENABLED=true`. When disabled nothing in `app/agents/` is imported. `COMPOSE_PROFILES=agents`
only adds the `mcp-server` container — bare-metal installs set `AGENTS_ENABLED=true` and run
`mcp_server.main:app` themselves, pointing `AGENTS_BUILTIN_MCP_URL` at it. Supports Ollama, OpenAI,
Anthropic, and OpenAI-compatible providers.

## Testing patterns

### Backend
- Tests use **SQLite in-memory** via `conftest.py` — no running Postgres needed.
- `pgvector.Vector` is shimmed to a JSON column, and `UUID` is compiled for SQLite.
- Postgres-specific behavior uses the `postgres_sessions` fixture, which needs `POSTGRES_TEST_URL`
  and gives each test its own schema. Locally it skips; in CI it fails if the URL is missing.
- `AGENTS_ENABLED=true` is forced in `conftest.py` so agent routes are always tested.
- Fixtures in `tests/conftest.py` provide `client`, `session`, `test_user`, `test_workspace`,
  `auth_headers`, `admin_auth_headers`, `viewer_auth_headers`, `clean_db`, etc.
  `clean_db` asserts a fresh, transaction-free session — pass it one.
- Test files mirror the service they test: `test_transaction_service.py` tests `transaction_service.py`.
- CI runs with `-W error`, so a new `DeprecationWarning` fails the build, and `--cov-fail-under=60`.
  `app/cli.py`, `app/worker.py`, `app/tasks/*`, and the provider clients are omitted from coverage.

### API contract sweep (`backend/tests/api_contract/`)
Every route and method is pinned to an exact status code in `baseline.json`, for five callers:
owner (`ok`), viewer, empty body, unknown ids, anonymous. Full guide: `tests/api_contract/README.md`.
- **Test data only.** It runs in-process on the SQLite test DB with conftest's fake users. Never point
  it, or anything built from it, at a running stack, prod, or a real account: ~185 cases delete or
  mutate data.
- **Changing an endpoint's contract** (new route, new validation, new status, removed route): the
  sweep fails. If the change is intended, regenerate the baseline in the same PR and review the JSON
  diff. That diff is what tells the reviewer the behaviour change was deliberate:
  `UPDATE_API_CONTRACT=1 uv run pytest tests/api_contract -n 0`
- **Unintended diff = regression.** Fix the code; don't regenerate over it.
- The baseline may never expect a 500. A known bug goes in `KNOWN_BUGS` (strict xfail holding the
  correct status), a deliberate `HTTPException(500)` in `DELIBERATE_500`, SQL SQLite can't run in
  `POSTGRES_ONLY`, all in `cases.py`, each with a reason.
- A new create endpoint that later routes depend on: add a step to `world.py`. A route whose
  generated body can't reach the happy path: add a `BODY_OVERRIDES` entry.
- New routes don't need hand-written cases; they're picked up from the OpenAPI spec automatically.

### Frontend
- Use `renderWithProviders` from `@/test/utils` — wraps TanStack Query, router, and i18n.
- Import with the `@/` alias, not relative paths.
- Assert on rendered output (text, disabled state, error messages), not implementation details.
- Two environments: `node` (pure utils) and `jsdom` (components). Configured in `vitest.config.ts`.

## Key conventions

### Database migrations
- Alembic migrations in `backend/alembic/versions/`, numbered sequentially (`076`, `077`, …), with
  `revision` / `down_revision` chained to the current head so the directory sorts in apply order.
- If another migration lands on `main` first, renumber — CI checks the chain against your branch
  *merged with* `main`, which is the only place a clash shows up.
- After adding a migration: run `python3 scripts/check_migration_chain.py`.
- After changing `pyproject.toml` dependencies: run `./scripts/lock.sh` and commit `uv.lock` (CI enforces).

### Python version and tooling
Target is **3.11** (`ruff target-version`, `ty python-version`) even though newer interpreters run it —
3.12+-only syntax fails CI. Ruff's rule set is pinned to `["E4", "E7", "E9", "F"]` and ruff/ty versions
are pinned in `pyproject.toml` on purpose: bump them deliberately, with whatever reformat or
annotations the new release wants, never as a drive-by.

### Frontend dependencies
`frontend/.npmrc` never runs install scripts and skips packages published within the last 7 days.
Requires npm 11.10+ (the npm bundled with Node 22 ignores the cooldown silently):
```bash
npm install --global npm@latest
cd frontend && npm install <package>
```

### i18n
User-facing strings must be added to both `frontend/src/locales/en/` and `pt-BR/`.

### CI
`.github/ci/changes.py` decides which of the four jobs (backend tests, migration chain, frontend
checks, helm lint + kubeconform) actually run for a diff — touching `charts/` triggers Helm
validation, so keep chart templates renderable. `pr-labels.yml` auto-applies `risk:` and `size:`
labels from the file list; `label-guard.yml` reverts label changes from outside the allowed list.

### Commits and PRs
Conventional-style messages (`feat:`, `fix:`, `docs:`, `refactor:`). One feature or fix per PR; add
tests for new backend functionality; update both locales for user-facing strings. See
`CONTRIBUTING.md` — large or core changes (accounts, transactions, budgets, rules engine,
workspaces, sync) are expected to be discussed before the code is written.
