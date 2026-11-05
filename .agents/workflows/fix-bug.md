# Workflow: Corregir un bug

1. **Comprueba** [risks.md](../technical-debt/risks.md): puede estar documentado con causa y solución.
2. **Reproduce sin tocar estado real:** test con fixture temporal, o binario en sandbox. Nunca contra esta raíz.
3. **Localiza:**

   ```bash
   graphify query "<síntoma>"
   graphify explain "RepositoryStoreService"
   graphify path "ConsoleUiService" "RepositoryGitService"
   ```

   Después lee el fuente: el grafo orienta, no prueba.
4. **Usa los logs del fallo:** `.tcg/logs/update-*.json`, `inspection-*.log`. La columna `inspections.error_message` guarda el error.
5. **Clasifica la capa:**

   | Síntoma | Mira primero |
   |---|---|
   | Flag ignorado | `src/commands/`, commander |
   | Estado incorrecto | Cálculo en `mapRow` y `RepositoryControlService.list/get` |
   | Se re-extrae sin razón | Hash de configuración, `RepositoryFingerprintService` |
   | Nunca se actualiza | Atajo `unchanged` en `inspectLocked` |
   | Error Git raro | `classifyGitError` y su orden |
   | Solo en Windows | Rutas, `taskkill`, `.cmd`, exit codes DWORD |
   | Tecnología mal detectada | Puntuación, `config/technology-catalog.yaml` |
   | Falla al abrir | Migraciones, schema YAML |

6. **Test que falla primero,** en la suite de [test-map.md](../testing/test-map.md).
7. **Arregla la causa,** no el síntoma. Revisa duplicaciones: `graphCounts`, `removeDanglingEdges` y `refresh` repiten lógica ([R-13](../technical-debt/risks.md)).
8. **Comprueba invariantes:** un fallo debe seguir conservando el grafo anterior.
9. `npm run lint:types`, `npm test`, `graphify update .`
10. **Si era un riesgo documentado,** elimínalo de `risks.md`.

Si el arreglo implica transformar datos existentes, necesitas migración: [modify-database.md](modify-database.md).
