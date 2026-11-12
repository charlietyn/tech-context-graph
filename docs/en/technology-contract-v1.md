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

READY carries repositoryId, repositoryKey, repositoryCommit, sourceFingerprint, graphDigestSha256, graphifyVersion, publishedAt and pointerInspectionId. Content digest and source fingerprint are verified before and after Graphify.

**READY is reproducible from its provenance (plan 28 C1, 2026-11-11).** A READY result always carries `freshnessCheckedAt` and, for every sourceRef, a non-null Git `repositoryCommit`. The technology source must be a Git repository whose worktree is clean within the registered source path (a monorepo member is judged on its own subtree):

| Source at query time | Status | Exit | Error code |
|---|---|---|---|
| Git, clean, fingerprint matches the publication | READY | 0 | — |
| Git, uncommitted or untracked changes that were already present at publication | STALE | 3 | SOURCE_CHANGED (commit, then re-inspect) |
| Git, changed since publication (new commit or edits) | STALE | 3 | STALE_GRAPH |
| Not a Git repository | FAILED | 2 | INTEGRITY_FAILED (no commit can vouch for the bytes) |

The JSON schema keeps `schemaVersion: "1.0"`: the rule only narrows what the producer emits, and every READY it can now produce was already valid for consumers of the previous 1.0 schema. No Git pulls, inspections, downloads, or aggregate-family fallbacks are triggered.

Only one approved core matching the requested version may be selected. Library compatibility and multi-core composition remain unimplemented until consumer-driven contract negotiation; do not infer package compatibility. TCG cannot authorize an agent, decide a business requirement or mark delivery as integrated.

Legacy interactive TUI graph queries record input/output only when graphify.query_log_disabled is explicitly false. Automated queryPublished never records the prompt or the output. Workspace access and consumer-side tenant ACLs are the caller's responsibility.

Manual registration for a versioned framework core:

    tcg project:add core-10 /path/to/framework --workspace /workspaces/tech --type technology --category backend --technology nestjs --kind core --technology-version 10.4.1

Then run `repository:inspect core-10` to publish the graph. The query interface does not automatically register or inspect sources.

A READY result additionally requires that the installed Graphify executable reports exactly the version recorded by the immutable publication; after a Graphify upgrade, rebuild the graph (STALE) instead of silently querying with incompatible semantics.

The v1 selector **does not implement semver ranges**: specify exact numeric major, major.minor, or full major.minor.patch prefix (e.g. `10`, `10.4`, `10.4.1`); `^10`, `~10` and `latest` are INVALID_INPUT. Unknown or ambiguous cores never fall back to a mixed aggregate.

TCG explicitly sets `GRAPHIFY_QUERY_LOG_DISABLE=1` for Graphify `query/explain/path` subprocesses. Upstream Graphify maintains a separate global query log otherwise; disabling TCG SQLite alone is insufficient. Local opt-in query history remains bounded and expiring in TCG SQLite only.

The real Graphify integration (`scripts/smoke-graphify-real.cjs`) drives the compiled CLI against temporary Git sources with code-only extraction: nestjs 10 and 11 cores side by side, query/explain/path READY, wrong major MISSING, pinned revision STALE, uncommitted source STALE, non-Git source FAILED, Graphify absent FAILED and a new commit after READY STALE. Every output is validated with Ajv against both schemas. The pin is `graphifyy==0.9.105` since 2026-11-11 (0.9.102 and 0.9.105 produce the same digest for the smoke graph); run it locally with `GRAPHIFY_BACKEND=none node scripts/smoke-graphify-real.cjs`.

For contract queries and inspections, the engine version is re-read from the actual Graphify executable on every execution (bypassing the interactive 60-second version cache); a graph built under another engine version returns STALE.

## Framework version mapping (plan 28 C2)

`--technology` is a TCG catalog id and `--version` the major (or prefix) of **that** technology's core. PCX derives the pair from DBIG C6 per profile: `framework` + `frameworkVersion` when the profile names a framework, otherwise the target id + `technologyVersion` when it is numeric. TCG never translates ids or versions; an unknown pair is MISSING/VERSION_MISMATCH.

| DBIG C6 target / profile | Ask TCG for | TCG core built (`scripts/technology-graph-targets.v1.json`) |
|---|---|---|
| vue `vue-spa-admin` (framework vite, frameworkVersion 8) | `--technology vite --version 8` | vite 8.3.7 |
| vue `vue-nuxt-*` (framework nuxt, frameworkVersion 4) | `--technology nuxt --version 4` | nuxt 4.6.4 |
| nestjs 11 | `--technology nestjs --version 11` | @nestjs/core 11.2.9 |
| laravel 12 / 13 | `--technology laravel --version 12` / `13` | laravel/framework 12.72.0 / 13.42.0 |
| springboot 3 | `--technology spring-boot --version 3` (id differs from the DBIG target) | spring-boot 3.5.16 |
| flutter 3 | `--technology flutter --version 3` | flutter 3.47.9 (`packages/flutter`) |
| react-native `expo` (emits Expo SDK 52) | `--technology expo --version 52` — C6 does not publish this number yet | expo 52.0.49 (`packages/`) |

Vite cores are registered explicitly (`project:add --technology vite --kind core`): a catalog profile for `vite` would reclassify every Vue SPA that has Vite as a devDependency.

## Concurrency and ambiguous names (2026-11-11)

- Contract reads do not take the workspace lock: they read the last persisted catalog and re-verify the publication from disk, so they work while TCG inspects another repository. A publication replaced between those two reads is STALE.
- When Graphify reports a node name as ambiguous, the result is FAILED `QUERY_FAILED` and `warnings` carries `AMBIGUOUS_NODE_CANDIDATES: <id>, <id>`; repeat the query with one of those ids.

## CONTRACT-003 — graph reference

    tcg technology:reference --workspace "/workspaces/tech" --technology nestjs --version 11 --json

Same checks and exit codes as `technology:query` (digest, pointer, fingerprint, clean commit, live Graphify version), but Graphify is not run. It prints one `TechnologyGraphReferenceV1` (`docs/contracts/technology-graph-reference.v1.schema.json`), the shape PCX stores and DBIG seals. See [technology-graph-reference-v1.md](technology-graph-reference-v1.md).
