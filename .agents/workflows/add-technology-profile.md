# Workflow: Añadir una tecnología

No suele requerir TypeScript.

1. **En `config/technology-catalog.yaml`, sección `profiles`:**

   ```yaml
   sveltekit:
     display_name: SvelteKit
     default_category: frontend
     ignore_profile: common
     files_glob_any: [svelte.config.*]
     package_dependencies_any: ['@sveltejs/kit']
     core_package_names_any: ['@sveltejs/kit']
     core_repository_names_any: [kit]
   ```

   Campos: [technology-detection.md](../modules/technology-detection.md).

2. **Calibra la puntuación:** el umbral por defecto es 60. Un fichero solo da 35; dos, o una dependencia, ya bastan. Busca que supere al perfil genérico que también coincidirá (`nodejs`, `react`). Gana la puntuación más alta.

3. **Prueba falsos positivos:** una app que **usa** la tecnología debe clasificarse `application`, una librería `library`, y el repositorio oficial `core`.

4. **Exclusiones (opcional):** crea `ignore/<perfil>.graphifyignore` y referéncialo en `ignore_profile`. Se suma a `common`.

5. **Alias de categorías:** `category_aliases` traduce nombres de carpeta, sin tildes y en minúsculas.

6. **Tecnología compuesta (opcional):** `member_key_aliases` nombra los miembros.

7. **Tests** en `test/repository-discovery.service.spec.ts`: crean carpetas falsas en temporales. Añade detección, clasificación y al menos un caso de no agrupar.

   ```powershell
   npx jest test/repository-discovery.service.spec.ts --runInBand
   ```

## Efectos

- **Cambiar un `ignore_profile` o sus patrones re-extrae** los repositorios afectados.
- Un perfil nuevo puede **reclasificar** repositorios ya aceptados al re-escanear, sobrescribiendo su tecnología ([R-02](../technical-debt/risks.md)).
- Para pruebas de usuario sin tocar el paquete: `technology-catalog.override.yaml` en el workspace.
- `config/` se publica, no requiere cambios en `package.json`.
