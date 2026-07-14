# Detection and human review

[Previous: Repository roots](03-repository-roots.md) · [Index](README.md) · [Next: Inspection](05-graphify-inspection.md) · [Español](../es/04-deteccion-revision.md)

Technology detection uses files and dependencies as evidence. Folder names can provide context but are never enough by themselves. New discoveries enter the catalog as `DETECTED` and are disabled for inspection.

The review screen provides searchable multi-selection. Accepted items become `ACCEPTED`; unselected items remain available for later review. Ignored or rejected items are preserved for audit and can be reconsidered.

This two-step model prevents example folders, generated fixtures, archived copies and false positives from being inspected accidentally.

## Evidence and scores

Profiles in `config/technology-catalog.yaml` define recognizable files, dependency names, text markers, categories, and ignore profiles. Strong dependency evidence receives more weight than a generic file. A plain `package.json`, for example, can identify a Node.js repository but does not prove that it is React or NestJS.

Git repositories with insufficient technology evidence may appear as `Unclassified`. Their folder key is shown so a person can identify them, but `unknown` remains the internal technology value until classification.

```bash
tcg repository:classify <key> \
  --technology nestjs \
  --technology-label "NestJS" \
  --category backend
```

## Review questions

Before accepting a candidate, ask:

- Is this the canonical repository or an archived copy?
- Does the detected technology match the dependency evidence?
- Does the category reflect how the organization uses it?
- Should generated examples or fixtures be excluded?
- Is the repository permitted to produce a knowledge graph?

Review is a governance boundary, not an inconvenience.
