# Graphify inspection

[Previous: Detection](04-detection-and-review.md) · [Index](README.md) · [Next: Project details](06-project-detail.md) · [Español](../es/05-inspeccion-graphify.md)

Only accepted repositories can be selected. The UI shows whether each graph is never built, running, ready, stale, failed or missing. Multi-selection supports searching by name, technology, category, state and path.

Graphify runs sequentially in this release to keep CPU, memory and logs predictable. Each execution records command, version, fingerprint, timestamps, graph location, node and edge counts, errors and log path.

`Update graph` reuses Graphify caches. `Fully rebuild graph` adds `--force` and should be reserved for legitimate full rebuilds.

## What inspection produces

A successful inspection creates Graphify artifacts below the repository's configured graph output. The central artifact is `graph.json`; reports and visualization files depend on the Graphify mode and version.

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
