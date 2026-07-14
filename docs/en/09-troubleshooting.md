# Troubleshooting

## No workspace configured

Run `tcg` interactively or pass `--workspace <path>` to a command.

## Folder is not a workspace

Open the interactive UI and choose **Open or adopt an existing workspace**. Adoption creates the marker after confirmation.

## No repositories detected

Verify the root, increase maximum depth carefully, inspect `config/technology-catalog.yaml`, and confirm that marker files exist.

## Graphify not found

Run `uv tool install graphifyy`, open a new terminal, and verify `graphify --version`.

## Repository is stale

The source fingerprint changed. Use **Update graph**.
