# Lúmina TV: fuentes y actualización del catálogo

## Descubrimiento de canales

En Administración, **Buscar emisoras en fuentes públicas (Latinoamérica)** consulta metadatos públicos de los 20 países configurados y guarda los candidatos identificados como **Pendiente de señal**. Esta búsqueda permite crear fichas de canales; no descubre una transmisión reproducible ni acredita derechos de distribución.

Una ficha pendiente no se expone en el catálogo de usuarios hasta que el administrador le asigne una fuente válida y la active.

## Buscar listas automáticamente

En Administración, el botón **Buscar listas y agregar canales pendientes** consulta el catálogo estructurado de Teleonline (`https://teleonline.github.io/listas/tv.json`), declarado por su mantenedor como una recopilación de emisiones oficiales y autorizadas. Lúmina filtra los 20 países latinoamericanos configurados y toma únicamente enlaces HTTPS directos con extensiones de vídeo admitidas.

La búsqueda omite señales servidas mediante reproductores incrustados, plataformas o formatos que el reproductor no admite directamente. Los canales nuevos se crean deshabilitados; si ya existe una ficha sin señal, se completa con la URL encontrada y se mantiene deshabilitada hasta que el administrador la revise. Los duplicados que ya tienen una fuente no se sobrescriben.

El directorio es una fuente comunitaria y sus declaraciones no sustituyen una comprobación independiente de los derechos, restricciones regionales, términos de la emisora y disponibilidad real. Antes de activar una señal, revisar la web oficial registrada, confirmar que su retransmisión está autorizada y probarla en el dispositivo. La búsqueda nunca activa canales automáticamente.

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