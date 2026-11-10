/* 「알라딘 등록 완료」 화면 회귀 테스트.
   저장이 확인되기 전에는 완료로 보이지 않는지, 실패가 숨겨지지 않는지를 본다. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "src", "books-done.js"), "utf8");

class Node {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.dataset = {};
    this.attrs = {};
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.type = "";
    this.cls = new Set();
    this.classList = {
      add: (name) => this.cls.add(name),
      remove: (name) => this.cls.delete(name),
      contains: (name) => this.cls.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !this.cls.has(name) : Boolean(force);
        if (on) this.cls.add(name);
        else this.cls.delete(name);
        return on;
      },
    };
  }
  set className(value) {
    this.cls = new Set(value.split(" ").filter(Boolean));
  }
  /* 실제 DOM처럼 자식의 글자까지 합쳐 읽고, 쓰면 자식을 지운다 */
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  setAttribute(name, value) {
    this.attrs[name] = value;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  after(node) {
    const list = this.parent.children;
    list.splice(list.indexOf(this) + 1, 0, node);
    node.parent = this.parent;
  }
  before(...nodes) {
    const list = this.parent.children;
    list.splice(list.indexOf(this), 0, ...nodes);
    for (const node of nodes) node.parent = this.parent;
  }
  remove() {
    const list = this.parent.children;
    list.splice(list.indexOf(this), 1);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  click() {
    if (this.disabled) return Promise.resolve([]); /* 실제 브라우저처럼 눌리지 않는다 */
    return Promise.all((this.listeners.click || []).map((fn) => fn({ target: this })));
  }
  all() {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  matches(selector) {
    if (selector === "tr[data-book-id]") return this.dataset.bookId !== undefined;
    if (selector === "section.booklist") return this.cls.has("booklist");
    return selector.startsWith(".") && this.cls.has(selector.slice(1));
  }
  querySelectorAll(selector) {
    const parts = selector.split(",").map((part) => part.trim());
    return this.all().filter((node) => node !== this && parts.some((part) => node.matches(part)));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function makeRow(id) {
  const row = new Node("tr");
  row.dataset.bookId = id;
  const info = new Node("td");
  info.className = "col-info";
  const title = new Node("button");
  title.className = "field-value copy-text field-title";
  title.dataset.copy = `제목-${id.replace(/^(97[89]\d{10})-\d$/, "$1")}`; /* 같은 책 둘째 권은 제목이 같다 */
  info.append(title);
  row.append(info);
  return row;
}

function makeSection(ids) {
  const section = new Node("section");
  section.className = "booklist";
  const count = new Node("span");
  count.className = "group-count";
  count.textContent = `${ids.length}권`;
  section.append(count, ...ids.map(makeRow));
  return section;
}

/* respond(url, options)가 값이나 약속을 돌려준다. { status, body } 또는 throw. */
function setup({ respond, api = "https://api.test", groups = [["a1", "a2"], ["b1"]], storage, prompt } = {}) {
  const page = new Node("body");
  const howto = new Node("section"); /* 맨 아래에 접어 둔 사용법 */
  howto.className = "help books-howto";
  const howtoLine = new Node("p");
  howtoLine.className = "done-howto";
  howtoLine.hidden = true;
  howto.append(howtoLine);
  const sections = groups.map(makeSection);
  page.append(...sections, howto);

  const docListeners = {};
  const windowListeners = {};
  const timers = [];
  const requests = [];
  const stored = storage === undefined ? new Map() : storage;
  const prompts = [];
  const handler = respond || (async () => ({ status: 200, body: { done: {} } }));

  const sandbox = {
    console,
    AbortSignal,
    Date,
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      const answer = await handler(url, options);
      return { status: answer.status, ok: answer.status < 300, json: async () => answer.body };
    },
    window: {
      prompt: (text) => {
        prompts.push(text);
        return prompt === undefined ? "12345678" : prompt;
      },
      addEventListener: (type, fn) => {
        windowListeners[type] = fn;
      },
    },
    localStorage:
      stored === null
        ? {
            getItem() { throw new Error("blocked"); },
            setItem() { throw new Error("blocked"); },
            removeItem() { throw new Error("blocked"); },
          }
        : {
            getItem: (key) => (stored.has(key) ? stored.get(key) : null),
            setItem: (key, value) => stored.set(key, value),
            removeItem: (key) => stored.delete(key),
          },
    document: {
      body: page,
      visibilityState: "visible",
      createElement: (tag) => new Node(tag),
      querySelector: (selector) =>
        selector.startsWith("meta") ? (api ? { content: api } : null) : page.querySelector(selector),
      querySelectorAll: (selector) => page.querySelectorAll(selector),
      addEventListener: (type, fn) => {
        docListeners[type] = fn;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  const row = (id) => page.all().find((node) => node.dataset.bookId === id);
  const slot = (id) => row(id).querySelector(".done-slot");
  return {
    page,
    sections,
    requests,
    prompts,
    stored,
    row,
    button: (id) => row(id).querySelector(".done-button"),
    label: (id) => row(id).querySelector(".done-label").textContent,
    message: (id) => row(id).querySelector(".done-message").textContent,
    slot,
    summary: () => page.querySelector(".done-summary").textContent,
    warning: () => page.querySelector(".done-warning"),
    retry: () => page.querySelector(".done-retry"),
    toggle: () => page.querySelector(".done-toggle"),
    panel: () => page.querySelector(".done-panel"),
    items: () => page.querySelectorAll(".done-item"),
    item: (title) => page.querySelectorAll(".done-item").find((li) => li.children[0].textContent === title),
    itemButton: (title) =>
      page
        .querySelectorAll(".done-item")
        .find((li) => li.children[0].textContent === title)
        .querySelector(".done-item-button"),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    alert: () => page.querySelector(".done-alert"),
    tick: () => timers.splice(0).forEach((timer) => timer.fn()),
    howtoLine,
    docListeners,
    windowListeners,
    timers,
    sandbox,
  };
}

/* 시계를 앞으로 돌린 채 fn을 실행한다. Date는 시험과 스크립트가 같은 것을 쓴다. */
async function later(ms, fn) {
  const realNow = Date.now;
  Date.now = () => realNow() + ms;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

const writesOf = (env) => env.requests.filter((request) => request.method !== "GET").map((request) => request.method);

const withDone = (done) => async (url, options) =>
  options.method === "GET" ? { status: 200, body: { done } } : { status: 200, body: { id: url.split("/").pop(), doneAt: 5 } };

test("주소가 없으면 버튼도 요청도 없고 목록은 그대로다", async () => {
  const env = setup({ api: "" });
  await env.settle();
  assert.equal(env.requests.length, 0);
  assert.equal(env.page.querySelector(".done-button"), null);
  assert.equal(env.page.querySelector(".done-bar"), null);
  assert.equal(env.howtoLine.hidden, true, "없는 버튼을 안내하지 않는다");
});

test("등록 현황과 경고 띠는 첫 묶음 바로 위에 책들과 나란히 둔다", async () => {
  const env = setup({ respond: withDone({}) });
  await env.settle();
  const order = env.page.children.map((node) => [...node.cls][0]);
  assert.deepEqual(order.slice(0, 3), ["done-bar", "done-alert", "booklist"], "경고 띠가 위에 붙으려면 책들과 같은 부모여야 한다");
});

test("켜지면 사용법에 등록 완료 안내가 나온다", async () => {
  const env = setup({ respond: withDone({}) });
  await env.settle();
  assert.equal(env.howtoLine.hidden, false);
});

test("긴급 끄기는 요청과 버튼 없이 이미 등록한 책이 섞여 있다고 알린다", async () => {
  const env = setup({ api: "off" });
  await env.settle();
  assert.equal(env.requests.length, 0);
  assert.equal(env.page.querySelector(".done-button"), null);
  assert.equal(env.howtoLine.hidden, true, "없는 버튼을 안내하지 않는다");
  assert.ok(env.warning().textContent.includes("전체 3권"));
  assert.ok(env.warning().textContent.includes("이미 등록한 책이 섞여 있을 수 있습니다"));
  assert.equal(env.warning().hidden, false);
  assert.equal(env.retry().hidden, true, "다시 확인할 곳이 없다");
  assert.equal(env.summary(), "");
});

test("서버에 기록된 책은 빠지고 권수가 바뀐다", async () => {
  const env = setup({ respond: withDone({ a1: 1793000000000 }) });
  await env.settle();
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.ok(!env.row("a1").cls.has("is-here"));
  assert.ok(!env.row("a2").cls.has("is-done"));
  assert.equal(env.summary(), "남은 책 2권 · 등록 완료 1권");
  assert.equal(env.sections[0].querySelector(".group-count").textContent, "남은 1권 / 2권");
  assert.equal(env.toggle().hidden, false);
});

test("목록에 없는 책 기록은 세지 않는다", async () => {
  const env = setup({ respond: withDone({ gone: 1 }) });
  await env.settle();
  assert.equal(env.summary(), "남은 책 3권 · 등록 완료 0권");
  assert.equal(env.toggle().hidden, true);
});

test("한 묶음이 다 끝나면 묶음이 사라지고, 보기를 켜도 원래 자리로 꺼내지 않는다", async () => {
  const env = setup({ respond: withDone({ b1: 1 }) });
  await env.settle();
  assert.ok(env.sections[1].cls.has("all-done"));
  await env.toggle().click();
  assert.ok(env.sections[1].cls.has("all-done"), "찾으러 목록을 다 내려가지 않게 위에 모은다");
  assert.ok(env.row("b1").cls.has("is-done"));
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), ["제목-b1"]);
});

test("보기를 누르면 완료한 책이 최근에 누른 것부터 위에 모인다", async () => {
  const env = setup({
    groups: [["a1", "a2", "a3"], ["b1"]],
    respond: withDone({ a1: Date.UTC(2026, 9, 30, 1), a3: Date.UTC(2026, 10, 2, 1), b1: Date.UTC(2026, 9, 31, 1) }),
  });
  await env.settle();
  assert.equal(env.panel().hidden, true);
  assert.equal(env.toggle().attrs["aria-expanded"], "false");
  await env.toggle().click();
  assert.equal(env.panel().hidden, false);
  assert.equal(env.toggle().textContent, "등록 완료한 책 닫기");
  assert.equal(env.toggle().attrs["aria-expanded"], "true");
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), ["제목-a3", "제목-b1", "제목-a1"]);
  assert.ok(env.item("제목-a3").children[1].textContent.includes("11월 2일"));
  assert.equal(env.itemButton("제목-a3").textContent, "되돌리기");

  await env.toggle().click();
  assert.equal(env.panel().hidden, true);
  assert.equal(env.items().length, 0);
  assert.equal(env.toggle().textContent, "등록 완료한 책 보기");
});

test("오늘 누른 책은 「오늘」과 시각으로 보인다", async () => {
  const env = setup({ respond: withDone({ a1: Date.now() }) });
  await env.settle();
  await env.toggle().click();
  assert.match(env.item("제목-a1").children[1].textContent, /^오늘 /);
});

test("같은 책 둘째 권은 목록에서 구분된다", async () => {
  const env = setup({
    groups: [["9784408337647", "9784408337647-2"]],
    respond: withDone({ "9784408337647": 2, "9784408337647-2": 1 }),
  });
  await env.settle();
  await env.toggle().click();
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), [
    "제목-9784408337647",
    "제목-9784408337647 (같은 책 2번째)",
  ]);
});

test("ISBN 없는 책 번호는 둘째 권으로 읽지 않는다", async () => {
  const env = setup({ groups: [["noisbn-7617-05", "noisbn-7616-2"]], respond: withDone({ "noisbn-7617-05": 2, "noisbn-7616-2": 1 }) });
  await env.settle();
  await env.toggle().click();
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), ["제목-noisbn-7617-05", "제목-noisbn-7616-2"]);
});

