# Inicio rápido - Tech Context Graph

## 1. Instalar requisitos

Instala Node.js 20+, Python 3.10+, Git, `uv` y Graphify:

```bash
uv tool install graphifyy
```

Instala este paquete localmente:

```bash
npm install
npm run build
npm link
```

## 2. Iniciar sin asumir ninguna carpeta

```bash
tcg
```

En una computadora nueva, la aplicación informa que no existe un workspace configurado y ofrece:

```text
Crear un workspace nuevo
Abrir o adoptar un workspace existente
Salir
```

## 3. Crear el workspace explícitamente

Escribe un nombre y después indica cómo proporcionar su ubicación:

```text
Navegar por carpetas
Escribir o pegar una ruta completa
Usar el directorio actual - avanzado
Volver (`Back` en la interfaz)
```

El directorio actual nunca se selecciona silenciosamente.

## 4. Añadir carpetas de búsqueda de repositorios

Después de abrir el workspace, selecciona:

```text
Carpetas de búsqueda de repositorios
  -> Añadir una carpeta de búsqueda
```

Navega hasta la carpeta real de esa computadora o pega la ruta. Ejemplos solamente:

```text
D:\Desarrollo
E:\Empresa\Repositorios
/home/usuario/proyectos
```

Ninguna ruta de ejemplo se utiliza como valor predeterminado.

## 5. Escanear y revisar

Selecciona `Discover repositories`, elige una raíz configurada, confirma el escaneo y revisa los candidatos. Un candidato detectado no se acepta automáticamente.

## 6. Inspeccionar con Graphify

Selecciona `Inspect with Graphify` y después:

```text
Todos los repositorios pendientes
Escoger uno o varios con buscador
Escoger uno con buscador
```

El buscador filtra por nombre, tecnología, categoría, estado y ruta.

## 7. Trabajar con un proyecto inspeccionado

Selecciona `Inspected project details` y elige un proyecto. Sus acciones incluyen:

```text
Actualizar grafo
Reconstruir completamente
Consultar el grafo
Explicar un nodo o concepto
Buscar un camino entre dos nodos
Mostrar ubicaciones de archivos
Quitar del catálogo activo
```

## 8. Localizar toda la configuración

```bash
tcg config:paths
```

## Ejemplo no interactivo

```bash
tcg workspace:create --path "D:\TCG\CatalogoEmpresa" --name "Catálogo de empresa" --non-interactive
tcg root:add "D:\Desarrollo" --workspace "D:\TCG\CatalogoEmpresa"
tcg root:list --workspace "D:\TCG\CatalogoEmpresa"
```
