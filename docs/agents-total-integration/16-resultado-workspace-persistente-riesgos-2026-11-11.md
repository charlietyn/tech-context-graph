# ARGEns v6 — TCG · Workspace persistente de C6 y riesgos R-21/22/23 (2026-11-11)

**SHA certificado: `e9f7677`** (R-21/22/23 en `5898199`, script de construcción en `a13fa8c`, duración monótona en `e9f7677`). Evidencia Linux y Windows nativo en [`evidence/local/tcg/e9f7677…/`](evidence/local/tcg/). Sin push y sin reinstalar el `tcg` global.

**Workspace:** `~/.argens/tcg-workspace` · fuentes `~/.argens/tcg-sources`. **Leer solo si existe `READY.marker`** (se borra al empezar una construcción y se escribe solo si todos los cores pasan). Construido con `dist` de `a13fa8c`, Graphify 0.9.105.

| Coordenada | Versión resuelta | graphSha256 | repositoryCommit |
|---|---|---|---|
| `vite@8` | 8.3.7 | `sha256:7831cb9372413c37fbc00a18245ac29c58baba6ec8c7fae4e6a7bb5962a773ff` | `5def936009d2637a48d056e197aebc6242ac27c6` |
| `nuxt@4` | 4.6.4 | `sha256:bf31483a3ade454abf810d6beaf2f9fea2d7cdd91d7fd8ea2e836020f5f04e2a` | `b9a6b687018a87db72832620beec55bf46abd623` |
| `nestjs@11` | 11.2.9 | `sha256:6afb34168b82e49e63eb8e877203d4cf8387322ba0161aa9bfb6e6c8fd9f8b16` | `c6cf340d071f89305236a942a9cf3bf7707849fa` |
| `nestjs@10` | 10.4.22 | `sha256:6b813687aa2357ccb7574066819f19b74a0c6e982d38a65b70bee54254bc369f` | `e88b270cb5497d122183d7cad423dcbaaae037f0` |
| `laravel@12` | 12.72.0 | `sha256:472909094bdba9187eba460d3721976719adc72180b3def3b09661379a877829` | `b089d3020e508f49b3625726ab4a2c897f1b78d5` |
| `laravel@13` | 13.42.0 | `sha256:dfa78dd9a7ec703294f265bce10b2be55c67e65fd5ecaa50723bab1c85dffc5f` | `f5c01f6b63803f16f38ebb31622c4fea412bd022` |
| `spring-boot@3` | 3.5.16 | `sha256:197316669ff7d5c970e1676eb394cfd540f98949c9c5742b02dcc42bd4a6e8d7` | `0566f6933049aca6bc5ffc6d559fffade9cd2e0c` |
| `flutter@3` | 3.47.9 | `sha256:25825b3676fb7ae4bc2c5f7c512250aab8b5d377146e8b5611f7554d58eb579b` | `c197ca5199e9ee5661e865596c9c07294dfab51c` |
| `expo@52` | 52.0.49 | `sha256:7c066bb1ac025195f9b0e073fee3c5331a4522e2c2658512fa6d7bb88f65960e` | `d516432a626ef37de1ae750ffc3b47a142a63f17` |

Por core (G2): `technology:reference` READY, mayor+100 ⇒ MISSING (exit 4), `technology:query --revision <digest>` ⇒ READY con ese digest, query y explain READY. Spring Boot: `explain SpringApplication` ⇒ FAILED con `AMBIGUOUS_NODE_CANDIDATES` (R-22 con datos reales).

## Reproducibilidad: causa raíz (Graphify, no TCG)

7 de 9 digests coinciden con construcciones anteriores hechas en otra ruta; Flutter y Expo no. Investigado hasta la causa:

- **Expo:** mismo conjunto de nodos y aristas; difieren 44 posiciones de aristas, siempre pares adyacentes de llamadas desde la misma línea (`EXAVPlayerData.m L129`, `L583`).
- **Flutter:** además, 2 nodos y 4 aristas difieren porque Graphify crea nodos externos para imports no resueltos con un id que **incluye la ruta absoluta del checkout** (`…_home_charlietyn_argens_tcg_sources_…`).
- Experimento controlado con `expo-av`: la misma copia extraída 5 veces (paralelo y `--max-workers 1`) da siempre el mismo digest; `PYTHONHASHSEED` fijo o aleatorio, ctime y orden de `readdir` **no** influyen; el árbol de una copia colocado en la ruta de la otra da exactamente el digest de esa ruta. **La salida de Graphify 0.9.105 es una función determinista de la ruta absoluta de la fuente.**

Consecuencias: un grafo es reproducible bit a bit si se reconstruye **en la misma ruta** (por eso las fuentes viven en `~/.argens/tcg-sources`); entre rutas o máquinas el digest puede cambiar aunque el commit sea el mismo. El contrato no se ve afectado: el digest identifica la publicación del workspace que se consulta y los consumidores fijan `--revision` contra ese workspace, nunca contra otro. Posibles mejoras (no hechas): JSON canónico ordenado antes de publicar (resolvería el orden, no los ids con ruta) y reportarlo a Graphify.

## R-21/R-22/R-23
Mitigados en `5898199`; detalle y pruebas en `.agents/technical-debt/risks.md`.

## G4 · Reinstalar `tcg` global (preparado, NO ejecutado; probado con prefijo npm temporal en Linux y Windows)
En WSL, `tcg` resuelve hoy al shim de Windows antiguo y `technology:reference --help` se cuelga.

Linux:
```bash
git clone --no-checkout ~/projects/argens/tech-context-graph ~/.local/opt/tech-context-graph
cd ~/.local/opt/tech-context-graph && git checkout --detach e9f7677
npm ci && npm run build && npm link && hash -r
command -v tcg   # debe ser ~/.nvm/versions/node/v24.20.0/bin/tcg
tcg technology:reference --workspace ~/.argens/tcg-workspace --technology nestjs --version 11 --json; echo $?   # 0 READY
# rollback: npm unlink -g tech-context-graph
```
Windows (PowerShell):
```powershell
git -c safe.directory=* clone --no-checkout \\wsl.localhost\Ubuntu-24.04\home\charlietyn\projects\argens\tech-context-graph C:\Tools\tech-context-graph
cd C:\Tools\tech-context-graph; git -c safe.directory=* checkout --detach e9f7677
npm ci; npm run build; npm unlink -g tech-context-graph; npm link
tcg technology:reference --help
# rollback: npm unlink -g tech-context-graph; cd D:\Proyectos\Grapify\tech-context-graph; npm link
```

## G5 (en `e9f7677`)

| Puerta | Linux (WSL2) | Windows nativo (ruta con espacios + junction) |
|---|---|---|
| `npm ci` / `lint:types` / `build` | 0 / 0 / 0 | 0 / 0 / 0 |
| `npm test` | 181/181, 31 suites | 180/180 + 1 omitido (PID reutilizado, solo Linux por diseño) |
| `smoke-technology-contract.cjs` | PASS | PASS |
| `smoke-graphify-real.cjs` | PASS (incluye query/reference READY con el lock retenido por otro proceso) | PASS (idem) |
| `smoke-crash-recovery.cjs` | PASS 4/4 | PASS 4/4, mismo digest recuperado |

Defecto encontrado y corregido durante G5: `queryDurationMs` se medía con `Date.now()` (no monótono); un ajuste del reloj de WSL produjo una duración negativa que viola el esquema. `e9f7677` usa `performance.now()`.

## Pendiente

- Push de la rama y reinstalación del `tcg` global: esperan tu autorización.
- Opcional: JSON canónico antes de publicar e informe a Graphify sobre la dependencia de la ruta.
