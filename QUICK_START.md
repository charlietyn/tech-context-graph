# Quick Start - Tech Context Graph

## 1. Install prerequisites

Install Node.js 20+, Python 3.10+, Git, `uv`, and Graphify:

```bash
uv tool install graphifyy
```

Install this package locally:

```bash
npm install
npm run build
npm link
```

## 2. Start without assuming any folder

```bash
tcg
```

On a new computer, the application says that no workspace is configured and offers:

```text
Create a new workspace
Open or adopt an existing workspace
Exit
```

## 3. Create the workspace explicitly

Choose a name and then choose how to provide its location:

```text
Browse folders
Type or paste a complete path
Use the current directory - advanced
Back
```

The current directory is never selected silently.

## 4. Add repository search folders

After opening the workspace, choose:

```text
Repository search folders
  -> Add a repository search folder
```

Browse to or paste the real folder used on that computer. Examples only:

```text
D:\Development
E:\Company\Repositories
/home/user/projects
```

No example path is used as a default.

## 5. Scan and review

Choose `Discover repositories`, select a configured root, confirm the scan, then review candidates. A detected candidate is not automatically accepted.

## 6. Inspect with Graphify

Choose `Inspect with Graphify`, then:

```text
All pending repositories
Choose one or more with search
Choose one with search
```

The searchable multi-select supports name, technology, category, status, and path.

## 7. Work with an inspected project

Choose `Inspected project details` and select one project. Available actions include:

```text
Update graph
Fully rebuild graph
Query the graph
Explain a node or concept
Find a path between two nodes
Show file locations
Remove from active catalog
```

## 8. Find every configuration file

```bash
tcg config:paths
```

## Non-interactive example

```bash
tcg workspace:create --path "D:\TCG\CompanyCatalog" --name "Company Catalog" --non-interactive
tcg root:add "D:\Development" --workspace "D:\TCG\CompanyCatalog"
tcg root:list --workspace "D:\TCG\CompanyCatalog"
```
