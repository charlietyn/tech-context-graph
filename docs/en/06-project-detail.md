# Inspected project details

[Previous: Inspection](05-graphify-inspection.md) · [Index](README.md) · [Next: Configuration](07-configuration.md) · [Español](../es/06-detalle-proyecto.md)

After a successful or attempted inspection, a repository appears in the project detail list. Actions include update, full rebuild, natural-language query, node explanation, shortest path, file locations and removal from the active catalog.

Queries use the repository-specific `graph.json`; the unified graph is not used automatically. This keeps answers scoped and reduces irrelevant context.

## Choosing the right operation

| Operation | Use it when |
|---|---|
| Query | You have a natural-language question about structure or behavior |
| Explain | You need focused context for one symbol or concept |
| Path | You suspect two concepts are connected and want the shortest known route |
| Update | Source changed and the existing graph can be incrementally refreshed |
| Rebuild | You intentionally need a clean extraction |

## Better and worse questions

Prefer bounded relationship questions:

```text
How does a repository candidate become accepted?
What calls GraphifyCliService.inspect()?
Find a path from RepositoryRootService to RepositoryStoreService.
```

Avoid questions with no success criterion, such as “Tell me everything.” Start narrow, inspect the returned source locations, and deepen the query iteratively.
