# Actualizar repositorios y grafos

[?ndice](README.md) ? [Inspecci?n](05-inspeccion-graphify.md) ? [English](../en/15-git-pull-before-inspection.md)

El men? **Pull latest code + update graphs** y la CLI comparten el mismo coordinador. Selecciona todos los repositorios aceptados o un subconjunto:

```powershell
tcg repository:inspect all --pull --workspace "D:\TCG\Catalogo"
tcg repository:inspect api auth --pull --workspace "D:\TCG\Catalogo"
```

Sin `--pull`, no se contactan remotos Git. `--force` reconstruye el grafo; `--no-cluster` evita el an?lisis de comunidades.

## Ejecuci?n y rendimiento

1. Se registra el lote y se adquiere el bloqueo del workspace.
2. Se resuelve la ra?z Git real de cada entrada. Varias subcarpetas del mismo checkout comparten un solo pull. Los worktrees comparten un grupo de exclusi?n para evitar operaciones Git incompatibles.
3. Git se actualiza mediante `pull --ff-only --no-rebase`. La concurrencia por defecto es 3; `TCG_GIT_CONCURRENCY` permite valores enteros de 1 a 8.
4. Se verifica la fuente, configuraci?n de exclusiones, versi?n de Graphify y digest del grafo publicado. Una publicaci?n vigente devuelve `UNCHANGED` sin extracci?n.
5. Graphify procesa secuencialmente las fuentes pendientes, en modo AST `--code-only`. La versi?n instalada debe anunciar soporte incremental con `--out` para reutilizar la generaci?n anterior; en otro caso se ejecuta una extracci?n completa.
6. Se comprueba cada agregado una vez al finalizar. Si sus entradas y su contenido no cambiaron, tampoco se ejecuta `merge-graphs`. Repetir el lote permite reintentar un agregado fallido sin extraer de nuevo sus miembros vigentes.

Git tiene un l?mite de 120 segundos por comando; solo los errores de red se reintentan una vez. Extracci?n y agregaci?n tienen un l?mite de 30 minutos. Ctrl+C cancela el lote, termina procesos hijos y conserva las publicaciones anteriores. Los repositorios independientes contin?an cuando uno queda bloqueado.

## Cambios locales y propietarios

TCG conserva cambios del usuario, incluidos archivos staged y unstaged. No ejecuta reset destructivo, limpieza, stash general, merge o rebase autom?tico.

Para rutas elegidas del cat?logo, la confianza Git se limita a la ra?z real y al comando mediante `-c safe.directory=<ra?z>`. No modifica la configuraci?n global ni utiliza comodines. Los fallos de Git se clasifican; un fallo de permisos no se interpreta como una carpeta sin Git.

Los artefactos locales se excluyen mediante la ruta que devuelve `git rev-parse --git-path info/exclude`, compatible con worktrees. Los archivos ya versionados siguen siendo versionados y sus cambios bloquean el pull.

La migraci?n autom?tica de `.gitignore` es deliberadamente precisa: solo reconoce el pie exacto que escrib?an versiones anteriores de TCG (`# Tech Context Graph local state`, seguido de `.tcg/logs/` y `.tcg/*.tmp`). Comprueba que el resto coincida con HEAD y que no haya modificaciones staged de ese archivo, guarda una copia en `info/tcg-backups` y restaura ?nicamente `.gitignore` desde su ?ndice verificado, respetando la conversi?n de finales de l?nea de Git. Las reglas locales pasan a `info/exclude`.

Una l?nea aislada como `graphify-out/`, un bloque modificado o cambios mezclados no prueban procedencia: se conservan y se explica el bloqueo. Revisarlos una vez es necesario; TCG no descarta cambios ambiguos para conseguir un resultado verde.

## Publicaci?n, recuperaci?n y estados

Cada extracci?n escribe en `<salida>/.generations/<id>/graphify-out/`. Despu?s de validar el grafo y comprobar que la fuente no cambi? durante la extracci?n, se publica `tcg-current.json` mediante rename. Este archivo identifica la generaci?n, ejecuci?n, huella, configuraci?n y digest. SQLite conserva la ruta concreta para consultas.

Las generaciones anteriores y las extracciones fallidas se conservan para recuperaci?n; todav?a no existe una pol?tica autom?tica de retenci?n. Los grafos antiguos sin publicaci?n se regeneran una vez para incorporar esta procedencia. La reconciliaci?n solo recupera una ejecuci?n cuyo ID, huella y digest coincidan: encontrar un grafo viejo no convierte una ejecuci?n fallida en ?xito.

El resumen distingue resultado del lote (`UPDATED`, `UNCHANGED`, `BLOCKED`, `FAILED`, `CANCELLED`), actualizaci?n Git y disponibilidad del grafo (`PRESERVED` cuando queda una publicaci?n anterior). Un fallo del agregado se muestra por separado. El tiempo total del lote es tiempo de reloj; las duraciones individuales pueden solaparse por la concurrencia y por los pulls compartidos.

Los logs comienzan antes de Git: `.tcg/logs/update-<id>.log` y su informe JSON. Tambi?n hay logs por inspecci?n y verificaci?n. Los errores incluyen propietario, permisos, autenticaci?n, red, timeout, divergencia, upstream ausente y detached HEAD.

## Arranque y bloqueo del workspace

`tcg` muestra primero el cat?logo persistido, con la fecha de la ?ltima inspecci?n disponible en los detalles. La verificaci?n de frescura se hace en segundo plano, con dos tareas como m?ximo y una cach? de sesi?n de 30 segundos. Se muestra cu?ndo se verific? la fuente; hasta entonces el estado es el guardado. Los errores de verificaci?n aparecen en los detalles. La versi?n de Graphify se cachea durante 60 segundos y se invalida si cambia PATH.

SQLite usa una copia en memoria, por lo que el workspace admite un controlador a la vez. El bloqueo de base de datos se mantiene hasta cerrar la sesi?n; evita que dos procesos sobrescriban el estado del otro. Un bloqueo cuyo propietario muri? se recupera autom?ticamente. Un bloqueo corrupto se informa y no se elimina a ciegas.

`.tcg/logs/startup.jsonl` registra tiempo hasta el men? y tiempo desde el inicio de Node. El resumen se refresca al navegar; las comprobaciones en segundo plano no escriben sobre un prompt activo.

## Verificaci?n reproducible

```powershell
npm run build
node scripts/verify-update.cjs
npm test
npm run lint:types
```

La verificaci?n crea repositorios temporales y un remoto local, utiliza Graphify real y comprueba: un pull por monorepo, dos extracciones iniciales, cero extracciones/merges sin cambios y actualizaci?n incremental de una sola fuente. No contacta repositorios de producci?n ni necesita una API LLM.

Los procesos Git que inicia Graphify reciben la misma excepci?n mediante configuraci?n de entorno limitada al proceso. V?ase la [documentaci?n de Git sobre configuraci?n en tiempo de ejecuci?n](https://git-scm.com/docs/git-config#Documentation/git-config.txt-GITCONFIGCOUNT).
