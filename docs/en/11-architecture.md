# Architecture and future NestJS migration

The CLI is a presentation adapter. Workspace resolution, discovery, catalog review, persistence and Graphify execution are services. This separation allows future NestJS applications to reuse the same use cases.

Target applications:

- `apps/cli`: local interactive client;
- `apps/api`: HTTP control plane;
- `apps/worker`: long-running Graphify jobs.

SQLite remains suitable for one local process. A server edition should use PostgreSQL, object storage and a job queue. Graphify remains an external Python engine behind a port.