test("목록에서 되돌리면 그 자리에 남고 책은 목록으로 돌아온다", async () => {
  const env = setup({
    groups: [["a1", "a2"], ["b1"]],
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) =>
      options.method === "GET"
        ? { status: 200, body: { done: { a1: 2, b1: 1 } } }
        : { status: 200, body: { id: url.split("/").pop(), doneAt: 9 } },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  assert.deepEqual(writesOf(env), ["DELETE"]);
  assert.ok(env.requests.at(-1).url.endsWith("/done/a1"));
  assert.equal(env.row("a1").cls.has("is-done"), false, "책 목록에 다시 나온다");
  assert.equal(env.items().length, 2, "항목이 빠지면 밑의 「되돌리기」가 밀려 올라와 다른 책을 되돌린다");
  assert.ok(env.item("제목-a1").cls.has("is-back"));
  assert.equal(env.item("제목-a1").children[1].textContent, "목록으로 돌려놓음");
  assert.equal(env.itemButton("제목-a1").textContent, "다시 빼기");
  assert.equal(env.summary(), "남은 책 2권 · 등록 완료 1권");

  assert.equal(env.itemButton("제목-a1").disabled, true, "바뀐 목록 버튼도 눌리지 않는 모습으로 보인다");
  await env.itemButton("제목-a1").click();
  assert.deepEqual(writesOf(env), ["DELETE"], "더블클릭의 둘째 클릭이 다시 빼지 않는다");
  assert.equal(env.button("a1").disabled, true, "행 버튼도 함께 쉰다");

  env.tick();
  assert.equal(env.itemButton("제목-a1").disabled, false);
  await env.itemButton("제목-a1").click();
  assert.deepEqual(writesOf(env), ["DELETE", "PUT"], "잘못 되돌린 책은 그 자리에서 다시 뺀다");
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.equal(env.itemButton("제목-a1").textContent, "되돌리기");
});

test("기록 중에는 행 버튼과 목록 버튼이 함께 막힌다", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 1 } } };
      await gate;
      return { status: 200, body: { id: "a1", doneAt: null } };
    },
  });
  await env.settle();
  await env.toggle().click();
  const pressed = env.itemButton("제목-a1").click();
  await env.settle();
  assert.equal(env.itemButton("제목-a1").disabled, true);
  assert.equal(env.itemButton("제목-a1").textContent, "기록하는 중…");
  assert.equal(env.button("a1").disabled, true);
  await env.button("a1").click();
  await env.retry().click(); /* 기다리는 동안 온 조회도 그 항목을 건드리지 않는다 */
  assert.equal(env.itemButton("제목-a1").textContent, "기록하는 중…");
  release();
  await pressed;
  assert.deepEqual(writesOf(env), ["DELETE"]);
});

