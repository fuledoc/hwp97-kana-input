# Windows 11 IME 수동 테스트

브라우저 자동화는 실제 Microsoft 한글 IME 조합 순서를 재현하지 못한다. IME 처리나 릴리스 후보를 변경할 때 Windows 11의 최신 Edge와 Chrome에서 이 문서를 수행한다.

## 준비

1. Microsoft 한글 IME를 사용한다.
2. `index.html?debug-ime=1`을 열고 개발자 도구 Console을 연다.
3. 오류가 나면 `[IME]` 로그의 이벤트 순서, `inputType`, `data`, `isComposing`, 선택 범위와 `value`를 보관한다.
4. 각 브라우저 이름·버전, Windows 빌드와 IME 호환성 설정을 함께 기록한다.

## Hangul Phonetic

- `와타시`, `히라가나`, `신주쿠`, `갓코우`, `쥬-스`를 천천히 입력한다.
- 같은 예문을 빠르게 연속 입력해 새 `compositionstart`가 120ms 안에 발생하도록 한다.
- Space와 Enter로 조합을 확정하고 마지막 글자의 누락·중복이 없는지 확인한다.
- 조합 직후 120ms 안에 Hiragana/Katakana와 Romaji/JIS 모드를 전환한다.
- 조합 중 마우스로 모드 버튼을 눌러 활성 조합 문자열이 중간에 바뀌지 않는지 확인한다.
- 기존 한글을 선택해 조합을 시작한 뒤 Esc로 취소한다. 선택 원문이 변환되지 않아야 한다.
- 취소 직후 Romaji/JIS로 바꾸고 한글을 붙여넣어 이전 Hangul 강제 확정 상태가 남지 않는지 확인한다.
- `와와`의 두 글자 사이에 같은 `와`를 붙여넣고, 새로 넣은 가운데 글자만 `わ`로 바뀌는지 확인한다.
- Hangul 조합 중 Romaji로 바꾼 직후 120ms 안에 새 한글 조합을 시작한다. 앞선 Hangul 조합만 변환되고 새 Romaji 조합은 한글로 남아야 한다.
- `ASCII text. ` 뒤와 기존 문장 중간에 `와타시`를 입력한다. 기존 마침표와 다른 문자가 변하지 않아야 한다.
- 여러 줄 문서 중간에서 입력하고 커서, 선택 방향과 스크롤 위치를 확인한다.
- Ctrl+Z와 Ctrl+Y 후 결과가 120ms 뒤 다시 바뀌지 않는지 확인한다.
- 붙여넣기, 잘라내기, 드래그 드롭 후 변환 범위를 확인한다.

## Romaji

- `nna`, `nnya`, `nya`, `konnichiha`, `gakkou`, `matcha`를 한 키씩 입력한다.
- `k`만 입력한 상태에서 방향키, Home/End, 마우스 클릭, Ctrl+V, focus 이동을 시험한다.
- 미완성 버퍼는 이동 전 위치에서 문자 그대로 확정되어야 한다.
- Backspace는 표시된 문자가 아니라 미완성 버퍼를 먼저 지워야 한다.

## JIS Kana

- JIS 106/109 키보드가 있으면 물리 키의 `KeyboardEvent.code`를 로그로 확인한다.
- 소문자 키, Shift 소문자, `゛`, `゜`, `「`, `」`, `ろ`, `ー`를 확인한다.
- 탁음·반탁음을 Hiragana와 Katakana에서 각각 확인한다.
- Microsoft IME가 조합 중일 때 JIS 처리기가 키를 가로채지 않는지 확인한다.

## UI와 Clipboard

- 어느 입력 방식에서도 예문 버튼이 현재 문자종으로 변환되는지 확인한다.
- `file://`로 직접 연 경우와 로컬 HTTP 서버에서 Copy를 각각 시험한다.
- Clipboard API 권한이 거부되어도 fallback이 동작하거나 `Copy failed`가 표시되어야 한다.
- Clear, Copy와 예문 버튼을 조합 직후 눌러 마지막 글자와 버퍼 상태를 확인한다.

## 통과 기준

- Console에 예외가 없다.
- 확정된 입력 범위 밖의 텍스트가 바뀌지 않는다.
- 마지막 조합 글자의 누락·중복·재변환이 없다.
- 테스트 실패 시 해당 이벤트 순서를 `test/app.test.js`에 가능한 범위까지 회귀 테스트로 추가한다.
