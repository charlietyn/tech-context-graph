# Updating repositories and graphs

[Index](README.md) ? [Inspection](05-graphify-inspection.md) ? [Espa?ol](../es/15-git-pull-antes-inspeccion.md)

The **Pull latest code + update graphs** menu and CLI use the same coordinator:

```powershell
tcg repository:inspect all --pull --workspace "D:\TCG\Catalog"
tcg repository:inspect api auth --pull --workspace "D:\TCG\Catalog"
```

Without `--pull`, no Git remote is contacted. `--force` rebuilds; `--no-cluster` skips community analysis.

## Execution

- A log and workspace lock are created before Git begins.
- Entries are grouped by actual Git root. Monorepo subfolders share one pull; linked worktrees sharing a Git directory are serialized.
- Git uses `pull --ff-only --no-rebase`. Set `TCG_GIT_CONCURRENCY` to an integer from 1 to 8 (default 3).
- Matching source fingerprint, extraction configuration, tool version and published graph digest return `UNCHANGED` without extraction.
- AST-only Graphify extractions run sequentially. Incremental manifests and sidecars are copied to a new generation when the installed tool advertises incremental `extract --out` support; otherwise extraction is full.
- Each technology aggregate is checked once at the end. Matching input and output digests skip `merge-graphs`. Retrying an aggregate does not require re-extracting current members.

Git commands time out after 120 seconds; network errors are retried once. Extraction and aggregation time out after 30 minutes. Ctrl+C terminates children and settles cancellation. An independent repository failure does not stop the batch.

## Local changes and Git ownership

Catalog-selected roots receive command-scoped `-c safe.directory=<real-root>` trust. No global Git configuration or wildcard trust is written. Git errors are classified instead of falling back to a filesystem scan.

Local artifacts are ignored through `git rev-parse --git-path info/exclude`, including linked worktrees. Tracked generated files remain tracked and their edits block pulling.

Only the exact legacy TCG `.gitignore` footer (`# Tech Context Graph local state`, `.tcg/logs/`, `.tcg/*.tmp`) is migrated. The remaining content must match HEAD and the file must have no staged changes. TCG backs it up under `info/tcg-backups`, transfers rules to local excludes and restores only the verified `.gitignore` index entry using Git checkout conversion. User edits, mixed changes and ambiguous standalone ignore rules are preserved with a diagnostic. No destructive reset, clean, blanket stash, automatic merge or rebase is performed.

## Publication and recovery

Extractions write `<output>/.generations/<id>/graphify-out/`. After graph validation and a second source-fingerprint check, `tcg-current.json` atomically publishes the generation. It records run ID, source fingerprint, configuration and graph digest. SQLite stores the concrete graph path.

Previous and failed generations are retained; there is no automatic retention policy yet. Legacy outputs without publication metadata require one extraction to establish provenance. Reconciliation recovers only a matching run ID, source fingerprint and content digest. An old valid graph never proves that a newer failed run succeeded.

Batch results distinguish `UPDATED`, `UNCHANGED`, `BLOCKED`, `FAILED` and `CANCELLED`, with separate Git and graph outcomes. `PRESERVED` means a prior graph remains available. Aggregate failures are reported separately. Batch duration is wall time; per-entry timings can overlap due to concurrent and shared Git pulls.

Logs start before Git at `.tcg/logs/update-<id>.log`, with a JSON report and separate inspection/verification logs. Diagnoses distinguish ownership, permissions, authentication, network, timeout, divergence, missing upstream and detached HEAD.

## Startup and workspace ownership

The first menu uses the stored catalog. Freshness is checked asynchronously with at most two workers and a 30-second session cache. Verification timestamps and errors are shown separately; until checked, graph state is explicitly the stored state. Graphify availability/version has a 60-second cache invalidated by PATH changes. Background checks never print into active prompts.

Because SQLite is exported from an in-memory database, one controller owns the workspace at a time. A database lock lasts until session close, preventing stale processes from overwriting each other's state. Dead-owner locks are recovered; corrupt locks produce an actionable error.

`.tcg/logs/startup.jsonl` records time to the first menu and elapsed Node process time.

## Reproducible validation

```powershell
npm run build
node scripts/verify-update.cjs
npm test
npm run lint:types
```

The smoke test uses real Graphify and temporary local repositories/remotes. It verifies monorepo deduplication, zero extractions/merges on an unchanged retry and incremental processing of one changed source. No production repositories or LLM API are involved.

Git subprocesses launched by Graphify receive the same exception through process-local environment configuration. See [Git runtime configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-GITCONFIGCOUNT).
