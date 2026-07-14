# Repository search folders

[Previous: Workspaces](02-workspaces.md) · [Index](README.md) · [Next: Detection](04-detection-and-review.md) · [Español](../es/03-raices.md)

A repository root is a folder tree that may contain many repositories. It is not copied into the workspace. Multiple roots are supported because organizations often separate backend, frontend, mobile, libraries and infrastructure.

Each root stores: path, enabled flag, maximum depth, minimum confidence, role and last scan time. CLI changes are synchronized to YAML and SQLite.

Commands:

```bash
tcg root:add <path> --workspace <workspace>
tcg root:list --workspace <workspace>
tcg root:scan <id> --workspace <workspace>
tcg root:disable <id>
tcg root:remove <id>
```

## Choosing a good root

Choose the narrowest stable folder that contains the repositories you intend to manage. A root that is too broad wastes scan time and may discover archives, examples, or unrelated personal work. A root that is too narrow forces unnecessary configuration.

Example:

```text
/engineering                         too broad if it contains backups and exports
/engineering/repositories            usually appropriate
/engineering/repositories/api-one    too narrow if twenty sibling repositories matter
```

## Depth and confidence

Maximum depth limits how far discovery descends. Minimum confidence controls how much evidence a technology match requires. Increasing depth expands cost. Lowering confidence increases false positives. Change one variable at a time and review the candidates before accepting them.

## Safe removal

Disabling a root prevents future scans. Removing it deletes the root configuration but preserves repository history and graph artifacts. This lets an operator correct configuration without destroying evidence.
