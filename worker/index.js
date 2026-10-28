const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  try {
    if (new URL(origin).origin === new URL(request.url).origin) {
      return { "access-control-allow-origin": origin, vary: "Origin" };
    }
  } catch {
    // Ignore malformed Origin headers.
  }
  return {};
}

function apiJson(request, data, status = 200) {
  return json(data, status, corsHeaders(request));
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedNumber(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function adminAuthorized(request, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return false;
  const authorization = request.headers.get("Authorization") || "";
  // Support both "Bearer <token>" and raw token formats
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ").trim() : authorization.trim();
  return token === configured;
}

async function handleResult(request, env) {
  if (!env.DB) return apiJson(request, { error: "Database is not configured." }, 503);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) return apiJson(request, { error: "Request is too large." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return apiJson(request, { error: "Expected a JSON request body." }, 400);
  }

  const targetWord = cleanString(body.targetWord, 200);
  const targetSyllables = Array.isArray(body.targetSyllables)
    ? body.targetSyllables.map((item) => cleanString(item, 80)).filter(Boolean).join("·")
    : cleanString(body.targetSyllables, 500);
  const transcript = cleanString(body.transcript, 500);
  if (!targetWord || !targetSyllables) {
    return apiJson(request, { error: "targetWord and targetSyllables are required." }, 400);
  }

  const confidence = boundedNumber(body.confidence, 0, 1);
  const score = boundedNumber(body.score, 0, 1, 0);
  const passed = body.passed === true || body.passed === 1 ? 1 : 0;
  let deviceInfo = {};
  if (body.deviceInfo && typeof body.deviceInfo === "object" && !Array.isArray(body.deviceInfo)) {
    deviceInfo = body.deviceInfo;
  }

  try {
    await env.DB.prepare(`
      INSERT INTO speech_results
        (target_word, target_syllables, transcript, confidence, score, passed, device_info, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      targetWord,
      targetSyllables,
      transcript,
      confidence,
      score,
      passed,
      JSON.stringify(deviceInfo).slice(0, 4000),
      cleanString(request.headers.get("User-Agent"), 500) || null,
    ).run();
  } catch (error) {
    console.error("[api] failed to store speech result", error);
    return apiJson(request, { error: "Could not store speech result." }, 500);
  }

  return apiJson(request, { ok: true }, 201);
}

async function handleAdminSummary(request, env) {
  if (!env.DB) return apiJson(request, { error: "Database is not configured." }, 503);
  if (!env.ADMIN_TOKEN) return apiJson(request, { error: "Admin access is not configured." }, 503);
  if (!adminAuthorized(request, env)) return apiJson(request, { error: "Unauthorized." }, 401);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);
  try {
    const [stats, byDay, results] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS attempts,
               COALESCE(AVG(confidence), 0) AS average_confidence,
               COALESCE(AVG(score), 0) AS average_score,
               COALESCE(SUM(passed), 0) AS passed
        FROM speech_results
      `).first(),
      env.DB.prepare(`
        SELECT substr(created_at, 1, 10) AS day,
               COUNT(*) AS attempts,
               ROUND(AVG(score) * 100, 1) AS average_score,
               SUM(passed) AS passed
        FROM speech_results
        GROUP BY day
        ORDER BY day DESC
        LIMIT 30
      `).all(),
      env.DB.prepare(`
        SELECT id, target_word, target_syllables, transcript, confidence, score,
               passed, device_info, user_agent, created_at
        FROM speech_results
        ORDER BY id DESC
        LIMIT ?
      `).bind(limit).all(),
    ]);
    return apiJson(request, {
      stats: {
        attempts: Number(stats?.attempts || 0),
        passed: Number(stats?.passed || 0),
        averageConfidence: Number(stats?.average_confidence || 0),
        averageScore: Number(stats?.average_score || 0),
      },
      byDay: byDay?.results || [],
      results: results?.results || [],
    });
  } catch (error) {
    console.error("[api] failed to load admin summary", error);
    return apiJson(request, { error: "Could not load dashboard data." }, 500);
  }
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }
  if (url.pathname === "/api/results" && request.method === "POST") return handleResult(request, env);
  if (url.pathname === "/api/admin/summary" && request.method === "GET") return handleAdminSummary(request, env);
  return apiJson(request, { error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};