(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KanaEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROMAJI = {
    a: "あ",
    i: "い",
    u: "う",
    e: "え",
    o: "お",
    wha: "うぁ",
    whi: "うぃ",
    whe: "うぇ",
    who: "うぉ",
    wi: "うぃ",
    we: "うぇ",
    va: "ゔぁ",
    vi: "ゔぃ",
    vu: "ゔ",
    ve: "ゔぇ",
    vo: "ゔぉ",
    vya: "ゔゃ",
    vyu: "ゔゅ",
    vyo: "ゔょ",
    ka: "か",
    ki: "き",
    ku: "く",
    ke: "け",
    ko: "こ",
    kya: "きゃ",
    kyu: "きゅ",
    kyo: "きょ",
    ga: "が",
    gi: "ぎ",
    gu: "ぐ",
    ge: "げ",
    go: "ご",
    gya: "ぎゃ",
    gyu: "ぎゅ",
    gyo: "ぎょ",
    sa: "さ",
    si: "し",
    shi: "し",
    su: "す",
    se: "せ",
    so: "そ",
    sya: "しゃ",
    syu: "しゅ",
    syo: "しょ",
    sha: "しゃ",
    shu: "しゅ",
    sho: "しょ",
    za: "ざ",
    zi: "じ",
    ji: "じ",
    zu: "ず",
    ze: "ぜ",
    zo: "ぞ",
    zya: "じゃ",
    zyu: "じゅ",
    zyo: "じょ",
    ja: "じゃ",
    ju: "じゅ",
    jo: "じょ",
    ta: "た",
    ti: "ち",
    chi: "ち",
    tu: "つ",
    tsu: "つ",
    te: "て",
    to: "と",
    tya: "ちゃ",
    tyu: "ちゅ",
    tyo: "ちょ",
    cha: "ちゃ",
    chu: "ちゅ",
    cho: "ちょ",
    tsa: "つぁ",
    tsi: "つぃ",
    tse: "つぇ",
    tso: "つぉ",
    da: "だ",
    di: "ぢ",
    du: "づ",
    de: "で",
    do: "ど",
    dya: "ぢゃ",
    dyu: "ぢゅ",
    dyo: "ぢょ",
    na: "な",
    ni: "に",
    nu: "ぬ",
    ne: "ね",
    no: "の",
    nya: "にゃ",
    nyu: "にゅ",
    nyo: "にょ",
    ha: "は",
    hi: "ひ",
    hu: "ふ",
    fu: "ふ",
    he: "へ",
    ho: "ほ",
    hya: "ひゃ",
    hyu: "ひゅ",
    hyo: "ひょ",
    fa: "ふぁ",
    fi: "ふぃ",
    fe: "ふぇ",
    fo: "ふぉ",
    fya: "ふゃ",
    fyu: "ふゅ",
    fyo: "ふょ",
    ba: "ば",
    bi: "び",
    bu: "ぶ",
    be: "べ",
    bo: "ぼ",
    bya: "びゃ",
    byu: "びゅ",
    byo: "びょ",
    pa: "ぱ",
    pi: "ぴ",
    pu: "ぷ",
    pe: "ぺ",
    po: "ぽ",
    pya: "ぴゃ",
    pyu: "ぴゅ",
    pyo: "ぴょ",
    ma: "ま",
    mi: "み",
    mu: "む",
    me: "め",
    mo: "も",
    mya: "みゃ",
    myu: "みゅ",
    myo: "みょ",
    ya: "や",
    yu: "ゆ",
    yo: "よ",
    ra: "ら",
    ri: "り",
    ru: "る",
    re: "れ",
    ro: "ろ",
    rya: "りゃ",
    ryu: "りゅ",
    ryo: "りょ",
    la: "ら",
    li: "り",
    lu: "る",
    lo: "ろ",
    wa: "わ",
    wo: "を",
    n: "ん",
    xa: "ぁ",
    xi: "ぃ",
    xu: "ぅ",
    xe: "ぇ",
    xo: "ぉ",
    xya: "ゃ",
    xyu: "ゅ",
    xyo: "ょ",
    xtu: "っ",
    xtsu: "っ",
    xwa: "ゎ",
    ltu: "っ",
    ltsu: "っ",
    lya: "ゃ",
    lyu: "ゅ",
    lyo: "ょ",
  };

  // Mozc's three-column rule `tch -> っ + ch` emits a small tsu while
  // retaining `ch` as pending input. Advancing by one leaves that pending
  // suffix in the source buffer without mutating it.
  const ROMAJI_TRANSITIONS = {
    tch: { text: "っ", advance: 1 },
  };

  const ROMAJI_KEYS = Object.keys(ROMAJI).sort((a, b) => b.length - a.length);
  const ROMAJI_TRANSITION_KEYS = Object.keys(ROMAJI_TRANSITIONS).sort(
    (a, b) => b.length - a.length
  );
  const ROMAJI_PREFIX_KEYS = ROMAJI_KEYS.concat(ROMAJI_TRANSITION_KEYS);
  const VOWELS = new Set(["a", "i", "u", "e", "o"]);
  const CONSONANTS = new Set("bcdfghjklmpqrstvwxyz".split(""));
  const HIRA_TO_KATA_OFFSET = 0x60;
  const HANGUL_JAMO_SEQUENCE = /[\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]+/g;

  function normalizeHangulJamo(text) {
    return text.replace(HANGUL_JAMO_SEQUENCE, (sequence) => sequence.normalize("NFC"));
  }

  function toKatakana(text) {
    return Array.from(text, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x3041 && code <= 0x3096) {
        return String.fromCharCode(code + HIRA_TO_KATA_OFFSET);
      }
      return char;
    }).join("");
  }

  function toHiragana(text) {
    return Array.from(text, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCharCode(code - HIRA_TO_KATA_OFFSET);
      }
      return char;
    }).join("");
  }

  function convertScript(text, script) {
    return script === "katakana" ? toKatakana(text) : text;
  }

  function canStartMapping(text) {
    return ROMAJI_PREFIX_KEYS.some((key) => key.startsWith(text));
  }

  function convertRomaji(input, options) {
    const final = Boolean(options && options.final);
    const script = options && options.script === "katakana" ? "katakana" : "hiragana";
    // Romaji is ASCII. Folding only A-Z keeps indices aligned with the
    // original input when unsupported Unicode (for example, U+0130) expands
    // during full Unicode lowercasing.
    const lower = input.replace(/[A-Z]/g, (char) => char.toLowerCase());
    let text = "";
    let index = 0;

    while (index < lower.length) {
      const current = lower[index];
      const next = lower[index + 1];
      const afterNext = lower[index + 2];

      if (current === "n") {
        if (next === "n") {
          if (!afterNext && !final) {
            break;
          }
          text += "ん";
          index += afterNext && (VOWELS.has(afterNext) || afterNext === "y") ? 1 : 2;
          continue;
        }
        if (next === "'") {
          text += "ん";
          index += 2;
          continue;
        }
        if (next && !VOWELS.has(next) && next !== "y") {
          text += "ん";
          index += 1;
          continue;
        }
        if (!next && final) {
          text += "ん";
          index += 1;
          continue;
        }
        if (!next) {
          break;
        }
        if (next === "y" && !afterNext && !final) {
          break;
        }
      }

      if (
        CONSONANTS.has(current) &&
        current === next &&
        current !== "n" &&
        canStartMapping(current)
      ) {
        text += "っ";
        index += 1;
        continue;
      }

      let transitioned = "";
      for (const key of ROMAJI_TRANSITION_KEYS) {
        if (lower.startsWith(key, index)) {
          transitioned = key;
          break;
        }
      }

      if (transitioned) {
        const transition = ROMAJI_TRANSITIONS[transitioned];
        text += transition.text;
        index += transition.advance;
        continue;
      }

      let matched = "";
      for (const key of ROMAJI_KEYS) {
        if (lower.startsWith(key, index)) {
          matched = key;
          break;
        }
      }

      if (matched) {
        text += ROMAJI[matched];
        index += matched.length;
        continue;
      }

      const rest = lower.slice(index);
      if (!final && /^[a-z]+$/.test(rest) && canStartMapping(rest)) {
        break;
      }

      text += input[index];
      index += 1;
    }

    return {
      text: convertScript(text, script),
      rest: input.slice(index),
    };
  }

  function flushRomaji(input, script) {
    const converted = convertRomaji(input, { final: true, script });
    return converted.text + converted.rest;
  }

  const JIS_KANA_BY_CODE = {
    Digit1: ["ぬ", "ぬ"],
    Digit2: ["ふ", "ふ"],
    Digit3: ["あ", "ぁ"],
    Digit4: ["う", "ぅ"],
    Digit5: ["え", "ぇ"],
    Digit6: ["お", "ぉ"],
    Digit7: ["や", "ゃ"],
    Digit8: ["ゆ", "ゅ"],
    Digit9: ["よ", "ょ"],
    Digit0: ["わ", "を"],
    Minus: ["ほ", "ほ"],
    Equal: ["へ", "へ"],
    KeyQ: ["た", "た"],
    KeyW: ["て", "て"],
    KeyE: ["い", "ぃ"],
    KeyR: ["す", "す"],
    KeyT: ["か", "か"],
    KeyY: ["ん", "ん"],
    KeyU: ["な", "な"],
    KeyI: ["に", "に"],
    KeyO: ["ら", "ら"],
    KeyP: ["せ", "せ"],
    BracketLeft: ["゛", "゛"],
    BracketRight: ["゜", "「"],
    KeyA: ["ち", "ち"],
    KeyS: ["と", "と"],
    KeyD: ["し", "し"],
    KeyF: ["は", "は"],
    KeyG: ["き", "き"],
    KeyH: ["く", "く"],
    KeyJ: ["ま", "ま"],
    KeyK: ["の", "の"],
    KeyL: ["り", "り"],
    Semicolon: ["れ", "れ"],
    Quote: ["け", "け"],
    Backslash: ["む", "」"],
    KeyZ: ["つ", "っ"],
    KeyX: ["さ", "さ"],
    KeyC: ["そ", "そ"],
    KeyV: ["ひ", "ひ"],
    KeyB: ["こ", "こ"],
    KeyN: ["み", "み"],
    KeyM: ["も", "も"],
    Comma: ["ね", "、"],
    Period: ["る", "。"],
    Slash: ["め", "・"],
    IntlYen: ["ー", "ー"],
    IntlRo: ["ろ", "ろ"],
  };

  const DAKUTEN = {
    か: "が",
    き: "ぎ",
    く: "ぐ",
    け: "げ",
    こ: "ご",
    さ: "ざ",
    し: "じ",
    す: "ず",
    せ: "ぜ",
    そ: "ぞ",
    た: "だ",
    ち: "ぢ",
    つ: "づ",
    て: "で",
    と: "ど",
    は: "ば",
    ひ: "び",
    ふ: "ぶ",
    へ: "べ",
    ほ: "ぼ",
    う: "ゔ",
  };

  const HANDAKUTEN = {
    は: "ぱ",
    ひ: "ぴ",
    ふ: "ぷ",
    へ: "ぺ",
    ほ: "ぽ",
  };

  function applyKanaMark(text, mark, script) {
    if (mark !== "゛" && mark !== "゜") {
      return { text: text + mark, applied: false };
    }
    if (!text) {
      return { text: convertScript(mark, script), applied: false };
    }

    const chars = Array.from(text);
    const last = chars[chars.length - 1];
    const lastHira = toHiragana(last);
    const mapped = (mark === "゜" ? HANDAKUTEN : DAKUTEN)[lastHira];

    if (!mapped) {
      return { text: text + convertScript(mark, script), applied: false };
    }

    chars[chars.length - 1] = convertScript(mapped, script);
    return { text: chars.join(""), applied: true };
  }

  function jisKanaFromKey(eventLike, script) {
    const entry = JIS_KANA_BY_CODE[eventLike.code];
    if (!entry) {
      return "";
    }
    return convertScript(entry[eventLike.shiftKey ? 1 : 0], script);
  }

  const HANGUL_BASE = 0xac00;
  const HANGUL_END = 0xd7a3;
  const CHOSEONG = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];
  const JUNGSEONG = [
    "ㅏ",
    "ㅐ",
    "ㅑ",
    "ㅒ",
    "ㅓ",
    "ㅔ",
    "ㅕ",
    "ㅖ",
    "ㅗ",
    "ㅘ",
    "ㅙ",
    "ㅚ",
    "ㅛ",
    "ㅜ",
    "ㅝ",
    "ㅞ",
    "ㅟ",
    "ㅠ",
    "ㅡ",
    "ㅢ",
    "ㅣ",
  ];
  const JONGSEONG = [
    "",
    "ㄱ",
    "ㄲ",
    "ㄳ",
    "ㄴ",
    "ㄵ",
    "ㄶ",
    "ㄷ",
    "ㄹ",
    "ㄺ",
    "ㄻ",
    "ㄼ",
    "ㄽ",
    "ㄾ",
    "ㄿ",
    "ㅀ",
    "ㅁ",
    "ㅂ",
    "ㅄ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];

  const HANGUL_VOWELS = {
    "ㅏ": "a",
    "ㅐ": "e",
    "ㅑ": "ya",
    "ㅒ": "ye",
    "ㅓ": "o",
    "ㅔ": "e",
    "ㅕ": "yo",
    "ㅖ": "ye",
    "ㅗ": "o",
    "ㅘ": "wa",
    "ㅙ": "we",
    "ㅚ": "we",
    "ㅛ": "yo",
    "ㅜ": "u",
    "ㅝ": "wo",
    "ㅞ": "we",
    "ㅟ": "wi",
    "ㅠ": "yu",
    "ㅡ": "u",
    "ㅢ": "ui",
    "ㅣ": "i",
  };

  const HANGUL_ROWS = {
    "": {
      a: "あ",
      i: "い",
      u: "う",
      e: "え",
      o: "お",
      ya: "や",
      ye: "いぇ",
      yu: "ゆ",
      yo: "よ",
      wa: "わ",
      wi: "うぃ",
      we: "うぇ",
      wo: "うぉ",
      ui: "うぃ",
    },
    "ㄱ": { a: "が", i: "ぎ", u: "ぐ", e: "げ", o: "ご", ya: "ぎゃ", ye: "ぎぇ", yu: "ぎゅ", yo: "ぎょ" },
    "ㄲ": { a: "っか", i: "っき", u: "っく", e: "っけ", o: "っこ", ya: "っきゃ", ye: "っきぇ", yu: "っきゅ", yo: "っきょ" },
    "ㅋ": { a: "か", i: "き", u: "く", e: "け", o: "こ", ya: "きゃ", ye: "きぇ", yu: "きゅ", yo: "きょ" },
    "ㄴ": { a: "な", i: "に", u: "ぬ", e: "ね", o: "の", ya: "にゃ", ye: "にぇ", yu: "にゅ", yo: "にょ" },
    "ㄷ": { a: "だ", i: "ぢ", u: "づ", e: "で", o: "ど", ya: "ぢゃ", ye: "ぢぇ", yu: "ぢゅ", yo: "ぢょ" },
    "ㄸ": { a: "った", i: "ってぃ", u: "っつ", e: "って", o: "っと", ya: "っちゃ", ye: "っちぇ", yu: "っちゅ", yo: "っちょ" },
    "ㅌ": { a: "た", i: "てぃ", u: "とぅ", e: "て", o: "と", ya: "ちゃ", ye: "ちぇ", yu: "ちゅ", yo: "ちょ" },
    "ㄹ": { a: "ら", i: "り", u: "る", e: "れ", o: "ろ", ya: "りゃ", ye: "りぇ", yu: "りゅ", yo: "りょ" },
    "ㅁ": { a: "ま", i: "み", u: "む", e: "め", o: "も", ya: "みゃ", ye: "みぇ", yu: "みゅ", yo: "みょ" },
    "ㅂ": { a: "ば", i: "び", u: "ぶ", e: "べ", o: "ぼ", ya: "びゃ", ye: "びぇ", yu: "びゅ", yo: "びょ" },
    "ㅃ": { a: "っぱ", i: "っぴ", u: "っぷ", e: "っぺ", o: "っぽ", ya: "っぴゃ", ye: "っぴぇ", yu: "っぴゅ", yo: "っぴょ" },
    "ㅍ": { a: "ぱ", i: "ぴ", u: "ぷ", e: "ぺ", o: "ぽ", ya: "ぴゃ", ye: "ぴぇ", yu: "ぴゅ", yo: "ぴょ" },
    "ㅅ": { a: "さ", i: "し", u: "す", e: "せ", o: "そ", ya: "しゃ", ye: "しぇ", yu: "しゅ", yo: "しょ" },
    "ㅆ": { a: "っさ", i: "っし", u: "っす", e: "っせ", o: "っそ", ya: "っしゃ", ye: "っしぇ", yu: "っしゅ", yo: "っしょ" },
    "ㅈ": { a: "ざ", i: "じ", u: "ず", e: "ぜ", o: "ぞ", ya: "じゃ", ye: "じぇ", yu: "じゅ", yo: "じょ" },
    "ㅉ": { a: "っざ", i: "っじ", u: "っず", e: "っぜ", o: "っぞ", ya: "っじゃ", ye: "っじぇ", yu: "っじゅ", yo: "っじょ" },
    "ㅊ": { a: "ちゃ", i: "ち", u: "つ", e: "ちぇ", o: "ちょ", ya: "ちゃ", ye: "ちぇ", yu: "ちゅ", yo: "ちょ" },
    "ㅎ": { a: "は", i: "ひ", u: "ふ", e: "へ", o: "ほ", ya: "ひゃ", ye: "ひぇ", yu: "ひゅ", yo: "ひょ" },
  };

  const HANGUL_PUNCTUATION = {
    "-": "ー",
    ",": "、",
    ".": "。",
    "?": "？",
    "!": "！",
    "[": "「",
    "]": "」",
    "(": "（",
    ")": "）",
    "/": "・",
  };

  function decomposeHangul(char) {
    const code = char.charCodeAt(0);
    if (code < HANGUL_BASE || code > HANGUL_END) {
      return null;
    }

    const offset = code - HANGUL_BASE;
    const choseong = Math.floor(offset / 588);
    const jungseong = Math.floor((offset % 588) / 28);
    const jongseong = offset % 28;
    return {
      initial: CHOSEONG[choseong],
      vowel: JUNGSEONG[jungseong],
      coda: JONGSEONG[jongseong],
    };
  }

  function moraForHangul(initial, vowel) {
    if (initial === "ㅈ" && vowel === "ㅜ") {
      return "じゅ";
    }
    if (initial === "ㅉ" && vowel === "ㅜ") {
      return "っじゅ";
    }
    if (initial === "ㅊ" && vowel === "ㅜ") {
      return "ちゅ";
    }

    const row = HANGUL_ROWS[initial === "ㅇ" ? "" : initial];
    const vowelKey = HANGUL_VOWELS[vowel];
    if (!row || !vowelKey) {
      return "";
    }

    if (row[vowelKey]) {
      return row[vowelKey];
    }

    if (vowelKey === "wa") {
      return row.u + "ぁ";
    }
    if (vowelKey === "wi") {
      return row.u + "ぃ";
    }
    if (vowelKey === "we") {
      return row.u + "ぇ";
    }
    if (vowelKey === "wo") {
      return row.u + "ぉ";
    }
    if (vowelKey === "ui") {
      return row.u + "ぃ";
    }

    return "";
  }

  const HANGUL_N_CODAS = new Set(["ㄴ", "ㄵ", "ㄶ", "ㅁ", "ㅇ"]);
  const HANGUL_R_CODAS = new Set(["ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ"]);

  function codaToKana(coda) {
    if (!coda) {
      return "";
    }
    if (HANGUL_N_CODAS.has(coda)) {
      return "ん";
    }
    if (HANGUL_R_CODAS.has(coda)) {
      return "る";
    }
    return "っ";
  }

  function hangulSyllableToKana(char, script) {
    const parts = decomposeHangul(char);
    if (!parts) {
      return null;
    }

    const mora = moraForHangul(parts.initial, parts.vowel);
    if (!mora) {
      return char;
    }

    return convertScript(mora + codaToKana(parts.coda), script);
  }

  function convertHangulPhonetic(input, options) {
    const script = options && options.script === "katakana" ? "katakana" : "hiragana";
    let output = "";

    for (const char of normalizeHangulJamo(input)) {
      const kana = hangulSyllableToKana(char, script);
      if (kana !== null) {
        output += kana;
      } else if (Object.prototype.hasOwnProperty.call(HANGUL_PUNCTUATION, char)) {
        output += HANGUL_PUNCTUATION[char];
      } else {
        output += char;
      }
    }

    return output;
  }

  return {
    applyKanaMark,
    convertHangulPhonetic,
    convertRomaji,
    convertScript,
    flushRomaji,
    jisKanaFromKey,
    toHiragana,
    toKatakana,
  };
});
