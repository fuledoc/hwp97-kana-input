# 등록 완료 저장소 운영 안내

책 목록의 「알라딘 등록 완료」 표시를 두 컴퓨터가 함께 보기 위한 저장소입니다. 화면은 그대로 GitHub Pages에 있고, 책 번호와 누른 시각만 Cloudflare에 기록합니다.

| 항목 | 값 |
|------|-----|
| 주소 | `https://books-api.fuledoc.com` (`books.html`의 `done-api` 메타 한 줄) |
| Worker | `books-done` (`worker/index.mjs`) |
| 계정 | `Fuledoc@gmail.com's Account` (fuledoc@gmail.com) |
| 데이터베이스 | D1 `books-done`(APAC, 2026-11-03 생성), 표 `done(book_id, done_at)` |
| 비상용 주소 | `https://books-done.fuledoc.workers.dev` (`workers_dev: true`) |
| 무료 한도 | Workers 하루 10만 요청, D1 하루 읽기 500만 행·쓰기 10만 행 |

## 로그인

코드 변경, 복구, 배포는 Cloudflare 로그인이 있어야 합니다. 먼저 「처음 설치」 1번으로 로그인하고, 끝나면 8번으로 로그아웃합니다.

## 코드

- 쓰기(`PUT`/`DELETE`)에만 코드가 필요합니다. 읽기(`GET /done`)는 공개이며 책 번호와 시각만 나옵니다.
- 코드는 숫자만 씁니다. 화면이 숫자가 아닌 입력을 틀린 코드로 처리합니다. 전각 숫자는 같은 숫자로 받습니다.
- 코드는 Worker 비밀값 `EDIT_CODE`에만 있고, 저장소에는 넣지 않습니다. 한번 넣으면 다시 읽을 수 없으니 사용자가 따로 메모합니다.
- 코드를 바꾸려면 아래를 실행합니다. 값을 물으면 새 코드를 직접 입력합니다. 바꾼 뒤 컴퓨터마다 첫 번째 누름은 「코드가 맞지 않습니다」로 끝나고, 어느 책이든 다시 누르면 새 코드를 묻습니다. 실패한 책은 기록되지 않았으니 그 책을 다시 눌러야 기록됩니다.

```bash
npx wrangler@4.156.0 secret put EDIT_CODE --config worker/wrangler.json
```

## 긴급 끄기

저장소가 멈추기만 했다면 끌 필요가 없습니다. 화면이 스스로 「이미 등록한 책이 섞여 있을 수 있습니다」라고 알리고, 복사와 표지 저장은 그대로 됩니다.

저장소가 틀린 값을 주면 `books.html`의 `done-api` 메타를 `content="off"`로 바꿔 `main`에 푸시합니다. Pages는 `main`만 배포합니다. 버튼과 요청이 사라지고 전체 목록과 같은 경고만 남습니다. 메타 줄을 지우면 경고까지 사라져 등록한 책이 아무 표시 없이 돌아오므로 그렇게 끄지 않습니다.

`off`는 화면만 끕니다. Worker는 코드가 맞으면 계속 기록을 받습니다. 코드가 새어 나가 쓰기를 막아야 하면 위 「코드」대로 코드를 바꿉니다.

HTML 캐시가 최대 10분이고 열어 둔 화면은 그대로이므로, 두 컴퓨터 모두 새로 고쳐야 적용됩니다. 기록은 저장소에 그대로 남습니다. 끄기 전에 어머니께 먼저 알립니다.

## 복구

잘못 누른 한 권은 화면의 「등록 완료한 책 보기」에서 「되돌리기」로 고칩니다. 여러 권이 지워졌거나 잘못 들어갔으면 D1 Time Travel로 지난 7일 안의 시점으로 돌립니다.

```bash
npx wrangler@4.156.0 d1 time-travel restore books-done --timestamp <RFC3339 시각>
```

표 전체가 그 시점으로 돌아가므로 그 뒤에 누른 기록도 함께 사라집니다. 먼저 `GET /done` 결과를 저장해 두고, 복구 뒤 필요한 책을 다시 누릅니다. 복구가 끝나면 wrangler가 되돌아갈 수 있는 책갈피를 출력합니다.

## 주소가 바뀔 때

`fuledoc.com` 도메인은 2027-10-19에 만료되고 자동 갱신이 꺼져 있습니다. 갱신하지 않으면 이 주소가 끊겨 목록에 「기록을 불러오지 못해…」 안내가 뜹니다. 기록은 D1에 남습니다.

