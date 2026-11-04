# Lúmina TV: fuentes y actualización del catálogo

## Descubrimiento de canales

En Administración, **Buscar emisoras en fuentes públicas (Latinoamérica)** consulta metadatos públicos de los 20 países configurados y guarda los candidatos identificados como **Pendiente de señal**. Esta búsqueda permite crear fichas de canales; no descubre una transmisión reproducible ni acredita derechos de distribución.

Una ficha pendiente no se expone en el catálogo de usuarios hasta que el administrador le asigne una fuente válida y la active.

## Buscar listas automáticamente

En Administración, **Buscar listas automáticamente** consulta el catálogo estructurado de Teleonline (\`https://raw.githubusercontent.com/teleonline/listas/main/tv.json\`). La interfaz permite elegir país, categoría (deportes, noticias, música, infantil, películas, series, documentales, entretenimiento, educación, cultura, estilo de vida y religión), cantidad máxima de señales a comprobar y presupuesto de tiempo. El servidor limita la cantidad real de comprobaciones y sus tiempos de espera; si se alcanza el límite, informa cuántas candidatas quedaron sin comprobar.

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
- Vídeo directo: MP4, M4V, WebM y Ogg/OGV.
- La búsqueda automática prioriza HLS y prueba hasta dos direcciones alternativas por canal.

La validación del servidor restringe las fuentes nuevas a HLS, MPEG-DASH, MP4, M4V, WebM y Ogg/OGV. Otros contenedores (MOV, TS, MKV, AVI y FLV) no se ofrecen como compatibles porque el soporte del navegador y del TV Box es irregular. Una respuesta técnicamente válida tampoco garantiza reproducción continua ni compatibilidad con todos los dispositivos.

## Catálogo visible, prueba y administración de canales

La API del catálogo devuelve a cada usuario únicamente las señales activas con una fuente HTTPS, y además una lista de fichas pendientes autorizadas por sus permisos. Las fichas pendientes muestran nombre, país, categoría y, cuando está disponible, la página oficial; nunca se les envía al navegador la URL de transmisión hasta que el canal esté activo. En TV en vivo se separan las señales reproducibles de las que siguen en preparación.

El botón **Actualizar** muestra el estado de la consulta en la propia sección TV en vivo, junto con la hora de actualización y las cantidades activas y pendientes. En Administración, **Probar** abre un reproductor de vista previa para comprobar la señal en el navegador del administrador; esto no publica el canal ni reemplaza la revisión de autorización.

La tabla de Administración separa las acciones **Editar** y **Activar / desactivar**: editar metadatos no cambia el estado de publicación. Al activar, se pueden ingresar hasta cinco fuentes HTTPS (una por línea) y cada una debe superar la validación técnica. La tabla permite seleccionar varios canales, eliminar la selección o borrar el catálogo completo. El borrado total requiere escribir exactamente `BORRAR TODOS LOS CANALES`. La eliminación de una ficha también elimina automáticamente sus permisos individuales asociados.

## Límites operativos y permisos

- La importación remota acepta listas de hasta 1 MiB y bloquea redirecciones HTTP; se debe ingresar la URL final.
- La importación procesa hasta 500 entradas por ejecución.
- Si un canal ya existe y pertenece a otra fuente, se evita sobrescribirlo automáticamente.
- Los canales importados se habilitan para cuentas que tengan permiso; la configuración de permisos de usuario sigue aplicándose.
- Los canales descubiertos en fuentes públicas quedan pendientes hasta asociar una transmisión autorizada.
- Las listas locales importadas desde la aplicación de TV se guardan solo en ese navegador; para compartir un catálogo se usa el importador de Administración.

Para una actualización automática de servidor 24/7 sería necesario configurar un Cron Trigger de Cloudflare Worker por separado. La actualización cada 24 horas documentada aquí depende de que se abra o permanezca abierta la página de Administración.
## Migración de categorías

La ampliación de permisos por categoría requiere aplicar `migrations/0005_expand_channel_categories.sql` a la base D1 de **Preview** (`minios-tv-preview-db`). La publicación de Pages no ejecuta automáticamente esta migración. No aplicar este archivo a la base de Producción durante las pruebas.
