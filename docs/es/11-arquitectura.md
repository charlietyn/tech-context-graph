# Arquitectura y futura migración a NestJS

La CLI es un adaptador de presentación. La resolución del workspace, descubrimiento, revisión, persistencia y ejecución de Graphify son servicios reutilizables.

La evolución prevista incluye `apps/cli`, `apps/api` y `apps/worker`. SQLite es correcto para uso local de un proceso. La versión servidor debería usar PostgreSQL, almacenamiento de objetos y una cola. Graphify seguirá siendo un motor Python externo.
