/* 등록 완료 기록 Worker 회귀 테스트.
   실제 D1 대신 node:sqlite로 같은 호출 모양을 흉내 내어 SQL까지 실행한다. */

import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../worker/index.mjs";

const ORIGIN = "https://fuledoc.github.io";
const ISBN = "9784398600646";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  return {
    raw: db,
    prepare(sql) {
      const statement = (args) => ({
        bind: (...next) => statement(next),
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        first: async () => db.prepare(sql).get(...args) ?? null,
        run: async () => db.prepare(sql).run(...args),
      });
      return statement([]);
    },
  };
}

function setup() {
  return { DB: fakeD1(), EDIT_CODE: "12345678", ALLOWED_ORIGIN: ORIGIN };
}

function call(env, method, path, code) {
  const headers = code ? { Authorization: `Bearer ${code}` } : {};
  return worker.fetch(new Request(`https://books-api.example${path}`, { method, headers }), env);
}

test("처음에는 등록 완료가 비어 있고 누구나 읽을 수 있다", async () => {
  const response = await call(setup(), "GET", "/done");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { done: {} });
});

test("코드가 맞으면 기록되고 다른 컴퓨터의 조회에 보인다", async () => {
  const env = setup();
  const put = await call(env, "PUT", `/done/${ISBN}`, "12345678");
  assert.equal(put.status, 200);
  const { doneAt } = await put.json();
  assert.ok(doneAt > 0);
  const { done } = await (await call(env, "GET", "/done")).json();
  assert.deepEqual(done, { [ISBN]: doneAt });
});

test("같은 책을 다시 눌러도 처음 시각이 유지된다", async () => {
  const env = setup();
  const first = await (await call(env, "PUT", `/done/${ISBN}`, "12345678")).json();
  env.DB.raw.prepare("UPDATE done SET done_at = 1000").run();
  const second = await (await call(env, "PUT", `/done/${ISBN}`, "12345678")).json();
  assert.ok(first.doneAt > 1000);
  assert.equal(second.doneAt, 1000);
});

test("되돌리면 목록에서 사라지고, 없는 책을 되돌려도 오류가 아니다", async () => {
  const env = setup();
  await call(env, "PUT", `/done/${ISBN}`, "12345678");
  assert.equal((await call(env, "DELETE", `/done/${ISBN}`, "12345678")).status, 200);
  assert.equal((await call(env, "DELETE", `/done/${ISBN}`, "12345678")).status, 200);
  assert.deepEqual((await (await call(env, "GET", "/done")).json()).done, {});
});

test("되돌리면 그 책만 사라진다", async () => {
  const env = setup();
  await call(env, "PUT", `/done/${ISBN}`, "12345678");
  await call(env, "PUT", `/done/${ISBN}-2`, "12345678");
  await call(env, "DELETE", `/done/${ISBN}`, "12345678");
  assert.deepEqual(Object.keys((await (await call(env, "GET", "/done")).json()).done), [`${ISBN}-2`]);
});

test("코드가 없거나 틀리면 쓰지 못한다", async () => {
  const env = setup();
  assert.equal((await call(env, "PUT", `/done/${ISBN}`)).status, 401);
  assert.equal((await call(env, "PUT", `/done/${ISBN}`, "00000000")).status, 401);
  assert.equal((await call(env, "DELETE", `/done/${ISBN}`, "00000000")).status, 401);
  assert.deepEqual((await (await call(env, "GET", "/done")).json()).done, {});
});

test("비밀값이 설정되지 않으면 어떤 코드로도 쓰지 못한다", async () => {
  const env = { ...setup(), EDIT_CODE: undefined };
  assert.equal((await call(env, "PUT", `/done/${ISBN}`, "undefined")).status, 401);
  assert.equal((await call(env, "PUT", `/done/${ISBN}`, "")).status, 401);
});

test("같은 책의 두 번째 실물과 ISBN 없는 책을 받는다", async () => {
  const env = setup();
  for (const id of [`${ISBN}-2`, "noisbn-7617-04"]) {
    assert.equal((await call(env, "PUT", `/done/${id}`, "12345678")).status, 200);
  }
  assert.equal(Object.keys((await (await call(env, "GET", "/done")).json()).done).length, 2);
});

test("책 식별자 모양이 아니면 거절한다", async () => {
  const env = setup();
  for (const id of ["abc", "1234567890123", "9784398600646-1", "noisbn-A-1", "9784398600646%27%3B", "%E0%A4%A"]) {
    assert.equal((await call(env, "PUT", `/done/${id}`, "12345678")).status, 400, id);
  }
});

test("없는 주소와 허용하지 않는 방법을 구분한다", async () => {
  const env = setup();
  assert.equal((await call(env, "GET", "/")).status, 404);
  assert.equal((await call(env, "GET", `/done/${ISBN}/x`)).status, 404);
  assert.equal((await call(env, "POST", "/done")).status, 405);
  assert.equal((await call(env, "GET", `/done/${ISBN}`)).status, 405);
});

test("책방 주소에만 교차 출처를 허용하고 preflight에 답한다", async () => {
  const env = setup();
  const preflight = await call(env, "OPTIONS", `/done/${ISBN}`);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /PUT/);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /DELETE/);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  for (const response of [await call(env, "GET", "/done"), await call(env, "PUT", `/done/${ISBN}`), await call(env, "GET", "/x")]) {
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("저장소 오류는 화면이 읽을 수 있는 503으로 돌려준다", async () => {
  const env = { ...setup(), DB: { prepare: () => { throw new Error("D1 down"); } } };
  for (const response of [await call(env, "GET", "/done"), await call(env, "PUT", `/done/${ISBN}`, "12345678")]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.deepEqual(await response.json(), { error: "unavailable" });
  }
});

test("설정은 새 하위 주소 하나만 쓰고 기존 주소를 건드리지 않는다", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../worker/wrangler.json", import.meta.url), "utf8"));
  assert.deepEqual(config.routes, [{ pattern: "books-api.fuledoc.com", custom_domain: true }]);
  assert.equal(config.vars.ALLOWED_ORIGIN, ORIGIN);
  assert.equal(config.workers_dev, true);
});
