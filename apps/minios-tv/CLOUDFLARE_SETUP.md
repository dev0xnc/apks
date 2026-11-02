# MiniOS TV 0.9.0 - Cloudflare Pages

Esta versión requiere Cloudflare Pages Functions y D1. No funciona con GitHub Pages como alojamiento de producción porque GitHub Pages no ejecuta las funciones del servidor.

## Antes de publicar
1. Crear una base D1.
2. Ejecutar en orden las migraciones `migrations/0001_minios_tv.sql` y `migrations/0002_single_admin_guard.sql`.
3. En Cloudflare Pages, configurar un binding D1 llamado `DB` que apunte a esa base.
4. Configurar el secreto `ADMIN_BOOTSTRAP_KEY` en Pages Functions.
5. Desplegar la rama y comprobar las funciones antes de anunciar el sitio.
6. Crear el primer administrador mediante `POST /api/auth/bootstrap-admin`, con JSON `email` y `password`, y el header `X-MiniOS-Bootstrap-Key`. La contraseña inicial debe tener 16 caracteres o más.
7. Retirar el secreto de bootstrap una vez creado el administrador.
8. Desactivar el sitio GitHub Pages antiguo para que no exista una ruta pública que evite el inicio de sesión.

## Comprobaciones
- Sin sesión, las páginas privadas redirigen al acceso.
- Las cuentas registradas reciben rol `user`; el registro no acepta roles.
- Solo el rol comprobado en D1 puede acceder al panel y a las APIs administrativas.
- Las sesiones se guardan en D1 como hashes de tokens aleatorios.
- Las fuentes administradas aceptan URLs HTTPS directas de medios; aun así, la reproducción depende de CORS, región y permisos del proveedor.

No introduzcas contraseñas ni secretos en el repositorio, en capturas o en conversaciones.
