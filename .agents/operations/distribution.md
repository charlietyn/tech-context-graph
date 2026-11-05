# Distribución

**No hay despliegue:** es un CLI local. Sin servidores, Docker, Kubernetes ni infraestructura como código.

## Paquete npm

`package.json#files` es una **lista blanca**: `dist`, `config`, `scripts`, `ignore`, `docs`, `diagrams`, los `.md` de usuario y `LICENSE`. `.agents/` no se publica.

**Cualquier recurso de runtime nuevo en otra carpeta debe añadirse a `files`,** o faltará al instalar.

Binarios: `tech-context-graph` y `tcg`. `postinstall` solo imprime un mensaje.

## CI/CD

`.github/workflows/quality.yml` (PR y push a `main`): matriz Ubuntu y Windows, Node 20: `npm ci`, `lint:types`, `test`, `build`, `--help`.

**No hay pipeline de publicación** ni etiquetado automático. `/CHECKSUMS.sha256` y `/MANIFEST.txt` están ignorados como inventarios de release. `.tcg-install/` contiene un `.tgz` local.

## Instalación de usuario

Documentada en `INSTALLATION.md`: Node, build + `npm link`, y Graphify con `scripts/install-windows.ps1` o `scripts/install-linux.sh`.

## Compatibilidad

| Elemento | Compromiso |
|---|---|
| Esquema SQLite | Migración automática al abrir, sin vuelta atrás |
| YAML | `version: 4`, con migración de claves antiguas |
| `graphify-out/` legacy | Se sigue leyendo |
| `--root` | Alias obsoleto, aún activo |
| Comandos `project:*` | Conservados |

Antes de publicar, actualiza `CHANGELOG.md` y mantén EN y ES alineados.
