# MiniOS Core — ESP32

Firmware inicial para ESP32 clásico (por ejemplo ESP32-D0WD-V3).

## Funciones

- Punto de acceso Wi-Fi propio, con nombre MiniOS-XXXX.
- Modo simultáneo AP + STA: el ESP32 puede mantener su AP mientras intenta conectarse al router.
- Panel web local en \`http://192.168.4.1/\`.
- Estado básico del sistema mediante \`GET /api/status\`.
- Configuración Wi-Fi persistida en NVS mediante Preferences.
- Protección HTTP Basic para las operaciones de configuración y reinicio.
- Enlace a MiniOS Store en GitHub Pages.

## Requisitos

- Arduino IDE.
- Paquete de placas ESP32 de Espressif.
- Placa seleccionada: ESP32 Dev Module.
- No requiere instalar librerías externas: WiFi, WebServer y Preferences vienen con el core ESP32.

## Cargar

1. Abrir \`MiniOS_Core.ino\` en Arduino IDE.
2. Seleccionar ESP32 Dev Module y el puerto correcto.
3. Compilar y cargar a 115200 baudios.
4. Abrir el monitor serie a 115200.
5. Conectar un teléfono o PC a la red MiniOS-XXXX.
6. Abrir \`http://192.168.4.1/\`.

## Credenciales iniciales

- Wi-Fi AP: \`MiniOS-Setup\`
- Usuario del panel: \`admin\`
- Contraseña inicial: \`minios-admin\`

Cambiar la contraseña de administración desde el panel inmediatamente después de la primera prueba.

## Endpoints

- \`GET /\` — panel web.
- \`GET /api/status\` — estado público básico.
- \`POST /api/wifi\` — guarda SSID y contraseña; requiere autenticación.
- \`POST /api/admin\` — cambia contraseña de administración; requiere autenticación.
- \`POST /api/restart\` — reinicia el ESP32; requiere autenticación.

## Seguridad y límites

Este firmware inicial usa HTTP sin TLS. La autenticación Basic no cifra las credenciales durante el transporte. Usarlo sólo en una red local de confianza; no exponer el puerto 80 a Internet ni usarlo en redes públicas. La contraseña del AP es fija en esta versión y debe cambiarse antes de un despliegue compartido.

Las credenciales del router se guardan en la NVS del ESP32 mediante Preferences. No se imprimen en el monitor serie.

El ESP32 no ejecuta APK ni renderiza las aplicaciones web: el navegador del dispositivo cliente ejecuta la interfaz. MiniOS Store se aloja por separado en GitHub Pages.

## Estado

Primera versión para pruebas de conectividad y panel local. Aún no incluye instalación de aplicaciones, almacenamiento USB, detección universal de clientes del router ni comunicación segura HTTPS entre GitHub Pages y el ESP32.
