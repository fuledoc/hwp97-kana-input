#!/usr/bin/env node
// SKK-JISYO.L(EUC-JP) → dict/kanji.txt 변환.
//
// 이 스크립트는 GPLv2 §3(a) 이행(가공 방법 공개)과 재현성을 위해 저장소에 둔다.
// 런타임에 로드되지 않으므로 앱 크기와 무관하다.
//
// 사용법:  node tools/build-kanji-dict.js <SKK-JISYO.L 경로>
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SRC = process.argv[2];
if (!SRC) {
  console.error("사용법: node tools/build-kanji-dict.js <SKK-JISYO.L 경로>");
  process.exit(1);
}

const OUT = path.join(__dirname, "..", "dict", "kanji.txt");
const MAX_CANDIDATES = 12;

// 한자(CJK 통합 + 확장A). 후보에 한자가 하나도 없으면 변환할 이유가 없다.
const HAS_KANJI = /[一-鿿㐀-䶿]/;
// 읽기는 순수 히라가나(+장음)만. 숫자 항목(#)·라틴 항목을 배제한다.
const PURE_KANA = /^[ぁ-ゖゝゞー]+$/;
// okuri-ari 표제어는 말미 1글자가 라틴 소문자다. 예: はしr /走/
const OKURI_ARI = /^([ぁ-ゖゝゞー]+)([a-z])$/;

const raw = fs.readFileSync(SRC);
const text = new TextDecoder("euc-jp").decode(raw);

function parseCandidates(body) {
  const out = [];
  for (const chunk of body.split("/")) {
    if (!chunk) continue;
    const cand = chunk.split(";")[0].trim(); // ';주석' 절단
    if (!cand || !HAS_KANJI.test(cand)) continue;
    if (!out.includes(cand)) out.push(cand);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

const nasi = [];
const ari = [];

for (const line of text.split("\n")) {
  if (!line || line.startsWith(";;")) continue;
  const m = /^(\S+)\s+\/(.+)\/\s*$/.exec(line);
  if (!m) continue;
  const [, key, body] = m;
  const cands = parseCandidates(body);
  if (!cands.length) continue;

  if (PURE_KANA.test(key)) {
    nasi.push(key + "\t" + cands.join(" "));
  } else {
    // 어간과 자음 문자를 함께 보존한다. 「きk」의 k를 버리면 聴け를 만들 수 없다.
    const om = OKURI_ARI.exec(key);
    if (om) ari.push(om[1] + om[2] + "\t" + cands.join(" "));
  }
}

const header = [
  "# 한글→일본어 입력기(책방)용 가공 사전",
  "#",
  "# 원본: SKK-JISYO.L — https://github.com/skk-dev/dict",
  "# Copyright (C) 1988-2014 Masahiko Sato, Hironobu Takahashi,",
  "#   Yukiyoshi Kameyama, NAKAJIMA Mikio, MITA Yuusuke, and the SKK Development Team.",
  "#",
  "# 이 사전 데이터는 GNU General Public License version 2 이상의 조건으로 배포됩니다.",
  "# 전문은 같은 폴더의 COPYING 파일을 보십시오.",
  "#",
  "# 가공 내용: EUC-JP→UTF-8 변환, 주석 제거, 한자 미포함 후보 제거,",
  "#   중복 제거, 후보 " + MAX_CANDIDATES + "개 상한, 읽기가 순수 히라가나가 아닌 표제어 제외.",
  "# 가공 스크립트: tools/build-kanji-dict.js (같은 저장소)",
  "#",
  "# 형식: 읽기<TAB>후보1 후보2 …",
  "#   '#okuri-ari' 이후는 활용 어간이며 키 말미 1글자는 어미의 자음(SKK 표기)이다.",
  "",
].join("\n");

const body =
  nasi.join("\n") + "\n#okuri-ari\n" + ari.join("\n") + "\n";

fs.writeFileSync(OUT, header + body, "utf8");

const bytes = fs.statSync(OUT).size;
console.log(`okuri-nasi ${nasi.length.toLocaleString()}개`);
console.log(`okuri-ari  ${ari.length.toLocaleString()}개`);
console.log(`출력 ${OUT} — ${(bytes / 1048576).toFixed(2)} MB`);
