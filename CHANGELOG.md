# Changelog

All notable changes to Tech Context Graph are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [4.0.0] - 2026-07-14

### Added

- Interactive, workspace-first CLI for managing local technology repositories.
- Explicit repository roots with add, scan, enable, disable, and remove operations.
- Human review states for detected repositories before Graphify inspection.
- SQLite-backed catalog, inspection history, and graph freshness tracking.
- Graphify inspection, query, explanation, and relationship-path workflows.
- Editable YAML configuration with JSON Schema validation.
- Technology catalog metadata for classifying repositories reliably.
- Native `doctor` and `project:add` commands.
- English and Spanish documentation, quick starts, and architecture diagrams.
- GitHub Actions checks on Linux and Windows.

### Safety

- Repository discovery never modifies or relocates source repositories.
- Detected repositories require explicit acceptance before inspection.
- Child processes use argument arrays without shell interpolation.
- Runtime state, generated graphs, local paths, and secrets are excluded from Git.
