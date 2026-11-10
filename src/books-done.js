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
  const LABEL_AGAIN = "다시 빼기";
  const LABEL_BUSY = "기록하는 중…";
  const WRONG_CODE = "코드가 맞지 않습니다. 메모해 둔 숫자 코드를 확인하고 다시 눌러 주세요.";
  const WRONG_CODE_BRIEF = "코드가 맞지 않습니다";

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
  let listOpen = false; /* 「등록 완료한 책 보기」 목록. 여는 순간의 책들로 만들고 열려 있는 동안 늘리거나 줄이지 않는다 */
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

  /* 목록에서 누른 사람은 목록을 보고 있으므로 목록에도 알린다. 목록에는 시각 자리 한 줄에
     짧게 쓴다. 긴 안내가 들어갔다 빠지면 항목 높이가 바뀌어 밑의 「되돌리기」가 밀린다 */
  function showBrief(item, brief) {
    item.message.textContent = brief;
    item.li.classList.toggle("has-message", Boolean(brief));
  }

  function sayTo(entry, text, brief = text) {
    entry.message.textContent = text;
    entry.brief = brief;
    if (entry.item) {
      showBrief(entry.item, brief);
    }
  }

  /* 행 버튼과 목록 버튼은 같은 책을 바꾸므로 함께 막고 함께 푼다. 행 버튼이 기준이다 */
  function holdButtons(entry, text) {
    entry.button.disabled = true;
    if (text) {
      entry.button.textContent = text;
    }
    if (entry.item) {
      entry.item.button.disabled = true;
      if (text) {
        entry.item.button.textContent = text;
      }
    }
  }

  function renderItem(entry) {
    const item = entry.item;
    if (!item) {
      return;
    }
    const time = doneAt.get(entry.id);
    const isDone = time !== undefined;
    /* 한 줄로 자른다. 문구 길이로 줄 수가 바뀌면 아래 책들이 밀린다 */
    item.li.classList.toggle("is-back", !isDone);
    item.when.textContent = isDone ? `${dayText(time) === dayText(Date.now()) ? "오늘" : dayText(time)} ${clockText(time)}` : "목록으로 돌려놓음";
    item.button.textContent = entry.button.textContent === LABEL_BUSY ? LABEL_BUSY : isDone ? LABEL_UNDO : LABEL_AGAIN;
    item.button.disabled = entry.button.disabled;
  }

  function renderRow(entry) {
    if (entry.button.disabled) {
      return; /* 기록 중인 행은 조회 응답으로 바꾸지 않는다. 행이 사라지면 옆 책이 밀려 올라온다 */
    }
    const time = doneAt.get(entry.id);
    const isDone = time !== undefined;
    if (entry.wanted === isDone) {
      /* 응답만 잃고 서버에는 반영됐다. 실패 안내대로 다시 누르면 반대로 되돌아간다 */
      sayTo(entry, "");
      entry.wanted = undefined;
    }
    entry.row.classList.toggle("is-done", isDone);
    entry.row.classList.toggle("is-here", here.has(entry.id));
    entry.label.textContent = isDone ? `✓ ${dayText(time)} 등록 완료` : "";
    entry.button.textContent = isDone ? LABEL_UNDO : LABEL_MARK;
    renderItem(entry);
  }

  function renderGroups() {
    document.querySelectorAll("section.booklist").forEach((section) => {
      const inGroup = [...section.querySelectorAll("tr[data-book-id]")];
      const left = inGroup.filter((row) => !doneAt.has(row.dataset.bookId)).length;
      const stays = inGroup.some((row) => here.has(row.dataset.bookId));
      section.classList.toggle("all-done", left === 0 && !stays);
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
        ? "모두 등록을 마치셨습니다." /* 좁은 화면에서도 한 줄. 줄 수가 바뀌면 열린 목록이 밀린다 */
        : `남은 책 ${rows.size - finished}권 · 등록 완료 ${finished}권`;
    bar.toggle.hidden = finished === 0 && !listOpen; /* 열어 둔 목록은 모두 되돌려도 닫을 수 있어야 한다 */
    bar.toggle.textContent = listOpen ? "등록 완료한 책 닫기" : "등록 완료한 책 보기";
    bar.toggle.setAttribute("aria-expanded", String(listOpen));
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
    if (Date.now() < noPressUntil || entry.button.disabled) {
      return; /* 행과 목록 중 한쪽이 기록 중이거나 막 바뀐 참이다 */
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
        entry.wanted = !wasDone; /* 다른 컴퓨터가 그렇게 바꾸면 안내를 지운다 */
        sayTo(entry, WRONG_CODE, WRONG_CODE_BRIEF); /* 그대로 보내면 인터넷 오류처럼 보인다 */
        return;
      }
    }

    sayTo(entry, "");
    entry.wanted = undefined;
    holdButtons(entry, LABEL_BUSY);
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
        sayTo(entry, WRONG_CODE, WRONG_CODE_BRIEF);
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
      if (wasDone) {
        sayTo(entry, "되돌리지 못했습니다. 인터넷을 확인하고 다시 눌러 주세요.", "되돌리지 못했습니다");
      } else {
        sayTo(
          entry,
          "기록하지 못했습니다. 아직 다른 컴퓨터에는 표시되지 않습니다. 인터넷을 확인하고 다시 눌러 주세요. 알라딘 등록은 다시 하지 않으셔도 됩니다.",
          "기록하지 못했습니다"
        );
      }
    } finally {
      writes += 1;
      entry.button.disabled = false;
      renderRow(entry);
      if (saved) {
        holdButtons(entry);
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

  function addItem(entry) {
    const li = element("li", "done-item");
    const title = element("span", "done-item-title");
    const name = element("span", "done-item-name", entry.title);
    name.lang = "ja";
    title.append(name);
    if (entry.copy) {
      title.append(element("span", "done-item-copy", ` (같은 책 ${entry.copy}번째)`));
    }
    const when = element("span", "done-item-when");
    const button = element("button", "done-item-button");
    button.type = "button";
    const message = element("p", "done-message");
    message.setAttribute("role", "status");
    entry.message.setAttribute("aria-live", "off"); /* 같은 안내를 두 번 읽지 않게, 열린 동안은 목록 쪽만 알린다 */
    li.append(title, when, button, message);
    entry.item = { li, when, button, message };
    showBrief(entry.item, entry.brief || "");
    button.addEventListener("click", () => change(entry));
    renderItem(entry);
    return li;
  }

  /* 완료한 책을 원래 자리에 다시 보이게 하면 찾으려고 목록을 다 내려가야 한다.
     최근에 누른 책부터 위에 모은다. 열려 있는 동안 항목을 더하거나 빼면 그 아래
     책들이 밀려 다른 책을 누르게 되므로, 여는 순간의 책들로 만들고 상태만 바꾼다. */
  function openList() {
    listOpen = true;
    const ids = [...doneAt.keys()].sort((a, b) => doneAt.get(b) - doneAt.get(a));
    bar.list.replaceChildren(...ids.map((id) => addItem(rows.get(id))));
    bar.panel.hidden = false;
  }

  function closeList() {
    listOpen = false;
    rows.forEach((entry) => {
      if (entry.item) {
        entry.message.setAttribute("aria-live", "polite");
      }
      entry.item = undefined;
    });
    bar.list.replaceChildren();
    bar.panel.hidden = true;
  }

  function addBar() {
    const box = element("section", "done-bar");
    box.setAttribute("aria-label", "등록 현황");
    const summary = element("p", "done-summary", "등록 완료 기록을 확인하는 중입니다.");
    summary.setAttribute("role", "status");
    const toggle = element("button", "done-toggle");
    toggle.type = "button";
    toggle.hidden = true;
    toggle.setAttribute("aria-controls", "done-panel");
    toggle.setAttribute("aria-expanded", "false");
    const panel = element("div", "done-panel");
    panel.id = "done-panel";
    panel.hidden = true;
    const list = element("ol", "done-list");
    panel.append(
      element("p", "done-panel-note", "최근에 누른 책이 맨 위에 있습니다. 잘못 누른 책은 「되돌리기」를 누르면 목록으로 돌아갑니다."),
      list
    );
    box.append(summary, toggle, panel);

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

    document.querySelector("section.booklist").before(box, alert); /* 첫 묶음 바로 위. 사용법은 맨 아래에 접혀 있다 */

    toggle.addEventListener("click", () => {
      if (listOpen) {
        closeList();
      } else {
        openList();
      }
      renderSummary();
    });
    retry.addEventListener("click", async () => {
      await load();
      if (alert.hidden) {
        noPressUntil = Date.now() + QUIET_MS;
      }
    });
    return { alert, summary, toggle, panel, list, warning, retry, confirmedAt: 0 };
  }

  function titleOf(row, id) {
    const node = row.querySelector(".field-title");
    return (node && node.dataset.copy) || id;
  }

  function copyOf(id) {
    const copy = /^97[89]\d{10}-([2-9])$/.exec(id); /* 같은 책 둘째 권은 제목만으로 구분되지 않는다. noisbn-서가-번호와 헷갈리지 않게 */
    return copy ? copy[1] : "";
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
    const entry = { id, row, label, button, message, title: titleOf(row, id), copy: copyOf(id), brief: "" };
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
