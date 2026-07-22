const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const KanaEngine = require("../src/kana-engine");

const GOLDEN_CORPUS_PATH = path.join(
  __dirname,
  "fixtures",
  "hangul-phonetic.golden.json",
);
const GOLDEN_CORPUS = JSON.parse(fs.readFileSync(GOLDEN_CORPUS_PATH, "utf8"));
const GOLDEN_CASES = GOLDEN_CORPUS.cases;
const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_SYLLABLE_COUNT = HANGUL_SYLLABLE_END - HANGUL_SYLLABLE_START + 1;
const HANGUL_SYLLABLE_PATTERN = /[\uac00-\ud7a3]/u;

// JIS 106/109 kana layer golden table; keep independent from the engine table.
const JIS_KANA_LAYOUT = {
  Digit1: ["ぬ", "ぬ"], Digit2: ["ふ", "ふ"], Digit3: ["あ", "ぁ"],
  Digit4: ["う", "ぅ"], Digit5: ["え", "ぇ"], Digit6: ["お", "ぉ"],
  Digit7: ["や", "ゃ"], Digit8: ["ゆ", "ゅ"], Digit9: ["よ", "ょ"],
  Digit0: ["わ", "を"], Minus: ["ほ", "ほ"], Equal: ["へ", "へ"],
  KeyQ: ["た", "た"], KeyW: ["て", "て"], KeyE: ["い", "ぃ"],
  KeyR: ["す", "す"], KeyT: ["か", "か"], KeyY: ["ん", "ん"],
  KeyU: ["な", "な"], KeyI: ["に", "に"], KeyO: ["ら", "ら"],
  KeyP: ["せ", "せ"], BracketLeft: ["゛", "゛"], BracketRight: ["゜", "「"],
  KeyA: ["ち", "ち"], KeyS: ["と", "と"], KeyD: ["し", "し"],
  KeyF: ["は", "は"], KeyG: ["き", "き"], KeyH: ["く", "く"],
  KeyJ: ["ま", "ま"], KeyK: ["の", "の"], KeyL: ["り", "り"],
  Semicolon: ["れ", "れ"], Quote: ["け", "け"], Backslash: ["む", "」"],
  KeyZ: ["つ", "っ"], KeyX: ["さ", "さ"], KeyC: ["そ", "そ"],
  KeyV: ["ひ", "ひ"], KeyB: ["こ", "こ"], KeyN: ["み", "み"],
  KeyM: ["も", "も"], Comma: ["ね", "、"], Period: ["る", "。"],
  Slash: ["め", "・"], IntlYen: ["ー", "ー"], IntlRo: ["ろ", "ろ"],
};

function final(input, script = "hiragana") {
  return KanaEngine.flushRomaji(input, script);
}

function stream(input, script = "hiragana") {
  let output = "";
  let buffer = "";

  for (const key of input) {
    const converted = KanaEngine.convertRomaji(buffer + key, {
      final: false,
      script,
    });
    output += converted.text;
    buffer = converted.rest;
  }

  return output + KanaEngine.flushRomaji(buffer, script);
}

