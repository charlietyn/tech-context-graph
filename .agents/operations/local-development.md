# Desarrollo local

## Requisitos

Node ≥ 20, Git y Graphify en PATH: `npm test` lo necesita para `graph-output-migration.spec.ts`, además de la inspección real y `verify-update.cjs`. `rg` es opcional.

```powershell
npm ci
npm run lint:types
npm test
```

## Ciclo de trabajo

| Objetivo | Comando | Nota |
|---|---|---|
| Probar lógica | `npx jest test/<x>.spec.ts --runInBand` | Lo más rápido y seguro |
| Tipos | `npm run lint:types` | |
| Binario local | `npm run build`, luego `node dist/main.js ...` | Borra `dist/` |
| Instalar global | `npm run link` / `npm run relink` / `npm run unlink` | `tcg` apunta a `dist/` |
| Compilar y ejecutar | `npm run dev -- <comando> --workspace <sandbox>` | No borra `dist/`, pero lo sobrescribe, y el `tcg` enlazado usa ese código |

## Sandbox obligatorio para probar comandos

**La raíz de un checkout de desarrollo puede ser también un workspace real,** con catálogo y rutas del usuario (marcador, YAML y `.tcg/` están ignorados por Git). Compruébalo antes de ejecutar nada. Sin aislar, `node dist/main.js repository:*` ejecutado desde aquí usará ese estado, porque encuentra el marcador en el cwd.

```powershell
$env:TCG_CONFIG_HOME = "$env:TEMP\tcg-sandbox\config"
node dist/main.js workspace:create --path "$env:TEMP\tcg-sandbox\ws" --name Sandbox
node dist/main.js root:add "$env:TEMP\tcg-sandbox\repos" --workspace "$env:TEMP\tcg-sandbox\ws"
```

Pasa siempre `--workspace`. Sin `TCG_CONFIG_HOME`, crear un workspace también altera el registro global del usuario.

## Estado que no debes tocar

`.tcg/`, `tech-graphify-out/`, `context-pack/`, `tech-context-graph.yaml`, `tech-context-graph.workspace.json`, y `%APPDATA%\TechContextGraph\`.

## Grafo de este repositorio

`graphify-out/` lo mantienen hooks y `graphify update .` (solo AST, sin coste). Ver [navigation.md](../agent-rules/navigation.md).

## Windows

- El shell principal del autor es PowerShell; `.gitattributes` fuerza LF salvo `.ps1`, `.bat`, `.cmd`.
- Las rutas se comparan en minúsculas en registro y raíces.
- Graphify debe ser ejecutable sin shell; `spawn` con `shell: false` no resuelve wrappers `.cmd`.
