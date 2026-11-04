# Lúmina TV: fuentes y actualización del catálogo

## Descubrimiento de canales

En Administración, **Buscar emisoras en fuentes públicas (Latinoamérica)** consulta metadatos públicos de los 20 países configurados y guarda los candidatos identificados como **Pendiente de señal**. Esta búsqueda permite crear fichas de canales; no descubre una transmisión reproducible ni acredita derechos de distribución.

Una ficha pendiente no se expone en el catálogo de usuarios hasta que el administrador le asigne una fuente válida y la active.

## Buscar listas automáticamente

En Administración, **Buscar listas automáticamente** consulta el catálogo estructurado de Teleonline (\`https://raw.githubusercontent.com/teleonline/listas/main/tv.json\`). La interfaz permite elegir país, cantidad máxima de señales a comprobar (5, 10, 20, 40 o 60) y presupuesto de tiempo (8, 12, 18 o 25 segundos). El servidor limita la cantidad real de comprobaciones y sus tiempos de espera; si se alcanza el límite, informa cuántas candidatas quedaron sin comprobar.

Antes de guardar una fuente, Lúmina realiza una petición HTTPS de lectura parcial, sin seguir redirecciones. Para HLS verifica que el contenido contenga \`#EXTM3U\`; para MPEG-DASH comprueba el manifiesto \`<MPD>\`; para vídeo directo exige un tipo MIME de vídeo reconocido. Se priorizan los formatos que el reproductor ya gestiona (HLS con HLS.js o soporte nativo, MPEG-DASH con dash.js y archivos directos compatibles). Las fuentes que no responden, redirigen, devuelven una página HTML o no coinciden con el formato se muestran como no validadas y no se incorporan como señales verificadas.

Los canales nuevos se guardan deshabilitados. Si ya existe una ficha sin fuente, se completa y sigue deshabilitada. Una fuente encontrada no se usa para reemplazar otra que ya estaba configurada. El panel muestra la marca **Compatible verificada · pendiente de revisión** cuando la comprobación de servidor fue satisfactoria. La creación o activación manual de una señal también exige superar esta comprobación técnica.

**Alcance de la prueba:** la comprobación de servidor confirma que la URL respondió y que su contenido parece corresponder al formato anunciado; no puede confirmar por sí sola CORS, reproducción en todos los navegadores o TV Box, restricciones geográficas, cookies, DRM, disponibilidad posterior ni derechos de distribución. El administrador debe revisar la página oficial y confirmar la autorización antes de activar. La búsqueda nunca activa canales automáticamente.

Fuente de datos: [Teleonline, catálogo público y su apartado de cumplimiento legal](https://github.com/teleonline/listas).

## Importar una lista M3U autorizada

En Administración, usar el panel **Importar / actualizar catálogo M3U**:

1. Seleccionar un archivo `.m3u` / `.m3u8` o ingresar una URL HTTPS pública que entregue la lista directamente.
2. Elegir un país por defecto solo cuando la lista no incluya `tvg-country` en cada entrada.
3. Ingresar una página oficial o referencia de autorización.
4. Confirmar que se cuenta con permiso para distribuir las señales.
5. Presionar **Importar / actualizar canales**.

Se leen `tvg-name`, el título después de la coma de `#EXTINF`, `tvg-logo`, `group-title`, `tvg-country` y `tvg-language`. Los enlaces deben ser HTTPS directos y terminar en una extensión de vídeo admitida. Se omiten las entradas sin nombre, país o formato compatible.

Para una URL remota, Lúmina TV conserva su dirección en el navegador de administración. Se vuelve a consultar cada 24 horas cuando la página de Administración se abre o permanece abierta. Los canales que desaparecen de esa lista se deshabilitan; no se borran. Esta actualización no se ejecuta en segundo plano con el navegador cerrado.

## Formatos de reproducción

- HLS (`.m3u8`): HLS.js o soporte HLS nativo del navegador.
- MPEG-DASH (`.mpd`): dash.js.
- Vídeo directo: MP4, M4V, WebM, Ogg/OGV, MOV, MPEG/MPG, 3GP, TS, MKV, AVI y FLV.

La aceptación de una URL no garantiza que el proveedor esté transmitiendo en ese momento. El soporte real de MOV, MKV, AVI, FLV, TS y otros contenedores depende de los códecs instalados en el navegador y del dispositivo. No existe compatibilidad universal para todos los formatos sin transcodificación.

## Límites operativos y permisos

- La importación remota acepta listas de hasta 1 MiB y bloquea redirecciones HTTP; se debe ingresar la URL final.
- La importación procesa hasta 500 entradas por ejecución.
- Si un canal ya existe y pertenece a otra fuente, se evita sobrescribirlo automáticamente.
- Los canales importados se habilitan para cuentas que tengan permiso; la configuración de permisos de usuario sigue aplicándose.
- Los canales descubiertos en fuentes públicas quedan pendientes hasta asociar una transmisión autorizada.
- Las listas locales importadas desde la aplicación de TV se guardan solo en ese navegador; para compartir un catálogo se usa el importador de Administración.

Para una actualización automática de servidor 24/7 sería necesario configurar un Cron Trigger de Cloudflare Worker por separado. La actualización cada 24 horas documentada aquí depende de que se abra o permanezca abierta la página de Administración.