# Starting & Stopping Services

## Development Mode

### Start

```bash
bun run start
```

This launches **electron-vite** in dev mode, which starts:

- Vite dev server on `http://localhost:5173` (renderer hot-reload)
- Electron main process (with auto-restart on main-process changes)
- Channel plugins (Slack, Telegram, Lark, DingTalk) if configured

### Stop

Press `Ctrl+C` in the terminal where `bun run start` is running.

If the process doesn't exit cleanly:

```bash
# Kill Electron processes
pkill -9 -f "Electron"

# Kill Vite dev server (if port is still occupied)
lsof -ti:5173 | xargs kill -9
```

### Restart

Kill the existing process, then start again:

```bash
pkill -9 -f "Electron"
sleep 1
bun run start
```

> **Note:** Changes to renderer code (React components, styles) hot-reload automatically.
> Changes to main process code (channels, services, database) require a full restart.

## WebUI Mode

```bash
bun run webui
```

Starts a standalone web server (no Electron window). Useful for remote access or headless environments.

## Common Issues

| Problem | Fix |
|---------|-----|
| Port 5173 already in use | `lsof -ti:5173 \| xargs kill -9` |
| "Another instance is already running" | `pkill -9 -f "Electron"` then retry |
| White screen after restart | Old Electron process still running — kill all Electron processes first |
| Channel plugin not reconnecting | Restart the app — plugins initialize on startup |

## Process Architecture

AionUi runs as an Electron app with three process types:

| Process | Location | Description |
|---------|----------|-------------|
| **Main** | `src/process/` | Node.js — database, IPC, channel plugins, cron service |
| **Renderer** | `src/renderer/` | Chromium — React UI, no Node.js APIs |
| **Worker** | `src/worker/` | Background tasks |

Cross-process communication goes through the IPC bridge (`src/preload.ts`).

### Key Services (Main Process)

| Service | Description |
|---------|-------------|
| **ChannelManager** | Manages channel plugins (Slack, Telegram, etc.) |
| **CronService** | Scheduled task execution |
| **SessionManager** | User session tracking per chat |
| **PairingService** | User authorization via pairing codes |
| **Database** | SQLite via better-sqlite3 |
