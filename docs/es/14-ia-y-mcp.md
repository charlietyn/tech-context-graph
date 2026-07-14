# Asistentes de IA y MCP

[Índice de documentación](README.md) · [Seguridad](08-seguridad.md) · [English](../en/14-ai-and-mcp.md)

## Propósito

Este capítulo explica cómo un grafo de conocimiento mantenido puede mejorar el desarrollo asistido por IA y cómo encaja el soporte opcional de Model Context Protocol de Graphify.

Tech Context Graph no implementa actualmente un servidor MCP. Administra repositorios y salidas de Graphify. Graphify es el componente que puede exponer operaciones del grafo mediante MCP cuando la versión instalada lo permite.

## Por qué el contexto del proyecto debe preceder al consejo genérico

Un asistente de IA suele disponer de varias fuentes:

1. el prompt actual;
2. los archivos adjuntos o abiertos;
3. herramientas del proyecto, como búsqueda o un grafo;
4. el conocimiento general del modelo;
5. fuentes externas de internet.

Para una pregunta específica del proyecto, lo normal es preferir primero la evidencia local y después la orientación general. Internet resulta valioso para documentación vigente de frameworks, avisos de seguridad y estándares. Tiene menos autoridad sobre la arquitectura privada de una aplicación.

Por ejemplo, internet puede explicar qué es un guard de NestJS. Solo el repositorio puede mostrar qué guard protege `RefundController`, de dónde proceden sus permisos y qué pruebas definen el comportamiento esperado.

## Tres niveles de integración

### Nivel 1: preguntas interactivas

Utiliza la interfaz de Tech Context Graph, selecciona un proyecto inspeccionado y ejecuta `Query`, `Explain` o `Path`. Es el flujo más sencillo y no requiere configurar un cliente MCP.

### Nivel 2: consultas CLI dirigidas por un agente

Un agente con acceso al terminal puede ejecutar subcomandos deterministas de Graphify contra un grafo aprobado. Este enfoque resulta útil en entornos locales donde los permisos del usuario ya gobiernan los comandos.

### Nivel 3: Graphify mediante MCP

MCP ofrece al cliente de IA una interfaz estructurada de herramientas. En vez de obligar al modelo a recordar la sintaxis de un comando, el cliente puede ofrecer operaciones explícitas con entradas y salidas definidas.

El flujo conceptual es:

```text
cliente de IA
  -> petición MCP
  -> servidor MCP de Graphify
  -> graph.json mantenido
  -> nodos, aristas, caminos y ubicaciones de origen
  -> explicación de la IA
```

Consulta la CLI de Graphify instalada porque las opciones y la configuración de clientes pueden evolucionar:

```bash
graphify --help
graphify <ruta-del-repositorio> --mcp
```

No describas `tcg` como servidor MCP mientras esa capacidad no esté implementada en una versión futura.

## Una buena política para el agente

Proporcionar una herramienta de grafo es útil; proporcionar una política de decisión lo es todavía más:

```text
Para preguntas sobre este código:
1. Consulta primero el grafo del proyecto.
2. Sigue las ubicaciones de origen para afirmaciones que afecten al código.
3. Lee el código y las pruebas relevantes antes de editar.
4. Usa documentación externa oficial cuando la pregunta dependa de una API o norma vigente.
5. Indica claramente cuando el grafo no contiene evidencia suficiente.
```

Esta política no prohíbe investigar en internet. Evita que una respuesta genérica sustituya silenciosamente la evidencia local.

## Preguntas de ejemplo según el objetivo

### Orientación

```text
¿Cuáles son los módulos centrales del repositorio?
¿Qué nodos conectan la persistencia con la CLI?
Explica RepositoryDiscoveryService.
```

### Impacto de un cambio

```text
¿Qué depende de WorkspaceConfigService?
¿Qué flujos cambiarían al modificar la clasificación de repositorios?
Encuentra caminos entre RepositoryStoreService y ConsoleUiService.
```

### Depuración

```text
Sigue el estado de inspección desde RUNNING hasta READY.
¿Dónde puede marcarse un grafo como MISSING?
¿Qué código registra un proceso fallido de Graphify?
```

### Incorporación al proyecto

```text
Explica la diferencia entre workspace y raíz de repositorios.
¿Cómo pasa un candidato de detectado a aceptado?
¿Qué archivos debo leer para entender la vigencia del grafo?
```

## Cómo evaluar una respuesta de IA

Una respuesta es más sólida cuando:

- menciona símbolos concretos del proyecto;
- explica las relaciones entre ellos;
- señala ubicaciones de origen;
- diferencia hechos extraídos de inferencias;
- reconoce estados desactualizados o incompletos;
- recomienda leer o probar el código afectado antes de cambios importantes.

Una respuesta es más débil cuando suena convincente pero podría aplicarse sin cambios a cualquier repositorio del mismo framework.

## Vigencia e invalidación

Una conexión MCP no actualiza datos obsoletos. Antes de confiar en una respuesta:

1. comprueba el estado del repositorio en Tech Context Graph;
2. actualiza un grafo `STALE`;
3. investiga estados `FAILED` o `MISSING`;
4. confirma que el repositorio correcto fue aceptado e inspeccionado;
5. reconstruye cuando cambien de forma importante las reglas de extracción o exclusión.

## Modelo de seguridad

Un grafo puede revelar arquitectura aunque no contenga el texto completo del código. Los nombres de nodos, dependencias, rutas y comunidades pueden exponer información de diseño sensible.

Antes de habilitar MCP:

- utiliza únicamente un transporte local o protegido y aprobado;
- limita los usuarios y clientes autorizados;
- no expongas el endpoint directamente a internet;
- revisa el contenido del grafo y las rutas excluidas;
- considera sensibles los logs de consultas;
- elimina o rota accesos cuando cambie el equipo;
- respeta las políticas de código fuente y tratamiento de datos de la organización.

## Limitaciones

- El grafo refleja lo que la extracción pudo observar, no todo el comportamiento en ejecución.
- El despacho dinámico, la reflexión, el código generado y los servicios externos pueden quedar incompletos.
- Una arista facilita la navegación, pero no demuestra la corrección del negocio.
- MCP transporta contexto; no valida el razonamiento del modelo.
- Las pruebas, la lectura del código y la observación en ejecución siguen siendo esenciales.

El mejor flujo combina navegación por el grafo, evidencia directa del código, pruebas automatizadas y criterio humano.
