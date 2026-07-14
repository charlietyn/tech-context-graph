# Carpetas de búsqueda de repositorios

[Anterior: Workspaces](02-workspaces.md) · [Índice](README.md) · [Siguiente: Detección](04-deteccion-revision.md) · [English](../en/03-repository-roots.md)

Una raíz es un árbol de carpetas que puede contener muchos repositorios. No se copia al workspace. Se admiten varias raíces porque una empresa puede separar backend, frontend, móvil, librerías e infraestructura.

Cada raíz guarda ruta, estado habilitado, profundidad, confianza mínima, rol y última fecha de escaneo. Los cambios de la CLI se sincronizan en YAML y SQLite.

## Elegir una buena raíz

Elige la carpeta estable más estrecha que contenga los repositorios que deseas administrar. Una raíz demasiado amplia consume tiempo y puede encontrar copias, ejemplos o trabajo ajeno. Una demasiado estrecha obliga a repetir configuración.

```text
/engineering                         demasiado amplia si contiene backups
/engineering/repositories            normalmente adecuada
/engineering/repositories/api-one    demasiado estrecha si importan veinte repositorios hermanos
```

## Profundidad y confianza

La profundidad máxima limita cuánto desciende el escáner. La confianza mínima determina cuánta evidencia exige una clasificación. Aumentar profundidad incrementa el coste. Reducir confianza aumenta falsos positivos. Modifica una variable cada vez y revisa siempre los candidatos.

## Comandos

```bash
tcg root:add <ruta> --workspace <workspace>
tcg root:list --workspace <workspace>
tcg root:scan <id> --workspace <workspace>
tcg root:disable <id>
tcg root:remove <id>
```

Deshabilitar evita futuros escaneos. Eliminar la configuración de la raíz conserva el historial y los grafos existentes.
