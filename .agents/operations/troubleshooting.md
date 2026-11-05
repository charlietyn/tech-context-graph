# Troubleshooting

## Primeros pasos

1. `tcg doctor --json --workspace <ws>`
2. `tcg config:paths --workspace <ws>`
3. Último `.tcg/logs/update-<id>.json`, y su `inspection-<runId>.log`
4. `tcg repository:reconcile --workspace <ws>` tras un corte

## Tabla de síntomas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Another operation (PID n) owns ...state.sqlite.lock` | Otra sesión de `tcg` abierta, por diseño | Ciérrala |
| Igual, pero el PID es de otro programa | PID reutilizado por un lock huérfano | Confirma que no es `tcg` y borra el lock, con permiso del usuario |
| `Another controller is recovering` | `.recovery` huérfano tras un crash | Confirma que no hay `tcg` activo y borra `<lock>.recovery` |
| `Cannot read properties of undefined (reading ...)` | Ejecutado con tsx u otro transpilador sin metadata | Usa `npm run dev -- <comando>` o `dist/` |
| `UNIQUE constraint failed: repositories.repo_key` | Key repetida entre escaneos ([R-03](../technical-debt/risks.md)) | No hay comando para renombrar. Escanea carpetas más acotadas o usa `member_key_aliases` en un override; el arreglo real está en el código |
| Clasificación manual perdida | Re-escaneo ([R-02](../technical-debt/risks.md)) | Reaplica `repository:classify` |
| Con `project:discover --apply` no sale en `repository:list` | Está `IGNORED`, o la key ya estaba en YAML (`skipped`) | `repository:review --accept <id>` |
| Registrado antes de esta corrección y sigue `DETECTED` | Versiones anteriores no lo aceptaban | `repository:review --accept-all` o `--accept <id>` |
| `Cannot migrate <key>: both source and destination...` al abrir | Conflicto de carpetas, migración 9 | Decide cuál conservar; el usuario debe confirmar |
| `Graphify is unavailable.` | No está en PATH | `uv tool install graphifyy`, terminal nueva |
| `Graphify crashed with code -1073741819` | Violación de acceso | Ver log; prueba `--force` |
| Agotamiento de memoria | Repositorio enorme | Reintento automático con 2 workers; revisa `ignore/` |
| `TIMEOUT` en Git | Límite fijo de 120 s ([R-11](../technical-debt/risks.md)) | Haz el pull a mano y vuelve a ejecutar |
| `LOCAL_CHANGES` | Cambios rastreados | El usuario los revisa; **nunca descartes** |
| `DIVERGED` | Conflicto en el rebase automático | Backup en `refs/tcg/backups/...`; resolver a mano |
| `OWNERSHIP` | Dueño distinto | Solo debería ocurrir fuera de `runGit` |
| `SOURCE_CHANGED` | Edición durante la extracción | Reintenta con la fuente estable |
| Repositorio de solo docs aparece `FAILED` | `EMPTY_GRAPH` ([R-17](../technical-debt/risks.md)) | Esperado hoy |
| Todo se re-extrae de golpe | Cambió la versión de Graphify o `ignore/` | Esperado |
| Disco lleno en `tech-graphify-out` | Sin retención ([R-09](../technical-debt/risks.md)) | Limpieza manual, nunca la generación publicada |
| Ajustes del YAML sin efecto | [R-07](../technical-debt/risks.md), [R-08](../technical-debt/risks.md) | Usa `technology-catalog.override.yaml` para discovery |
| Scan truncado | `maximum_directories` | Se cambia en el catálogo u override, **no** en YAML |
