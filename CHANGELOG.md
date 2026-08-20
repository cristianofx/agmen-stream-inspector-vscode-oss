# Changelog

## [Unreleased]

### Changed

- Advanced filters now combine with the basic field filter using AND semantics.

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
