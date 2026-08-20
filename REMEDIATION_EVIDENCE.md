# Remediation evidence

This file records verification performed in the `fix/audit-remediation` worktree. It does not claim live Redis/SSH or cross-platform behavior that was not exercised.

## Build and VSIX release slice

- `npm ci` — passed; 502 packages installed, 0 vulnerabilities reported.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run typecheck:webview` — passed.
- `npm test` — passed; 114 passing tests reported by the current unit command.
- `xvfb-run -a npm run test:vscode` — passed; 1 VS Code smoke test passed and the extension host exited with code 0.
- `npm run build` — passed.
- `npm run package` — passed; generated `agmen-stream-inspector-1.2.0.vsix`.
- `npx vsce ls` — passed; the package contains 20 files and no `node_modules`, source files, tests, TypeScript files, or source maps.
- `npm audit --json` — passed; 0 vulnerabilities across the installed graph.
- `npm audit --omit=dev` — passed; 0 production vulnerabilities.
- `git diff --check` — passed.

## Current limitation

The smoke test exercises extension activation and command registration. Live Redis, SSH, host-key rotation, and native SSH module execution across Windows/macOS/Linux architectures still require environment-specific verification.
