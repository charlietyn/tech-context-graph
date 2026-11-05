# Estilo de código

Sin ESLint ni Prettier en el repo; estas son las convenciones observadas. Sigue las del fichero que tocas.

## TypeScript

- `strict: true`. Se tolera `any` en filas SQL y JSON de Graphify; evítalo en código nuevo de dominio.
- Módulos CommonJS con sintaxis `import`.
- Imports de Node con prefijo `node:` (`node:fs`, `node:path`).
- 2 espacios, comillas simples, punto y coma.
- Identificadores, mensajes y comentarios en **inglés**. Los comentarios explican el **porqué**.

## Estilo denso existente

Los servicios recientes usan líneas largas y bloques compactos. Los comandos declaran opciones en una línea:

```ts
@Option({ flags: '--json' }) parseJson(): boolean { return true; }
```

No reformatees ficheros enteros: el diff debe mostrar el cambio.

## Errores

| Caso | Tipo |
|---|---|
| Un llamador debe distinguirlo | `OperationError(code, message)` |
| Entrada inválida, precondición | `Error` con mensaje accionable |
| Cancelación de prompt | `Error('TCG_CANCELLED')` |

- Los mensajes dicen **qué pasó y qué hacer**, con la ruta o key concreta.
- Fallos en lote: registrar por elemento y seguir. Nunca abortar por un repositorio independiente.
- `catch {}` vacío solo con comentario que lo justifique.

## Sistema de ficheros

- Resuelve con `resolve`. Nunca concatenes separadores.
- Estado: temporal + `rename`. Temporales únicos con `randomUUID` donde pueda haber concurrencia.
- Valida contención con `relative` y comprueba `..` antes de mover.
- Compara rutas en minúsculas solo donde ya se hace (registro, raíces, id).

## Procesos

Siempre `runProcess`/`runGit`, con `signal` si la operación es cancelable. Comprueba `exitCode`: **`runProcess` no lanza por salida no cero.**

## Salida

Solo la presentación imprime. Con `--json`, stdout es **exclusivamente** JSON válido.
