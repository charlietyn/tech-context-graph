# Workspace management

[Previous: First run](01-first-run.md) · [Index](README.md) · [Next: Repository roots](03-repository-roots.md) · [Español](../es/02-workspaces.md)

A workspace is the control folder. It contains `tech-context-graph.workspace.json`, `tech-context-graph.yaml`, `.tcg/state.sqlite`, `.tcg/logs`, `tech-graphify-out`, and `context-pack`.

The global workspace registry stores references selected by the user. It allows `tcg` to list, switch and reopen workspaces. Removing an entry from the registry never deletes the workspace files.

Commands:

```bash
tcg workspace:list
tcg workspace:create
tcg workspace:use <path>
tcg workspace:remove <id-or-path>
```

## Workspace versus repository

This distinction is foundational:

| Workspace | Repository |
|---|---|
| Stores catalog and operational state | Stores source code |
| May manage many repositories | Represents one project or technology member |
| Contains graph outputs and logs | Is inspected by Graphify |
| Can remain stable while repositories move | Evolves through commits and branches |

Removing a workspace reference affects the registry, not the directory. Removing a repository from the active catalog affects management state, not Git files. Deletion is deliberately not implied by administrative actions.

## Multiple workspaces

Separate workspaces are useful when repository groups have different owners, privacy rules, clients, or retention policies. Avoid creating one workspace per repository unless those isolation requirements exist; a workspace is designed to manage a catalog.

## Recovery principle

The marker identifies a workspace, YAML captures editable intent, and SQLite stores runtime history. Back up all three when operational history matters. Use `tcg config:paths` to locate them rather than relying on memory.
