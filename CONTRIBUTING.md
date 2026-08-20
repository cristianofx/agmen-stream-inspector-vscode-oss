# Contributing

## Development baseline

- Node.js 20.x
- VS Code 1.85 or later
- Redis reachable locally or through a test SSH bastion when changing connection features

## Setup

```bash
npm ci
npm run lint
npm run typecheck
npm run typecheck:webview
npm run test:unit
npm run build
```

On Linux, run the VS Code smoke test with:

```bash
xvfb-run -a npm run test:vscode
```

## Pull requests

- Add focused regression tests before production changes.
- Keep credential handling inside VS Code `SecretStorage`.
- Do not bypass SSH host-key verification.
- Update `README.md` and `CHANGELOG.md` when user-visible behavior changes.

## Release verification

```bash
npm ci
npm run lint
npm run typecheck
npm run typecheck:webview
npm run test:unit
xvfb-run -a npm run test:vscode
npm run build
npm audit
npm run package
npx vsce ls
unzip -l *.vsix
```
