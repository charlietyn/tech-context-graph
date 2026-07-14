# Detección y revisión humana

[Anterior: Raíces](03-raices.md) · [Índice](README.md) · [Siguiente: Inspección](05-inspeccion-graphify.md) · [English](../en/04-detection-and-review.md)

La detección utiliza ficheros y dependencias como evidencia. Los nombres de carpetas aportan contexto, pero no constituyen una prueba suficiente. Los nuevos resultados entran como `DETECTED` y no pueden inspeccionarse.

La pantalla de revisión permite buscar y seleccionar varios. Los elegidos pasan a `ACCEPTED`. Los no seleccionados quedan disponibles para otra revisión. Este modelo evita inspeccionar ejemplos, copias, fixtures y falsos positivos.

## Evidencias y puntuación

Los perfiles de `config/technology-catalog.yaml` definen archivos, dependencias, marcadores, categorías y perfiles de exclusión. Una dependencia específica pesa más que un archivo genérico. `package.json` puede identificar Node.js, pero por sí solo no demuestra que el proyecto sea React o NestJS.

Los repositorios Git sin evidencia suficiente aparecen como `Unclassified`. Se muestra su clave de carpeta para identificarlos, pero `unknown` continúa como valor interno hasta clasificarlos.

```bash
tcg repository:classify <clave> \
  --technology nestjs \
  --technology-label "NestJS" \
  --category backend
```

## Preguntas antes de aceptar

- ¿Es el repositorio canónico o una copia archivada?
- ¿La tecnología coincide con sus dependencias?
- ¿La categoría representa su uso real?
- ¿Hay ejemplos o fixtures que deban excluirse?
- ¿Está permitido generar un grafo de este código?

La revisión es una frontera de gobernanza, no una molestia.
