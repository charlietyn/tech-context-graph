# First run

[Previous: Overview](00-overview.md) · [Index](README.md) · [Next: Workspaces](02-workspaces.md) · [Español](../es/01-primer-arranque.md)

Run `tcg`. On a new computer the application opens the workspace manager instead of using the current directory. Choose **Create a new workspace**, enter a clear name, and browse to or paste the exact location where the application may store its SQLite database, graphs, reports and logs.

Before creating files, the wizard shows every path and asks for confirmation. The current directory is available only as an explicitly labelled advanced option.

After creation, add one or more repository search folders. These folders may be on another disk or network location. Tech Context Graph validates read access before saving them.

## Before you begin

Verify the required tools:

```bash
node --version
python --version
git --version
graphify --version
tcg doctor
```

If `tcg` is not found after `npm link`, open a new terminal and confirm that the npm global binary directory is on `PATH`.

## What the wizard is asking

The **workspace location** is where Tech Context Graph stores its own state. It does not need to be inside a source repository. For example:

```text
D:\Engineering\TCG\CompanyCatalog       Windows
/home/ana/.local/share/tcg/catalog       Linux
/Users/ana/TCG/CompanyCatalog            macOS
```

The **repository search root** is where source repositories already live:

```text
D:\Engineering\Repositories
/srv/source
/Users/ana/Developer
```

Do not choose the same folder merely because it is convenient. Choose paths according to backup, access, disk-space, and privacy requirements.

## Expected result

After the first run, `tcg config:paths` should show the workspace marker, editable YAML, SQLite state, graph output, reports, and logs. No repository is inspected until you discover, review, and accept it.

## Common beginner mistake

Creating a workspace does not register every nearby repository. The workspace is the control center; repository roots are separate inputs. Continue with [workspace concepts](02-workspaces.md).
