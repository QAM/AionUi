# Building macOS ARM64 DMG

## Prerequisites

- **macOS** on Apple Silicon (M1/M2/M3/M4)
- **Node.js** 22+
- **bun** ([install](https://bun.sh))
- **Python** 3.11+ (for native module compilation)

## Steps

### 1. Install dependencies

```bash
bun install
```

### 2. Build the app

Bundle main process, renderer, and preload scripts with electron-vite:

```bash
npx electron-vite build
```

Output goes to `out/main/`, `out/renderer/`, and `out/preload/`.

### 3. Package the DMG

```bash
npx electron-builder --mac --arm64
```

This produces two artifacts in `out/`:

| File | Description |
|------|-------------|
| `AionUi-<version>-mac-arm64.dmg` | Installer disk image |
| `AionUi-<version>-mac-arm64.zip` | Zipped app bundle |

### 4. Install

Open the `.dmg`, drag **AionUi** into `/Applications`.

> **Note:** Without Apple Developer credentials, the build uses ad-hoc code signing.
> macOS Gatekeeper will block it on first launch — right-click → Open to bypass.

## Code Signing & Notarization

For production distribution, set these environment variables before building:

```bash
export CSC_LINK=/path/to/certificate.p12      # or base64-encoded .p12
export CSC_KEY_PASSWORD=your-cert-password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

Then run the same build commands — electron-builder will sign and notarize automatically.

## Cross-Architecture Build

To build for Intel (x64) on an Apple Silicon machine:

```bash
npx electron-builder --mac --x64
```

> Native modules (`better-sqlite3`, `node-pty`, `bcrypt`) must be compiled for the target architecture.
> If cross-compilation fails, build on a native x64 machine instead.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `better-sqlite3` build fails | Run `bun install` to ensure native modules are compiled for your arch |
| DMG blocked by Gatekeeper | Right-click → Open, or `xattr -cr /Applications/AionUi.app` |
| "App is damaged" error | Clear quarantine: `xattr -cr /Applications/AionUi.app` |
| Port 5173 in use during dev | `lsof -ti:5173 \| xargs kill -9` |