test("기록 중에 목록을 열어도 그 책 버튼은 막혀 있다", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 1 } } };
      await gate;
      return { status: 200, body: { id: "a1", doneAt: null } };
    },
  });
  await env.settle();
  const pressed = env.button("a1").click();
  await env.settle();
  await env.toggle().click();
  assert.equal(env.itemButton("제목-a1").disabled, true);
  assert.equal(env.itemButton("제목-a1").textContent, "기록하는 중…");
  release();
  await pressed;
  assert.equal(env.itemButton("제목-a1").textContent, "다시 빼기");
});

test("목록에서 되돌리기가 실패하면 목록 안에 알린다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 1 } } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  const message = env.item("제목-a1").querySelector(".done-message").textContent;
  assert.ok(message.includes("되돌리지 못했습니다"));
  assert.equal(env.itemButton("제목-a1").textContent, "되돌리기");
  assert.equal(env.itemButton("제목-a1").disabled, false, "실패 뒤에는 바로 다시 누를 수 있다");
  assert.ok(env.row("a1").cls.has("is-done"));
});

test("목록 안내는 시각 자리에 짧게 쓰고, 긴 안내는 행에 둔다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 1 } } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  const item = env.item("제목-a1");
  assert.equal(item.querySelector(".done-message").textContent, "되돌리지 못했습니다", "길면 항목 높이가 바뀐다");
  assert.ok(item.cls.has("has-message"), "시각 대신 안내를 보인다");
  assert.ok(env.message("a1").includes("인터넷을 확인하고 다시 눌러 주세요"));
});

