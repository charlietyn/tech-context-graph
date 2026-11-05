# Reglas para agentes que escriben código

## Antes de editar

1. Lee [README.md](../README.md) y sus Critical Rules.
2. Navega con `graphify query` antes que con grep ([navigation.md](navigation.md)), y **lee el fuente real** antes de cambiar nada.
3. Revisa `git status`. Puede haber trabajo sin commitear del usuario. **No lo reviertas, reformatees ni incluyas en tus commits** salvo que te lo pidan.
4. Comprueba si el tema está en [risks.md](../technical-debt/risks.md).

## Nunca sin petición explícita

- Ejecutar `tcg` o `node dist/main.js` contra esta raíz, o sin `--workspace` desde ella.
- Leer, editar o borrar `.tcg/`, `tech-graphify-out/`, `context-pack/`, `tech-context-graph.yaml`, `tech-context-graph.workspace.json`.
- Tocar `%APPDATA%\TechContextGraph\` (usa `TCG_CONFIG_HOME`).
- Ejecutar pulls o inspecciones contra los repositorios del catálogo real.
- Borrar generaciones, locks o bases de datos de un workspace.
- Hacer commit o push.
- Exponer contenido de `internal-notes/` en ficheros versionados: es privado.

## Mientras editas

- Cambios mínimos en el estilo del fichero.
- Sin nuevas dependencias de runtime sin justificación.
- Respeta [dependency-rules.md](../architecture/dependency-rules.md).
- Registra lo nuevo en `CliModule`.
- No introduzcas una segunda ruta de actualización de grafos, resolución de workspace o validación de grafo: consolida.
- No "arregles" de paso lo que encuentres. Si es fuera de alcance, anótalo y coméntalo.

## Zonas de alto riesgo

Para estos ficheros, lee la documentación del módulo y sus tests **antes** de tocar:

`src/services/repository-git.service.ts`, `src/services/repository-exclusions.ts`, `src/services/graphify-cli.service.ts`, `src/services/operation-lock.ts`, `src/services/process-runner.ts`, `src/persistence/sqlite-migration.service.ts`, `src/persistence/graph-output-migration.ts`, `src/persistence/repository-store.service.ts` (`upsertCandidate`).

## Antes de dar por terminado

```powershell
npm run lint:types
npm test
graphify update .
```

Si cambiaste comandos o flags, compila y pruébalos en sandbox. `npm run build` borra `dist/`, de modo que el `tcg` global queda inutilizable durante la compilación, y si falla, hasta corregirlo.

Informa con exactitud: qué se ejecutó, qué falló, y qué no verificaste.

## Actualizar esta documentación

Si cambias un contrato, estado, comando, tabla o riesgo, actualiza `.agents/`. Basa cada afirmación en código leído.
