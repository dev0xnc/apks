const TV_PREFIX = "/apps/minios-tv";
const LOGIN_PATH = TV_PREFIX + "/login.html";
const COOKIE = "minios_tv_session";

function cookieValue(header, name) {
  const match = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function sessionUser(request, env) {
  if (!env.DB) return null;
  const token = cookieValue(request.headers.get("Cookie"), COOKIE);
  if (!token || token.length < 40 || token.length > 200) return null;
  const hash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  return await env.DB.prepare(
    "SELECT u.id,u.email,u.role,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1"
  ).bind(hash, now).first();
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(TV_PREFIX)) return next();
  if (url.pathname === LOGIN_PATH || url.pathname === TV_PREFIX + "/login.html") return next();
  if (url.pathname.startsWith(TV_PREFIX + "/assets/")) return next();

  const user = await sessionUser(request, env);
  if (!user) {
    const headers = new Headers({ "Location": LOGIN_PATH, "Cache-Control": "no-store" });
    return new Response(null, { status: 302, headers });
  }
  if (url.pathname === TV_PREFIX + "/admin.html" && user.role !== "admin") {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' https: data:; media-src 'self' https: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
