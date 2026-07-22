const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../src/kana-engine.js");

function streamRomaji(input, script = "hiragana") {
  let committed = "";
  let pending = "";

  for (const char of input) {
    const converted = engine.convertRomaji(pending + char, {
      final: false,
      script,
    });
    committed += converted.text;
    pending = converted.rest;
  }

  const flushed = engine.convertRomaji(pending, { final: true, script });
  return committed + flushed.text + flushed.rest;
}

test("Romaji ASCII case folding preserves unsupported Unicode exactly", () => {
  assert.equal(engine.flushRomaji("KAki"), "かき");
  assert.equal(engine.flushRomaji("İ"), "İ");
  assert.equal(engine.flushRomaji("AİB"), "あİB");
});

test("incremental Romaji conversion keeps Unicode and source indices aligned", () => {
  assert.deepEqual(engine.convertRomaji("AİK", { final: false }), {
    text: "あİ",
    rest: "K",
  });

  assert.deepEqual(engine.convertRomaji("AİKA", { final: false }), {
    text: "あİか",
    rest: "",
  });
});

test("Mozc tch transition converts matcha in batch and incremental input", () => {
  assert.equal(engine.flushRomaji("matcha"), "まっちゃ");
  assert.equal(streamRomaji("matcha"), "まっちゃ");
  assert.equal(engine.flushRomaji("MATCHA", "katakana"), "マッチャ");
  assert.equal(streamRomaji("MATCHA", "katakana"), "マッチャ");
});

test("Mozc tch transition preserves its pending ch prefix", () => {
  assert.deepEqual(engine.convertRomaji("tc", { final: false }), {
    text: "",
    rest: "tc",
  });
  assert.deepEqual(engine.convertRomaji("tch", { final: false }), {
    text: "っ",
    rest: "ch",
  });
});
