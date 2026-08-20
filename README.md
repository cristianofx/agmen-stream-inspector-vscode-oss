# Agmen Stream Inspector for Redis

A free and open-source Visual Studio Code extension for inspecting, searching,
monitoring, exporting, and replaying Redis Streams directly from your editor.

Every feature is available to every user. The extension does not require an
account, activation key, subscription, or external entitlement service.

## Features

### Search and filter

- Full-text search across stream messages with field-level filtering
- JSON path traversal for nested payloads using dot notation, such as `data.user.name`
- Case-insensitive matching with optional exact-match mode
- Find the most recent N messages from selected streams
- Ascending and descending scan modes with configurable page size
- Search across multiple streams simultaneously

### Advanced conditional search

- Combine multiple field conditions with AND/OR logic
- Equals, Not Equals, Contains, and Exists operators
- Nested groups with independent combinators for complex queries
- Apply the basic field match first, then the advanced group with AND semantics
- Built-in examples and help in the filter editor

### Real-time monitoring

- Watch streams in real time with a configurable polling interval
- Display new messages automatically as they arrive
- Retain a bounded result buffer in Find and Watch modes to avoid unbounded host/webview memory growth
- Efficient polling through Redis `XREAD`

### Connection management

- Multiple connection profiles with Dev, Test, and Prod labels
- Color-coded environments
- SSH tunnels with password or private-key authentication
- SSH trust-on-first-use confirmation with persisted `SHA256:...` host fingerprints and mismatch blocking
- Redis and SSH passwords stored through VS Code SecretStorage
- Connection testing before save
- Keyboard-accessible profile reordering

### Message tools

- Pretty-printed JSON with syntax highlighting
- Find within a message with `Ctrl+F`
- Automatic decoding of JSON strings containing embedded JSON
- Resizable results and message-viewer panels
- JSON and CSV export
- Replay individual messages or all results to another Redis server with `XADD`
- Confirmation before large replay operations

## Getting started

### Install a VSIX

1. Build or download the `.vsix` file.
2. In VS Code, run **Extensions: Install from VSIX...** from the Command Palette.
3. Select the VSIX and reload VS Code when prompted.

### Open the inspector

- Click **Agmen Stream Inspector** in the Activity Bar.
- Press `Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS.
- Run **Agmen Stream Inspector: Open** from the Command Palette.

### Connect and search

1. Select **+ Add** in the Connection section.
2. Enter a name and Redis URL, such as `redis://localhost:6379`.
3. Optionally configure authentication or an SSH tunnel.
4. If you use SSH, test the tunnel. On first use the extension will show the bastion fingerprint and ask whether to trust and save it.
5. Save the connection.
6. Fetch the available streams, select one or more, configure the search, and select **Find** or **Watch**.

## Commands

| Command | Shortcut | Description |
| --- | --- | --- |
| Agmen Stream Inspector: Open | `Ctrl+Shift+R` | Open the inspector panel |
| Agmen Stream Inspector: Add Connection | - | Add a Redis connection |
| Agmen Stream Inspector: Export Results (JSON) | - | Export results as JSON |
| Agmen Stream Inspector: Export Results (CSV) | - | Export results as CSV |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `redisInspector.defaultJsonField` | `message` | Stream field containing the JSON payload |
| `redisInspector.pollIntervalMs` | `100` | Watch polling interval in milliseconds, from 50 to 5000 |
| `redisInspector.resultRetentionMaxResults` | `1000` | Maximum number of Find and Watch results retained and rendered |

## Connection URL format

The extension accepts standard Redis URLs:

```text
redis://[[username:]password@]host[:port][/db]
rediss://[[username:]password@]host[:port][/db]
```

The default Redis port is `6379`. Use `rediss://` for TLS-encrypted connections.
For simple endpoints, use `host`, `host:port`, `[ipv6]`, or `[ipv6]:port`. Ambiguous forms such as `host:6379:6380` are rejected.

For a server accessible only through SSH, enable **SSH Tunnel** in the connection
editor, enter the bastion details, and choose password or private-key
authentication. On first use the extension shows the presented bastion host
fingerprint, asks whether to trust it, and saves the accepted `SHA256:...`
fingerprint to the profile. Future connections fail closed if the fingerprint
changes.

## Workspace trust

The extension is disabled in untrusted workspaces. It opens outbound Redis and
SSH connections and can replay messages to target Redis servers, so it does not
run in VS Code restricted mode.

## Development

### Prerequisites

- Node.js 20 or later
- VS Code 1.85 or later

### Setup and verification

```bash
git clone https://github.com/cristianofx/agmen-stream-inspector-vscode-oss.git
cd agmen-stream-inspector-vscode-oss
npm ci
npm run lint
npm run typecheck
npm run typecheck:webview
npm run test:unit
xvfb-run -a npm run test:vscode   # Linux
npm run build
npm audit
```

Press `F5` in VS Code to open an Extension Development Host. To produce an
installable extension package, run:

```bash
npm run package
```

Tagged releases also generate a CycloneDX SBOM and `SHA256SUMS.txt` through
`.github/workflows/release.yml`.

### Project structure

```text
src/
  extension.ts              # Extension activation and commands
  core/
    models/                 # Search, filter, connection, and result models
    services/               # Redis search, watch, discovery, and SSH services
  providers/                # Extension-host webview providers
  services/                 # Connection profile storage
  webview/                  # Browser-side UI and message protocol
test/
  suite/                    # Mocha unit tests
```

## Technology

- TypeScript
- ioredis
- ssh2
- esbuild
- VS Code Webview API and SecretStorage
- Mocha

## Security and governance

- See `SECURITY.md` for private vulnerability reporting.
- See `CONTRIBUTING.md` for the contributor workflow and release checklist.
- See `SUPPORT.md` for support expectations.

## License

Agmen Stream Inspector is available under the MIT License. See the `LICENSE`
file included with the source and extension package.
