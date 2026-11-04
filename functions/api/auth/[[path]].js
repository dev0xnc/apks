const COOKIE = "minios_tv_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100000;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
function cookie(token, maxAge) {
  return COOKIE + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}
function clearCookie() { return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"; }
function randomId(bytes = 32) { const a = crypto.getRandomValues(new Uint8Array(bytes)); return Array.from(a, x => x.toString(16).padStart(2, "0")).join(""); }
async function digest(value) {
  const a = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(a), x => x.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return Array.from(new Uint8Array(bits), x => x.toString(16).padStart(2, "0")).join("");
}
function validEmail(email) { return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function secureOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin && request.url.startsWith("https://"); } catch { return false; }
}
async function readBody(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 4096) throw new Error("payload_too_large");
  return await request.json();
}
async function currentUser(request, env) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(/(?:^|;\s*)minios_tv_session=([^;]+)/);
  if (!m) return null;
  let token; try { token = decodeURIComponent(m[1]); } catch { return null; }
  if (token.length !== 64) return null;
  const now = Math.floor(Date.now() / 1000);
  return await env.DB.prepare("SELECT u.id,u.email,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1").bind(await digest(token), now).first();
}
async function newSession(userId, env) {
  const token = randomId(32), now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)")
    .bind(await digest(token), userId, now + SESSION_SECONDS, now, now).run();
  return token;
}
async function authBucket(request, identity) {
  const ip = request.headers.get("CF-Connecting-IP");
  const client = typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
  return await digest(client + "|" + String(identity).toLowerCase());
}
async function checkRateLimit(request, env, identity, maxAttempts) {
  const bucket = await authBucket(request, identity);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT attempts,window_started,blocked_until FROM auth_limits WHERE bucket=?").bind(bucket).first();
  if (!row) return true;
  if (row.blocked_until > now) return false;
  if (now - row.window_started > 900) return true;
  return row.attempts < maxAttempts;
}
async function recordRateLimit(request, env, identity, maxAttempts) {
  const bucket = await authBucket(request, identity);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT attempts,window_started,blocked_until FROM auth_limits WHERE bucket=?").bind(bucket).first();
  if (!row || now - row.window_started > 900) {
    await env.DB.prepare("INSERT INTO auth_limits(bucket,attempts,window_started,blocked_until) VALUES(?,1,?,0) ON CONFLICT(bucket) DO UPDATE SET attempts=1,window_started=excluded.window_started,blocked_until=0").bind(bucket, now).run();
    return maxAttempts > 1;
  }
  const attempts = row.attempts + 1;
  await env.DB.prepare("UPDATE auth_limits SET attempts=?,blocked_until=? WHERE bucket=?").bind(attempts, attempts >= maxAttempts ? now + 900 : 0, bucket).run();
  return attempts < maxAttempts;
}
async function clearRateLimit(request, env, identity) {
  const bucket = await authBucket(request, identity);
  await env.DB.prepare("DELETE FROM auth_limits WHERE bucket=?").bind(bucket).run();
}
async function checkIpRateLimit(request, env, maxAttempts) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (typeof ip !== "string" || !ip.trim()) return true;
  return await checkRateLimit(request, env, "ip-global-v2", maxAttempts);
}
async function recordIpRateLimit(request, env, maxAttempts) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (typeof ip !== "string" || !ip.trim()) return;
  await recordRateLimit(request, env, "ip-global-v2", maxAttempts);
}
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "service_unavailable" }, 503);
  const url = new URL(request.url), action = url.pathname.split("/").filter(Boolean).pop();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Allow": "GET,POST,OPTIONS" } });
  if (request.method === "GET" && action === "me") {
    const user = await currentUser(request, env);
    return user ? json({ user: { id: user.id, email: user.email, role: user.role } }) : json({ error: "unauthorized" }, 401);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "GET,POST,OPTIONS" });
  if (!secureOrigin(request, env)) return json({ error: "invalid_origin" }, 403);
  let body; try { body = await readBody(request); } catch (error) {
    return json({ error: error && error.message === "payload_too_large" ? "payload_too_large" : "invalid_request" }, error && error.message === "payload_too_large" ? 413 : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);

  if (action === "register") {
    let stage = "validate";
    const requestId = randomId(8);
    try {
      const email = String(body.email || "").trim().toLowerCase(), password = body.password;
      if (!validEmail(email) || typeof password !== "string" || password.length < 12 || password.length > 128) return json({ error: "invalid_email_or_password" }, 400);
      stage = "rate_limit";
      const registrationBucket = "register-v2:" + email;
      if (!await checkRateLimit(request, env, registrationBucket, 8) || !await checkIpRateLimit(request, env, 40)) {
        return json({ error: "rate_limited" }, 429);
      }
      await recordRateLimit(request, env, registrationBucket, 8);
      await recordIpRateLimit(request, env, 40);
      stage = "check_email";
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if (exists) return json({ error: "registration_unavailable" }, 409);
      const id = randomId(16), salt = randomId(16);
      stage = "password_hash";
      const hashStarted = Date.now();
      const hash = await passwordHash(password, salt);
      const hashDurationMs = Date.now() - hashStarted;
      const now = Math.floor(Date.now() / 1000);
      stage = "create_user";
      await env.DB.prepare("INSERT INTO users(id,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?, 'user','active',?,?)").bind(id,email,hash,salt,now,now).run();
      stage = "create_session";
      const token = await newSession(id, env);
      console.log("minios_auth_register_success", JSON.stringify({ requestId, hashDurationMs }));
      return json({ ok: true }, 201, { "Set-Cookie": cookie(token, SESSION_SECONDS) });
    } catch (error) {
      console.error("minios_auth_register_failure", JSON.stringify({
        requestId,
        stage,
        errorName: error && error.name ? String(error.name).slice(0, 80) : "UnknownError",
        errorMessage: error && error.message ? String(error.message).slice(0, 240) : "No message"
      }));
      return json({ error: stage === "create_user" ? "registration_unavailable" : "registration_failed", request_id: requestId }, stage === "create_user" ? 409 : 500);
    }
  }

  if (action === "login") {
    const email = String(body.email || "").trim().toLowerCase(), password = body.password;
    if (!validEmail(email) || typeof password !== "string" || password.length > 128) return json({ error: "invalid_credentials" }, 400);
    const loginBucket = "login-v2:" + email;
    if (!await checkRateLimit(request, env, loginBucket, 8) || !await checkIpRateLimit(request, env, 40)) {
      return json({ error: "rate_limited" }, 429);
    }
    const user = await env.DB.prepare("SELECT id,email,password_hash,password_salt,status FROM users WHERE email=?").bind(email).first();
    if (!user || user.status !== "active") {
      await passwordHash(password, "minios-tv-dummy-salt");
      await recordRateLimit(request, env, loginBucket, 8);
      await recordIpRateLimit(request, env, 40);
      return json({ error: "invalid_credentials" }, 401);
    }
    const candidate = await passwordHash(password, user.password_salt);
    if (candidate !== user.password_hash) {
      await recordRateLimit(request, env, loginBucket, 8);
      await recordIpRateLimit(request, env, 40);
      return json({ error: "invalid_credentials" }, 401);
    }
    await clearRateLimit(request, env, loginBucket);
    const token = await newSession(user.id, env);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(token, SESSION_SECONDS) });
  }

  if(action==="password"){const user=await currentUser(request,env);if(!user)return json({error:"unauthorized"},401);const current=body.currentPassword,next=body.newPassword;if(typeof current!=="string"||typeof next!=="string"||next.length<12||next.length>128)return json({error:"invalid_password"},400);const row=await env.DB.prepare("SELECT password_hash,password_salt FROM users WHERE id=?").bind(user.id).first();const oldHash=await passwordHash(current,row.password_salt);if(oldHash!==row.password_hash)return json({error:"current_password_incorrect"},400);const salt=randomId(16),hash=await passwordHash(next,salt),now=Math.floor(Date.now()/1000);await env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?").bind(hash,salt,now,user.id).run();await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();return json({ok:true},200,{"Set-Cookie":clearCookie()});}
  if (action === "logout") {
    const user = await currentUser(request, env);
    const raw = request.headers.get("Cookie") || "", m = raw.match(/(?:^|;\s*)minios_tv_session=([^;]+)/);
    if (m) { let token = ""; try { token = decodeURIComponent(m[1]); } catch {} if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run(); }
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
  }

  if (action === "bootstrap-admin") {
    if (!env.ADMIN_BOOTSTRAP_KEY || request.headers.get("X-MiniOS-Bootstrap-Key") !== env.ADMIN_BOOTSTRAP_KEY) return json({ error: "not_found" }, 404);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    if (count && count.n > 0) return json({ error: "bootstrap_closed" }, 409);
    const email = String(body.email || "").trim().toLowerCase(), password = body.password;
    if (!validEmail(email) || typeof password !== "string" || password.length < 16 || password.length > 128) return json({ error: "invalid_admin_credentials" }, 400);
    const id = randomId(16), salt = randomId(16), hash = await passwordHash(password, salt), now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO users(id,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,?, 'admin','active',?,?)").bind(id,email,hash,salt,now,now).run();
    const token = await newSession(id, env);
    return json({ ok: true }, 201, { "Set-Cookie": cookie(token, SESSION_SECONDS) });
  }
  return json({ error: "not_found" }, 404);
}
