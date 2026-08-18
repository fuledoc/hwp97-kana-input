(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KanjiEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // 읽기 → 한자 후보. loadDictionary() 전에는 비어 있고, 그 상태에서도
  // convert()는 예외 없이 빈 제안을 돌려준다(사전 로딩 실패가 앱을 죽이지 않는다).
  let nasi = new Map(); // 명사 등: 통짜 표제어
  let ari = new Map(); // 활용 어간: 「はしr → 走」의 어간부

  const HIRAGANA = /[ぁ-ゖゝゞー]/;
  const MAXLEN = 14;
  const MINSPAN = 2;

  // 조사 1보 예측용. 최장일치가 조사를 삼키는 것을 막는다.
  // 예) かぜのうたをきけ 에서 「のう(脳)」가 「の+うた」를 삼키는 문제.
  const CORE_PARTICLES = new Set("のをはがにへともでやかな".split(""));

  // 어미 가나 → SKK 자음 문자. 「聴け」의 け는 k행이므로 키 「きk」와 짝이 된다.
  const OKURI_CONSONANT = (() => {
    const rows = {
      k: "かきくけこ", g: "がぎぐげご", s: "さしすせそ", z: "ざじずぜぞ",
      t: "たちつてと", d: "だぢづでど", n: "なにぬねの", h: "はひふへほ",
      b: "ばびぶべぼ", p: "ぱぴぷぺぽ", m: "まみむめも", y: "やゆよ",
      r: "らりるれろ", w: "わゐゑを",
    };
    const map = new Map();
    for (const [c, kana] of Object.entries(rows)) {
      for (const k of kana) map.set(k, c);
    }
    return map;
  })();
  const LONG_PARTICLES = [
    "について", "における", "のための", "という", "である",
    "では", "には", "とは", "から", "まで", "より", "など", "ので", "のに",
  ];

  function parseDictionary(text) {
    const nextNasi = new Map();
    const nextAri = new Map();
    let target = nextNasi;
    for (const line of String(text).split("\n")) {
      if (!line) continue;
      if (line.charCodeAt(0) === 35 /* # */) {
        if (line === "#okuri-ari") target = nextAri;
        continue;
      }
      const tab = line.indexOf("\t");
      if (tab <= 0) continue;
      target.set(line.slice(0, tab), line.slice(tab + 1).split(" "));
    }
    return { nasi: nextNasi, ari: nextAri };
  }

  function loadDictionary(text) {
    const parsed = parseDictionary(text);
    nasi = parsed.nasi;
    ari = parsed.ari;
    return { nasi: nasi.size, ari: ari.size };
  }

  function isLoaded() {
    return nasi.size > 0;
  }

  function isHiragana(ch) {
    return HIRAGANA.test(ch);
  }

  // 어간이 사전에 있고 어미의 자음이 맞으면 활용형 후보를 만든다. きk + け → 聴け
  function okuriCandidates(stem, tail) {
    const consonant = OKURI_CONSONANT.get(tail);
    if (!consonant) return [];
    const stems = ari.get(stem + consonant);
    if (!stems) return [];
    return stems.map((s) => s + tail);
  }

  // text[from..] 에서 시작하는 가장 긴 표제어 길이. 없으면 0.
  function longestAt(text, from, limit) {
    const max = Math.min(limit === undefined ? MAXLEN : limit, text.length - from);
    for (let len = max; len >= 1; len -= 1) {
      if (nasi.has(text.substr(from, len))) return len;
    }
    return 0;
  }

  // 조사 1보 예측: 조사를 떼는 쪽과 조사를 삼킨 단어로 읽는 쪽 중
  // 더 많은 글자를 덮는 쪽을 고른다. 「魂軒奥」(과소 분절)과
  // 「講談社が口授」(과잉 분절)를 동시에 막는다.
  function particleAt(text, i) {
    for (const p of LONG_PARTICLES) {
      if (text.startsWith(p, i)) return p;
    }
    const ch = text[i];
    if (!CORE_PARTICLES.has(ch)) return "";
    // 「を」는 현대 일본어에서 목적격 조사로만 쓰인다. 단어의 일부일 수 없다.
    if (ch === "を") return ch;

    const after = i + 1;
    if (after >= text.length) return ch;
    const nextLen = longestAt(text, after);
    if (nextLen < MINSPAN) return "";
    // 조사를 삼킨 채로 잡히는 단어가 더 길면 그쪽을 믿는다.
    const swallowed = longestAt(text, i);
    return 1 + nextLen > swallowed ? ch : "";
  }

  function segment(text) {
    const spans = [];
    let i = 0;
    let prevWasWord = false;

    while (i < text.length) {
      const ch = text[i];

      // 스크립트 경계(가타카나·한자·라틴·숫자·기호)는 조회하지 않고 통과.
      if (!isHiragana(ch)) {
        let j = i;
        while (j < text.length && !isHiragana(text[j])) j += 1;
        const run = text.slice(i, j);
        spans.push({ type: "pass", text: run });
        i = j;
        // 가타카나·한자·라틴 낱말 뒤에도 조사가 붙는다(「アジアの新時代」).
        // 문장부호 뒤에는 붙지 않는다.
        prevWasWord = /[ァ-ヿ一-鿿㐀-䶿A-Za-z0-9]/.test(run);
        continue;
      }

      // 앞에 단어가 있었다면, 이 자리가 조사인지 먼저 본다.
      if (prevWasWord) {
        const p = particleAt(text, i);
        if (p) {
          spans.push({ type: "pass", text: p });
          i += p.length;
          prevWasWord = false;
          continue;
        }
      }

      // 최장일치. 단 다음 글자가 조사로 확정되면 거기서 끊는다.
      let len = 0;
      const max = Math.min(MAXLEN, text.length - i);
      for (let n = max; n >= MINSPAN; n -= 1) {
        const word = text.substr(i, n);
        if (!nasi.has(word)) continue;
        len = n;
        break;
      }

      if (len) {
        const word = text.substr(i, len);
        const cands = nasi.get(word).slice();
        // 활용 어간과 길이가 같으면 후보를 병합한다(告ぐ ↔ 津具).
        if (len >= 2 && i + len < text.length) {
          const tail = text[i + len];
          for (const c of okuriCandidates(word, tail)) {
            if (!cands.includes(c)) cands.push(c);
          }
        }
        spans.push({ type: "word", text: word, candidates: cands });
        i += len;
        prevWasWord = true;
        continue;
      }

      // 활용형: 어간 + 어미 1글자
      let hit = null;
      for (let n = Math.min(MAXLEN, text.length - i - 1); n >= 1; n -= 1) {
        const stem = text.substr(i, n);
        const tail = text[i + n];
        if (!tail || !isHiragana(tail)) continue;
        const cands = okuriCandidates(stem, tail);
        if (cands.length) {
          hit = { text: stem + tail, candidates: cands };
          break;
        }
      }
      if (hit) {
        spans.push({ type: "word", text: hit.text, candidates: hit.candidates });
        i += hit.text.length;
        prevWasWord = true;
        continue;
      }

      // 어디에도 안 걸리는 가나 1글자는 그대로 통과.
      spans.push({ type: "pass", text: ch });
      i += 1;
      prevWasWord = false;
    }

    // 인접한 pass 스팬 병합
    const merged = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (s.type === "pass" && last && last.type === "pass") {
        last.text += s.text;
      } else {
        merged.push({ ...s });
      }
    }

    // 후보 목록 맨 앞에는 언제나 원문 가나를 둔다.
    // 고르기와 되돌리기가 같은 동작이 되어 따로 가르칠 필요가 없다.
    for (const s of merged) {
      if (s.type !== "word") continue;
      s.candidates = [s.text, ...s.candidates.filter((c) => c !== s.text)];
    }
    return merged;
  }

  function convert(text) {
    if (!isLoaded() || !text) return [];
    // 통짜 조회 우선. 저자명·출판사명이 대부분 여기서 끝난다.
    const whole = nasi.get(text);
    if (whole) {
      return [{ type: "word", text, candidates: [text, ...whole] }];
    }
    return segment(text);
  }

  // 캐럿 왼쪽의 연속된 가나 덩어리를 돌려준다. UI가 변환 대상을 잡는 데 쓴다.
  function kanaRunBefore(text, caret) {
    let start = caret;
    while (start > 0 && isHiragana(text[start - 1])) start -= 1;
    return { start, end: caret, text: text.slice(start, caret) };
  }

  return {
    convert,
    isLoaded,
    kanaRunBefore,
    loadDictionary,
    segment,
  };
});
