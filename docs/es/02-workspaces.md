# Administración de workspaces

[Anterior: Primer arranque](01-primer-arranque.md) · [Índice](README.md) · [Siguiente: Raíces](03-raices.md) · [English](../en/02-workspaces.md)

Un workspace es la carpeta de control. Contiene `tech-context-graph.workspace.json`, `tech-context-graph.yaml`, `.tcg/state.sqlite`, `.tcg/logs`, `tech-graphify-out` y `context-pack`.

El registro global conserva referencias elegidas por el usuario. Permite listar, cambiar y reabrir workspaces. Quitar una referencia no elimina los ficheros.

```bash
tcg workspace:list
tcg workspace:create
tcg workspace:use <ruta>
tcg workspace:remove <id-o-ruta>
```

## Workspace frente a repositorio

Esta diferencia es fundamental:

| Workspace | Repositorio |
|---|---|
| Guarda el catálogo y el estado operativo | Guarda código fuente |
| Puede administrar muchos repositorios | Representa un proyecto o miembro tecnológico |
| Contiene grafos y logs | Graphify lo inspecciona |
| Puede permanecer estable aunque el código cambie de lugar | Evoluciona mediante commits y ramas |

Quitar una referencia de workspace afecta al registro, no a la carpeta. Retirar un repositorio del catálogo activo afecta al estado administrativo, no a sus archivos Git. Las acciones administrativas no implican borrado.

## Varios workspaces

Conviene separar workspaces cuando los grupos de repositorios tienen propietarios, clientes, reglas de privacidad o retención diferentes. Evita crear uno por repositorio salvo que necesites ese aislamiento; el workspace está diseñado para administrar un catálogo.

## Principio de recuperación

El marcador identifica el workspace, YAML expresa la intención editable y SQLite conserva el historial operativo. Realiza copias de los tres cuando el historial sea importante. Usa `tcg config:paths` para localizarlos.
