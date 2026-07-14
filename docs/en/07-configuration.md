# Configuration model

Editable intent lives in `tech-context-graph.yaml`. Operational history lives in `.tcg/state.sqlite`. Workspace discovery lives in the OS-specific global registry. Workspace identity lives in `tech-context-graph.workspace.json`.

Run:

```bash
tcg config:paths
tcg config:show
```

The example and JSON Schema are in `config/`. See the root-level configuration reference for every property.

## Runtime directories that should not be committed

| Directory | Purpose |
|---|---|
| `context-pack/` | Generated repository-discovery reports and context artifacts |
| `tech-graphify-out/` | Managed Graphify outputs |
| `graphify-out/` | Graphify output for this source repository |
| `.tcg/` | SQLite operational state and logs |

These directories describe a particular local workspace and can contain sensitive or generated information. The source repository ignores them. Stable user documentation belongs under `docs/`.

The root `internal-notes/` folder is also ignored. It is a local holding area for completed migration plans, design evaluations, and other notes that should not be part of the public product documentation.
