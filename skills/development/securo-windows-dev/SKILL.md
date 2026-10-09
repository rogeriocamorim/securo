---
name: securo-windows-dev
description: Diagnose and fix Securo dev setup issues on Windows.
version: 0.1.0
author: Camor (camor), Hermes Agent
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [windows, docker, networking, localhost, port-clash]
    related_skills: []
---

# Securo Windows Dev Setup

Local development on Windows. Covers port clashes, Docker networking, and startup fixes.

## When to Use

- `http://localhost:3000` shows a gray blank page or "Loading..." forever
- Docker containers are running (`docker compose ps` shows all healthy) but nothing loads
- Backend API responds on `127.0.0.1:8000` but frontend never boots
- First-time Docker setup and secrets need auto-generating

## How to Run

```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
```

Open in browser: `http://127.0.0.1:3000` (not `localhost`)

## Root Cause: Port 3000 Clash

Chrome resolves `localhost` to `::1` (IPv6) first. A Windows COM surrogate (`dllhost.exe`) also listens on `[::1]:3000`. Request hits the wrong listener → hangs.

Docker listens on `0.0.0.0:3000` (IPv4) but Chrome never reaches it.

## Fix

1. **Default:** Use `http://127.0.0.1:3000` (IPv4-only). Confirmed working.
2. **Kill the offender:** `netstat -ano | findstr :3000` → find PID on `[::1]:3000` → `taskkill /PID <pid> /F`.
3. **Reboot** (PID changes each boot).
4. **Move port:** Change `docker-compose.yml` mapping from `"3000:5173"` to `"3001:5173"`, update `.env` `FRONTEND_URL`.

## Other Known Issues

- **Docker Desktop port forwarding broken:** If `localhost:3000` and `localhost:8000` both time out, Docker Desktop's Windows proxy is stale. Quit Docker Desktop from system tray, reopen, then restart containers.
- **Blank page despite working assets:** Vite v8 `allowedHosts` strictness. Set `allowedHosts: true` in `frontend/vite.config.ts`.
- **Backend health 200 but frontend API proxy fails:** Backend container reachable but not the Windows port mapping. Test with `curl http://127.0.0.1:8000/api/health`.

## Auto-Generated Secrets

On first startup, `backend/app/core/config.py` detects weak default `SECRET_KEY` and `AGENTS_MCP_JWT_SECRET` and generates random replacements. Logs show:

```
Securo auto-generated a new SECRET_KEY ...
Securo auto-generated a new AGENTS_MCP_JWT_SECRET ...
```

To persist: grab the generated keys and add them to the host `.env` file:

```bash
docker exec securo-backend-1 python -c "import os; print(os.environ['SECRET_KEY']); print(os.environ['AGENTS_MCP_JWT_SECRET'])"
```

## Verification

```bash
# Containers up
docker compose -f docker-compose.yml ps

# Backend responds
curl http://127.0.0.1:8000/api/health

# Frontend HTML loads
curl http://127.0.0.1:3000/ | head -5

# Frontend JS assets serve
curl http://127.0.0.1:3000/@vite/client

# No IPv6 port clash
netstat -ano | findstr :3000
# Only Docker PID should appear on 0.0.0.0:3000, not on [::1]:3000
```

## Pitfalls

- **Test `127.0.0.1` not `localhost`:** Always use the IP address to bypass IPv6 DNS resolution.
- **Docker Desktop restart ≠ containers restart:** If Docker restarts, containers keep running but port forwarding may be stale.
- **Chrome tabs persist lock on browser tool:** If the browser tool fails with "profile locked", Chrome is still running. Kill all `chrome.exe` processes before retrying.
- **CORS/allowedHosts in Vite v8:** The old `getFrontendHost()` logic extracted only the bare hostname (`localhost`) from `FRONTEND_URL`, but the browser sends `Host: localhost:3000` which Vite v8 rejects. Use `allowedHosts: true` in dev.
