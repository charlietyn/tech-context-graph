# Security

Tech Context Graph executes Graphify with argument arrays and `shell: false`. It does not interpolate repository paths into a shell command. Repository roots are validated before saving. The scanner avoids symbolic-link traversal and ignores common dependency/build folders.

Code-only repository inspections remain local to Graphify's AST pipeline. Documentation workflows may use semantic providers and must respect `allow_external_llm` and sensitive-source gates.

Graphs can contain sensitive architectural knowledge. Store workspaces in approved locations and do not expose Graphify MCP endpoints without authentication and network controls.
