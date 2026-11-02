/* 책 목록 페이지 스크립트 회귀 테스트.
   실제 브라우저 없이 books.js를 돌려, 글자를 눌렀을 때
   「복사됨」이 떴다가 사라지는지와 복사값이 무엇인지 확인한다. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add: (...n) => n.forEach((x) => set.add(x)),
    remove: (...n) => n.forEach((x) => set.delete(x)),
    contains: (n) => set.has(n),
    toggle: (n, force) => {
      const on = force === undefined ? !set.has(n) : Boolean(force);
      if (on) set.add(n);
      else set.delete(n);
      return on;
    },
  };
}

class Node {
  constructor(cls = "", dataset = {}) {
    this.classList = makeClassList();
    /* books.js는 el.className = "copy-toast" 로 클래스를 준다.
       실제 DOM처럼 className 대입이 classList에 반영되게 한다. */
    Object.defineProperty(this, "className", {
      get: () => [...this.classList._set].join(" "),
      set: (v) => {
        this.classList._set.clear();
        String(v).split(" ").filter(Boolean).forEach((c) => this.classList.add(c));
      },
      enumerable: true,
    });
    this.className = cls;
    this.dataset = dataset;
    this.style = {};
    this.textContent = "";
    this.children = [];
    this.attrs = {};
    this.offsetWidth = 10;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
  }
  getBoundingClientRect() {
    return { left: 100, top: 200, width: 80, height: 20, bottom: 220, right: 180 };
  }
  /* books.js는 event.target.closest(".copy-text")로 눌린 글자를 찾는다. */
  closest(sel) {
    return this.classList.contains(sel.replace(".", "")) ? this : null;
  }
}

function setup({ clipboardOk = true } = {}) {
  const timers = [];
  const body = new Node("body");
  const listeners = {};
  const doc = {
    body,
    createElement: () => new Node(),
    addEventListener: (t, fn) => {
      listeners[t] = fn;
    },
    querySelector: () => null,
  };
  const sandbox = {
    document: doc,
    window: { innerWidth: 1000, innerHeight: 800 },
    navigator: {
      clipboard: {
        writeText: async (t) => {
          if (!clipboardOk) throw new Error("blocked");
          sandbox.__copied = t;
        },
      },
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => {},
    __copied: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "src", "books.js"), "utf8"),
    sandbox
  );
  const runTimers = () => {
    while (timers.length) timers.shift().fn();
  };
  return { sandbox, listeners, body, runTimers };
}

async function clickChip(env, chip) {
  await env.listeners.click({ target: chip });
}

test("글자를 누르면 그 항목의 값만 복사된다", async () => {
  const env = setup();
  /* 쪽수는 「167쪽」으로 보이지만 알라딘 칸에는 숫자만 들어가야 한다. */
  const chip = new Node("copy-text", { copy: "167" });
  chip.textContent = "167쪽";
  await clickChip(env, chip);
  assert.equal(env.sandbox.__copied, "167");
});

test("복사하면 「복사됨」이 뜬다", async () => {
  const env = setup();
  const chip = new Node("copy-text", { copy: "9784087204445" });
  await clickChip(env, chip);
  const toast = env.body.children.find((c) => c.classList.contains("copy-toast"));
  assert.ok(toast, "안내가 만들어져야 한다");
  assert.equal(toast.textContent, "복사됨");
  assert.ok(toast.classList.contains("is-on"), "보이는 상태여야 한다");
  assert.ok(chip.classList.contains("is-success"));
});

test("잠깐 뒤에 사라진다", async () => {
  const env = setup();
  const chip = new Node("copy-text", { copy: "集英社" });
  await clickChip(env, chip);
  const toast = env.body.children.find((c) => c.classList.contains("copy-toast"));
  env.runTimers();
  assert.equal(toast.classList.contains("is-on"), false, "타이머 뒤 사라져야 한다");
  assert.equal(chip.classList.contains("is-success"), false, "글자 강조도 풀려야 한다");
});

test("복사에 실패하면 실패라고 알린다", async () => {
  const env = setup({ clipboardOk: false });
  const chip = new Node("copy-text", { copy: "x" });
  await clickChip(env, chip);
  const toast = env.body.children.find((c) => c.classList.contains("copy-toast"));
  assert.equal(toast.textContent, "복사 실패");
  assert.ok(toast.classList.contains("is-error"));
  assert.ok(chip.classList.contains("is-error"));
});

