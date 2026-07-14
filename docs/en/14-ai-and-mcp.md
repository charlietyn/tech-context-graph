# AI assistants and MCP

[Documentation index](README.md) · [Security](08-security.md) · [Español](../es/14-ia-y-mcp.md)

## Purpose

This chapter explains how a maintained software knowledge graph can improve an AI-assisted development workflow and how Graphify's optional Model Context Protocol support fits into the architecture.

Tech Context Graph does not currently implement an MCP server. It manages repositories and Graphify outputs. Graphify is the component that can expose graph operations through MCP when supported by the installed version.

## Why project context should come before generic advice

An AI assistant normally has several possible information sources:

1. the current prompt;
2. files attached or opened in the session;
3. project tools such as search or a knowledge graph;
4. general model knowledge;
5. external web sources.

For a project-specific question, the desirable order is usually local evidence first and general guidance second. The web is valuable for current framework documentation, security advisories, and standards. It is less authoritative about the private architecture of your application.

For example, the internet can explain the NestJS guard abstraction. Only your repository can show which guard protects `RefundController`, where its permissions originate, and which tests encode the expected behavior.

## Three integration levels

### Level 1: interactive graph questions

Use the Tech Context Graph UI to select an inspected project and run `Query`, `Explain`, or `Path`. This is the simplest workflow and requires no MCP client configuration.

### Level 2: agent-guided CLI queries

An agent with terminal access can run deterministic Graphify subcommands against an approved graph. This is useful in local development environments where commands are already governed by user permissions.

### Level 3: Graphify through MCP

MCP gives an AI client a structured tool interface. Instead of asking the model to remember a command syntax, the client can offer explicit graph operations with typed inputs and outputs.

The conceptual flow is:

```text
AI client
  -> MCP request
  -> Graphify MCP server
  -> maintained graph.json
  -> scoped nodes, edges, paths, and source locations
  -> AI explanation
```

Consult the installed Graphify CLI because MCP flags and client setup can evolve:

```bash
graphify --help
graphify <repository-path> --mcp
```

Do not describe `tcg` itself as an MCP server unless that capability is implemented in a future release.

## A good agent policy

Giving an agent a graph tool is useful; giving it a decision policy is better. A practical policy is:

```text
For questions about this codebase:
1. Query the project graph first.
2. Follow source locations for claims that affect code changes.
3. Read the relevant source and tests before editing.
4. Use official external documentation when the question concerns a current API or standard.
5. State clearly when the graph does not contain enough evidence.
```

This policy does not ban web research. It prevents generic research from silently replacing local evidence.

## Example questions by learning objective

### Orientation

```text
What are the central modules in this repository?
Which nodes bridge persistence and the CLI?
Explain RepositoryDiscoveryService.
```

### Change impact

```text
What depends on WorkspaceConfigService?
Which flows could be affected if repository classification changes?
Find paths from RepositoryStoreService to ConsoleUiService.
```

### Debugging

```text
Trace the inspection state from RUNNING to READY.
Where can a graph become marked as MISSING?
What code records a failed Graphify process?
```

### Onboarding

```text
Explain the difference between a workspace and a repository root.
How does a detected candidate become accepted?
Which files should I read to understand graph freshness?
```

## How to evaluate an AI answer

An answer is stronger when it:

- names concrete project symbols;
- explains the relationship between them;
- points to source locations;
- distinguishes extracted facts from inference;
- acknowledges stale or missing graph state;
- recommends reading or testing the affected code before a consequential change.

An answer is weaker when it sounds polished but could apply unchanged to any repository using the same framework.

## Freshness and invalidation

An MCP connection does not make stale data current. Before trusting a graph-backed answer:

1. check the repository's state in Tech Context Graph;
2. update a `STALE` graph;
3. investigate `FAILED` or `MISSING` states;
4. confirm that the relevant repository was accepted and inspected;
5. rebuild when extraction rules or ignored paths changed materially.

## Security model

A graph may disclose architecture even when source text is absent. Node labels, dependency edges, file paths, and community names can reveal sensitive design information.

Before enabling MCP:

- bind only to an approved local or protected transport;
- restrict which users and clients can connect;
- avoid exposing the endpoint directly to the public internet;
- review graph contents and ignored paths;
- treat query logs as potentially sensitive;
- rotate or remove access when team membership changes;
- follow the organization's source-code and data-handling policy.

## Limitations

- A graph reflects what extraction could observe, not every runtime behavior.
- Dynamic dispatch, reflection, generated code, and external services may be incomplete.
- An edge can support navigation without proving business correctness.
- MCP transports context; it does not validate the model's reasoning.
- Tests, source review, and runtime observation remain essential.

The best workflow combines graph navigation, direct source evidence, automated tests, and human judgment.
