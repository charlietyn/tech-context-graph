# Reglas para agentes revisores

Prioriza por daño potencial. El proyecto toca repositorios reales y estado no recuperable.

## Bloqueantes

### Datos del usuario

- ¿Algún camino modifica un repositorio fuera de `RepositoryGitService` o de una acción explícita?
- ¿Se pueden perder cambios locales? ¿Hay ref de respaldo antes de reescribir?
- ¿Se añade `clean`, `stash`, `reset --hard` o configuración global de Git?
- ¿Coincide el comportamiento con lo que prometen `docs/`, `CHANGELOG.md` y los avisos de la TUI y de `--help`?

### Integridad

- ¿Un fallo en cualquier punto deja intacto el grafo anterior?
- ¿Se publica antes de validar o sin re-comprobar el fingerprint?
- ¿Una migración edita una versión anterior o puede bloquear la apertura?
- ¿Las escrituras de estado son temporal + `rename`?
- ¿Cada lock se libera en `finally`? ¿Es correcto el orden para evitar auto-bloqueo?

### Seguridad

- ¿Hay `shell: true` o cadenas interpoladas en un comando?
- ¿Se construyen rutas desde datos sin comprobar contención?
- ¿SQL con valores interpolados?

### Registro

- ¿Lo nuevo está en `CliModule`? ¿Falta algo en `package.json#files`?

## Importantes

### `ON CONFLICT` y re-escaneo

Cualquier campo nuevo en `upsertCandidate`: ¿qué pasa si el usuario lo editó?

### CLI

- **¿Se usó un flag nuevo a través de commander de verdad?** Los tests de `run()` no lo comprueban.
- ¿`--json` emite solo JSON? ¿El código de salida es correcto?
- ¿Se usa `process.exit()`? Impide liberar locks.

### Paridad

¿Se añadió a la TUI y al CLI vía el mismo servicio? ¿Un flujo paralelo a `RepositoryUpdateService`?

### Multiplataforma

Rutas con `\`, `:` y espacios. Regex sobre rutas. Código POSIX sin rama de Windows.

### Cancelación

¿La operación larga propaga `signal`? ¿Se distingue `CANCELLED` de `FAILED`?

### Frescura

Cambios en reglas de extracción: ¿suben `schema`? ¿Reutilizan por error un grafo antiguo? ¿Cambiar `ignore/` re-extrae a propósito?

### Dependencias

Contrasta contra [dependency-rules.md](../architecture/dependency-rules.md). Una dirección con 0 en la matriz es una regresión.

## Calidad

- ¿Duplica `resolveWorkspacePath`, validación de aristas o rutas de salida?
- ¿Añade clave YAML sin lector?
- ¿El test verifica el comportamiento de fallo?
- ¿Documentación EN y ES alineadas?

## No señales

Líneas largas ni estilo denso, que son convención. Tampoco la ausencia de hexagonal o DDD.

## Formato

Por cada hallazgo: fichero y línea, escenario concreto de fallo (entrada → resultado incorrecto), y severidad. Distingue lo verificado de lo inferido.
