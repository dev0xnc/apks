# Lúmina TV

Plataforma independiente enfocada exclusivamente en televisión en vivo. La aplicación web se sirve desde Cloudflare Pages y utiliza Cloudflare D1 para cuentas, sesiones, catálogo y permisos.

## Componentes

- `apps/minios-tv/`: interfaz de televisión en vivo y panel de administración.
- `functions/api/auth/`: registro, inicio/cierre de sesión y gestión de contraseña.
- `functions/api/channels.js`: catálogo filtrado por permisos.
- `functions/api/admin/`: administración de usuarios, permisos y señales.
- `migrations/`: esquema de base de datos.

> El identificador de carpeta y algunas rutas API conservan temporalmente el nombre técnico anterior para no romper despliegues ni sesiones existentes. La identidad visible del producto es Lúmina TV.

## Descubrimiento y derechos de transmisión

El descubrimiento público puede completar metadatos (nombre, país, idioma y sitio oficial), pero no demuestra que exista una URL de streaming ni que se permita retransmitirla. Una señal solo debe publicarse cuando la URL provenga del titular o de una fuente con autorización verificable. Los canales pendientes no se muestran a los usuarios.

La disponibilidad de reproducción depende del proveedor, el navegador, CORS, formatos y restricciones regionales o de acceso. No se incluyen listas pirateadas ni se eluden controles de acceso.

## Guía de fuentes

Consultá [`docs/LUMINA-TV-FUENTES.md`](docs/LUMINA-TV-FUENTES.md) para el descubrimiento de canales, la importación de listas M3U autorizadas, la actualización de catálogo y los formatos de reproducción admitidos.

## Desarrollo y despliegue

Usá el entorno Preview de Cloudflare Pages y la base D1 de Preview para probar cambios. No ejecutes migraciones ni despliegues en producción sin revisar y autorizar expresamente esos pasos.
