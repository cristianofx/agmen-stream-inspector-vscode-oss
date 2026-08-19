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
- Use a basic field match as a pre-filter before advanced conditions
- Built-in examples and help in the filter editor

### Real-time monitoring

- Watch streams in real time with a configurable polling interval
- Display new messages automatically as they arrive
- Efficient polling through Redis `XREAD`

### Connection management

- Multiple connection profiles with Dev, Test, and Prod labels
- Color-coded environments
- SSH tunnels with password or private-key authentication
- Redis and SSH passwords stored through VS Code SecretStorage
- Connection testing before save
- Drag-and-drop profile reordering

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
4. Test and save the connection.
5. Fetch the available streams, select one or more, configure the search, and select **Find** or **Watch**.

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

## Connection URL format

The extension accepts standard Redis URLs:

```text
redis://[[username:]password@]host[:port][/db]
rediss://[[username:]password@]host[:port][/db]
```

The default Redis port is `6379`. Use `rediss://` for TLS-encrypted connections.

For a server accessible only through SSH, enable **SSH Tunnel** in the connection
editor, enter the bastion details, and choose password or private-key
authentication. The extension creates a local tunnel for the Redis connection.

## Development

### Prerequisites

- Node.js 20 or later
- VS Code 1.85 or later

### Setup and verification

```bash
git clone https://github.com/cristianofx/agmen-stream-inspector-vscode-oss.git
cd agmen-stream-inspector-vscode-oss
npm ci
npm run build
npm test
```

Press `F5` in VS Code to open an Extension Development Host. To produce an
installable extension package, run:

```bash
npm run package
```

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

## License

Agmen Stream Inspector is available under the MIT License. See the `LICENSE`
file included with the source and extension package.
