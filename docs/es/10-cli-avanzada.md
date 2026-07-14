# CLI avanzada

Utiliza `--workspace` en automatizaciones. `--root` queda como alias antiguo. `TCG_WORKSPACE` puede establecer el workspace de una sesión.

```bash
set TCG_WORKSPACE=D:\TCG\Catalogo
tcg root:list --json
tcg repository:list --json
tcg repository:inspect api shared-auth
```