test("Romaji 완성 문자열을 변환한다", () => {
  const cases = [
    ["aiueo", "あいうえお"],
    ["kakikukeko", "かきくけこ"],
    ["sashisuseso", "さしすせそ"],
    ["tachitsuteto", "たちつてと"],
    ["konnichiha", "こんにちは"],
    ["nihongo", "にほんご"],
    ["gakkou", "がっこう"],
    ["ryokou", "りょこう"],
    ["shinjuku", "しんじゅく"],
    ["kon'ya", "こんや"],
    ["pa pi pu pe po", "ぱ ぴ ぷ ぺ ぽ"],
    ["qq", "qq"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(final(input), expected, input);
  }
  assert.equal(final("konnichiha", "katakana"), "コンニチハ");
});

test("Romaji 키 단위 입력은 일괄 변환과 일치한다", () => {
  for (const input of ["nya", "nyu", "nyo", "nna", "nnya", "konnichiha", "gakkou", "qq"]) {
    assert.equal(stream(input), final(input), input);
  }
});

test("미완성 Romaji 접두사를 버퍼에 보존한다", () => {
  assert.deepEqual(KanaEngine.convertRomaji("ky", { final: false }), {
    text: "",
    rest: "ky",
  });
  assert.deepEqual(KanaEngine.convertRomaji("ny", { final: false }), {
    text: "",
    rest: "ny",
  });
  assert.deepEqual(KanaEngine.convertRomaji("nn", { final: false }), {
    text: "",
    rest: "nn",
  });
  assert.deepEqual(KanaEngine.convertRomaji("kya", { final: false }), {
    text: "きゃ",
    rest: "",
  });
});

test("히라가나와 카타카나 문자종을 변환한다", () => {
  assert.equal(KanaEngine.toKatakana("がっこう"), "ガッコウ");
  assert.equal(KanaEngine.toHiragana("ガッコウ"), "がっこう");
});

test("JIS Kana 키와 탁음·반탁음을 처리한다", () => {
  assert.deepEqual(KanaEngine.applyKanaMark("か", "゛", "hiragana"), {
    text: "が",
    applied: true,
  });
  assert.deepEqual(KanaEngine.applyKanaMark("ハ", "゜", "katakana"), {
    text: "パ",
    applied: true,
  });
  assert.deepEqual(KanaEngine.applyKanaMark("あ", "゜", "hiragana"), {
    text: "あ゜",
    applied: false,
  });
  assert.deepEqual(KanaEngine.applyKanaMark("カ", "゛", "hiragana"), {
    text: "が",
    applied: true,
  });
  assert.deepEqual(KanaEngine.applyKanaMark("か", "x", "hiragana"), {
    text: "かx",
    applied: false,
  });

  for (const [code, expectedByShift] of Object.entries(JIS_KANA_LAYOUT)) {
    for (const shiftKey of [false, true]) {
      for (const script of ["hiragana", "katakana"]) {
        const expected = KanaEngine.convertScript(expectedByShift[shiftKey ? 1 : 0], script);
        assert.equal(
          KanaEngine.jisKanaFromKey({ code, shiftKey }, script),
          expected,
          `${code} shift=${shiftKey} script=${script}`,
        );
      }
    }
  }
  assert.equal(
    KanaEngine.jisKanaFromKey({ code: "Unknown", shiftKey: false }, "hiragana"),
    "",
  );
});

test("Hangul Phonetic 골든 코퍼스 형식을 검증한다", () => {
  assert.equal(GOLDEN_CORPUS.schemaVersion, 1);
  assert.ok(Array.isArray(GOLDEN_CASES));
  assert.ok(GOLDEN_CASES.length > 0);

  const ids = new Set();
  const contracts = new Set();
  const scripts = new Set(["hiragana", "katakana"]);

  for (const entry of GOLDEN_CASES) {
    assert.ok(entry && typeof entry === "object", "case must be an object");
    assert.equal(typeof entry.id, "string", "case id must be a string");
    assert.ok(entry.id.length > 0, "case id must not be empty");
    assert.ok(!ids.has(entry.id), "duplicate case id: " + entry.id);
    ids.add(entry.id);

    assert.equal(typeof entry.category, "string", entry.id + " category");
    assert.ok(entry.category.length > 0, entry.id + " category must not be empty");
    assert.equal(typeof entry.input, "string", entry.id + " input");
    assert.equal(typeof entry.expected, "string", entry.id + " expected");
    assert.ok(scripts.has(entry.script), entry.id + " script: " + entry.script);

    if (Object.hasOwn(entry, "status")) {
      assert.equal(entry.status, "provisional", entry.id + " status");
    }

    const contract = entry.input + "\u0000" + entry.script;
    assert.ok(!contracts.has(contract), "duplicate input/script contract: " + entry.id);
    contracts.add(contract);
  }
});

test("Hangul Phonetic 골든 코퍼스를 변환한다", () => {
  for (const entry of GOLDEN_CASES) {
    const actual = KanaEngine.convertHangulPhonetic(entry.input, {
      script: entry.script,
    });
    const status = entry.status ? " [" + entry.status + "]" : "";
    assert.equal(actual, entry.expected, entry.id + status);
  }
});

test("전체 11,172개 한글 음절은 잔존 없이 카타카나 대칭을 유지한다", () => {
  assert.equal(HANGUL_SYLLABLE_COUNT, 11172);
  let checked = 0;

  for (let code = HANGUL_SYLLABLE_START; code <= HANGUL_SYLLABLE_END; code += 1) {
    const input = String.fromCharCode(code);
    const hiragana = KanaEngine.convertHangulPhonetic(input, { script: "hiragana" });
    const katakana = KanaEngine.convertHangulPhonetic(input, { script: "katakana" });
    const label = "U+" + code.toString(16).toUpperCase().padStart(4, "0");

    assert.doesNotMatch(hiragana, HANGUL_SYLLABLE_PATTERN, label + " left Hangul");
    assert.equal(katakana, KanaEngine.toKatakana(hiragana), label + " script symmetry");
    checked += 1;
  }

  assert.equal(checked, 11172);
});
