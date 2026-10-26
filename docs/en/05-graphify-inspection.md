# Graphify inspection

[Previous: Detection](04-detection-and-review.md) · [Index](README.md) · [Next: Project details](06-project-detail.md) · [Español](../es/05-inspeccion-graphify.md)

Only accepted repositories can be selected. The UI shows whether each graph is never built, running, ready, stale, failed or missing. Multi-selection supports searching by name, technology, category, state and path.

Graphify runs sequentially in this release to keep CPU, memory and logs predictable. Each execution records command, version, fingerprint, timestamps, graph location, node and edge counts, errors and log path.

`Update graph` reuses Graphify caches. `Fully rebuild graph` adds `--force` and should be reserved for legitimate full rebuilds.

`Pull latest code + update graphs` lets you search for and select several repositories from the main menu; it runs `git pull --ff-only` in each original repository folder before Graphify. If one pull fails, that graph is skipped while the remaining repositories continue. Normal **Update graph** remains offline with respect to Git remotes. See [Git pull before graph inspection](15-git-pull-before-inspection.md) for validation order, safety rules and CLI automation.

## What inspection produces

A successful inspection creates Graphify artifacts below the repository's configured graph output. The central artifact is `graph.json`; reports and visualization files depend on the Graphify mode and version.

Default outputs always live under `tech-graphify-out/technologies/`: recognized technologies use `<technology>/<repository-key>/`, and unrecognized repositories use `<repository-key>/`, regardless of their catalog role. For example, Go and driver-js can use `tech-graphify-out/technologies/go/` and `tech-graphify-out/technologies/driver-js/` while classified as `unknown`. Graphify may create its own `graphify-out/graph.json` inside each output directory.

On opening an older workspace, the catalog migrates flat default outputs (`tech-graphify-out/<repository-key>/`) and their inspection history. Folders already moved to the destination are adopted without rebuilding the graph. If both locations exist, migration stops with their paths so they can be reconciled without overwriting either copy. Explicit custom output paths are preserved. Historical command and log text retains the original execution paths; the graph of Tech Context Graph itself stays in the workspace's separate `graphify-out/`.

Tech Context Graph records counts and locations, but counts are diagnostic rather than a quality score. A graph with many nodes is not automatically better than a smaller graph that answers the intended questions.

## Update versus rebuild

Use **Update graph** after normal source changes. It is faster because Graphify can reuse extraction state. Use **Fully rebuild graph** when caches are suspected to be inconsistent, extraction configuration changed substantially, or a clean baseline is explicitly required.

## Failure workflow

When inspection fails:

1. read the displayed error and `.tcg/logs`;
2. run `tcg doctor`;
3. verify repository permissions and Graphify availability;
4. correct the cause;
5. retry an update before forcing a rebuild;
6. run reconciliation if a process was interrupted.

Never interpret a `FAILED` graph as usable current context.

New inspections publish validated generations through `tcg-current.json`; SQLite stores their concrete paths. Unchanged updates skip extraction. A failed run preserves the previous valid graph. See [update and recovery behavior](15-git-pull-before-inspection.md).
