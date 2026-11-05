# CONTRACT-002 — Versioned technology knowledge (v1)

This is a **TCG producer-side, read-only CLI**. PCX retains ownership of authorization, requirements, agents, QA, Git delivery, and business approvals.

## Usage

    tcg technology:query --workspace "/workspaces/tech" --technology nestjs --version 10 --action query --question "Where is DTO validation implemented?" --json
    tcg technology:query --workspace "/workspaces/tech" --technology nestjs --version 10 --action path --question "Node A" --to "Node B"

Prerequisites: existing TCG workspace; exactly one approved and version-matched **core** repository; READY inspection with publication pointer schema 2; installed Graphify executable.

## Protocol and exit statuses

- Always one JSON object on STDOUT: TechnologyContextResultV1, schemaVersion "1.0", status READY/STALE/MISSING/FAILED, sourceRefs, matches, warnings, durations, typed error.
- Exit status: 0 READY, 3 STALE, 4 MISSING, 2 FAILED.
- The --version argument is the **technology core version** (e.g. 10 or 10.4), not the protocol or Graphify version.
- --revision pins graph SHA-256 (64 lowercase hexadecimal characters). No fallback on revision mismatch.
- --max-results accepts 1..20; free-form Graphify output is currently one INDEX match, capped at 64 KiB and untrusted. No imaginary file/line citations.

## Provenance and trust

READY carries repositoryId, repositoryKey, repositoryCommit (null for a non-Git source), sourceFingerprint, graphDigestSha256, graphifyVersion, publishedAt and pointerInspectionId. Content digest and source fingerprint are verified before and after Graphify. No Git pulls, inspections, downloads, or aggregate-family fallbacks are triggered.

Only one approved core matching the requested version may be selected. Library compatibility and multi-core composition remain unimplemented until consumer-driven contract negotiation; do not infer package compatibility. TCG cannot authorize an agent, decide a business requirement or mark delivery as integrated.

Legacy interactive TUI graph queries record input/output only when graphify.query_log_disabled is explicitly false. Automated queryPublished never records the prompt or the output. Workspace access and consumer-side tenant ACLs are the caller's responsibility.

Manual registration for a versioned framework core:

    tcg project:add core-10 /path/to/framework --workspace /workspaces/tech --type technology --category backend --technology nestjs --kind core --technology-version 10.4.1

Then run `repository:inspect core-10` to publish the graph. The query interface does not automatically register or inspect sources.

A READY result additionally requires that the installed Graphify executable reports exactly the version recorded by the immutable publication; after a Graphify upgrade, rebuild the graph (STALE) instead of silently querying with incompatible semantics.

The v1 selector **does not implement semver ranges**: specify exact numeric major, major.minor, or full major.minor.patch prefix (e.g. `10`, `10.4`, `10.4.1`); `^10`, `~10` and `latest` are INVALID_INPUT. Unknown or ambiguous cores never fall back to a mixed aggregate.

TCG explicitly sets `GRAPHIFY_QUERY_LOG_DISABLE=1` for Graphify `query/explain/path` subprocesses. Upstream Graphify maintains a separate global query log otherwise; disabling TCG SQLite alone is insufficient. Local opt-in query history remains bounded and expiring in TCG SQLite only.

The branch also runs a **real** Linux Graphify integration job pinned to `graphifyy==0.9.102` (`scripts/smoke-graphify-real.cjs`), with a temporary TypeScript fixture, code-only extraction, READY query and STALE on source mutation. GitHub Actions evidence: [run 42034585042](https://github.com/charlietyn/tech-context-graph/actions/runs/42034585042).

For contract queries and inspections, the engine version is re-read from the actual Graphify executable on every execution (bypassing the interactive 60-second version cache); a graph built under another engine version returns STALE.
