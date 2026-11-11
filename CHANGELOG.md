# Changelog

All notable changes to Tech Context Graph are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `technology:reference` (CONTRACT-003 `TechnologyGraphReferenceV1`): one versioned graph reference for PCX and DBIG, with JSON schema, fixtures and EN/ES documentation. Same verification and exit codes as `technology:query`, without running Graphify.
- `scripts/build-technology-graphs.cjs` and `scripts/technology-graph-targets.v1.json`: build and certify commit-pinned core graphs for the versions DBIG announces (vite 8, nuxt 4, nestjs 11, laravel 12/13, spring-boot 3, flutter 3, expo 52).
- Real Graphify smoke now drives the compiled CLI: nestjs 10 and 11 side by side, query/explain/path, every non-READY path with its exit code, and Ajv validation of every output.

### Changed

- CONTRACT-002 READY now requires a clean Git commit for the technology source (plan 28 C1): non-Git sources are `FAILED/INTEGRITY_FAILED`, sources with uncommitted changes are `STALE/SOURCE_CHANGED`. The schema stays `1.0` because it only narrows producer output.
- A workspace locked by another TCG operation is reported as a retryable `QUERY_FAILED`.
- Graphify pin for the real integration is `graphifyy==0.9.105`. GitHub workflows run only on manual dispatch.

- Selectable **Pull latest code + update graph** action in the interactive project-detail workflow.
- Batch **Pull latest code + update graphs** main-menu action with select-all or searchable multi-selection, failure isolation and shared-path pull deduplication.
- `repository:review --accept-all` for accepting every currently detected candidate with per-item failure reporting.
- `--pull` option for `repository:inspect`, including multi-repository processing and pull deduplication for entries that share an original path.
- `RepositoryGitService` with live Git-root, branch, working-tree, upstream and commit validation.
- Separate editable source-code folders through `repository:set-source`, preserving the original repository path used by Git.
- Detailed English and Spanish documentation for source-folder mapping and pull-before-inspection workflows.
- Automatic retry with `--max-workers 2` when a parallel Graphify extraction runs out of memory.
- `SKIPPED` update status for repositories without code symbols, which no longer fail the batch.
- `**/testdata/` in the common ignore profile, which re-extracts repositories on their next update.

### Fixed

- `project:add --json` reported the detected version instead of the explicit `--technology-version`/`--package-version` it stored.
- `repository:inspect --no-cluster` now reaches the coordinator; it was silently ignored.
- `project:discover --apply`, `project:refresh` and `project:add` now accept the repository in the SQLite catalog instead of leaving it `DETECTED` and impossible to inspect. Scans never revive a repository you ignored; `project:add` on that explicit path does.
- `repository:review --accept/--ignore` now organizes graph folders, restores the prior status on failure, and reports unknown IDs with exit status `1` instead of counting them as accepted.
- `npm run dev` compiles with `tsc` and runs `dist/main.js`; under `tsx` dependency injection failed because decorator metadata was not emitted.

### Safety

- Pulls try `git pull --ff-only` first and never perform automatic merges, stashes, cleans, hard resets or conflict resolution.
- **Diverged branches change Git history automatically.** TCG first creates a backup ref under `refs/tcg/backups/`. Local commits that only edit `.gitignore` are replaced by the upstream with `git reset --keep`, keeping their rules in `.git/info/exclude`. Any other local commits are rebased with `git rebase --no-autostash`; a conflict aborts the rebase, leaves the branch unchanged and reports `DIVERGED`.
- When deleted tracked files are the only local change, they are restored with `git restore --worktree` before pulling.
- Other tracked changes, detached `HEAD`, missing upstream branches, Git authentication/network errors and unresolved divergence stop the graph update before Graphify starts. Untracked files are not checked; Git itself refuses to overwrite them.
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
