# Workflow: Añadir una funcionalidad

1. **Ubica el dominio** con `graphify query "<tema>"` y [navigation.md](../agent-rules/navigation.md). Lee `.agents/features/` y [risks.md](../technical-debt/risks.md).
2. **Decide dónde vive:**

   | Tipo | Lugar |
   |---|---|
   | Regla o caso de uso | Servicio existente o `src/services/<x>.service.ts` |
   | SQL | `RepositoryStoreService` |
   | Parseo y formato | `src/commands/` o presenter |
   | Utilidad sin estado | `src/services/<x>.ts` |

3. **Escribe el test primero**, si encaja: [add-test.md](add-test.md).
4. **Implementa** con `workspaceRoot` explícito como primer parámetro.
5. **Registra** en `src/cli.module.ts`: providers y comandos.
6. **Expón:** comando ([add-command.md](add-command.md)) y, si aporta, flujo en la TUI ([interactive-ui.md](../cli/interactive-ui.md)). Ambos llaman al mismo servicio.
7. **Si toca datos:** [modify-database.md](modify-database.md) o [change-configuration.md](change-configuration.md).
8. **Comprueba** [architectural-rules.md](../conventions/architectural-rules.md).
9. **Verifica:** `npm run lint:types`, `npm test`, y prueba el binario en sandbox ([local-development.md](../operations/local-development.md)).
10. **Documenta:** `CHANGELOG.md`, `docs/en` + `docs/es`, `.agents/`.
11. **Actualiza el grafo:** `graphify update .`

Si necesitas algo nuevo en runtime fuera de `dist`, `config` o `ignore`, añádelo a `package.json#files`.
