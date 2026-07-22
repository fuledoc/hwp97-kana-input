const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const KanaEngine = require("../src/kana-engine");

class FakeElement {
  constructor(options = {}) {
    this.listeners = new Map();
    this.value = options.value || "";
    this.checked = Boolean(options.checked);
    this.dataset = options.dataset || {};
    this.textContent = options.textContent || "";
    this.selectionStart = this.value.length;
    this.selectionEnd = this.value.length;
    this.selectionDirection = "none";
    this.scrollTop = 0;
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, force) => {
        const shouldHave = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldHave) classes.add(name);
        else classes.delete(name);
        return shouldHave;
      },
      contains: (name) => classes.has(name),
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      key: "",
      code: "",
      keyCode: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
      inputType: "",
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...properties,
    };

    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
    return event;
  }

  setRangeText(replacement, start, end, selectionMode = "preserve") {
    const previousStart = this.selectionStart;
    const previousEnd = this.selectionEnd;
    const delta = replacement.length - (end - start);
    this.value = this.value.slice(0, start) + replacement + this.value.slice(end);

    if (selectionMode === "end") {
      this.selectionStart = start + replacement.length;
      this.selectionEnd = this.selectionStart;
      return;
    }

    this.selectionStart =
      previousStart <= start ? previousStart : previousStart >= end ? previousStart + delta : start;
    this.selectionEnd =
      previousEnd <= start
        ? previousEnd
        : previousEnd >= end
          ? previousEnd + delta
          : start + replacement.length;
  }

  setSelectionRange(start, end, direction = "none") {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction || "none";
  }

  select() {
    this.setSelectionRange(0, this.value.length);
  }

  focus() {}
}

function createScheduler() {
  let nextId = 1;
  const tasks = new Map();

  return {
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      tasks.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    runAll() {
      while (tasks.size) {
        const batch = [...tasks.entries()].sort((a, b) => a[1].delay - b[1].delay);
        tasks.clear();
        for (const [, task] of batch) {
          task.callback();
        }
      }
    },
    size() {
      return tasks.size;
    },
  };
}

