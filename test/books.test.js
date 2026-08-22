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
