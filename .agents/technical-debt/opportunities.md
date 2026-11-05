# Oportunidades

Ordenadas por relación entre valor y esfuerzo. Son propuestas, no decisiones; las de arquitectura requieren confirmación.

## Correcciones rápidas

| # | Acción | Resuelve | Esfuerzo |
|---|---|---|---|
| O-2 | Copiar `notices` por fila | [R-12](risks.md) | Minutos |
| O-3 | Corregir textos y `?` | [R-14](risks.md) | Minutos |
| O-5 | Añadir `--workspace` a `project:*` | [R-16](risks.md) | Bajo |

## Alto valor

### O-7. Tests a través de commander

Harness que ejecute `CommandFactory.run` o el binario compilado contra un workspace temporal. Añadir a CI un flujo real sin Graphify (`workspace:create`, `root:add`, `repository:scan`, `repository:list --json`). Hoy solo `repository:inspect` tiene un test con commander real.

### O-8. Política de re-escaneo en `upsertCandidate`

Separar evidencia, que se actualiza siempre, de identidad y clasificación, que se conservan en `ACCEPTED`. Resolver colisiones de key entre escaneos. Resuelve [R-02](risks.md) y [R-03](risks.md). Requiere tests de escenarios de re-escaneo.

### O-9. Alinear el contrato de seguridad de Git

Decidir si la reconciliación automática es por defecto o bajo flag, y documentarlo. Resuelve [R-06](risks.md). **Debe resolverse antes de publicar el trabajo en curso.**

### O-10. Honestidad de configuración

Por cada clave de [R-07](risks.md) y [R-08](risks.md): conectarla o eliminarla del schema con migración. Mínimo inmediato: usar `graphify.executable` en runtime, que `query_log_disabled` funcione, y unificar los defaults de discovery.

## Consolidación

- **O-11. Una sola resolución de workspace:** servicio único, y `common-options.ts` delega. Sin duplicar la ruta del registro.
- **O-12. `graph-document.ts`:** normalizar nodos y aristas, contar y validar en un solo módulo para los tres consumidores.
- **O-13. Una sola localización de `graph.json`,** consciente del puntero.
- **O-14. Dividir `ConsoleUiService`** por flujos, cuando se añada el siguiente.
- **O-15. Mover primitivas:** `operation-lock`, `graph-output-path`, `process-runner`, `git-access` a `src/runtime/` o similar, eliminando las excepciones de `persistence → services`.
- **O-16. Mover Onboarding y PathSelection a `src/ui/`,** eliminando `services → ui`.
- **O-17. Límites automáticos:** ESLint con `no-restricted-imports` que codifique [dependency-rules.md](../architecture/dependency-rules.md).

## Producto y operación

- **O-18. Retención:** comando `tcg repository:prune` que conserve la publicada y N anteriores, y limpie fallidas ([R-09](risks.md)).
- **O-19. Copia antes de migrar:** `state.sqlite.bak-v<N>` antes de aplicar una migración. Encaja con el roadmap 4.1.
- **O-20. `timeoutMs` configurable para pull,** con variable como `TCG_GIT_CONCURRENCY` ([R-11](risks.md)).
- **O-21. Comando de consulta:** `repository:query|explain|path --json`. Hoy solo TUI, y sería muy útil para agentes.
- **O-22. `repository:disable`:** paridad CLI.
- **O-23. Estado `EMPTY`:** distinguir "sin código" de `FAILED` ([R-17](risks.md)).
- **O-24. `doctor`:** añadir locks huérfanos, `rg`, versión mínima de Graphify, espacio en disco.
- **O-25. Smoke real en CI** con Graphify instalado ([R-20](risks.md)).

## Decisión de fondo

¿`project:*` sigue teniendo futuro? Retirarlo en favor de `repository:*` y dejar `projects:` del YAML solo como importación eliminaría gran parte de [R-15](risks.md). Es un cambio incompatible que debe decidir el mantenedor.