function createHarness(options = {}) {
  const editor = new FakeElement({ value: options.value || "" });
  const modeStatus = new FakeElement();
  const feedback = new FakeElement();
  const copyButton = new FakeElement({ textContent: "복사하기" });
  const clearButton = new FakeElement({ textContent: "지우기" });
  const sampleButtons = [new FakeElement({ dataset: { sample: "와타시" } })];
  const insertButtons = [new FakeElement({ dataset: { insert: "を" } })];
  const scriptInputs = [
    new FakeElement({ value: "hiragana", checked: options.script !== "katakana" }),
    new FakeElement({ value: "katakana", checked: options.script === "katakana" }),
  ];
  const initialScheme = options.scheme || "hangul";
  const schemeInputs = ["hangul", "romaji", "jis"].map(
    (value) => new FakeElement({ value, checked: value === initialScheme }),
  );
  const scheduler = createScheduler();

  const document = {
    querySelector(selector) {
      if (selector === "#editor") return editor;
      if (selector === "#modeStatus") return modeStatus;
      if (selector === "#feedback") return feedback;
      if (selector === "#copyButton") return copyButton;
      if (selector === "#clearButton") return clearButton;
      if (selector === 'input[name="script"]:checked') {
        return scriptInputs.find((input) => input.checked);
      }
      if (selector === 'input[name="scheme"]:checked') {
        return schemeInputs.find((input) => input.checked);
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-sample]") return sampleButtons;
      if (selector === "[data-insert]") return insertButtons;
      if (selector === 'input[name="script"], input[name="scheme"]') {
        return [...scriptInputs, ...schemeInputs];
      }
      return [];
    },
    execCommand() {
      return true;
    },
  };

  const appSource = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  vm.runInNewContext(appSource, {
    KanaEngine,
    document,
    navigator: {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  });

  function setScheme(scheme) {
    for (const input of schemeInputs) {
      input.checked = input.value === scheme;
    }
    schemeInputs.find((input) => input.value === scheme).dispatch("change");
  }

  function compose(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.dispatch("compositionstart");
    editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
    editor.setSelectionRange(start + text.length, start + text.length);
    editor.dispatch("input", {
      data: text,
      inputType: "insertCompositionText",
      isComposing: true,
    });
    editor.dispatch("compositionend", { data: text });
  }

  function keydown(key, properties = {}) {
    return editor.dispatch("keydown", { key, ...properties });
  }

  return {
    editor,
    sampleButton: sampleButtons[0],
    insertButton: insertButtons[0],
    copyButton,
    clearButton,
    scheduler,
    setScheme,
    compose,
    keydown,
  };
}

test("Hangul 조합 종료 후 입력한 범위만 지연 변환한다", () => {
  const app = createHarness({ value: "ASCII text. " });
  app.compose("와");

  assert.equal(app.editor.value, "ASCII text. 와");
  assert.equal(app.scheduler.size(), 1);
  app.editor.setSelectionRange(12, 13, "backward");
  app.editor.scrollTop = 48;
  app.scheduler.runAll();
  assert.equal(app.editor.value, "ASCII text. わ");
  assert.equal(app.editor.selectionDirection, "backward");
  assert.equal(app.editor.scrollTop, 48);
});

test("새 조합은 타이머만 취소하고 앞선 확정 범위를 보존한다", () => {
  const app = createHarness();
  app.compose("와");
  app.compose("타");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わた");
});

test("Hangul에서 다른 입력 방식으로 전환할 때 대기 중인 글자를 확정한다", () => {
  const app = createHarness();
  app.compose("와");
  app.setScheme("romaji");
  assert.equal(app.editor.value, "わ");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("조합 중 모드 변경은 활성 조합 문자열을 즉시 수정하지 않는다", () => {
  const app = createHarness();
  app.editor.dispatch("compositionstart");
  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    inputType: "insertCompositionText",
    isComposing: true,
  });

  app.setScheme("romaji");
  assert.equal(app.editor.value, "와");
  app.editor.dispatch("compositionend", { data: "와" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("강제 확정 타이머 중 다시 모드를 바꿔도 대기 범위를 잃지 않는다", () => {
  const app = createHarness();
  app.editor.dispatch("compositionstart");
  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.setScheme("romaji");
  app.editor.dispatch("compositionend", { data: "와" });

  app.setScheme("jis");
  assert.equal(app.editor.value, "わ");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("compositionend 뒤 늦은 input도 강제 확정 상태를 유지한다", () => {
  const app = createHarness();
  app.editor.dispatch("compositionstart");
  app.setScheme("romaji");
  app.editor.dispatch("compositionend", { data: "와" });
  app.setScheme("jis");

  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", { inputType: "insertText" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("반복 문자열에서도 beforeinput 위치의 붙여넣기만 변환한다", () => {
  const app = createHarness({ value: "와와" });
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("beforeinput", {
    data: "와",
    inputType: "insertFromPaste",
  });
  app.editor.value = "와와와";
  app.editor.setSelectionRange(2, 2);
  app.editor.dispatch("input", {
    data: "와",
    inputType: "insertFromPaste",
  });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와わ와");
});

test("동일한 텍스트로 선택을 교체해도 beforeinput 범위를 변환한다", () => {
  const app = createHarness({ value: "와" });
  app.editor.setSelectionRange(0, 1);
  app.editor.dispatch("beforeinput", {
    data: "와",
    inputType: "insertFromPaste",
  });
  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    data: "와",
    inputType: "insertFromPaste",
  });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("반복 문자열의 compositionend 뒤 늦은 input도 원래 조합 위치에서 변환한다", () => {
  const app = createHarness({ value: "와와" });
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("compositionstart");
  app.editor.dispatch("compositionend", { data: "와" });

  app.editor.dispatch("beforeinput", {
    data: "와",
    inputType: "insertText",
  });
  app.editor.value = "와와와";
  app.editor.setSelectionRange(2, 2);
  app.editor.dispatch("input", {
    data: "와",
    inputType: "insertText",
  });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와わ와");
});

test("취소된 빈 조합은 강제 확정 상태를 남기지 않는다", () => {
  const app = createHarness();
  app.editor.dispatch("compositionstart");
  app.setScheme("romaji");
  app.editor.dispatch("compositionend", { data: "" });
  app.scheduler.runAll();

  app.editor.value = "한";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", { inputType: "insertFromPaste" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "한");
});

test("선택 상태에서 취소된 조합은 기존 텍스트를 변환하지 않는다", () => {
  const app = createHarness({ value: "와" });
  app.editor.setSelectionRange(0, 1);
  app.editor.dispatch("compositionstart");
  app.editor.dispatch("compositionend", { data: "" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와");
});

test("preedit 변경 후 원래 값으로 복원된 취소 조합을 변환하지 않는다", () => {
  const app = createHarness({ value: "와" });
  app.editor.setSelectionRange(0, 1);
  app.editor.dispatch("compositionstart");

  app.editor.value = "타";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.editor.dispatch("compositionend", { data: "" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와");
});

test("선택 영역을 짧은 조합으로 교체해도 인접 텍스트를 변환하지 않는다", () => {
  const app = createHarness({ value: "A와타카" });
  app.editor.setSelectionRange(1, 3);
  app.editor.dispatch("compositionstart");
  app.editor.value = "A나카";
  app.editor.setSelectionRange(2, 2);
  app.editor.dispatch("input", {
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.editor.dispatch("compositionend", { data: "나" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "Aな카");
});

test("Romaji에서 시작한 composition은 나중에 Hangul 범위로 변환하지 않는다", () => {
  const app = createHarness({ scheme: "romaji" });
  app.compose("와");
  app.scheduler.runAll();
  app.setScheme("hangul");
  app.setScheme("jis");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와");
});

test("Hangul을 떠날 때의 강제 확정은 다음 Romaji composition으로 전파되지 않는다", () => {
  const app = createHarness();
  app.editor.dispatch("compositionstart");
  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", {
    data: "와",
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.setScheme("romaji");
  app.editor.dispatch("compositionend", { data: "와" });

  app.editor.dispatch("compositionstart");
  app.editor.value = "와타";
  app.editor.setSelectionRange(2, 2);
  app.editor.dispatch("input", {
    data: "타",
    inputType: "insertCompositionText",
    isComposing: true,
  });
  app.editor.dispatch("compositionend", { data: "타" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ타");
});

test("길이가 늘어나는 변환도 backward selection을 보정한다", () => {
  const app = createHarness({ value: "AB" });
  app.editor.setSelectionRange(1, 1);
  app.compose("쥬");
  app.editor.setSelectionRange(2, 3, "backward");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "AじゅB");
  assert.equal(app.editor.selectionStart, 3);
  assert.equal(app.editor.selectionEnd, 4);
  assert.equal(app.editor.selectionDirection, "backward");
});

test("historyUndo와 historyRedo 결과를 다시 자동 변환하지 않는다", () => {
  const app = createHarness();
  app.compose("와");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");

  app.editor.value = "와";
  app.editor.setSelectionRange(1, 1);
  app.editor.dispatch("input", { inputType: "historyUndo" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와");

  app.editor.dispatch("input", { inputType: "historyRedo" });
  app.scheduler.runAll();
  assert.equal(app.editor.value, "와");
});

test("Romaji 키 단위 입력에서 n 계열 버퍼를 보존한다", () => {
  const app = createHarness({ scheme: "romaji" });
  for (const key of "nnya") {
    assert.equal(app.keydown(key).defaultPrevented, true);
  }
  assert.equal(app.editor.value, "んにゃ");
});

test("Romaji 미완성 버퍼는 커서 이동 전에 원래 위치에서 확정한다", () => {
  const app = createHarness({ scheme: "romaji", value: "AB" });
  app.keydown("k");
  const arrowEvent = app.keydown("ArrowLeft");
  assert.equal(arrowEvent.defaultPrevented, false);
  assert.equal(app.editor.value, "ABk");

  app.editor.setSelectionRange(0, 0);
  app.keydown("a");
  assert.equal(app.editor.value, "あABk");
});

test("Romaji 미완성 버퍼는 Undo/Redo 단축키 전에 취소한다", () => {
  const app = createHarness({ scheme: "romaji", value: "AB" });
  app.keydown("k");
  const undoEvent = app.keydown("z", { ctrlKey: true });
  assert.equal(undoEvent.defaultPrevented, false);
  assert.equal(app.editor.value, "AB");

  app.keydown("a");
  assert.equal(app.editor.value, "ABあ");
});

test("조합 중 JIS keydown을 가로채지 않는다", () => {
  const app = createHarness({ scheme: "jis" });
  const event = app.keydown("q", {
    code: "KeyQ",
    isComposing: true,
    keyCode: 229,
  });
  assert.equal(event.defaultPrevented, false);
  assert.equal(app.editor.value, "");
});

test("예문은 입력 방식과 관계없이 현재 문자종으로 변환한다", () => {
  const app = createHarness({ scheme: "jis", script: "katakana" });
  app.sampleButton.dispatch("click");
  assert.equal(app.editor.value, "ワタシ");
});

test("scheme 라디오가 없으면 입력 방식은 hangul로 고정된다", () => {
  const app = createHarness();
  app.compose("와");
  app.scheduler.runAll();
  assert.equal(app.editor.value, "わ");
});

test("특수 글자 버튼은 대기 중인 한글을 먼저 확정한 뒤 글자를 넣는다", () => {
  const app = createHarness();
  app.compose("와");
  app.insertButton.dispatch("click");
  assert.equal(app.editor.value, "わを");
  assert.equal(app.scheduler.size(), 0);
});

test("지우기 버튼은 입력창을 비운다", () => {
  const app = createHarness({ value: "わたし" });
  app.clearButton.dispatch("click");
  assert.equal(app.editor.value, "");
});

test("복사 버튼은 성공 시 성공 표시를 남긴다", () => {
  const app = createHarness({ value: "わたし" });
  app.copyButton.dispatch("click");
  assert.equal(app.copyButton.classList.contains("is-success"), true);
});
