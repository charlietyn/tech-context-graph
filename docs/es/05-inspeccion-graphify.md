# Inspección con Graphify

[Anterior: Detección](04-deteccion-revision.md) · [Índice](README.md) · [Siguiente: Detalle](06-detalle-proyecto.md) · [English](../en/05-graphify-inspection.md)

Solo pueden seleccionarse repositorios aceptados. La interfaz informa si el grafo nunca se generó, está ejecutándose, está actualizado, quedó desactualizado, falló o falta.

Graphify se ejecuta secuencialmente para mantener predecible el consumo y los logs. Cada ejecución registra comando, versión, fingerprint, fechas, ruta del grafo, nodos, relaciones, errores y log.

**Pull latest code + update graphs** permite buscar y seleccionar varios repositorios desde el menú principal; ejecuta `git pull --ff-only` en cada carpeta original antes de Graphify. Si un pull falla, ese grafo se omite y los demás repositorios continúan. La acción normal **Update graph** no contacta remotos Git. Consulta [Git pull antes de actualizar el grafo](15-git-pull-antes-inspeccion.md) para conocer todas las validaciones, reglas de seguridad y opciones de automatización.

## Qué produce la inspección

Una inspección correcta crea artefactos de Graphify bajo la salida configurada. El artefacto central es `graph.json`; los informes y visualizaciones dependen del modo y la versión de Graphify.

Las salidas por defecto siempre se guardan en `tech-graphify-out/technologies/`: las tecnologías reconocidas usan `<tecnología>/<clave-repositorio>/` y los repositorios sin reconocer usan `<clave-repositorio>/`, independientemente de su rol en el catálogo. Por ejemplo, Go y driver-js pueden usar `tech-graphify-out/technologies/go/` y `tech-graphify-out/technologies/driver-js/` mientras figuren como `unknown`. Graphify puede crear su propio `graphify-out/graph.json` dentro de cada carpeta de salida.

Al abrir un workspace antiguo, el catálogo migra las salidas planas por defecto (`tech-graphify-out/<clave-repositorio>/`) y su historial de inspecciones. Si las carpetas ya se movieron al destino, las reconoce sin reconstruir el grafo. Si existen ambas ubicaciones, la migración se detiene e indica sus rutas para resolver el conflicto sin sobrescribir ninguna copia. Se conservan las rutas de salida personalizadas. El texto histórico de comandos y logs mantiene las rutas de la ejecución original; el grafo del propio Tech Context Graph sigue separado en `graphify-out/`.

Tech Context Graph registra cantidades y ubicaciones, pero el número de nodos no es una nota de calidad. Un grafo grande no es necesariamente mejor que uno pequeño capaz de responder las preguntas relevantes.

## Actualizar frente a reconstruir

Usa **Update graph** después de cambios normales: Graphify puede reutilizar resultados. Usa **Fully rebuild graph** cuando sospeches inconsistencias de caché, cambie sustancialmente la extracción o necesites explícitamente una base limpia.

## Flujo ante un fallo

1. Lee el error y los archivos de `.tcg/logs`.
2. Ejecuta `tcg doctor`.
3. Comprueba permisos y disponibilidad de Graphify.
4. Corrige la causa.
5. Prueba una actualización antes de forzar una reconstrucción.
6. Reconcilia el estado si el proceso se interrumpió.

Nunca utilices un grafo `FAILED` como contexto vigente.