test("목록에서 되돌리기 응답을 잃고 서버에 반영됐으면 목록 안내도 지운다", async () => {
  let done = { a1: 7 };
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done } };
      done = {};
      throw new Error("reply lost");
    },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  const item = () => env.item("제목-a1");
  assert.ok(item().querySelector(".done-message").textContent.includes("되돌리지 못했습니다"));
  await env.retry().click();
  assert.equal(env.itemButton("제목-a1").textContent, "다시 빼기");
  assert.equal(item().querySelector(".done-message").textContent, "", "시키는 대로 다시 누르면 되돌린 책이 다시 빠진다");
  assert.equal(item().cls.has("has-message"), false);
});

test("목록을 다시 열어도 실패 안내는 그 책 옆에 남는다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 7, a2: 3 } } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  await env.toggle().click();
  await env.toggle().click();
  assert.equal(env.item("제목-a1").querySelector(".done-message").textContent, "되돌리지 못했습니다");
  assert.equal(env.item("제목-a2").querySelector(".done-message").textContent, "");
});

test("숫자가 아닌 코드 안내도 다른 컴퓨터가 그 책을 끝내면 지운다", async () => {
  let done = {};
  const env = setup({ prompt: "ㅁㄴㅇㄹ", respond: async () => ({ status: 200, body: { done } }) });
  await env.settle();
  await env.button("a1").click();
  assert.ok(env.message("a1").includes("코드가 맞지 않습니다"));
  done = { a1: 9 }; /* 다른 컴퓨터에서 등록 완료 */
  await env.retry().click();
  assert.equal(env.message("a1"), "", "남아 있으면 목록에서 「다시 눌러 주세요」를 보고 되돌린다");
  await env.toggle().click();
  assert.equal(env.item("제목-a1").querySelector(".done-message").textContent, "");
});

test("목록이 열린 동안 같은 안내를 두 곳에서 읽지 않는다", async () => {
  const env = setup({ respond: withDone({ a1: 1 }) });
  await env.settle();
  const rowMessage = env.row("a1").querySelector(".done-message");
  await env.toggle().click();
  assert.equal(rowMessage.attrs["aria-live"], "off");
  assert.equal(env.item("제목-a1").querySelector(".done-message").attrs.role, "status");
  await env.toggle().click();
  assert.equal(rowMessage.attrs["aria-live"], "polite");
});

test("일본어 제목에만 일본어 표시를 붙인다", async () => {
  const env = setup({ groups: [["9784408337647", "9784408337647-2"]], respond: withDone({ "9784408337647-2": 1 }) });
  await env.settle();
  await env.toggle().click();
  const title = env.items()[0].children[0];
  assert.equal(title.lang, undefined, "「같은 책 2번째」는 한국어로 읽어야 한다");
  assert.equal(title.querySelector(".done-item-name").lang, "ja");
  assert.equal(title.querySelector(".done-item-copy").textContent, " (같은 책 2번째)");
});

test("목록이 열려 있는 동안 조회가 와도 항목 수는 그대로다", async () => {
  let done = { a1: 2, a2: 1 };
  const env = setup({ respond: async () => ({ status: 200, body: { done } }) });
  await env.settle();
  await env.toggle().click();
  done = { a1: 2, b1: 3 }; /* 다른 컴퓨터가 a2를 되돌리고 b1을 뺐다 */
  await env.retry().click();
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), ["제목-a1", "제목-a2"]);
  assert.equal(env.item("제목-a2").children[1].textContent, "목록으로 돌려놓음");
  assert.equal(env.summary(), "남은 책 1권 · 등록 완료 2권");

  await env.toggle().click();
  await env.toggle().click();
  assert.deepEqual(env.items().map((li) => li.children[0].textContent), ["제목-b1", "제목-a1"], "다시 열면 지금 상태로 만든다");
});

test("모두 되돌려도 열린 목록은 닫을 수 있다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) =>
      options.method === "GET"
        ? { status: 200, body: { done: { a1: 1 } } }
        : { status: 200, body: { id: "a1", doneAt: null } },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  assert.equal(env.summary(), "남은 책 3권 · 등록 완료 0권");
  assert.equal(env.toggle().hidden, false);
  await env.toggle().click();
  assert.equal(env.toggle().hidden, true);
  assert.equal(env.panel().hidden, true);
});

test("모두 끝나면 그렇게 알려 준다", async () => {
  const env = setup({ groups: [["a1"]], respond: withDone({ a1: 1 }) });
  await env.settle();
  assert.equal(env.summary(), "모두 등록을 마치셨습니다.");
});

