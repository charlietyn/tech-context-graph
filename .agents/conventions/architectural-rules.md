# Reglas arquitectónicas

Formuladas como comprobaciones. Cada una refleja un invariante existente en el código o en los tests.

## Seguridad de datos del usuario

- [ ] Discovery no escribe en carpetas escaneadas.
- [ ] Un repositorio solo cambia mediante `RepositoryGitService` o una petición explícita (`project:prepare`).
- [ ] No hay `clean`, `stash`, `reset --hard`, merge automático ni configuración global de Git.
- [ ] Antes de una acción Git que reescribe historia existe una ref de respaldo.
- [ ] Los cambios locales rastreados bloquean el pull.
- [ ] Las exclusiones van a `info/exclude`, no a `.gitignore`.

## Procesos

- [ ] `shell: false`, argumentos en array, nada de `exec` con cadenas.
- [ ] Todo subproceso tiene timeout y, si es largo, `signal`.
- [ ] Git se llama con `runGit`; `safe.directory` nunca es global ni comodín.

## Publicación de grafos

- [ ] Extracciones en generación nueva; nada escribe en una publicada.
- [ ] `tcg-current.json` se reemplaza solo con temporal + `rename`, tras validar.
- [ ] Reparar aristas ocurre antes de publicar y genera un aviso.
- [ ] El fingerprint se recalcula antes de publicar.
- [ ] Reconcile exige prueba exacta.
- [ ] Un cambio en la semántica de extracción sube `schema` del hash.

## Estado

- [ ] El SQL vive en `src/persistence/`.
- [ ] El esquema cambia con migraciones append-only.
- [ ] Varias escrituras relacionadas usan `transaction`.
- [ ] Hay un lock adecuado para operaciones entre procesos.
- [ ] Nada asume una ruta: `workspaceRoot` es explícito y las raíces las elige el usuario.
- [ ] Las rutas de salida usan `graph-output-path.ts`.

## Flujo

- [ ] Actualizar grafos pasa por `RepositoryUpdateService`.
- [ ] Fallos de un repositorio no detienen el lote.
- [ ] La aceptación humana no se salta.
- [ ] Toda opción nueva funciona en modo comando sin TTY.
- [ ] Una funcionalidad expuesta en la TUI y el CLI comparte el servicio.

## Plataforma

- [ ] Funciona en Windows y Linux (CI ejecuta ambos).
- [ ] Rutas con espacios y con letra de unidad contempladas al parsear.

## Documentación

- [ ] El comportamiento visible se refleja en `docs/en` y `docs/es`, y en `CHANGELOG.md`.
- [ ] `.agents/` se actualiza si cambia un contrato.
