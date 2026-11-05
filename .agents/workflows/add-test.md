# Workflow: Añadir un test

Ubicación: `test/<nombre>.spec.ts`. Busca primero la suite en [test-map.md](../testing/test-map.md).

## Elige la técnica

| Quieres probar | Técnica | Plantilla |
|---|---|---|
| Función pura | Directo | `test/graphify-cli.service.spec.ts` |
| Store o SQL | SQLite real en temporal | `test/repository-store.service.spec.ts` |
| Publicación | Graphify simulado con `spawnGraphify` | `test/graph-publication.spec.ts` |
| Git | Git real: `seed` → `origin.git` → `clone` | `test/update-safety.spec.ts` |
| Coordinador | Mocks de Git y Graphify | `test/update-safety.spec.ts` |
| Comando | `new Command(mocks).run(params, options)` | `test/repository-inspect.command.spec.ts` |
| Flujo Clack | Mock de prompts | `test/workspace-onboarding.service.spec.ts` |
| Detección | Carpetas falsas | `test/repository-discovery.service.spec.ts` |

## Plantilla con SQLite

```ts
const root = mkdtempSync(resolve(tmpdir(), 'tcg-x-'));
const sqlite = new SqliteDatabaseService();
const store = new RepositoryStoreService(sqlite);
try {
  await store.upsertManual(root, { key: 'core', path: source, role: 'technology', category: 'backend', technology: 'test' });
  // ...
} finally {
  sqlite.close();   // libera el lock
}
```

## Reglas

1. **Nunca rutas reales**; siempre `mkdtempSync`.
2. **Cierra `sqlite`** en `finally`.
3. **Restaura** `process.env`, `process.exitCode` y spies.
4. Usa `TCG_KIT_ROOT = resolve(__dirname, '..')` si el código carga el catálogo o `ignore/`, y `TCG_CONFIG_HOME` temporal si toca el registro.
5. **Compatible con Windows y Linux**, sin rutas codificadas ni separadores fijos; CI ejecuta ambos.
6. Sube el timeout con `jest.setTimeout(60_000)` si usas Git real.
7. **Prueba el comportamiento de fallo:** la propiedad clave suele ser que el estado anterior se conserva.
8. **`command.run(...)` no prueba el parseo de flags.** Para eso, ejecuta el binario.