test("기록을 못 불러오면 숨기지 않고 사실대로 알린다", async () => {
  let down = true;
  const env = setup({
    respond: async () => {
      if (down) throw new Error("offline");
      return { status: 200, body: { done: { a1: 1 } } };
    },
  });
  await env.settle();
  assert.ok(env.warning().textContent.includes("전체 3권"));
  assert.ok(env.warning().textContent.includes("이미 등록한 책이 섞여 있을 수 있습니다"));
  assert.equal(env.row("a1").cls.has("is-done"), false);
  assert.equal(env.retry().hidden, false);

  down = false;
  await env.retry().click();
  assert.equal(env.warning().hidden, true);
  assert.ok(env.row("a1").cls.has("is-done"));
});

test("모양이 이상한 200은 믿지 않는다", async () => {
  for (const body of [null, {}, { done: null }, "오류"]) {
    const env = setup({ respond: async () => ({ status: 200, body }) });
    await env.settle();
    assert.equal(env.warning().hidden, false);
  }
});

test("새로 확인에 실패하면 마지막으로 확인한 내용임을 밝힌다", async () => {
  let down = false;
  const env = setup({
    respond: async () => {
      if (down) throw new Error("offline");
      return { status: 200, body: { done: { a1: 1 } } };
    },
  });
  await env.settle();
  down = true;
  await env.retry().click();
  assert.ok(env.warning().textContent.includes("최신 기록을 확인하지 못했습니다"));
  assert.ok(env.row("a1").cls.has("is-done"), "확인했던 내용은 유지한다");
});

test("확인이 오늘이 아니면 날짜까지 밝힌다", async () => {
  let down = false;
  const env = setup({
    respond: async () => {
      if (down) throw new Error("offline");
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  down = true;
  await env.retry().click();
  assert.equal(/\d+월 \d+일/.test(env.warning().textContent), false, "오늘이면 시각만으로 충분하다");
  await later(26 * 3600 * 1000, () => env.retry().click());
  assert.ok(/\d+월 \d+일/.test(env.warning().textContent));
});

test("경고가 뜨면 목록을 내려 보는 중에도 보이게 표시한다", async () => {
  let down = true;
  const env = setup({
    respond: async () => {
      if (down) throw new Error("offline");
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  assert.equal(env.alert().hidden, false);
  down = false;
  await env.retry().click();
  assert.equal(env.alert().hidden, true);
});

test("인터넷이 돌아오면 경고가 있을 때만 다시 확인한다", async () => {
  let down = true;
  let gets = 0;
  const env = setup({
    respond: async () => {
      gets += 1;
      if (down) throw new Error("offline");
      return { status: 200, body: { done: { a1: 1 } } };
    },
  });
  await env.settle();
  assert.equal(gets, 1);
  down = false;
  await env.windowListeners.online();
  await env.settle();
  assert.equal(gets, 2);
  assert.equal(env.warning().hidden, true);
  assert.ok(env.row("a1").cls.has("is-done"));

  await env.windowListeners.online();
  await env.settle();
  assert.equal(gets, 2, "경고가 없으면 다시 묻지 않는다");
});

test("불러오기가 실패하면 조금 뒤 한 번만 저절로 다시 확인한다", async () => {
  let gets = 0;
  const env = setup({
    respond: async () => {
      gets += 1;
      throw new Error("offline");
    },
  });
  await env.settle();
  assert.equal(env.timers.length, 1);
  await env.timers[0].fn();
  await env.settle();
  assert.equal(gets, 2);
  assert.equal(env.timers.length, 1, "끝없이 다시 묻지 않는다");
});

test("불러오기가 성공하면 저절로 다시 확인하는 기회가 되살아난다", async () => {
  let down = true;
  const env = setup({
    respond: async () => {
      if (down) throw new Error("offline");
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  await env.timers[0].fn();
  await env.settle();
  down = false;
  await env.retry().click();
  down = true;
  await env.retry().click();
  await env.settle();
  assert.equal(env.timers.length, 2);
});

test("응답을 잃었어도 서버에 기록됐으면 실패 안내를 지운다", async () => {
  let done = {};
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done } };
      done = { a1: 7 }; /* 기록은 됐는데 */
      throw new Error("reply lost"); /* 응답이 사라졌다 */
    },
  });
  await env.settle();
  await env.button("a1").click();
  assert.ok(env.message("a1").includes("기록하지 못했습니다"));

  await env.retry().click();
  assert.equal(env.button("a1").textContent, "되돌리기");
  assert.equal(env.message("a1"), "", "시키는 대로 다시 누르면 기록이 취소된다");
});

test("되돌리기 응답을 잃었어도 서버에서 지워졌으면 실패 안내를 지운다", async () => {
  let done = { a1: 7 };
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done } };
      done = {};
      throw new Error("reply lost");
    },
  });
  await env.settle();
  await env.button("a1").click();
  assert.ok(env.message("a1").includes("되돌리지 못했습니다"));

  await env.retry().click();
  assert.equal(env.button("a1").textContent, "알라딘 등록 완료 · 목록에서 빼기");
  assert.equal(env.message("a1"), "");
});

