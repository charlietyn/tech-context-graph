# Advanced CLI automation

Use `--workspace` for deterministic automation. `--root` remains a deprecated compatibility alias. `TCG_WORKSPACE` can define the workspace for a session.

```bash
set TCG_WORKSPACE=D:\TCG\Catalog
tcg root:list --json
tcg repository:list --json
tcg repository:inspect api shared-auth
```

Machine-readable commands return JSON when `--json` is available. Interactive confirmation is intentionally kept for destructive or expensive operations.
