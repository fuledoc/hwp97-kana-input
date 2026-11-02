/* 책 목록 페이지: 「알라딘 등록 완료」 표시.
   두 컴퓨터가 같은 상태를 보도록 기록은 worker/의 저장소에 둔다.
   화면은 서버가 확인한 값만 따른다. 저장이 확인되지 않으면 완료로 보이지 않는다.
   이 스크립트가 어떻게 실패해도 복사(books.js)와 표지 저장은 그대로 동작해야 하므로
   파일을 나누고, 그 기능들의 이벤트를 건드리지 않는다. */

(() => {
  const meta = document.querySelector('meta[name="done-api"]');
  if (!meta || !meta.content || typeof fetch !== "function") {
    return; /* 주소가 없으면 기능을 켜지 않는다. 책 목록은 그대로 다 보인다. */
  }

  const API = meta.content.replace(/\/+$/, "");
  const SWITCHED_OFF = meta.content === "off"; /* 긴급 끄기. docs/books-done.md */
  const CODE_KEY = "books-done.code";
  const TIMEOUT_MS = 8000;
  const REFRESH_GAP_MS = 60000;
  const RETRY_MS = 10000;
  const QUIET_MS = 800; /* 더블클릭의 둘째 클릭이 응답 뒤에 와도 반대 동작이 되지 않게 잠시 막는다 */
  const LABEL_MARK = "알라딘 등록 완료 · 목록에서 빼기";
  const LABEL_UNDO = "되돌리기";
  const WRONG_CODE = "코드가 맞지 않습니다. 메모해 둔 숫자 코드를 확인하고 다시 눌러 주세요.";

  const rows = new Map();
  const doneAt = new Map(); /* 서버가 확인한 등록 완료만 들어간다 */
  const here = new Set(); /* 이번 방문에 누른 책. 화면이 밀리지 않게 그 자리에 남겨 둔다 */
  let codeInMemory = "";
  let writes = 0; /* 조회 도중 쓰기가 있었는지 알아내는 데 쓴다 */
  let loads = 0; /* 조회 순번. 늦게 도착한 옛 조회를 가려낸다 */
  let newestLoad = 0; /* 성공한 조회 가운데 가장 나중에 시작한 것 */
  let lastChecked = 0;
  let noPressUntil = 0; /* 「다시 확인」의 둘째 클릭이 사라진 경고 띠 밑의 책에 떨어지지 않게 */
  let retried = false; /* 실패 뒤 저절로 다시 확인하는 것은 성공할 때까지 한 번만 */
  let bar;

  function readCode() {
    try {
      return localStorage.getItem(CODE_KEY) || codeInMemory;
    } catch (_error) {
      return codeInMemory; /* 브라우저 저장소가 막혀도 이번 창에서는 쓸 수 있다 */
    }
  }

  function writeCode(code) {
    codeInMemory = code;
    try {
      if (code) {
        localStorage.setItem(CODE_KEY, code);
      } else {
        localStorage.removeItem(CODE_KEY);
      }
    } catch (_error) {
      /* 위와 같다 */
    }
  }

  function send(path, options) {
    return fetch(`${API}${path}`, {
      ...options,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  function dayText(time) {
    return new Date(time).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      timeZone: "Asia/Seoul",
    });
  }

  function clockText(time) {
    return new Date(time).toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    });
  }

  function whenText(time) {
    return dayText(time) === dayText(Date.now()) ? clockText(time) : `${dayText(time)} ${clockText(time)}`;
  }

  function renderRow(entry) {
    if (entry.button.disabled) {
      return; /* 기록 중인 행은 조회 응답으로 바꾸지 않는다. 행이 사라지면 옆 책이 밀려 올라온다 */
    }
    const time = doneAt.get(entry.id);
    const isDone = time !== undefined;
    if (entry.wanted === isDone) {
      /* 응답만 잃고 서버에는 반영됐다. 실패 안내대로 다시 누르면 반대로 되돌아간다 */
      entry.message.textContent = "";
      entry.wanted = undefined;
    }
    entry.row.classList.toggle("is-done", isDone);
    entry.row.classList.toggle("is-here", here.has(entry.id));
    entry.label.textContent = isDone ? `✓ ${dayText(time)} 등록 완료` : "";
    entry.button.textContent = isDone ? LABEL_UNDO : LABEL_MARK;
  }

  function renderGroups() {
    const showAll = document.body.classList.contains("show-done");
    document.querySelectorAll("section.booklist").forEach((section) => {
      const inGroup = [...section.querySelectorAll("tr[data-book-id]")];
      const left = inGroup.filter((row) => !doneAt.has(row.dataset.bookId)).length;
      const stays = inGroup.some((row) => here.has(row.dataset.bookId));
      section.classList.toggle("all-done", left === 0 && !stays && !showAll);
      const count = section.querySelector(".group-count");
      if (count) {
        count.textContent = left === inGroup.length ? `${left}권` : `남은 ${left}권 / ${inGroup.length}권`;
      }
    });
  }

  function renderSummary() {
    const finished = doneAt.size;
    bar.summary.textContent =
      finished === rows.size
        ? "남은 책이 없습니다. 모두 등록을 마치셨습니다."
        : `남은 책 ${rows.size - finished}권 · 등록 완료 ${finished}권`;
    bar.toggle.hidden = finished === 0;
    bar.toggle.textContent = document.body.classList.contains("show-done")
      ? "등록 완료한 책 숨기기"
      : "등록 완료한 책 보기";
  }

  function renderAll() {
    rows.forEach(renderRow);
    renderGroups();
    renderSummary();
  }

  function showWarning(text) {
    bar.warning.textContent = text;
    bar.warning.hidden = !text;
    bar.retry.hidden = !text;
    bar.alert.hidden = !text;
  }

  function showSwitchedOff() {
    const total = document.querySelectorAll("tr[data-book-id]").length;
    bar.summary.textContent = "";
    showWarning(`등록 완료 기록을 잠시 쓰지 않아 전체 ${total}권을 보여 드립니다. 이미 등록한 책이 섞여 있을 수 있습니다.`);
    bar.retry.hidden = true;
  }

  async function load() {
    const startedWith = writes;
    const turn = ++loads;
    lastChecked = Date.now();
    try {
      const response = await send("/done", { method: "GET" });
      const body = await response.json();
      if (!response.ok || !body || typeof body.done !== "object" || body.done === null) {
        throw new Error("unexpected response");
      }
      if (writes !== startedWith) {
        return load(); /* 조회 중에 누른 내용을 낡은 응답으로 덮지 않는다 */
      }
      if (turn < newestLoad) {
        return undefined;
      }
      newestLoad = turn;
      doneAt.clear();
      for (const [id, time] of Object.entries(body.done)) {
        if (rows.has(id) && typeof time === "number") {
          doneAt.set(id, time);
        }
      }
      bar.confirmedAt = Date.now();
      retried = false;
      showWarning("");
      renderAll();
    } catch (_error) {
      if (turn < newestLoad) {
        return undefined; /* 더 새로운 조회가 이미 성공했다 */
      }
      showWarning(
        bar.confirmedAt
          ? `최신 기록을 확인하지 못했습니다. 화면은 ${whenText(bar.confirmedAt)}에 확인한 내용입니다.`
          : `등록 완료 기록을 불러오지 못해 전체 ${rows.size}권을 보여 드립니다. 이미 등록한 책이 섞여 있을 수 있습니다.`
      );
      if (!bar.confirmedAt) {
        bar.summary.textContent = "";
      }
      if (!retried) {
        retried = true; /* 잠에서 깬 직후처럼 인터넷이 곧 돌아오는 경우 */
        setTimeout(load, RETRY_MS);
      }
    }
  }

  async function change(entry) {
    if (Date.now() < noPressUntil) {
      return;
    }
    const wasDone = doneAt.has(entry.id);
    let saved = false;
    let code = readCode();
    if (!code) {
      code = (window.prompt("메모해 둔 숫자 코드를 입력해 주세요.\n이 컴퓨터에서는 한 번만 넣으면 됩니다.") || "")
        .normalize("NFKC") /* 일본어 입력 상태의 전각 숫자 */
        .trim();
      if (!code) {
        return;
      }
      if (!/^\d+$/.test(code)) {
        entry.message.textContent = WRONG_CODE; /* 그대로 보내면 인터넷 오류처럼 보인다 */
        return;
      }
    }

    entry.message.textContent = "";
    entry.wanted = undefined;
    entry.button.disabled = true;
    entry.button.textContent = "기록하는 중…";
    here.add(entry.id); /* 응답을 기다리거나 잃어도 그 자리에 남긴다 */
    writes += 1;
    try {
      const response = await send(`/done/${encodeURIComponent(entry.id)}`, {
        method: wasDone ? "DELETE" : "PUT",
        headers: { Authorization: `Bearer ${code}` },
      });
      if (response.status === 401) {
        writeCode("");
        entry.wanted = !wasDone;
        entry.message.textContent = WRONG_CODE;
        return;
      }
      const body = await response.json();
      if (!response.ok || !body || body.id !== entry.id) {
        throw new Error("unexpected response");
      }
      writeCode(code);
      saved = true;
      if (wasDone) {
        doneAt.delete(entry.id);
        here.delete(entry.id);
      } else {
        doneAt.set(entry.id, body.doneAt);
      }
    } catch (_error) {
      entry.wanted = !wasDone;
      entry.message.textContent = wasDone
        ? "되돌리지 못했습니다. 인터넷을 확인하고 다시 눌러 주세요."
        : "기록하지 못했습니다. 아직 다른 컴퓨터에는 표시되지 않습니다. 인터넷을 확인하고 다시 눌러 주세요. 알라딘 등록은 다시 하지 않으셔도 됩니다.";
    } finally {
      writes += 1;
      entry.button.disabled = false;
      renderRow(entry);
      if (saved) {
        entry.button.disabled = true;
        setTimeout(() => {
          entry.button.disabled = false;
          renderRow(entry);
        }, QUIET_MS);
      }
      if (bar.confirmedAt) {
        renderGroups();
        renderSummary();
      } else if (saved) {
        load(); /* 불러오기에 실패했던 상태다. 누른 한 권으로 권수를 지어내지 않고 전체를 확인한다 */
      }
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function addBar() {
    const box = element("section", "done-bar");
    box.setAttribute("aria-label", "등록 현황");
    const summary = element("p", "done-summary", "등록 완료 기록을 확인하는 중입니다.");
    summary.setAttribute("role", "status");
    const toggle = element("button", "done-toggle");
    toggle.type = "button";
    toggle.hidden = true;
    box.append(summary, toggle);

    /* 경고는 목록을 내려 보는 중에도 보여야 해서 따로 둔다. 책들과 같은 부모에 있어야 위에 붙어 있는다 */
    const alert = element("div", "done-alert");
    alert.hidden = true;
    const warning = element("p", "done-warning");
    warning.setAttribute("role", "status");
    warning.hidden = true;
    const retry = element("button", "done-retry", "다시 확인");
    retry.type = "button";
    retry.hidden = true;
    alert.append(warning, retry);

    document.querySelector(".howto").after(box);
    box.after(alert);

    toggle.addEventListener("click", () => {
      document.body.classList.toggle("show-done");
      renderGroups();
      renderSummary();
    });
    retry.addEventListener("click", async () => {
      await load();
      if (alert.hidden) {
        noPressUntil = Date.now() + QUIET_MS;
      }
    });
    return { alert, summary, toggle, warning, retry, confirmedAt: 0 };
  }

  function addSlot(row) {
    const id = row.dataset.bookId;
    const slot = element("div", "done-slot");
    const label = element("span", "done-label");
    const button = element("button", "done-button", LABEL_MARK);
    button.type = "button";
    const message = element("p", "done-message");
    message.setAttribute("role", "status");
    slot.append(label, button, message);
    row.querySelector(".col-info").append(slot);
    const entry = { id, row, label, button, message };
    rows.set(id, entry);
    button.addEventListener("click", () => change(entry));
  }

  try {
    bar = addBar();
    if (SWITCHED_OFF) {
      showSwitchedOff();
      return;
    }
    document.querySelectorAll("tr[data-book-id]").forEach(addSlot);
    const howto = document.querySelector(".done-howto");
    if (howto) {
      howto.hidden = false;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - lastChecked > REFRESH_GAP_MS) {
        load();
      }
    });
    window.addEventListener("online", () => {
      if (!bar.warning.hidden) {
        load();
      }
    });
    load();
  } catch (_error) {
    document.querySelectorAll(".done-bar, .done-alert, .done-slot").forEach((node) => node.remove());
  }
})();
