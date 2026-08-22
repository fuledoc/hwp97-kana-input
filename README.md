# 한글 → 일본어 입력기 (HWP97 Kana Input)

한글 발음을 입력하면 일본어 히라가나 또는 카타카나로 바꿔 주는 웹 입력기입니다. 일본어 원서의 제목을 중고책 판매 플랫폼(알라딘·북코아·개똥이네·예스24 등)에 등록할 때, 한글97의 한글→가나 입력 감각을 브라우저에서 대신 쓰기 위해 만들었습니다. 한글97 바이너리나 사전 파일은 사용하지 않으며, 번역이 아니라 발음 기반 휴리스틱입니다.

빌드·서버·외부 요청이 전혀 없는 정적 웹앱이라, 입력한 내용은 사용자의 브라우저 밖으로 나가지 않습니다.

## 실행

- **웹(권장):** 배포된 URL을 브라우저(Edge·Chrome·Safari 등)로 열면 어느 컴퓨터에서든 바로 씁니다. 자주 쓴다면 브라우저의 「앱으로 설치」(Edge/Chrome)로 바탕화면 아이콘을 만들 수 있습니다.
- **로컬:** `index.html`을 브라우저로 열어도 동작합니다. 단 `file://`에서는 복사 기능이 구형 경로로 떨어질 수 있어, 실사용은 HTTPS 배포본을 권장합니다.

### 사용 흐름

1. `ひらがな`/`カタカナ` 중 원하는 글자 종류를 고릅니다(기본 히라가나).
2. 입력창에 한글 발음을 칩니다. 예) `와타시 → わたし`, `토우쿄우 → とうきょう`.
3. 목적격 조사 `を`나 장음 `ー`, 「」, `・`처럼 한글로 치기 어려운 글자는 「특수 글자」 버튼으로 넣습니다.
4. **복사하기**를 눌러 판매글에 붙여넣습니다.

탁음(が·だ·ば)은 평음 `ㄱㄷㅂ`, 청음(か·た·ぱ)은 격음 `ㅋㅌㅍ`로 입력합니다. 자세한 규칙과 예시는 화면의 「도움말 · 예시 보기」에 있습니다.

### 한자 바꾸기

가나가 입력되면 잠시 뒤 아래에 한자 후보가 뜹니다. 버튼을 눌러야 바뀌며 **자동으로 삽입되지 않습니다**. 후보 첫 항목은 언제나 원문 가나라, 되돌리기도 같은 방식으로 합니다. 사전에 없는 말이면 아무것도 뜨지 않습니다.

사전은 첫 입력 때 `dict/kanji.txt`(전송 기준 약 1.3MB)를 한 번 내려받아 브라우저가 캐시합니다. 내려받기에 실패하면 한자 기능만 조용히 꺼지고 가나 변환·복사는 그대로 동작합니다.

### 책 제목 목록 (`books.html`)

서가 사진에서 옮겨 적어 서지 검색으로 대조한 일본어 책 제목을 표로 모아 둔 별도 페이지입니다. 제목마다 「복사」 버튼이 있어 입력기를 거치지 않고 바로 판매글에 붙여넣습니다. 입력기 화면 아래 「책 제목 목록」 링크로 오갑니다.

