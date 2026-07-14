# Diagrams

The diagrams are provided in two languages:

```text
diagrams/en
diagrams/es
```

Each diagram is supplied as:

- `.dot`: editable Graphviz source.
- `.svg`: scalable documentation format.

PNG files are generated only when preparing external documents and are not kept
in the repository. This avoids storing two rendered copies of the same diagram.

Example regeneration:

```bash
dot -Tsvg diagrams/en/01-first-run-workspace-manager.dot -o diagrams/en/01-first-run-workspace-manager.svg
dot -Tpng -Gdpi=180 diagrams/en/01-first-run-workspace-manager.dot -o diagrams/en/01-first-run-workspace-manager.png
```

Included flows:

1. First-run workspace manager.
2. Workspace versus repository roots.
3. No path assumptions.
4. Candidate review lifecycle.
5. Graph state lifecycle.
6. Configuration and operational state.
7. CLI-to-NestJS evolution.
8. End-to-end beginner workflow.

## Browse the diagrams

| Concept | English | Español |
|---|---|---|
| First-run workspace manager | [SVG](en/01-first-run-workspace-manager.svg) | [SVG](es/01-first-run-workspace-manager.svg) |
| Workspace vs. repository roots | [SVG](en/02-workspace-vs-repository-roots.svg) | [SVG](es/02-workspace-vs-repository-roots.svg) |
| Explicit path model | [SVG](en/03-no-path-assumptions.svg) | [SVG](es/03-no-path-assumptions.svg) |
| Candidate review lifecycle | [SVG](en/04-candidate-review-lifecycle.svg) | [SVG](es/04-candidate-review-lifecycle.svg) |
| Graph state lifecycle | [SVG](en/05-graph-state-lifecycle.svg) | [SVG](es/05-graph-state-lifecycle.svg) |
| Configuration and state | [SVG](en/06-configuration-and-state.svg) | [SVG](es/06-configuration-and-state.svg) |
| CLI architecture | [SVG](en/07-cli-to-nestjs.svg) | [SVG](es/07-cli-to-nestjs.svg) |
| End-to-end beginner flow | [SVG](en/08-end-to-end-beginner-flow.svg) | [SVG](es/08-end-to-end-beginner-flow.svg) |
