# Referencia de configuración

Tech Context Graph separa deliberadamente la configuración editable del estado operativo.

## 1. Registro global de workspaces

Este fichero se crea automáticamente y contiene únicamente referencias a workspaces elegidos por el usuario.

- Windows: `%APPDATA%\TechContextGraph\workspaces.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/tech-context-graph/workspaces.json`
- macOS: `~/Library/Application Support/TechContextGraph/workspaces.json`

Variable para instalaciones portables o pruebas:

```text
TCG_CONFIG_HOME
```

No añadas rutas no confiables manualmente. Es mejor utilizar `tcg workspace:create` o la interfaz interactiva.

## 2. Marcador del workspace

Fichero:

```text
tech-context-graph.workspace.json
```

Sirve para:

- demostrar que la carpeta es un workspace;
- aportar una identidad estable;
- evitar usar silenciosamente cualquier directorio actual;
- localizar el workspace desde una subcarpeta.

## 3. Configuración editable

Fichero:

```text
tech-context-graph.yaml
```

Es la configuración principal editable por personas. Los cambios de raíces realizados desde la CLI se sincronizan aquí y en SQLite.

### `workspace`

Define identidad y rutas internas.

```yaml
workspace:
  id: catalogo-empresa
  name: Catálogo de empresa
  paths:
    database: ./.tcg/state.sqlite
    logs: ./.tcg/logs
    graphs: ./tech-graphify-out
    reports: ./context-pack
```

### `repository_discovery`

```yaml
repository_discovery:
  default_max_depth: 7
  default_min_confidence: 60
  maximum_directories: 25000
  stop_at_detected_repository: true
  include_unknown_git_repositories: true
  roots:
    - path: D:/Desarrollo
      enabled: true
      max_depth: 7
      min_confidence: 60
      role: technology
```

Las raíces pueden editarse manualmente, pero la CLI es más segura porque valida la carpeta y actualiza SQLite.

### `graphify`

```yaml
graphify:
  executable: graphify
  code_only: true
  force_rebuild: false
  query_log_disabled: true
  semantic:
    backend: ollama
    model: null
    mode: deep
```

### `security`

```yaml
security:
  allow_external_llm: false
  block_sensitive_sources: true
  scan_secrets: true
  copy_raw_sources: true
```

## 4. Estado operativo SQLite

Fichero:

```text
.tcg/state.sqlite
```

Guarda raíces, repositorios, evidencias, ejecuciones, estados, fingerprints, errores, logs y consultas. No se edita con un editor de texto.

## 5. Catálogo de tecnologías

Fichero:

```text
config/technology-catalog.yaml
```

Define marcadores, dependencias, categorías y perfiles de exclusión.

## 6. Variables de entorno

| Variable | Función |
|---|---|
| `TCG_WORKSPACE` | Workspace explícito para comandos no interactivos |
| `TCG_CONFIG_HOME` | Cambia la carpeta del registro global |
| `TCG_KIT_ROOT` | Localiza la raíz del paquete durante desarrollo o pruebas |

## 7. Prioridad para resolver el workspace

1. `--workspace` o el alias `--root`;
2. `TCG_WORKSPACE`;
3. marcador en la carpeta actual o un ancestro;
4. último workspace válido del registro global;
5. administrador interactivo.

El directorio actual nunca se adopta silenciosamente.
