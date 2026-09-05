# Advanced CLI automation

Use `--workspace` for deterministic automation. `--root` remains a deprecated compatibility alias. `TCG_WORKSPACE` can define the workspace for a session.

```bash
set TCG_WORKSPACE=D:\TCG\Catalog
tcg root:list --json
tcg repository:list --json
tcg repository:review --accept-all
tcg repository:set-source api D:\Repositories\platform\packages\api
tcg repository:inspect api shared-auth
tcg repository:inspect api shared-auth --pull
```

Use `repository:review --accept-all` to accept every candidate awaiting review at that moment. It cannot be combined with `--accept` or `--ignore`; if one acceptance fails, the others continue and the command exits with status `1`.

Use `repository:set-source <key> <folder>` when discovery found the repository container but its actual source code lives in a different folder. The folder must exist. The registered repository path and key remain unchanged; later fingerprints and Graphify inspections use the edited source folder.

Add `--pull` to execute `git pull --ff-only` in each distinct original repository folder before inspection. A failed pull skips Graphify for the affected entries and makes the command exit with status `1`. See [Git pull before graph inspection](15-git-pull-before-inspection.md) for detailed safety and multi-repository behavior.

Machine-readable commands return JSON when `--json` is available. Interactive confirmation is intentionally kept for destructive or expensive operations.
