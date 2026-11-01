#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>

static const char *AP_PASSWORD = "MiniOS-Setup";
static const char *DEFAULT_ADMIN_PASSWORD = "minios-admin";
static const unsigned long RECONNECT_INTERVAL = 15000;

WebServer server(80);
Preferences preferences;

String savedSSID;
String savedWiFiPassword;
String adminPassword;
String accessPointName;

unsigned long lastReconnectAttempt = 0;

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080d18">
<title>MiniOS Core</title>
<style>
:root{color-scheme:dark;font-family:system-ui,Arial,sans-serif;background:#080d18;color:#edf3ff}
*{box-sizing:border-box}body{margin:0}header{padding:25px max(20px,calc((100% - 920px)/2));background:#101a2b;border-bottom:1px solid #263650}
h1{margin:0;color:#72b4ff}header p,.muted{color:#9aabc3}main{max-width:920px;margin:auto;padding:22px}
.card{background:#111c2e;border:1px solid #293a55;border-radius:15px;padding:20px;margin-bottom:16px}
h2{font-size:18px;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}
.metric{background:#0a1322;border-radius:10px;padding:14px;min-width:0}.metric span{display:block;color:#91a4bf;font-size:12px;margin-bottom:7px}.metric strong{overflow-wrap:anywhere}
label{display:block;margin-top:12px;color:#bdcce0;font-size:14px}
input{display:block;width:100%;padding:12px;margin-top:7px;background:#080f1b;border:1px solid #344863;border-radius:8px;color:white}
button,.button{display:inline-block;margin-top:14px;padding:11px 16px;background:#2679ed;border:0;border-radius:8px;color:white;text-decoration:none;font-weight:650;cursor:pointer}
button.secondary{background:#2b3b54}.notice{font-size:12px;line-height:1.5;color:#91a4bf}#message{min-height:22px;color:#82c3ff;margin-top:10px}
footer{text-align:center;padding:20px;color:#70839e;font-size:12px}
</style>
</head>
<body>
<header><h1>MiniOS Core</h1><p>Centro de control del ESP32</p></header>
<main>
<section class="card">
<h2>Estado del sistema</h2>
<div class="grid">
<div class="metric"><span>Wi-Fi del router</span><strong id="connected">Consultando...</strong></div>
<div class="metric"><span>Red conectada</span><strong id="ssid">—</strong></div>
<div class="metric"><span>Red guardada</span><strong id="savedSSID">—</strong></div>
<div class="metric"><span>Diagnóstico Wi-Fi</span><strong id="wifiReason">—</strong></div>
<div class="metric"><span>Señal</span><strong id="rssi">—</strong></div>
<div class="metric"><span>IP del router</span><strong id="staIP">—</strong></div>
<div class="metric"><span>IP de acceso MiniOS</span><strong id="apIP">—</strong></div>
<div class="metric"><span>Memoria libre</span><strong id="heap">—</strong></div>
<div class="metric"><span>Tiempo activo</span><strong id="uptime">—</strong></div>
</div>
<button class="secondary" onclick="refreshStatus()">Actualizar</button>
</section>
<section class="card">
<h2>Conectar al router</h2>
<form id="wifiForm">
<label>Nombre de la red (SSID)</label>
<input name="ssid" maxlength="32" autocomplete="off" required>
<label>Contraseña Wi-Fi</label>
<input name="password" type="password" maxlength="63" autocomplete="new-password">
<button type="submit">Guardar y conectar</button>
</form>
<p class="notice">La configuración se guarda en la memoria interna del ESP32. Si la red es abierta, dejá la contraseña vacía.</p>
<div id="message" role="status"></div>
</section>
<section class="card">
<h2>Seguridad del panel</h2>
<form id="adminForm">
<label>Nueva contraseña de administración</label>
<input name="newPassword" type="password" minlength="10" maxlength="64" required autocomplete="new-password">
<button type="submit">Cambiar contraseña</button>
</form>
<p class="notice">Usuario de administración: admin. Cambiá la contraseña inicial después de la primera conexión.</p>
</section>
<section class="card">
<h2>MiniOS Store</h2>
<p class="muted">El catálogo de aplicaciones web está alojado en GitHub Pages.</p>
<a class="button" href="https://dev0xnc.github.io/apks/" target="_blank" rel="noopener">Abrir MiniOS Store</a>
</section>
<section class="card">
<h2>Sistema</h2>
<button class="secondary" id="restartButton">Reiniciar MiniOS Core</button>
</section>
</main>
<footer>MiniOS Core 1.1.0 · ESP32</footer>
<script>
let authHeader = "";
async function protectedFetch(url, options = {}) {
  if (!authHeader) {
    const password = prompt("Contraseña de administración de MiniOS");
    if (password === null) throw new Error("Autenticación cancelada");
    authHeader = "Basic " + btoa("admin:" + password);
  }
  options.headers = {...(options.headers || {}), Authorization: authHeader};
  const response = await fetch(url, options);
  if (response.status === 401) {
    authHeader = "";
    throw new Error("Contraseña incorrecta");
  }
  return response;
}
async function refreshStatus() {
  try {
    const response = await fetch("/api/status", {cache:"no-store"});
    const d = await response.json();
    document.getElementById("connected").textContent = d.connected ? "Conectado" : "Sin conexión";
    document.getElementById("ssid").textContent = d.ssid || "Ninguna";
    document.getElementById("savedSSID").textContent = d.savedSSID || "No configurada";
    document.getElementById("wifiReason").textContent = d.statusText || "Desconocido";
    document.getElementById("rssi").textContent = d.connected ? (d.rssi + " dBm") : "Sin señal";
    document.getElementById("staIP").textContent = d.ip;
    document.getElementById("apIP").textContent = d.apIP;
    document.getElementById("heap").textContent = Math.round(d.freeHeap/1024) + " KB";
    const h = Math.floor(d.uptime/3600), m = Math.floor((d.uptime%3600)/60);
    document.getElementById("uptime").textContent = h + " h " + m + " min";
  } catch(e) {
    document.getElementById("connected").textContent = "Sin respuesta";
  }
}
document.getElementById("wifiForm").addEventListener("submit", async e => {
  e.preventDefault();
  const message = document.getElementById("message");
  message.textContent = "Enviando configuración...";
  const body = new URLSearchParams(new FormData(e.currentTarget));
  try {
    const r = await protectedFetch("/api/wifi", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const d = await r.json();
    message.textContent = d.message;
    if (r.ok) setTimeout(refreshStatus, 2500);
  } catch(err) { message.textContent = err.message; }
});
document.getElementById("adminForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = new URLSearchParams(new FormData(e.currentTarget));
  try {
    const r = await protectedFetch("/api/admin", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const d = await r.json();
    alert(d.message);
    if (r.ok) { authHeader = ""; e.currentTarget.reset(); }
  } catch(err) { alert(err.message); }
});
document.getElementById("restartButton").addEventListener("click", async () => {
  if (!confirm("¿Reiniciar MiniOS Core?")) return;
  try {
    const r = await protectedFetch("/api/restart", {method:"POST"});
    if (r.ok) alert("MiniOS se está reiniciando.");
  } catch(err) { alert(err.message); }
});
refreshStatus();
setInterval(refreshStatus, 10000);
</script>
</body>
</html>
)HTML";

String jsonEscape(const String &value) {
  String out;
  out.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if ((uint8_t)c >= 0x20) out += c;
  }
  return out;
}

void sendJSON(int code, const String &body) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json; charset=utf-8", body);
}

bool requireAdmin() {
  if (server.authenticate("admin", adminPassword.c_str())) return true;
  server.requestAuthentication(BASIC_AUTH, "MiniOS Core");
  return false;
}

void handleRoot() {
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
}

void handleStatus() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  String json = "{";
  json += "\"connected\":";
  json += connected ? "true" : "false";
  json += ",\"ssid\":\"" + jsonEscape(connected ? WiFi.SSID() : "") + "\"";
  json += ",\"ip\":\"" + (connected ? WiFi.localIP().toString() : String("0.0.0.0")) + "\"";
  json += ",\"apIP\":\"" + WiFi.softAPIP().toString() + "\"";
  json += ",\"savedSSID\":\"" + jsonEscape(savedSSID) + "\"";
  json += ",\"wifiStatus\":" + String((int)WiFi.status());
  String statusText = "Desconocido";
  switch (WiFi.status()) {
    case WL_IDLE_STATUS: statusText = "Iniciando"; break;
    case WL_NO_SSID_AVAIL: statusText = "No se encuentra esa red"; break;
    case WL_SCAN_COMPLETED: statusText = "Búsqueda completada"; break;
    case WL_CONNECTED: statusText = "Conectado"; break;
    case WL_CONNECT_FAILED: statusText = "Falló la autenticación o conexión"; break;
    case WL_CONNECTION_LOST: statusText = "Conexión perdida"; break;
    case WL_DISCONNECTED: statusText = savedSSID.isEmpty() ? "Falta configurar una red" : "Desconectado; reintentando"; break;
    default: statusText = "Estado Wi-Fi " + String((int)WiFi.status()); break;
  }
  json += ",\"statusText\":\"" + jsonEscape(statusText) + "\"";
  json += ",\"rssi\":" + String(connected ? WiFi.RSSI() : 0);
  json += ",\"freeHeap\":" + String(ESP.getFreeHeap());
  json += ",\"uptime\":" + String(millis() / 1000);
  json += ",\"version\":\"1.1.0\"}";
  sendJSON(200, json);
}

void handleSaveWiFi() {
  if (!requireAdmin()) return;
  if (!server.hasArg("ssid") || !server.hasArg("password")) {
    sendJSON(400, "{\"message\":\"Faltan datos.\"}");
    return;
  }
  String ssid = server.arg("ssid");
  String password = server.arg("password");
  ssid.trim();
  if (ssid.isEmpty() || ssid.length() > 32 || password.length() > 63 ||
      (password.length() > 0 && password.length() < 8)) {
    sendJSON(400, "{\"message\":\"SSID o contraseña no válidos.\"}");
    return;
  }
  preferences.putString("ssid", ssid);
  preferences.putString("wifiPass", password);
  savedSSID = ssid;
  savedWiFiPassword = password;
  WiFi.disconnect(false, false);
  WiFi.begin(savedSSID.c_str(), savedWiFiPassword.c_str());
  lastReconnectAttempt = millis();
  sendJSON(200, "{\"message\":\"Datos guardados. Intentando conectar al router.\"}");
}

void handleChangeAdmin() {
  if (!requireAdmin()) return;
  if (!server.hasArg("newPassword")) {
    sendJSON(400, "{\"message\":\"Falta la nueva contraseña.\"}");
    return;
  }
  String value = server.arg("newPassword");
  if (value.length() < 10 || value.length() > 64) {
    sendJSON(400, "{\"message\":\"Usá entre 10 y 64 caracteres.\"}");
    return;
  }
  preferences.putString("admin", value);
  adminPassword = value;
  sendJSON(200, "{\"message\":\"Contraseña actualizada. Volvé a autenticarte con la nueva.\"}");
}

void handleRestart() {
  if (!requireAdmin()) return;
  sendJSON(200, "{\"message\":\"Reiniciando.\"}");
  delay(350);
  ESP.restart();
}

void handleNotFound() {
  sendJSON(404, "{\"message\":\"Ruta no encontrada.\"}");
}

void startAccessPoint() {
  const uint64_t id = ESP.getEfuseMac();
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%04X", (unsigned int)(id & 0xFFFF));
  accessPointName = "MiniOS-" + String(suffix);
  const bool ok = WiFi.softAP(accessPointName.c_str(), AP_PASSWORD, 1, false, 4);
  Serial.println(ok ? "Punto de acceso iniciado." : "Error iniciando punto de acceso.");
  Serial.print("SSID: ");
  Serial.println(accessPointName);
  Serial.print("IP AP: ");
  Serial.println(WiFi.softAPIP());
}

void startServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/wifi", HTTP_POST, handleSaveWiFi);
  server.on("/api/admin", HTTP_POST, handleChangeAdmin);
  server.on("/api/restart", HTTP_POST, handleRestart);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("Servidor HTTP iniciado en puerto 80.");
}

void reconnectWiFi() {
  if (savedSSID.isEmpty() || WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnectAttempt < RECONNECT_INTERVAL) return;
  lastReconnectAttempt = millis();
  WiFi.begin(savedSSID.c_str(), savedWiFiPassword.c_str());
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println("===== MINIOS CORE 1.0.0 =====");

  preferences.begin("minios", false);
  savedSSID = preferences.getString("ssid", "");
  savedWiFiPassword = preferences.getString("wifiPass", "");
  adminPassword = preferences.getString("admin", DEFAULT_ADMIN_PASSWORD);

  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  startAccessPoint();

  if (!savedSSID.isEmpty()) {
    Serial.println("Intentando conectar al router...");
    WiFi.begin(savedSSID.c_str(), savedWiFiPassword.c_str());
  }

  startServer();
  Serial.println("MiniOS Core listo.");
}

void loop() {
  server.handleClient();
  reconnectWiFi();
  delay(2);
}