test("정말 실패했으면 조회 뒤에도 실패 안내가 남는다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: {} } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.button("a1").click();
  await env.retry().click();
  assert.ok(env.message("a1").includes("기록하지 못했습니다"));
});

test("경고가 사라진 직후의 클릭은 띠 밑의 책을 기록하지 않는다", async () => {
  let down = true;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method !== "GET") return { status: 200, body: { id: "a1", doneAt: 7 } };
      if (down) throw new Error("offline");
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  down = false;
  await env.retry().click();
  assert.equal(env.alert().hidden, true);
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), [], "「다시 확인」의 둘째 클릭이다");

  await later(1000, () => env.button("a1").click());
  assert.deepEqual(writesOf(env), ["PUT"]);
});

test("경고가 저절로 사라졌을 때는 누르는 것을 막지 않는다", async () => {
  let down = true;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method !== "GET") return { status: 200, body: { id: "a1", doneAt: 7 } };
      if (down) throw new Error("offline");
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  down = false;
  await env.windowListeners.online();
  await env.settle();
  assert.equal(env.alert().hidden, true);
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), ["PUT"]);
});

test("늦게 실패한 조회가 새 조회의 결과를 경고로 덮지 않는다", async () => {
  let failFirst;
  const firstGet = new Promise((resolve, reject) => { failFirst = reject; });
  let gets = 0;
  const env = setup({
    respond: async () => {
      gets += 1;
      if (gets === 1) return firstGet;
      return { status: 200, body: { done: {} } };
    },
  });
  await env.settle();
  await env.retry().click();
  assert.equal(env.warning().hidden, true);
  failFirst(new Error("timeout"));
  await env.settle();
  await env.settle();
  assert.equal(env.warning().hidden, true);
  assert.equal(env.timers.length, 0, "다시 확인할 일도 없다");
});

test("처음 불러오기에 실패한 동안에는 누른 책으로 권수를 지어내지 않는다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async () => {
      throw new Error("offline");
    },
  });
  await env.settle();
  const count = env.sections[0].querySelector(".group-count");
  await env.button("a1").click();
  assert.equal(env.summary(), "");
  assert.equal(count.textContent, "2권");
  assert.equal(env.toggle().hidden, true);
  assert.ok(env.message("a1").includes("기록하지 못했습니다"));
});

test("처음 불러오기에 실패했어도 기록이 되면 전체를 다시 확인해 맞는 권수를 보인다", async () => {
  let gets = 0;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "PUT") return { status: 200, body: { id: "a1", doneAt: 7 } };
      gets += 1;
      if (gets === 1) throw new Error("offline");
      return { status: 200, body: { done: { a1: 7, a2: 3 } } };
    },
  });
  await env.settle();
  await env.button("a1").click();
  await env.settle();
  await env.settle();
  assert.equal(gets, 2);
  assert.equal(env.summary(), "남은 책 1권 · 등록 완료 2권");
  assert.equal(env.warning().hidden, true);
  assert.ok(env.row("a1").cls.has("is-here"), "방금 누른 책은 그 자리에 남는다");
});

test("처음 누르면 코드를 묻고, 저장이 확인된 뒤에야 완료로 보인다", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = setup({
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: {} } };
      await gate;
      return { status: 200, body: { id: "a1", doneAt: 1793000000000 } };
    },
  });
  await env.settle();

  const pressed = env.button("a1").click();
  await env.settle();
  assert.equal(env.prompts.length, 1);
  assert.equal(env.button("a1").disabled, true);
  assert.equal(env.row("a1").cls.has("is-done"), false, "응답 전에는 완료가 아니다");

  release();
  await pressed;
  const put = env.requests.at(-1);
  assert.equal(put.method, "PUT");
  assert.equal(put.headers.Authorization, "Bearer 12345678");
  assert.ok(put.url.endsWith("/done/a1"));
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.ok(env.row("a1").cls.has("is-here"), "화면이 밀리지 않게 그 자리에 남는다");
  assert.equal(env.button("a1").textContent, "되돌리기");
  assert.ok(env.label("a1").includes("등록 완료"));
  assert.equal(env.summary(), "남은 책 2권 · 등록 완료 1권");
});

test("맞은 코드는 기억해서 다음부터 묻지 않는다", async () => {
  const env = setup({ respond: withDone({}) });
  await env.settle();
  await env.button("a1").click();
  await env.button("a2").click();
  assert.equal(env.prompts.length, 1);
  assert.equal(env.stored.get("books-done.code"), "12345678");
});

test("일본어 입력 상태의 전각 숫자도 같은 코드로 받는다", async () => {
  const env = setup({ respond: withDone({}), prompt: " １２３４５６７８ " });
  await env.settle();
  await env.button("a1").click();
  assert.equal(env.requests.at(-1).headers.Authorization, "Bearer 12345678");
});

test("숫자가 아닌 코드는 보내지 않고 코드가 틀렸다고 알린다", async () => {
  for (const prompt of ["ㅁㄴㅇㄹ", "あいう", "1234 5678"]) {
    const env = setup({ respond: withDone({}), prompt });
    await env.settle();
    await env.button("a1").click();
    assert.deepEqual(writesOf(env), []);
    assert.ok(env.message("a1").includes("코드가 맞지 않습니다"));
    assert.equal(env.stored.has("books-done.code"), false);
    assert.equal(env.button("a1").disabled, false);
  }
});

