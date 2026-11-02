/* 책방 「알라딘 등록 완료」 공용 기록.
   화면은 GitHub Pages의 정적 파일이라 두 컴퓨터가 같은 상태를 보려면 기록할 곳이 필요하다.
   기록은 책 식별자와 시각뿐이다. 읽기는 공개, 쓰기는 숫자 코드(비밀값 EDIT_CODE)가 있어야 한다. */

const BOOK_ID = /^(?:97[89]\d{10}(?:-[2-9])?|noisbn-[0-9a-z]{1,10}-\d{1,3})$/;

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization",
    "Access-Control-Max-Age": "7200",
    Vary: "Origin",
  };
}

function reply(env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* 코드의 길이나 앞자리가 응답 시간으로 드러나지 않게 해시를 비교한다. */
async function hasEditCode(request, env) {
  if (!env.EDIT_CODE) {
    return false; /* 비밀값이 없으면 쓰기는 닫힌다 */
  }
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given, env.EDIT_CODE].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value)))
  );
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

async function listDone(env) {
  const { results } = await env.DB.prepare("SELECT book_id, done_at FROM done").all();
  const done = {};
  for (const row of results) {
    done[row.book_id] = row.done_at;
  }
  return reply(env, 200, { done });
}

async function markDone(env, id) {
  await env.DB.prepare("INSERT INTO done (book_id, done_at) VALUES (?1, ?2) ON CONFLICT (book_id) DO NOTHING")
    .bind(id, Date.now())
    .run();
  const row = await env.DB.prepare("SELECT done_at FROM done WHERE book_id = ?1").bind(id).first();
  return reply(env, 200, { id, doneAt: row.done_at });
}

async function unmarkDone(env, id) {
  await env.DB.prepare("DELETE FROM done WHERE book_id = ?1").bind(id).run();
  return reply(env, 200, { id, doneAt: null });
}

async function route(request, env) {
  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }
  if (pathname === "/done") {
    return request.method === "GET" ? listDone(env) : reply(env, 405, { error: "method_not_allowed" });
  }
  const match = pathname.match(/^\/done\/([^/]+)$/);
  if (!match) {
    return reply(env, 404, { error: "not_found" });
  }
  if (request.method !== "PUT" && request.method !== "DELETE") {
    return reply(env, 405, { error: "method_not_allowed" });
  }
  if (!(await hasEditCode(request, env))) {
    return reply(env, 401, { error: "wrong_code" });
  }
  const id = match[1]; /* 식별자에는 인코딩할 글자가 없다. 잘못된 % 표기도 여기서 거절된다. */
  if (!BOOK_ID.test(id)) {
    return reply(env, 400, { error: "bad_book_id" });
  }
  return request.method === "PUT" ? markDone(env, id) : unmarkDone(env, id);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (_error) {
      return reply(env, 503, { error: "unavailable" });
    }
  },
};