test("여러 번 눌러도 안내는 하나만 만든다", async () => {
  const env = setup();
  const a = new Node("copy-text", { copy: "1" });
  const b = new Node("copy-text", { copy: "2" });
  await clickChip(env, a);
  await clickChip(env, b);
  const toasts = env.body.children.filter((c) => c.classList.contains("copy-toast"));
  assert.equal(toasts.length, 1);
  assert.equal(env.sandbox.__copied, "2");
});

test("누른 자리 근처에 뜬다", async () => {
  const env = setup();
  const chip = new Node("copy-text", { copy: "1" });
  await clickChip(env, chip);
  const toast = env.body.children.find((c) => c.classList.contains("copy-toast"));
  assert.ok(toast.style.left.endsWith("px"));
  assert.ok(toast.style.top.endsWith("px"));
  assert.notEqual(toast.style.top, "-999px");
});

test("복사할 값이 없는 글자는 무시한다", async () => {
  const env = setup();
  await clickChip(env, new Node("copy-text", {}));
  assert.equal(env.sandbox.__copied, null);
  assert.equal(env.body.children.length, 0);
});

test("묶음별 권수와 전체 권수가 실제 책 수와 같다", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "books.html"), "utf8");
  const groups = html.split('<section class="booklist"').slice(1);
  assert.ok(groups.length > 0, "묶음이 있어야 한다");
  let total = 0;
  for (const group of groups) {
    const title = group.match(/class="group-title">([^<]*)</)[1].trim();
    const rows = (group.match(/<td class="col-no"/g) || []).length;
    assert.equal(Number(group.match(/class="group-count">(\d+)권/)[1]), rows, `${title} 권수`);
    total += rows;
  }
  assert.equal(Number(html.match(/모두 (\d+)권/)[1]), total, "맨 아래 전체 권수");
});

test("같은 책을 두 번 넣지 않는다(원래 있던 두 권 제외)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "books.html"), "utf8");
  const isbns = [...html.matchAll(/field-isbn" data-copy="(\d+)"/g)].map((m) => m[1]);
  const seen = new Map();
  for (const isbn of isbns) seen.set(isbn, (seen.get(isbn) || 0) + 1);
  const twice = [...seen].filter(([, n]) => n > 1).map(([isbn]) => isbn).sort();
  /* 古代史 不都合な真実, 「歴史認識」とは何か는 실물이 두 권씩 있어 목록에도 두 번 있다. */
  assert.deepEqual(twice, ["9784121023322", "9784408337647"]);
});

test("모든 책에 바뀌지 않는 고유 번호가 있다", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "books.html"), "utf8");
  const rows = [...html.matchAll(/<tr data-book-id="([^"]+)">([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, (html.match(/<td class="col-no"/g) || []).length, "번호 없는 행이 없어야 한다");
  const ids = rows.map((row) => row[1]);
  assert.equal(new Set(ids).size, ids.length, "번호가 겹치면 다른 책까지 함께 빠진다");
  for (const [, id, row] of rows) {
    assert.match(id, /^(?:97[89]\d{10}(?:-[2-9])?|noisbn-[0-9a-z]{1,10}-\d{1,3})$/);
    const isbn = row.match(/field-isbn" data-copy="(\d{13})"/);
    if (isbn) {
      assert.equal(id.replace(/-\d$/, ""), isbn[1], `${id}의 ISBN이 행과 다르다`);
    } else {
      assert.ok(
        row.includes(`photos/covers/${id}.jpg`) || row.includes("cover-missing"),
        `${id}의 표지 파일이 행과 다르다`
      );
    }
  }
});

test("등록 완료 안내는 기능이 켜질 때까지 숨겨 둔다", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "books.html"), "utf8");
  assert.match(html, /<p class="done-howto" hidden><b>알라딘 등록을 마친 책<\/b>/);
  assert.equal((html.match(/목록에서 빼기/g) || []).length, 1, "다른 곳에 고정 문구로 두지 않는다");
});

test("책 목록의 등록 완료 주소는 운영 주소 아니면 off다", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "books.html"), "utf8");
  const metas = html.match(/<meta name="done-api"[^>]*>/g) || [];
  assert.equal(metas.length, 1, "메타는 한 줄만 둔다");
  assert.match(metas[0], /^<meta name="done-api" content="(?:https:\/\/books-api\.fuledoc\.com|off)">$/);
});

test("입력기는 등록 완료 기능을 불러오지 않는다", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.equal(/https?:\/\//.test(html), false);
  assert.equal(html.includes("books-done"), false);
  assert.equal(html.includes("done-api"), false);
});
