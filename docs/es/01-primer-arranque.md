# Primer arranque

[Anterior: Visión general](00-vision-general.md) · [Índice](README.md) · [Siguiente: Workspaces](02-workspaces.md) · [English](../en/01-first-run.md)

Ejecuta `tcg`. En una computadora nueva se abre el administrador de workspaces en vez de usar el directorio actual. Selecciona **Create a new workspace**, escribe un nombre claro y navega o pega la ubicación exacta donde se podrán guardar SQLite, grafos, informes y logs.

Antes de crear ficheros, el asistente muestra todas las rutas y solicita confirmación. Usar el directorio actual es una opción avanzada explícita.

Después añade una o varias carpetas de búsqueda de repositorios. Pueden estar en otro disco o en una ubicación de red.

## Antes de comenzar

Comprueba las herramientas necesarias:

```bash
node --version
python --version
git --version
graphify --version
tcg doctor
```

Si `tcg` no aparece después de `npm link`, abre otro terminal y confirma que el directorio global de binarios de npm se encuentra en `PATH`.

## Qué pregunta el asistente

La **ubicación del workspace** es el lugar donde Tech Context Graph guarda su propio estado. No tiene que estar dentro de un repositorio:

```text
D:\Engineering\TCG\CompanyCatalog       Windows
/home/ana/.local/share/tcg/catalog       Linux
/Users/ana/TCG/CompanyCatalog            macOS
```

La **raíz de búsqueda de repositorios** es donde ya existe el código fuente:

```text
D:\Engineering\Repositories
/srv/source
/Users/ana/Developer
```

No elijas la misma carpeta únicamente por comodidad. Considera copias de seguridad, permisos, espacio y privacidad.

## Resultado esperado

Después del primer arranque, `tcg config:paths` debe mostrar el marcador, YAML editable, estado SQLite, grafos, informes y logs. Ningún repositorio se inspecciona hasta que se descubre, revisa y acepta.

## Error habitual

Crear un workspace no registra automáticamente los repositorios cercanos. El workspace es el centro de control; las raíces son entradas separadas. Continúa con [los conceptos del workspace](02-workspaces.md).
