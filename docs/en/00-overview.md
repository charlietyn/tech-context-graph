# Overview

[Documentation index](README.md) · [Next: First run](01-first-run.md) · [Español](../es/00-vision-general.md)

## The central idea

Tech Context Graph is a local control plane for software knowledge graphs. It helps a person maintain a reviewed catalog of repositories and decide when Graphify should build or update each repository's graph.

Its value is easiest to understand as a sequence:

```text
unstructured repository folders
  -> evidence-based discovery
  -> human review
  -> accepted catalog
  -> Graphify inspection
  -> freshness-aware graph
  -> project-grounded questions
```

The project does not replace Graphify. Graphify performs extraction, graph construction, traversal, visualization, and optional MCP serving. Tech Context Graph supplies the operational discipline around multiple repositories: explicit paths, approval, state, history, logs, and repeatable actions.

## Why an AI benefits from a graph

Large language models reason from the context they receive. When the context is a random collection of files, the model must spend effort discovering structure before it can solve the task. It can also miss relationships that are obvious only when several files are considered together.

A graph provides a compact map:

- nodes identify relevant entities;
- edges record relationships;
- communities group related areas;
- source locations connect an answer back to evidence;
- graph state indicates whether the map is current.

The graph does not make the model infallible. It reduces avoidable uncertainty and gives the model a better starting point.

## Complete beginner example

Suppose Ana joins a team that maintains an online store. She receives a bug report: cancelled orders still trigger a shipment notification.

Without project context, Ana might search for `cancel order notification bug` and receive generic advice. With the graph, she can ask:

```text
Find a path from CancelOrderHandler to ShipmentNotificationPublisher.
```

The graph may reveal:

```text
CancelOrderHandler
  -> OrderService.cancel()
  -> OrderCancelledEvent
  -> EventBus
  -> ShipmentNotificationSubscriber
  -> ShipmentNotificationPublisher
```

Ana now has a testable hypothesis: the subscriber may not filter cancelled orders correctly. She still reads the source and runs tests, but she starts in the right neighborhood.

## Four different kinds of state

Beginners often combine concepts that the system deliberately separates:

1. **Filesystem state:** does the repository folder exist?
2. **Catalog state:** was the repository merely detected, or did a person accept it?
3. **Inspection state:** was a graph built successfully, and is it current?
4. **Knowledge quality:** does the graph contain enough evidence to answer a particular question?

A repository can be accepted but never inspected. A graph can exist but be stale. A ready graph can still lack a relationship that the extractor could not prove. These distinctions prevent false confidence.

## Design principles

- **No guessed personal paths.** Every workspace and search root is explicitly selected.
- **Detection is a proposal.** A filesystem scan never silently becomes approval.
- **Evidence beats folder names.** Recognized files and dependencies support technology classification.
- **Catalog state and graph state are independent.** Operational truth remains visible.
- **Human decisions are reversible.** Removing a repository from the active catalog does not delete its source.
- **The source remains authoritative.** A graph is an index, not a replacement for code and tests.
- **Presentation is separated from services.** The CLI can evolve without embedding application logic in prompts.

## When this project is useful

Tech Context Graph is a good fit when you have several local repositories, need repeatable graph builds, want to know which graphs are stale, or want AI tools to query project-specific structure.

It may be excessive for a single tiny repository that can be understood in minutes. Good engineering includes knowing when not to add infrastructure.

Next: [run the application for the first time](01-first-run.md).
