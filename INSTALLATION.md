# Installation

## Prerequisites

- Node.js 20 or newer.
- Python 3.10 or newer.
- Git.
- `uv` recommended for installing Graphify.

## Install Graphify

Minimal code inspection:

```bash
uv tool install graphifyy
```

Documentation and office formats can require Graphify extras. Install only the extras approved for the environment.

Verify:

```bash
graphify --version
python --version
node --version
```

## Install Tech Context Graph from source

```bash
npm install
npm run build
npm link
```

Verify:

```bash
tcg --help
tcg doctor
```

## First run

```bash
tcg
```

The first-run manager asks the user to create or open a workspace. It does not select the current directory silently.

## Windows notes

- Use PowerShell or Windows Terminal.
- Paste paths directly; the path service validates them.
- If script policy blocks an npm shim, use `node dist/main.js` temporarily or adjust the approved execution policy.

## Linux and macOS notes

- Ensure the npm global bin directory is on `PATH`.
- Ensure the selected workspace and repository roots are readable.

## Upgrade

1. Back up the workspace `.tcg` directory.
2. Install the new package.
3. Run `tcg doctor`.
4. Open the workspace and allow controlled SQLite migrations.
5. Verify roots and repository states before running Graphify.
