# Changelog

All notable changes to Tech Context Graph are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Selectable **Pull latest code + update graph** action in the interactive project-detail workflow.
- Batch **Pull latest code + update graphs** main-menu action with select-all or searchable multi-selection, failure isolation and shared-path pull deduplication.
- `repository:review --accept-all` for accepting every currently detected candidate with per-item failure reporting.
- `--pull` option for `repository:inspect`, including multi-repository processing and pull deduplication for entries that share an original path.
- `RepositoryGitService` with live Git-root, branch, working-tree, upstream and commit validation.
- Separate editable source-code folders through `repository:set-source`, preserving the original repository path used by Git.
- Detailed English and Spanish documentation for source-folder mapping and pull-before-inspection workflows.

### Safety

- Pulls use `git pull --ff-only` and never perform automatic merges, resets, stashes, checkouts or conflict resolution.
- Dirty working trees, detached `HEAD`, missing upstream branches, Git authentication/network errors and divergent histories stop the graph update before Graphify starts.
- Git runs without shell interpolation or interactive credential prompts.

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
