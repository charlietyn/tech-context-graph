# Seguridad

Graphify se ejecuta con argumentos separados y `shell: false`. Las rutas se validan antes de guardarse. El escáner evita enlaces simbólicos y excluye dependencias y builds comunes.

Las inspecciones de código utilizan el flujo AST local de Graphify. Los documentos pueden requerir proveedores semánticos y deben respetar las políticas de privacidad.