test("코드 입력을 취소하면 아무것도 보내지 않는다", async () => {
  for (const prompt of [null, "", "   "]) {
    const env = setup({ respond: withDone({}), prompt });
    await env.settle();
    await env.button("a1").click();
    assert.equal(env.requests.filter((r) => r.method !== "GET").length, 0);
    assert.equal(env.button("a1").disabled, false);
  }
});

test("코드가 틀리면 잊어버리고 완료로 만들지 않는다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "00000000"]]),
    respond: async (url, options) =>
      options.method === "GET" ? { status: 200, body: { done: {} } } : { status: 401, body: { error: "wrong_code" } },
  });
  await env.settle();
  await env.button("a1").click();
  assert.equal(env.row("a1").cls.has("is-done"), false);
  assert.ok(env.message("a1").includes("코드가 맞지 않습니다"));
  assert.equal(env.stored.has("books-done.code"), false);
  assert.equal(env.button("a1").disabled, false);
});

test("기록이 실패하면 완료로 보이지 않고 알라딘을 다시 안 해도 된다고 알린다", async () => {
  for (const answer of [
    async () => { throw new Error("offline"); },
    async () => ({ status: 503, body: { error: "unavailable" } }),
    async () => ({ status: 200, body: { id: "other", doneAt: 1 } }),
  ]) {
    const env = setup({
      storage: new Map([["books-done.code", "12345678"]]),
      respond: async (url, options) => (options.method === "GET" ? { status: 200, body: { done: {} } } : answer()),
    });
    await env.settle();
    await env.button("a1").click();
    assert.equal(env.row("a1").cls.has("is-done"), false);
    assert.ok(env.message("a1").includes("알라딘 등록은 다시 하지 않으셔도 됩니다"));
    assert.equal(env.button("a1").disabled, false);
    assert.equal(env.button("a1").textContent, "알라딘 등록 완료 · 목록에서 빼기");
  }
});

test("다시 누르면 메시지가 지워지고 기록된다", async () => {
  let fail = true;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: {} } };
      if (fail) throw new Error("offline");
      return { status: 200, body: { id: "a1", doneAt: 1 } };
    },
  });
  await env.settle();
  await env.button("a1").click();
  fail = false;
  await env.button("a1").click();
  assert.equal(env.message("a1"), "");
  assert.ok(env.row("a1").cls.has("is-done"));
});

test("되돌리면 목록으로 돌아온다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) =>
      options.method === "GET"
        ? { status: 200, body: { done: { a1: 1 } } }
        : { status: 200, body: { id: "a1", doneAt: null } },
  });
  await env.settle();
  await env.toggle().click();
  await env.itemButton("제목-a1").click();
  assert.equal(env.requests.at(-1).method, "DELETE");
  assert.equal(env.row("a1").cls.has("is-done"), false);
  assert.equal(env.button("a1").textContent, "알라딘 등록 완료 · 목록에서 빼기");
  assert.equal(env.summary(), "남은 책 3권 · 등록 완료 0권");
});

test("되돌리기가 실패하면 빠진 상태를 유지하고 알린다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: { a1: 1 } } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.button("a1").click();
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.ok(env.message("a1").includes("되돌리지 못했습니다"));
  assert.equal(env.button("a1").textContent, "되돌리기");
});

test("두 번 눌러도 등록 완료가 취소되지 않는다", async () => {
  const env = setup({ storage: new Map([["books-done.code", "12345678"]]), respond: withDone({}) });
  await env.settle();
  await env.button("a1").click();
  assert.equal(env.button("a1").textContent, "되돌리기");
  assert.equal(env.button("a1").disabled, true, "바뀐 버튼은 눌리지 않는 모습으로 보인다");
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), ["PUT"]);
  assert.ok(env.row("a1").cls.has("is-done"));

  env.tick();
  assert.equal(env.button("a1").disabled, false);
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), ["PUT", "DELETE"], "잠시 뒤의 되돌리기는 그대로 동작한다");
});

test("두 번 눌러도 되돌리기가 다시 완료가 되지 않는다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) =>
      options.method === "GET"
        ? { status: 200, body: { done: { a1: 1 } } }
        : { status: 200, body: { id: "a1", doneAt: 1 } },
  });
  await env.settle();
  await env.button("a1").click();
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), ["DELETE"]);
  assert.equal(env.row("a1").cls.has("is-done"), false);
});

test("실패한 뒤에는 바로 다시 누를 수 있다", async () => {
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "GET") return { status: 200, body: { done: {} } };
      throw new Error("offline");
    },
  });
  await env.settle();
  await env.button("a1").click();
  assert.equal(env.button("a1").disabled, false);
  await env.button("a1").click();
  assert.deepEqual(writesOf(env), ["PUT", "PUT"]);
});

