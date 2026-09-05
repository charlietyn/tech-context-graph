# Git pull antes de actualizar el grafo

[Índice](README.md) · [Inspección con Graphify](05-inspeccion-graphify.md) · [CLI avanzada](10-cli-avanzada.md) · [English](../en/15-git-pull-before-inspection.md)

Tech Context Graph puede actualizar opcionalmente un repositorio desde su rama upstream inmediatamente antes de actualizar el grafo. Es una operación seleccionable: una actualización normal del grafo nunca contacta un remoto Git.

## Ruta del repositorio frente a carpeta de código fuente

El catálogo conserva dos rutas con responsabilidades diferentes:

| Valor | Propósito |
|---|---|
| `repository.path` | Ubicación original detectada o registrada. Los comandos Git se ejecutan aquí. |
| `repository.sourcePath` | Carpeta de código fuente seleccionada para la extracción AST. Graphify se ejecuta aquí. |

Normalmente coinciden. En un monorepo, sin embargo, la ruta original puede ser `D:\Repositorios\plataforma` y la carpeta inspeccionada `D:\Repositorios\plataforma\packages\api`. Primero se actualiza todo el repositorio Git y después Graphify inspecciona únicamente la carpeta fuente configurada.

## Flujo interactivo

Para actualizar varios repositorios:

1. Inicia `tcg` y elige **Pull latest code + update graphs** en el menú principal.
2. Elige **All accepted repositories** para seleccionar todos, o **Choose one or more with search** para elegirlos manualmente.
3. En la selección manual, busca y marca uno o varios repositorios con la barra espaciadora.
4. Revisa la lista y confirma la selección.
5. Tech Context Graph ejecuta Git y Graphify secuencialmente y muestra un resumen de ambos resultados.

También puedes actualizar un único repositorio desde **Project details and source folders** → repositorio → **Pull latest code + update graph**.

La acción existente **Update graph** continúa siendo local y no ejecuta Git.

## Flujo mediante CLI

Actualizar e inspeccionar un repositorio:

```bash
tcg repository:inspect api --pull --workspace "D:\TCG\Catalogo"
```

Actualizar e inspeccionar varias entradas:

```bash
tcg repository:inspect api shared-auth billing --pull --workspace "D:\TCG\Catalogo"
```

También puede combinarse con una reconstrucción completa, aunque las actualizaciones normales deben seguir siendo la opción habitual:

```bash
tcg repository:inspect api --pull --force --workspace "D:\TCG\Catalogo"
```

Sin `--pull`, `repository:inspect` mantiene exactamente el comportamiento anterior.

## Validaciones de seguridad y orden de ejecución

Para cada ruta original distinta, Tech Context Graph realiza estos pasos:

1. Comprueba que la carpeta original exista y sea un directorio.
2. Consulta a Git cuál es la raíz real del repositorio.
3. Exige una rama activa; rechaza un `HEAD` separado.
4. Exige un árbol de trabajo completamente limpio, incluidos archivos sin seguimiento.
5. Exige una rama upstream para la rama actual.
6. Registra el commit actual.
7. Ejecuta `git pull --ff-only`.
8. Registra el commit resultante e informa si cambió.
9. Inicia Graphify sobre `sourcePath`.

`--ff-only` impide crear un merge commit no supervisado. Tech Context Graph nunca ejecuta `git reset`, `git stash`, `git checkout`, resolución de conflictos ni limpieza destructiva. Cuando hace falta una decisión manual, la actualización del grafo se detiene y el repositorio queda en manos del operador.

Git se ejecuta sin un prompt interactivo (`GIT_TERMINAL_PROMPT=0`). Los gestores de credenciales y mecanismos no interactivos existentes continúan funcionando. Las credenciales ausentes o caducadas provocan un error inmediato en vez de dejar la CLI esperando una entrada.

## Varias entradas que comparten un repositorio

Varias tecnologías pueden usar diferentes valores de `sourcePath` dentro del mismo `repository.path`. Tanto en la acción visual por lotes como durante una ejecución de `repository:inspect ... --pull`:

- Git se actualiza una sola vez por cada ruta original normalizada;
- las entradas posteriores reutilizan el resultado del pull;
- Graphify inspecciona cada carpeta fuente seleccionada por separado;
- si el pull falla, Graphify se omite para todas las entradas que comparten esa ruta;
- las rutas de repositorios no relacionadas continúan procesándose;
- el comando finaliza con estado `1` si falla alguna entrada.

## Comportamiento ante fallos

| Fallo | Resultado |
|---|---|
| La carpeta no es un repositorio Git | Graphify no comienza. |
| Existen cambios locales o archivos sin seguimiento | Se omiten tanto el pull como Graphify. |
| La rama no tiene upstream | Se omiten tanto el pull como Graphify. |
| El repositorio está en `HEAD` separado | Se omiten tanto el pull como Graphify. |
| Fallan las credenciales o la red | Falla el pull y Graphify no comienza. |
| Los historiales local y remoto divergen | `--ff-only` rechaza el pull; no se crea un merge ni se actualiza el grafo. |
| El repositorio ya está actualizado | Se informa y Graphify continúa. |
| El fast-forward termina correctamente | Se muestran ambos commits y Graphify continúa. |

Un fallo del pull no crea un registro nuevo de inspección Graphify ni elimina un grafo existente. La CLI muestra una fila fallida para que la automatización pueda detectar que se omitió la actualización.

## Resolución de problemas

Ejecuta manualmente estos comandos en la carpeta original para diagnosticar el bloqueo:

```bash
git status --short
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"
git pull --ff-only
```

Resuelve los archivos locales, upstream, autenticación, red o divergencia según las políticas del repositorio. Después vuelve a ejecutar la actualización de Tech Context Graph.