- 항목은 알라딘 상품 등록 화면의 순서·칸 이름을 따릅니다(ISBN → 도서명 → 부제 → 저자 → 출판사 → 페이지 → 출간일). 「출판사」는 총서명이 아니라 발행처입니다.
- 각 행에 알라딘 분류와, 그 책이 알라딘 DB에 이미 있는지를 표시합니다. 있으면 ISBN 검색만으로 등록이 끝나고, 없으면 항목을 하나씩 옮겨 담아야 합니다. 분류는 알라딘 상품페이지에서 읽어 온 값이며, 없는 책만 제안값입니다.
- 제목·저자·출판사·발행년·쪽수·ISBN은 **글자를 누르면 그 항목만 복사**됩니다. 알라딘 상품 등록 화면의 칸에 하나씩 붙여넣기 위한 것이라, 쪽수는 「167쪽」으로 보여 주되 복사값은 `167`입니다.
- 표지를 누르면 `{ISBN13}.jpg`로 저장됩니다(`<a download>`). 알라딘 「상품 이미지」에 그 파일을 첨부합니다. 가로 500px을 넘지 않게 두는데, 알라딘 상품 이미지의 최대 가로가 500px이기 때문입니다.
- 각 행에는 앞표지 썸네일이 붙어 있습니다. 실물을 찍은 사진이 아니라, ISBN으로 일본 서점·중고서점에서 받아 온 판 확인용 참고 이미지입니다.
- 표지 이미지는 `photos/covers/{ISBN13}.jpg`에 로컬로 두고 상대경로로 참조합니다. **핫링크하지 않습니다**(외부 요청 0건 불변 조건).
- 별도 복사 버튼은 없습니다. 값 자체가 버튼이라 누르면 복사되고, 누른 자리 옆에 「복사됨」이 잠깐 떴다 사라집니다.
- 정가는 국립국회도서관 서지(`dcndl:price`)에서 가져온 발행 당시 일본 정가입니다. 원화는 고정 환율(100엔 = 870원, 2026-08-22)로 미리 계산해 HTML에 적어 둡니다. 런타임에 환율을 조회하면 외부 요청 0건 조건이 깨집니다.
- 목록 데이터는 `books.html`에 직접 적혀 있습니다. 책을 더하거나 고칠 때 그 파일의 표 행을 편집하고, `data-copy` 값을 제목과 같게 맞춥니다.
- 복사 동작은 `src/books.js`가 담당하며 `src/app.js`와 상태를 공유하지 않습니다.

#### 표지 이미지 추가 방법

1. 국립국회도서관 서치로 ISBN을 확정합니다. `https://ndlsearch.ndl.go.jp/api/opensearch?isbn={ISBN}` 의 `dcterms:extent`(쪽수)·`dcterms:issued`(발행년)가 목록의 값과 맞는지 먼저 대조합니다. 판·권이 다르면 표지도 다릅니다.
2. 아래 순서로 받아 봅니다. 앞의 것이 없으면 다음으로 넘어갑니다.
   - `https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/{ISBN13 끝4자리}/{ISBN13}.jpg`
   - `https://m.media-amazon.com/images/P/{ISBN10}.09.LZZZZZZZ.jpg`
   - ブックオフオンライン 상품페이지의 `content.bookoff.co.jp/goodsimages/XL/...` 이미지
3. **자리표시자를 걸러냅니다.** Amazon은 표지가 없으면 「COVER COMING SOON」이 그려진 정상 크기 JPEG를 돌려주므로 파일 크기로는 못 거릅니다. 楽天은 404 HTML을 줍니다.
4. 받은 이미지를 **반드시 눈으로 열어** 표지에 인쇄된 제목·저자·출판사·총서번호가 목록과 같은지 확인합니다. 서점 페이지의 설명문만 믿지 않습니다.
5. 가로 400px로 줄여 `photos/covers/{ISBN13}.jpg`로 저장하고, 행에 `<img>`를 넣습니다.

## 입력 방식

화면에는 **Hangul Phonetic**(한글 발음) 입력만 노출합니다. 엔진에는 보조 입력 방식 두 가지가 남아 있으나 UI에서는 숨겼습니다.

- **Hangul Phonetic:** 한글 음절과 일부 문장부호를 가나로 바꿉니다. (화면 노출)
- **Romaji / JIS Kana:** 엔진과 테스트에는 유지되지만 화면에는 노출하지 않습니다. `src/app.js`의 `currentScheme()`은 `scheme` 라디오가 있을 때만 그 값을 따르고, 없으면 `hangul`로 고정됩니다.

Hangul IME 조합 중에는 텍스트를 바꾸지 않습니다. `compositionend` 뒤 브라우저의 마지막 `input`을 기다리기 위해 120ms 후 확정 범위만 변환하며, 새 조합이 시작되면 타이머는 취소하되 앞선 확정 범위는 보존합니다. Undo/Redo 결과는 자동 재변환하지 않습니다.

복사는 Clipboard API를 먼저 사용하고, 로컬 파일이나 권한 제한으로 실패하면 브라우저의 기존 copy 명령으로 fallback합니다.

## 배포

