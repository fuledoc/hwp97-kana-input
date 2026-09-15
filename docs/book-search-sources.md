# 책 찾기 검색 리스트

서가·책등 사진의 일본어 책을 목록(`books.html`)에 올릴 때 쓰는 사이트 목록이다.
**사용자가 알려 준 사이트는 반드시 검색 리스트에 넣는다.** 새로 알려 주면 아래
「사용자가 알려 준 곳」에 날짜와 쓰임을 적고, 검색 순서에도 반영한다.

## 사용자가 알려 준 곳

| 알려 준 날 | 사이트 | 주소 형식 | 쓰임 |
|---|---|---|---|
| 2026-08-19 | 알라딘 상품 등록 화면 | `https://www.aladin.co.kr/scm/wrecord.aspx` | 목록 항목의 순서·칸 이름 기준(ISBN · 도서명 · 부제 · 저자 · 출판사 · 페이지 · 출간일 · 정가) |
| 2026-08-19, 2026-09-11 | 알라딘 상품 카테고리 설정 | `https://www.aladin.co.kr/scm/wpopup_category.aspx?cat=0&branchType=1` | 직접 등록 책의 분류 목록(국내도서 4단). 로그인해야 전체가 보이므로 공개 분류 트리 `/shop/common/wtreefold.aspx?CID={번호}`로 받는다 |
| 2026-09-11, 2026-09-15 | Amazon.co.jp 상품 페이지 | `https://www.amazon.co.jp/dp/{ISBN10}` | 표지(`#landingImage`)·서지. ISBN 이미지 주소가 비어도 상품 페이지엔 표지가 있을 수 있다 |
| 2026-09-15 | BOOKOFF 온라인 | `https://shopping.bookoff.co.jp/used/{상품번호}` | 옛 책 표지. 상품 페이지에 JAN·출판사·발매일이 있다 |
| 2026-09-15 | 日本の古本屋 | `https://www.kosho.or.jp/products/detail.php?product_id={번호}` | ISBN 없는 옛 책의 판(版)·刊行年·쪽수·판매자 사진 |
| 2026-09-15 | メルカリ(중고 거래) | 검색 `https://jp.mercari.com/search?keyword={제목 출판사}` → 상품 `https://jp.mercari.com/item/m{번호}` | 서점에 표지가 없는 옛 책의 실물 사진. ISBN 없는 책도 제목·출판사로 찾을 수 있다 |

## 검색 순서

1. **서지(판·쪽수·출간일·정가)**
   - 국립국회도서관 서치: `https://ndlsearch.ndl.go.jp/api/opensearch?title=…&creator=…`, ISBN은 `…/api/sru?operation=searchRetrieve&recordSchema=dcndl&query=isbn%3D{ISBN}`
   - CiNii Books: `https://ci.nii.ac.jp/books/opensearch/search?format=json&q=…` — NDL에 ISBN이 없는 옛 판의 ISBN이 여기 있기도 하다(예: 岩波少年文庫 구판 三国志)
   - 日本の古本屋(사용자 제공): ISBN이 없는 책의 판·刊行年·쪽수
2. **알라딘 등록 여부**: `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord={ISBN13}` → 있으면 상품 페이지의 `ul#ulCategory`·정가
3. **표지**(위에서부터 차례로, 찾으면 멈추되 반드시 눈으로 대조)
   1. Amazon.co.jp 상품 페이지(사용자 제공) `/dp/{ISBN10}`
   2. BOOKOFF(사용자 제공): 브라우저로 `https://shopping.bookoff.co.jp/search/keyword/{ISBN13}` → `/used/{상품번호}` → 표지 `https://content.bookoff.co.jp/goodsimages/LL/{상품번호 앞 6자리}/{상품번호}LL.jpg`
   3. 楽天ブックス: `https://books.rakuten.co.jp/search?sitem={ISBN13}` → `thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/…`
   4. 日本の古本屋(사용자 제공): ISBN 없는 책
   5. メルカリ(사용자 제공): 위에서 못 찾은 옛 책. 판매자가 찍은 실물 사진이라 판·쇄를 알 수 있는 부분(판권장·띠·정가 표시)을 보고, 사진 속 책등과 같은 판일 때만 쓴다. 기울거나 배경이 있으면 잘라 쓴다
   6. 그 밖에 전에 후보로 본 중고 사이트: 駿河屋, まんだらけ, ヤフオク
   7. 그 밖에 전에 참고한 곳: 紀伊國屋書店 `https://www.kinokuniya.co.jp/f/dsg-01-{ISBN13}`, TSUTAYA `https://shop.tsutaya.co.jp/book/product/{ISBN13}/`, 丸善ジュンク堂 `https://www.maruzenjunkudo.co.jp/products/{ISBN13}`, 출판사 사이트(有斐閣·PHP·SBクリエイティブ·ワック 등)
4. **분류**: 알라딘 카테고리 설정 목록(사용자 제공) 안에서 NDC 기준, 한국어판이 있으면 알라딘 한국어판 분류

## 접속 요령

- BOOKOFF·日本の古本屋·Amazon 상품 페이지·メルカリ는 curl을 막거나 빈 응답을 준다. 헤드리스 Chrome(`--headless=new --dump-dom`)으로 연다. メルカリ는 화면을 그린 뒤에 목록이 생기므로 `--virtual-time-budget=15000` 정도로 기다린다. 목록 사진은 `https://static.mercdn.net/thumb/item/webp/m{번호}_1.jpg`.
- Amazon 「COVER COMING SOON」 자리표시자는 350×500 정상 크기로 온다. 楽天 검색은 책이 없으면 엉뚱한 상품 이미지를 준다. 크기로 거르지 말고 눈으로 본다.

## 대조 원칙(사용자가 알려 준 링크도 똑같이)

같은 제목이라도 다른 판이거나 다른 책일 수 있다. 상품 페이지의 **JAN(ISBN)·출판사·발매일**과 표지의 **제목·저자·출판사**를 사진의 책등과 대조하고, 다르면 쓰지 않은 이유를 사용자에게 알린다.

| 알려 준 링크 | 실제 | 사진 속 책 |
|---|---|---|
| BOOKOFF 0012762984 | 積木くずし 2005 アートン 완전복각판 | 1982 桐原書店 |
| BOOKOFF 0016122173, Amazon 4480425756 | 名曲三〇〇選(吉田秀和, ちくま文庫 2009) — 다른 책 | 名曲二〇三選(ステレオ芸術編集部 編, ラジオ技術社 1977) |
| Amazon 481380392X · 4813803938 | 令和6年度 「国語 五 銀河」「国語 六 創造」 | 옛 판 「国語 五上」「国語 六上」 |