test("기록 응답을 기다리는 동안 온 조회가 그 행을 건드리지 않는다", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = setup({
    groups: [["a1"], ["b1"]],
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "PUT") {
        await gate;
        return { status: 200, body: { id: "a1", doneAt: 7 } };
      }
      return { status: 200, body: { done: env.requests.length > 1 ? { a1: 7 } : {} } };
    },
  });
  await env.settle();
  const pressed = env.button("a1").click();
  await env.settle();
  await env.retry().click(); /* 서버에는 이미 기록됐고 응답만 늦은 상황 */
  await env.settle();
  assert.equal(env.button("a1").disabled, true, "둘째 클릭이 들어가지 않는다");
  assert.equal(env.button("a1").textContent, "기록하는 중…");
  assert.equal(env.row("a1").cls.has("is-done"), false, "행이 사라져 옆 책이 밀려 올라오지 않는다");
  assert.equal(env.sections[0].cls.has("all-done"), false, "묶음도 그대로 있다");

  release();
  await pressed;
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.ok(env.row("a1").cls.has("is-here"), "다음에 열 때까지 그 자리에 남는다");
});

test("응답을 잃어도 조회로 기록이 확인되면 실패로 알리지 않고 그 자리에 남는다", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = setup({
    groups: [["a1"], ["b1"]],
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "PUT") {
        await gate;
        throw new Error("reply lost");
      }
      return { status: 200, body: { done: env.requests.length > 1 ? { a1: 7 } : {} } };
    },
  });
  await env.settle();
  const pressed = env.button("a1").click();
  await env.settle();
  await env.retry().click();
  await env.settle();
  release();
  await pressed;
  assert.ok(env.row("a1").cls.has("is-here"), "다음에 열 때까지 그 자리에 남는다");
  assert.equal(env.sections[0].cls.has("all-done"), false);
  assert.equal(env.message("a1"), "", "서버에 있는데 실패했다고 하면 다시 눌러 취소하게 된다");
  assert.equal(env.button("a1").textContent, "되돌리기");
});

test("같은 책 두 권은 행마다 따로 기록된다", async () => {
  const env = setup({ groups: [["9784408337647", "9784408337647-2"]], respond: withDone({}) });
  await env.settle();
  await env.button("9784408337647-2").click();
  assert.ok(env.requests.at(-1).url.endsWith("/done/9784408337647-2"));
  assert.ok(env.row("9784408337647-2").cls.has("is-done"));
  assert.equal(env.row("9784408337647").cls.has("is-done"), false);
});

test("늦게 온 조회가 방금 누른 내용을 덮지 않는다", async () => {
  let releaseSecond;
  const secondGet = new Promise((resolve) => { releaseSecond = resolve; });
  let gets = 0;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "PUT") return { status: 200, body: { id: "a1", doneAt: 7 } };
      gets += 1;
      if (gets === 1) return { status: 200, body: { done: {} } };
      if (gets === 2) {
        await secondGet;
        return { status: 200, body: { done: {} } }; /* 누르기 전의 낡은 응답 */
      }
      return { status: 200, body: { done: { a1: 7 } } };
    },
  });
  await env.settle();
  env.retry().click();
  await env.button("a1").click();
  releaseSecond();
  await env.settle();
  await env.settle();
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.equal(gets, 3, "낡은 응답을 버리고 다시 조회한다");
});

test("첫 조회가 끝나기 전에 눌러도 낡은 응답이 덮지 않는다", async () => {
  let releaseFirst;
  const firstGet = new Promise((resolve) => { releaseFirst = resolve; });
  let gets = 0;
  const env = setup({
    storage: new Map([["books-done.code", "12345678"]]),
    respond: async (url, options) => {
      if (options.method === "PUT") return { status: 200, body: { id: "a1", doneAt: 7 } };
      gets += 1;
      if (gets === 1) {
        await firstGet;
        return { status: 200, body: { done: {} } };
      }
      return { status: 200, body: { done: { a1: 7 } } };
    },
  });
  await env.settle();
  await env.button("a1").click();
  releaseFirst();
  await env.settle();
  await env.settle();
  assert.ok(env.row("a1").cls.has("is-done"));
  assert.equal(env.summary(), "남은 책 2권 · 등록 완료 1권");
});

test("브라우저 저장소가 막혀도 이번 창에서는 동작한다", async () => {
  const env = setup({ storage: null, respond: withDone({}) });
  await env.settle();
  await env.button("a1").click();
  await env.button("a2").click();
  assert.equal(env.prompts.length, 1);
  assert.ok(env.row("a2").cls.has("is-done"));
});

test("창으로 돌아오면 오래됐을 때만 다시 확인한다", async () => {
  const env = setup({ respond: withDone({}) });
  await env.settle();
  const before = env.requests.length;
  env.docListeners.visibilitychange();
  await env.settle();
  assert.equal(env.requests.length, before, "방금 확인했으면 다시 묻지 않는다");

  const realNow = Date.now;
  env.sandbox.Date.now = () => realNow() + 61000;
  env.docListeners.visibilitychange();
  env.sandbox.Date.now = realNow;
  await env.settle();
  assert.equal(env.requests.length, before + 1);
});

test("복사와 표지 저장의 이벤트를 막지 않는다", () => {
  assert.equal(/preventDefault|stopPropagation|stopImmediatePropagation/.test(SOURCE), false);
  assert.equal(/\.copy-text|\.cover-save/.test(SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")), false);
  assert.equal(/delete|삭제/.test(SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"DELETE"|doneAt\.delete|here\.delete/g, "")), false);
});