정적 파일이므로 GitHub Pages 등 어느 정적 호스팅에도 그대로 올라갑니다. 자원 참조가 모두 상대경로라 서브패스(`user.github.io/repo/`)에서도 깨지지 않습니다. `manifest.webmanifest`와 `icon.svg`로 「앱으로 설치」(홈 화면/바탕화면 아이콘)를 지원합니다.

- 서비스워커/오프라인 캐시는 의도적으로 넣지 않았습니다. 비개발자 사용자에게 「고쳤는데 안 바뀜」 혼란을 만들 수 있기 때문입니다.
- 배포 후에도 자기완결성을 유지합니다. 릴리스 전 `grep -rEn 'https?://' index.html books.html src/` 가 비어 있는지(외부 자원 0건) 확인하세요.

## 개발과 검증

Node.js 22 이상에서 외부 패키지 설치 없이 실행할 수 있습니다.

```sh
npm test
npm run check
npm run verify
```

기존 명령 `node test/kana-engine.test.js`도 계속 사용할 수 있습니다. 전체 테스트에는 엔진 단위 테스트와 가짜 textarea·타이머를 이용한 IME 상태 전이 테스트, UI 버튼(복사·지우기·특수 글자 삽입) 회귀 테스트가 포함됩니다.

Hangul Phonetic 기대값은 [골든 코퍼스](test/fixtures/hangul-phonetic.golden.json)에, 근거와 한계는 [변환 정책](docs/hangul-phonetic-policy.md)에 기록합니다. 이 코퍼스는 한글97에서 추출한 데이터가 아니라 프로젝트의 회귀 계약이며, `provisional` 사례도 의도적으로 바꾸기 전까지 같은 값으로 검증합니다.

Windows 11에서 이벤트 로그가 필요하면 `index.html?debug-ime=1`로 열고 Console의 `[IME]` 항목을 확인하세요. 릴리스 전 절차는 [Windows 11 IME 수동 테스트](docs/windows-ime-test.md)를 따릅니다.

## 구조

- `index.html`: 화면 구조(한국어 UI, 히라가나/카타카나 토글, 특수 글자 삽입, 복사·지우기, 도움말)
- `src/kana-engine.js`: DOM 없는 변환 엔진
- `src/app.js`: 입력 버퍼, IME 상태, 선택 범위와 UI 연결
- `src/styles.css`: 라이트/다크 대응, 큰 글자·버튼
- `src/kanji-engine.js`: DOM 없는 가나→한자 변환 엔진(통짜 조회 → 조사 1보 예측 분절)
- `dict/kanji.txt`, `dict/COPYING`: 가공 사전과 GPL v2 전문
- `tools/build-kanji-dict.js`: SKK-JISYO.L → `dict/kanji.txt` 변환 스크립트
- `manifest.webmanifest`, `icon.svg`: 「앱으로 설치」용 최소 PWA 구성
- `test/kana-engine.test.js`: 엔진 단위·골든 코퍼스·전체 음절 불변식 테스트
- `test/kana-engine-edge.test.js`: Romaji 스트리밍·Unicode 경계 회귀 테스트
- `test/fixtures/hangul-phonetic.golden.json`: Hangul Phonetic 회귀 계약
- `test/app.test.js`: 조합·타이머·모드·커서·UI 버튼 회귀 테스트
- `test/books.test.js`: 목록 페이지의 항목별 복사와 「복사됨」 알림 회귀 테스트
- `docs/hangul-phonetic-policy.md`: Hangul Phonetic 정책과 한계
- `AGENTS.md`: 프로젝트 규칙과 에이전트 운용 원칙
- `archive/`: 이전 원본 보관용이며 개발 대상이 아님

## 사전 라이선스

한자 변환 사전은 [SKK-JISYO.L](https://github.com/skk-dev/dict)을 가공한 것입니다.

Copyright (C) 1988-2014 Masahiko Sato, Hironobu Takahashi, Yukiyoshi Kameyama, NAKAJIMA Mikio, MITA Yuusuke, and the SKK Development Team.

**GNU General Public License version 2 이상**의 조건으로 배포됩니다. 전문은 [`dict/COPYING`](dict/COPYING)에 있고, 가공 방법은 [`tools/build-kanji-dict.js`](tools/build-kanji-dict.js)에서 확인할 수 있습니다.

배경 조사와 참고 링크는 [조사 메모](docs/research.md)에 정리되어 있습니다.
