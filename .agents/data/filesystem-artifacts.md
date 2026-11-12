# Artefactos en disco

## Layout de un workspace

```text
<workspace>/
├── tech-context-graph.workspace.json     marcador
├── tech-context-graph.yaml               configuración editable
├── technology-catalog.override.yaml      opcional
├── .tcg/
│   ├── state.sqlite                      estado
│   ├── state.sqlite.lock                 lock de sesión {pid,token,createdAt}
│   ├── state.sqlite.tmp                  exportación en curso
│   ├── update.lock                       coordinador y reconcile
│   └── logs/
│       ├── update-<id>.log, .json        lote
│       ├── inspection-<runId>.log        extracción
│       ├── verification-<uuid>.log       verificación sin extracción
│       └── startup.jsonl                 tiempos de arranque de la TUI
├── context-pack/repository-discovery/
│   ├── repository-candidates.json        leído por project:review
│   ├── repository-candidates.yaml
│   └── REPOSITORY_DISCOVERY.md
└── tech-graphify-out/technologies/
    ├── <repoKey>/                        tecnología unknown
    └── <technology>/
        ├── technology.json               manifiesto
        ├── aggregate.json                metadatos del agregado
        ├── graph.json                    agregado (≥ 2 miembros)
        └── <repoKey>/
            ├── tcg-current.json          PUNTERO PUBLICADO
            ├── .tcg-inspection.lock
            └── .generations/<runId>/graphify-out/
                ├── graph.json
                └── ...                   sidecars y manifiestos de Graphify
```

## Qué es regenerable

| Artefacto | ¿Se puede borrar? |
|---|---|
| `.tcg/logs/*` | Sí |
| `context-pack/*` | Sí; `project:review` fallará hasta otro escaneo |
| Generaciones no publicadas | Sí, si **no** son la de `tcg-current.json`. No hay comando para hacerlo. Puede dejar sin grafo a filas antiguas de `inspections`, que apuntan a esa ruta |
| Generación publicada, `tcg-current.json` | Solo si se acepta re-extraer. SQLite podría indicar `MISSING` |
| `state.sqlite` | **No**: pierde catálogo e historial |
| Locks | Solo si se confirma que el dueño no vive |

**Sin política de retención:** las generaciones crecen sin límite ([R-09](../technical-debt/risks.md)). No borres nada de un workspace de usuario sin pedirlo.

## Exclusiones

`RULES` en `repository-exclusions.ts` añade salidas y logs a `info/exclude`. **`.tcg/state.sqlite` no está incluido**; en este repo lo cubre `.gitignore` con `*.sqlite`.

## Ficheros de versión

| Fichero | Versión |
|---|---|
| Marcador | `schemaVersion: 1` |
| YAML | `version: 4` (constante en el schema) |
| `tcg-current.json` | `schema: 2` |
| `technology.json`, `aggregate.json` | `schemaVersion: '2.0'` |
| Registro | `version: 1` |
| Fingerprint | Prefijo `git-v2:` o `files-v2:` |

## Publicaciones ARGEns v1 como evidencia técnica

`tcg-current.json` schema 2 apunta a `.generations/<inspectionId>/graphify-out/graph.json` inmutable y contiene `graphDigest` SHA256, `inspectionId`, `fingerprint`, `graphifyVersion`, `publishedAt`. `PublishedGraphResolverService` compara bytes, path real dentro de workspace, última fila SQLite READY, fingerprint actual y commit Git. `TechnologyContextResultV1.sourceRefs[]` NO equivale a path o líneas fuente citadas. `technology.json` v2 de TCG NO es `AG tech-graph metadata v1` ni capability hash C6.
