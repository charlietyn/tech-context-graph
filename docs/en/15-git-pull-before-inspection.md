# Git pull before graph inspection

[Index](README.md) · [Graphify inspection](05-graphify-inspection.md) · [Advanced CLI](10-advanced-cli.md) · [Español](../es/15-git-pull-antes-inspeccion.md)

Tech Context Graph can optionally update a repository from its configured upstream branch immediately before updating its graph. This operation is opt-in: a normal graph update never contacts a Git remote.

## Repository path versus source folder

The catalog keeps two paths with different responsibilities:

| Value | Purpose |
|---|---|
| `repository.path` | Original repository location detected or registered in the catalog. Git commands run here. |
| `repository.sourcePath` | Source-code folder selected for AST extraction. Graphify runs here. |

They are often identical. In a monorepo, however, the original path may be `D:\Repositories\platform` while the Graphify source folder is `D:\Repositories\platform\packages\api`. The pull updates the whole Git repository first; Graphify then inspects only the configured source folder.

## Interactive workflow

To update several repositories:

1. Start `tcg` and choose **Pull latest code + update graphs** from the main menu.
2. Choose **All accepted repositories** to select everything, or **Choose one or more with search** for manual selection.
3. For manual selection, search for repositories and mark one or more with the Space key.
4. Review the list and confirm the selection.
5. Tech Context Graph runs Git and Graphify sequentially and displays a summary of both results.

You can also update one repository from **Project details and source folders** → repository → **Pull latest code + update graph**.

The existing **Update graph** action remains local-only and does not execute Git.

## CLI workflow

Pull and inspect one repository:

```bash
tcg repository:inspect api --pull --workspace "D:\TCG\Catalog"
```

Pull and inspect several catalog entries:

```bash
tcg repository:inspect api shared-auth billing --pull --workspace "D:\TCG\Catalog"
```

The option can be combined with a full Graphify rebuild, although normal updates should remain the default:

```bash
tcg repository:inspect api --pull --force --workspace "D:\TCG\Catalog"
```

Without `--pull`, `repository:inspect` behaves exactly as before.

## Safety checks and execution order

For every distinct original repository path, Tech Context Graph performs these steps:

1. Verify that the original folder exists and is a directory.
2. Ask Git for the actual repository root.
3. Require an attached branch; detached `HEAD` is rejected.
4. Require a completely clean working tree, including untracked files.
5. Require an upstream branch for the current branch.
6. Record the current commit.
7. Run `git pull --ff-only`.
8. Record the resulting commit and report whether it changed.
9. Start Graphify against `sourcePath`.

`--ff-only` prevents an unattended merge commit. Tech Context Graph never runs `git reset`, `git stash`, `git checkout`, conflict resolution or destructive cleanup. If manual action is required, the graph update stops and the repository is left for the operator.

Git runs without an interactive terminal prompt (`GIT_TERMINAL_PROMPT=0`). Existing credential managers and non-interactive authentication continue to work. Missing or expired credentials cause the pull to fail instead of leaving the CLI waiting for input.

## Multiple catalog entries sharing a repository

Several technology entries may use different `sourcePath` values inside the same original `repository.path`. In both the interactive batch action and one `repository:inspect ... --pull` invocation:

- Git is pulled only once for each normalized original path;
- the successful pull result is reused by later entries with that path;
- Graphify still inspects every selected source folder separately;
- a failed pull skips Graphify for every entry that shares the failed original path;
- unrelated repository paths continue processing;
- the command exits with status `1` if any selected entry failed.

## Failure behavior

| Failure | Result |
|---|---|
| Folder is not a Git repository | Graphify is not started. |
| Working tree contains tracked or untracked changes | Pull and Graphify are both skipped. |
| Branch has no upstream | Pull and Graphify are both skipped. |
| Repository is in detached `HEAD` | Pull and Graphify are both skipped. |
| Credentials or network fail | Pull fails and Graphify is not started. |
| Local and remote histories diverge | `--ff-only` rejects the pull; no merge or graph update occurs. |
| Repository is already current | The pull is reported as up to date and Graphify proceeds. |
| Fast-forward succeeds | The before/after commits are shown and Graphify proceeds. |

A pull failure does not create a new Graphify inspection record and does not delete an existing graph. The CLI displays a failed operation row so automation can detect the skipped update.

## Troubleshooting

Run these commands manually in the original repository folder to diagnose a blocked pull:

```bash
git status --short
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"
git pull --ff-only
```

Resolve dirty files, upstream configuration, authentication, network access or branch divergence according to your repository policy. Then rerun the Tech Context Graph update.
