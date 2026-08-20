# REPERTORIOS RL

Aplicación web para gestionar repertorios de worship/génesis. Permite organizar canciones, listas y repertorios semanales con soporte para transposición de acordes, audio vinculado y gestión de vocales.

## Características

- **Biblioteca de canciones** — Agregar, editar, eliminar y buscar canciones con letra y acordes
- **Transposición de acordes** — Cambiar tono al vuelo con notación ♭ / #
- **Listas** — Organizar canciones en listas para ensayos o servicios
- **Repertorios semanales** — Crear repertorios por domingo/lunes con vocales asignados
- **Audio vinculado** — Subir y reproducir audio directamente desde la canción
- **Importar/Exportar** — Soporte para archivos `.txt` y `.json`
- **Modo Admin** — Gestión completa de repertorios (contraseña: `worship2026`)
- **PWA** — Instalable como app en móvil y escritorio

## Uso

1. Abre `index.html` en tu navegador
2. Para acceder a funciones de admin, toca "Admin" en la pestaña Repertorios
3. La contraseña por defecto es `worship2026`

## Despliegue en GitHub Pages

1. Crea un repositorio en GitHub
2. Sube el archivo `index.html`
3. Ve a **Settings > Pages**
4. Selecciona la rama `main` y la carpeta `/ (root)`
5. Tu app estará disponible en `https://tu-usuario.github.io/tu-repo/`

## Tecnologías

- HTML5, CSS3, JavaScript vanilla
- Supabase (backend, base de datos y storage)
- PWA con Web App Manifest

## Estructura del proyecto