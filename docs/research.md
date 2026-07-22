# 조사 메모

최신 한컴 도움말에도 일본어 글자판은 남아 있다. 공식 문서 기준으로 확인되는 방식은 다음과 같다.

- [한컴 도움말: 일본어 글자판](https://help.hancom.com/hoffice130/ko-KR/HncFinder/insert/keyboard/keyboard%28japanese%29.htm)
- [한컴 도움말: 글자판 바꾸기](https://help.hancom.com/hoffice130_assistant/ko-KR/Hwp/insert/keyboard/keyboard%28change%29.htm)
- [한컴 도움말: 동아시아 언어 입력 옵션](https://help.hancom.com/hoffice130_assistant/ko-KR/Hwp/insert/keyboard/keyboard%28asia_option%29.htm)

공개 도움말에서는 일본어 직접 글자판, 영어/로마자 발음 입력, 외래어 글자판, 일본어 변환/확정 옵션이 확인된다. `와타시 → わたし`처럼 한글 발음을 일본어 가나로 바꾸는 방식은 현재 공개된 일본어 글자판 종류에는 보이지 않는다.

한컴 외부의 비슷한 아이디어:

- [Google Play: 한글 발음 일본어 키보드](https://play.google.com/store/apps/details?id=com.studiogmh.kj_keyboard)
- [ONE store: 한글 발음 일본어 입력기](https://m.onestore.co.kr/v2/ko-kr/app/0000201960/about)
- [SoftDowntown: 다울소프트 일본어 입력기](https://www.softdowntown.com/bbs/board.php?bo_table=board&wr_id=1487)
- [한국어닷컴: 일본어 히라가나/가타카나 변환기](https://xn--yq5bk9r.com/blog/korean-to-japanes)

프로젝트는 한글97 바이너리나 사전 파일을 추출·패치하지 않고 사용감만 독립적으로 재현한다.

## Romaji 참고 기준

Romaji 보조 입력은 Mozc 전체 호환을 목표로 하지 않는다. 현재는 Google의 오픈 소스 일본어 IME인 [Mozc의 고정 commit `0651fbca`](https://github.com/google/mozc/blob/0651fbcae495ff98f6ae17bb59e2bee0e3a79661/src/data/preedit/romanji-hiragana.tsv)에 있는 `tch → っ + ch` 전이만 근거로 채택했다. 이에 따라 일괄 입력과 키 단위 입력 모두 `matcha → まっちゃ`가 된다.

향후 규칙을 확대할 때도 가변 `master` 전체를 자동 복제하지 않고, 채택할 항목과 source commit을 테스트와 함께 고정한다. Mozc 자체도 [안정 릴리스 개념이 없다고 설명](https://github.com/google/mozc#release-plan)하므로 이 프로젝트의 회귀 계약을 별도로 유지한다.