`done-api` 메타를 `workers.dev` 비상용 주소로 바꿔 `main`에 푸시하면 그대로 동작합니다. `fuledoc.com`을 더 쓰지 않기로 정했으면 `worker/wrangler.json`의 `routes`와, 그 값을 확인하는 `test/worker.test.mjs`의 설정 테스트를 함께 고치고 다시 배포합니다.

화면 주소(`fuledoc.github.io`)는 그대로이므로 설치한 앱 아이콘과 입력해 둔 코드는 바뀌지 않습니다.

## 처음 설치

저장소를 새로 만들 때의 순서입니다. 로그인과 코드 입력은 사람이 합니다.

1. Cloudflare에 로그인합니다. 브라우저에 뜬 「Wrangler wants to access your account」에서 Authorize를 누릅니다. 이 방식은 2분만 기다리고, 늦으면 「Timed out waiting for authorization code」로 끝납니다.

   ```bash
   npx wrangler@4.156.0 login --scopes account:read user:read workers:write workers_scripts:write workers_routes:write d1:write zone:read
   ```

   시간이 더 필요하면 `login` 뒤에 `--device`를 붙입니다. 5분 동안 기다리며, 브라우저에서 터미널의 코드와 같은지 보고 Continue → Authorize를 누릅니다. 예전 시도에서 열린 탭의 Authorize는 받는 쪽이 끝나 아무 일도 하지 않으니 가장 최근 탭에서 누릅니다. 이 7개 권한으로 2026-11-03 첫 설치(데이터베이스·표·배포·사용자 지정 도메인)가 끝났습니다.

2. `books-api.fuledoc.com`에 기존 레코드가 없는지 확인합니다.

   ```bash
   dig +short books-api.fuledoc.com
   ```

3. 데이터베이스를 만들고, 출력된 `database_id`를 `worker/wrangler.json`에 넣습니다.

   ```bash
   npx wrangler@4.156.0 d1 create books-done --location=apac
   ```

4. 표를 만듭니다. `--remote`가 없으면 로컬 데이터베이스에 만들어져 Worker가 503만 돌려줍니다.

   ```bash
   npx wrangler@4.156.0 d1 execute books-done --remote --file worker/schema.sql --config worker/wrangler.json
   ```

5. 아래 「Worker 배포」로 배포합니다. 이때 DNS 레코드와 인증서가 생깁니다. 출력된 `workers.dev` 주소를 맨 위 표의 비상용 주소 칸에 적습니다.
6. 코드를 넣습니다(위 「코드」). 코드가 없는 동안 쓰기는 모두 거절됩니다.
7. `https://books-api.fuledoc.com/done`이 `{"done":{}}`를 돌려주는지 보고, `books.html`에 메타를 넣어 `main`에 푸시합니다.

   ```html
   <meta name="done-api" content="https://books-api.fuledoc.com">
   ```

8. 끝나면 `npx wrangler@4.156.0 logout`으로 로그인을 지웁니다.

## Worker 배포

Worker는 자동 배포되지 않습니다. `worker/`를 고치면 직접 배포합니다.

```bash
npx wrangler@4.156.0 deploy --config worker/wrangler.json
```

`routes`의 주소는 `books-api.fuledoc.com` 하나만 둡니다. 비대화형으로 실행하면 wrangler가 같은 이름의 DNS 레코드를 묻지 않고 덮어쓰기 때문입니다. `fuledoc.com`과 `data.fuledoc.com`은 학교 서버로 가는 다른 용도의 레코드입니다. 배포 뒤 두 레코드가 그대로인지 확인합니다.

## 로컬에서 시험하기

로컬 데이터베이스에 표를 한 번 만듭니다. 없으면 저장소가 503만 돌려줍니다.

```bash
npx wrangler@4.156.0 d1 execute books-done --local --file worker/schema.sql --config worker/wrangler.json
```

```bash
npx wrangler@4.156.0 dev --local --config worker/wrangler.json --port 8806 --var EDIT_CODE:12345678 --var ALLOWED_ORIGIN:http://localhost:8805
```

`books.html` 복사본의 `done-api` 메타를 `http://127.0.0.1:8806`으로 바꿔 `localhost:8805`에서 엽니다. 저장소에 있는 파일은 고치지 않습니다.
