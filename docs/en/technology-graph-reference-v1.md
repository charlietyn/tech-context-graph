# CONTRACT-003 — Technology graph reference (v1)

One versioned way for PCX and DBIG to point at a TCG technology graph. Schema:
[`docs/contracts/technology-graph-reference.v1.schema.json`](../contracts/technology-graph-reference.v1.schema.json).
Producer: `tcg technology:reference` or, in code, `technologyGraphReferenceFromResult()` over a CONTRACT-002 result
(`src/models/technology-graph-reference.ts`). Fixtures: `test/fixtures/contracts/technology-graph-reference/v1/`.

A reference is **technology context only**. It never approves business, authorizes a WorkUnit, starts an agent or
marks a delivery READY. A consumer that keeps a reference must re-verify it before relying on it again.

## Why

Before this contract the two consumers described the same thing with different, incompatible fields:

| | Digest | Digest format | Of which bytes | Source identity | When |
|---|---|---|---|---|---|
| DBIG `VerifiedTechGraphReference` 1.0 | `graphSha256` | `sha256:<hex>` | whatever `graph.json` DBIG found under `TECH_GRAPHS_ROOT/<id>` (often a family **aggregate**) | none | `generatedAt` (aggregate date or file mtime) |
| TCG CONTRACT-002 | `graphHash` | bare hex | the immutable **core publication** of one version | `repositoryCommit` + `sourceFingerprint` | `publishedAt`, `freshnessCheckedAt` |

The two digests are over different files and can never be compared. CONTRACT-003 fixes the artifact
(`graphArtifact: "core-publication"`), the digest format (`sha256:<hex>`, as DBIG already uses) and adds the
source identity DBIG lacked.

## Shape

```json
{
  "schema": "argens.technology-graph-reference",
  "schemaVersion": "1.0",
  "producer": "tech-context-graph",
  "status": "READY",
  "technology": "nestjs",
  "requestedVersion": "11",
  "resolvedVersion": "11.2.9",
  "graphArtifact": "core-publication",
  "graphSha256": "sha256:6afb34168b82e49e63eb8e877203d4cf8387322ba0161aa9bfb6e6c8fd9f8b16",
  "publishedAt": "2026-11-11T02:00:10.915Z",
  "inspectionId": "8e0b7acc-2fb2-49bc-971f-c6796ce0cff3",
  "graphifyVersion": "graphify 0.9.105",
  "repositoryKey": "nestjs-core-11",
  "repositoryCommit": "c6cf340d071f89305236a942a9cf3bf7707849fa",
  "sourceFingerprint": "git-v2:ff845eeebf14d817e77b5a191a9ccc6b33898c0d8e464a5273b2ac2661b83296",
  "freshnessCheckedAt": "2026-11-11T02:00:11.649Z"
}
```

(A real reference for NestJS v11.2.9 built from upstream tag `v11.2.9`.)

Rules enforced by the schema:

- `READY` ⇒ every identity field is present, `repositoryCommit` is a Git SHA, `sourceFingerprint` is `git-v2:`,
  and there is no `error`.
- Not `READY` ⇒ `error` is present and **no** `graphSha256` or `repositoryCommit`: a consumer can never seal the
  digest of something TCG did not verify.
- `additionalProperties: false`; `schemaVersion` other than `1.0` is rejected.

## Field correspondence

| CONTRACT-003 | CONTRACT-002 (`technology:query`) | DBIG `VerifiedTechGraphReference` |
|---|---|---|
| `graphSha256` | `"sha256:" + graphHash` (= `sourceRefs[0].graphDigestSha256`) | `graphSha256` — only if DBIG copies it from TCG |
| `publishedAt` | `sourceRefs[0].publishedAt` (= `inspectionAt`) | `generatedAt` |
| `inspectionId` | `sourceRefs[0].pointerInspectionId` | — |
| `repositoryCommit`, `sourceFingerprint`, `repositoryKey` | `sourceRefs[0].*` | — (missing today) |
| `resolvedVersion`, `freshnessCheckedAt`, `graphifyVersion` | same names | — |
| `technology` | `technology` (TCG id, e.g. `spring-boot`) | `target` is the DBIG id (e.g. `springboot`) — not the same namespace |

`bareGraphDigest("sha256:<hex>")` gives the bare hex expected by `technology:query --revision`.

## How each consumer uses it

**PCX (TaskContextPack).** After `admitTechnologyContext` returns `USABLE`, store
`technologyGraphReferenceFromResult(result)` (or the equivalent projection) instead of loose `graphHash` fields. To
replay a pack, call `technology:query ... --revision <bareGraphDigest(graphSha256)>`: a different publication is
`STALE`, never silently newer.

**DBIG (architecture.lock).** Call `tcg technology:reference --workspace <trusted> --technology <tcg id> --version
<major> --json` at generation time and seal the returned object verbatim when `status` is `READY`; seal nothing (or a
non-READY reference, which carries no digest) otherwise. To verify a lock later, call the same command with
`--revision <bare hex>`; `READY` means the sealed graph is still the verified latest publication. DBIG should stop
hashing `graph.json` files itself for this purpose: those digests are of aggregates and are not TCG publications.

Neither consumer imports TCG code; both read the JSON over the CLI with argv only (no shell), a timeout and an
output limit.
