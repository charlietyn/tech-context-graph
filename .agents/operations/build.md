# Build

```text
npm run build
  prebuild: scripts/clean-dist.cjs   borra dist/ (con guarda de ruta)
  tsc -p tsconfig.build.json         src/ → dist/
```

| Config | Alcance | `rootDir` |
|---|---|---|
| `tsconfig.json` | `src` + `test`; base y `lint:types` | `.` |
| `tsconfig.build.json` | Solo `src` | `./src` |

Salida: `dist/main.js`, con source maps y `.d.ts`.

## Dependencias de layout en runtime

Mover ficheros puede romper esto sin error de compilación:

| Código | Asume |
|---|---|
| `WorkspaceConfigValidationService` | `<dirname>/../../config/tech-context-graph.schema.json` |
| `KitPathService` | `package.json` + `config/technology-catalog.yaml` subiendo desde el cwd o `__dirname` |
| `GraphifyIgnoreService` | `<kit>/ignore/` |
| `scripts/verify-update.cjs` | `dist/services/*`, `dist/persistence/*` |

**`KitPathService` prueba primero el cwd:** ejecutar `tcg` desde dentro de este repo usa su `config/`, no el del paquete instalado.

## Metadata de decoradores

`experimentalDecorators` y `emitDecoratorMetadata` son obligatorios en `tsconfig.json`. Sin ellos, Nest no puede inyectar nada y falla en runtime.

## Verificación completa antes de entregar

```powershell
npm run lint:types
npm test
npm run build
node dist/main.js --help
```

Es lo mismo que hace CI. `npm run test:all` equivale a test + build.
