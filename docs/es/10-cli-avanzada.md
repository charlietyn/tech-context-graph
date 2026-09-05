# CLI avanzada

Utiliza `--workspace` en automatizaciones. `--root` queda como alias antiguo. `TCG_WORKSPACE` puede establecer el workspace de una sesión.

```bash
set TCG_WORKSPACE=D:\TCG\Catalogo
tcg root:list --json
tcg repository:list --json
tcg repository:review --accept-all
tcg repository:set-source api D:\Repositorios\plataforma\packages\api
tcg repository:inspect api shared-auth
tcg repository:inspect api shared-auth --pull
```

Usa `repository:review --accept-all` para aceptar todos los candidatos que estén pendientes en ese momento. No puede combinarse con `--accept` ni `--ignore`; si alguna aceptación falla, las demás continúan y el comando termina con estado `1`.

Usa `repository:set-source <clave> <carpeta>` cuando el descubrimiento encuentre el contenedor del repositorio pero el código fuente real esté en otra carpeta. La carpeta debe existir. La ruta registrada y la clave del repositorio no cambian; las siguientes huellas e inspecciones de Graphify utilizan la carpeta de origen editada.

Añade `--pull` para ejecutar `git pull --ff-only` en cada carpeta original distinta antes de la inspección. Un pull fallido omite Graphify para las entradas afectadas y hace que el comando termine con estado `1`. Consulta [Git pull antes de actualizar el grafo](15-git-pull-antes-inspeccion.md) para conocer en detalle la seguridad y el comportamiento con varios repositorios.
