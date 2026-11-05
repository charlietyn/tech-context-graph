# Módulo: Detección de tecnologías

**Ficheros:** `src/services/repository-discovery.service.ts`, `src/services/repository-manifest.service.ts`, `src/services/technology-catalog.service.ts`, `config/technology-catalog.yaml`, `ignore/*.graphifyignore`.

Flujo y puntuación en [features/repository-discovery.md](../features/repository-discovery.md). Añadir una tecnología: [workflows/add-technology-profile.md](../workflows/add-technology-profile.md).

## Perfiles existentes

`nestjs`, `laravel`, `spring-boot`, `nuxt`, `vue`, `primevue`, `nextjs`, `react`, `expo`, `flutter`, `angular`, `dotnet`, `python`, `nodejs`, `php`, `go`, `rust`, `terraform`.

## Campos de un perfil (`TechnologyProfile`)

| Campo | Uso |
|---|---|
| `display_name`, `default_category`, `ignore_profile` | Presentación, categoría, exclusiones |
| `files_any`, `files_glob_any`, `text_markers` | Detección por ficheros |
| `package_dependencies_any`, `composer_require_any`, `maven_dependencies_any`, `dependency_prefixes_any`, `composer_extra_any` | Detección por dependencias |
| `core_package_names_any`, `core_repository_names_any` | Identifican la tecnología en sí |
| `library_package_names_any` | Identifican librerías conocidas |
| `maven_version_properties_any` | Propiedades Maven que declaran versiones |
| `member_key_aliases` | Key de cada miembro de una tecnología compuesta |

## Parser de manifiestos

`readRepositoryManifest` prueba en orden: `package.json`, `composer.json`, `pom.xml`, `build.gradle(.kts)`.

- **Maven y Gradle se parsean con regex**, no con un parser real. Maven separa `<parent>` para no confundir coordenadas. Es intencional por ligereza; un POM o Groovy inusual puede clasificarse mal.
- Un manifiesto inválido devuelve `undefined` y cae al siguiente formato o a `unknown`. Nunca aborta.
- `versionMajors` extrae majors de restricciones por regex. No resuelve rangos.

## Dos conjuntos de reglas de exclusión distintos

| Dónde | Para qué |
|---|---|
| `settings.exclude_directories` del catálogo | Directorios que **no se recorren al escanear** |
| `ignore/*.graphifyignore` | Rutas que **Graphify no procesa** (`--exclude`) |

`common` incluye `**/testdata/` por casos de agotamiento de memoria con corpus de tests. Cambiar estos ficheros invalida el hash de configuración de los repositorios afectados y los re-extrae.

## Overrides

`technology-catalog.override.yaml` en el workspace se fusiona en profundidad. **Los arrays se reemplazan, no se concatenan.** No se valida con schema.
