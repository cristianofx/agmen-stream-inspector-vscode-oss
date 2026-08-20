# Changelog

## [Unreleased]

## [1.2.1] - 2026-08-20

### Added

- Added SSH host-key verification with TOFU approval, SHA-256 pinning, and actionable mismatch errors.
- Added bounded replay with cancellation and partial-delivery reporting.
- Added a Reset Filters control for query, advanced-filter, and stream-filter criteria.

### Changed

- Advanced filters now combine with the basic field filter using AND semantics.
- Bundled JavaScript runtime dependencies while keeping `node_modules` out of the VSIX.
- Kept optional SSH native accelerators external so the extension builds consistently across operating systems.
- Added global result retention limits and retries for transient watch polling failures.
- Preserved displayed results when Watch is canceled; results are cleared only for a new Find or Watch.

### Fixed

- Migrated credential-bearing Redis URLs out of persisted profile state and handled cleared secrets correctly.
- Restored reliable connection-test error reporting and the default Redis URL for new connections.
- Fixed sidebar rendering and result-row theming in the webview.

## [1.2.0] - 2026-08-19

### Changed

- Made every feature available without accounts, activation, or subscriptions.
- Released the project under the MIT License.

### Removed

- Removed paid-tier limits, feature gates, upgrade controls, checkout integrations,
  entitlement checks, and related test-only modes.

## [1.1.1] - 2026-02-25

### Added

- Advanced conditional search with AND/OR logic and nested groups
- Equals, Not Equals, Contains, and Exists operators
- In-app examples for building advanced filters
- A pre-filled `redis://localhost:6379` URL for new connections

### Fixed

- Conditional filters not being passed through search options
- JSON double-encoding handling in the conditional matcher

## [1.0.0] - Initial Release

### Features

- Search and filter Redis Stream messages
- JSON path traversal
- Real-time Watch mode
- Multiple connection profiles with environment labels
- SSH tunnel support
- JSON and CSV export
- Message replay to another Redis server
- Pretty-printed JSON viewer with find-in-message
