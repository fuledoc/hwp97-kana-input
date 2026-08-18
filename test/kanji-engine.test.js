const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const KanjiEngine = require("../src/kanji-engine");
const DICT = path.join(__dirname, "..", "dict", "kanji.txt");

KanjiEngine.loadDictionary(fs.readFileSync(DICT, "utf8"));

// 스팬 배열에서 1순위 결과를 만든다. candidates[0]은 언제나 원문 가나이므로
// 실제 '변환된' 1순위는 candidates[1]이다.
function topLine(kana) {
  return KanjiEngine.convert(kana)
    .map((s) => (s.type === "word" ? s.candidates[1] || s.text : s.text))
    .join("");
}

function shape(kana) {
  return KanjiEngine.convert(kana)
    .map((s) => (s.type === "word" ? `[${s.text}]` : s.text))
    .join("");
}

function candidatesOf(kana, word) {
  const span = KanjiEngine.convert(kana).find((s) => s.text === word);
  return span ? span.candidates : [];
}

test("통짜 조회로 저자명·출판사명을 한 스팬에 잡는다", () => {
  for (const [kana, want] of [
    ["むらかみはるき", "村上春樹"],
    ["なつめそうせき", "夏目漱石"],
    ["しんちょうぶんこ", "新潮文庫"],
    ["いわなみしょてん", "岩波書店"],
  ]) {
    const spans = KanjiEngine.convert(kana);
    assert.equal(spans.length, 1, `${kana}는 한 스팬이어야 한다`);
    assert.ok(spans[0].candidates.includes(want), `${kana} 후보에 ${want}`);
  }
});

test("조사 1보 예측이 조사 흡수를 막는다", () => {
  // のき(軒)가 「の + きおく」를 삼키면 안 된다.
  assert.equal(shape("たましいのきおく"), "[たましい]の[きおく]");
  assert.equal(topLine("たましいのきおく"), "魂の記憶");
  // のう(脳)가 「の + うた」를 삼키면 안 된다.
  assert.ok(shape("かぜのうたをきけ").startsWith("[かぜ]の[うた]"));
});

test("조사 1보 예측이 과잉 적용되지 않는다", () => {
  // 学術(がくじゅつ)의 が를 조사로 떼면 안 된다.
  assert.equal(topLine("こうだんしゃがくじゅつぶんこ"), "講談社学術文庫");
});

test("を는 언제나 조사로 끊는다", () => {
  // をき(惜)로 삼키면 「聴け」에 도달할 수 없다.
  assert.ok(shape("かぜのうたをきけ").includes("を["));
});

test("활용 어간은 어미 자음이 맞을 때만 결합한다", () => {
  const cands = candidatesOf("かぜのうたをきけ", "きけ");
  assert.ok(cands.includes("聴け"), "きけ 후보에 聴け");
  assert.ok(cands.includes("聞け"), "きけ 후보에 聞け");
  // 자음이 다른 어미에는 붙지 않는다.
  assert.deepEqual(candidatesOf("きさ", "きさ").filter((c) => c === "聴さ"), []);
});

test("가타카나·라틴·숫자 런은 조회하지 않고 통과한다", () => {
  assert.equal(shape("ひがしアジアのしんじだい"), "[ひがし]アジアの[しんじだい]");
  assert.equal(shape("せんじゅつORION"), "[せんじゅつ]ORION");
});

test("가타카나 낱말 뒤에도 조사를 인식한다", () => {
  // のし(熨斗)가 「の + しんじだい」를 삼키면 안 된다.
  assert.ok(shape("ひがしアジアのしんじだい").includes("アジアの["));
});

test("모든 word 스팬의 첫 후보는 원문 가나다", () => {
  for (const kana of ["こころ", "たましいのきおく", "にんげんしっかく"]) {
    for (const span of KanjiEngine.convert(kana)) {
      if (span.type !== "word") continue;
      assert.equal(span.candidates[0], span.text, `${kana}의 ${span.text}`);
    }
  }
});

test("사전 미적재 상태에서도 예외 없이 빈 결과를 준다", () => {
  const modulePath = require.resolve("../src/kanji-engine");
  delete require.cache[modulePath];
  const fresh = require("../src/kanji-engine");
  assert.equal(fresh.isLoaded(), false);
  assert.deepEqual(fresh.convert("にんげん"), []);
  assert.deepEqual(fresh.convert(""), []);
  delete require.cache[modulePath];
});

test("캐럿 왼쪽 가나 덩어리만 잡는다", () => {
  const engine = require("../src/kanji-engine");
  engine.loadDictionary(fs.readFileSync(DICT, "utf8"));
  const run = engine.kanaRunBefore("人間しっかく", 6);
  assert.equal(run.text, "しっかく");
  assert.equal(run.start, 2);
  assert.equal(engine.kanaRunBefore("ABC", 3).text, "");
});

test("골든 코퍼스를 유지한다", () => {
  const golden = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "kanji-titles.golden.json"), "utf8"),
  );
  assert.equal(golden.schemaVersion, 1);
  for (const item of golden.cases) {
    assert.ok(item.id && item.kana && item.expected, `필드 누락: ${item.id}`);
    assert.equal(topLine(item.kana), item.top, `1순위 불일치: ${item.id}`);
    if (item.reachable !== false) {
      const spans = KanjiEngine.convert(item.kana);
      const ok = spans.every(
        (s) => s.type !== "word" || s.candidates.some((c) => item.expected.includes(c)),
      );
      assert.ok(ok, `정답 도달 불가: ${item.id}`);
    }
  }
});

test("사전 헤더에 라이선스 고지가 남아 있다", () => {
  const head = fs.readFileSync(DICT, "utf8").slice(0, 1200);
  assert.ok(head.includes("SKK-JISYO.L"), "출처 표기");
  assert.ok(head.includes("General Public License"), "GPL 고지");
  assert.ok(fs.existsSync(path.join(__dirname, "..", "dict", "COPYING")), "COPYING 동봉");
});
