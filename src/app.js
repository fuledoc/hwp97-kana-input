const editor = document.querySelector("#editor");
const modeStatus = document.querySelector("#modeStatus");
const feedback = document.querySelector("#feedback");
const copyButton = document.querySelector("#copyButton");
const clearButton = document.querySelector("#clearButton");
const sampleButtons = document.querySelectorAll("[data-sample]");
const insertButtons = document.querySelectorAll("[data-insert]");
const kanjiPanel = document.querySelector("#kanjiPanel");
const kanjiTarget = document.querySelector("#kanjiTarget");
const kanjiChoices = document.querySelector("#kanjiChoices");
const kanjiMore = document.querySelector("#kanjiMore");
const imeDebugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debug-ime");

const ROMAJI_PUNCTUATION = {
  "-": "ー",
  ",": "、",
  ".": "。",
  "?": "？",
  "!": "！",
  "[": "「",
  "]": "」",
  "(": "（",
  ")": "）",
  "/": "・",
};

let romajiBuffer = "";
let isComposing = false;
let isTransforming = false;
let hangulTransformTimer = 0;
let activeScheme = currentScheme();
let activeCompositionRange = null;
let recentComposition = null;
let pendingHangulRanges = [];
let lastEditorValue = editor.value;
let beforeInputHint = null;
let compositionGeneration = 0;

function currentScript() {
  return document.querySelector('input[name="script"]:checked').value;
}

function currentScheme() {
  // 화면에는 한글 발음 입력만 노출한다. scheme 라디오는 UI에서 제거했으므로
  // 실제 앱에서는 항상 hangul로 고정된다. Romaji/JIS 엔진과 테스트 하네스는
  // scheme 라디오를 주입할 수 있어, 존재할 때만 그 값을 따른다.
  const selected = document.querySelector('input[name="scheme"]:checked');
  return selected ? selected.value : "hangul";
}

function updateStatus() {
  const scriptLabel =
    currentScript() === "katakana" ? "카타카나(カタカナ)" : "히라가나(ひらがな)";
  modeStatus.textContent = `지금은 ${scriptLabel}로 바뀌어요`;
}

function insertText(text) {
  beforeInputHint = null;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.setRangeText(text, start, end, "end");
  lastEditorValue = editor.value;
}

function replacePreviousCharacter(text) {
  beforeInputHint = null;
  const start = editor.selectionStart;
  if (start === 0 || start !== editor.selectionEnd) {
    insertText(text);
    return;
  }
  editor.setRangeText(text, start - 1, start, "end");
  lastEditorValue = editor.value;
}

function flushBuffer() {
  if (!romajiBuffer) {
    return;
  }
  insertText(KanaEngine.flushRomaji(romajiBuffer, currentScript()));
  romajiBuffer = "";
  updateStatus();
}

function cancelScheduledHangulTransform() {
  if (hangulTransformTimer) {
    clearTimeout(hangulTransformTimer);
    hangulTransformTimer = 0;
  }
}

function clearPendingHangulTransforms() {
  pendingHangulRanges = [];
  activeCompositionRange = null;
  recentComposition = null;
}

function findTextChange(previous, current) {
  if (previous === current) {
    return null;
  }

  let start = 0;
  const sharedLength = Math.min(previous.length, current.length);
  while (start < sharedLength && previous[start] === current[start]) {
    start += 1;
  }

  let previousEnd = previous.length;
  let currentEnd = current.length;
  while (
    previousEnd > start &&
    currentEnd > start &&
    previous[previousEnd - 1] === current[currentEnd - 1]
  ) {
    previousEnd -= 1;
    currentEnd -= 1;
  }

  return {
    start,
    previousEnd,
    currentEnd,
    delta: current.length - previous.length,
  };
}

function findTextChangeFromBeforeInput(hint, current, inputType) {
  if (
    !hint ||
    hint.value !== lastEditorValue ||
    (hint.inputType && inputType && hint.inputType !== inputType)
  ) {
    return null;
  }

  const start = Math.max(0, Math.min(hint.start, hint.value.length));
  const previousEnd = Math.max(start, Math.min(hint.end, hint.value.length));
  const prefix = hint.value.slice(0, start);
  const suffix = hint.value.slice(previousEnd);

  if (
    !current.startsWith(prefix) ||
    !current.endsWith(suffix) ||
    current.length < prefix.length + suffix.length
  ) {
    return null;
  }

  return {
    start,
    previousEnd,
    currentEnd: current.length - suffix.length,
    delta: current.length - hint.value.length,
  };
}

function rebasePendingHangulRanges(change) {
  for (const range of pendingHangulRanges) {
    if (change.previousEnd <= range.start) {
      range.start += change.delta;
      range.end += change.delta;
      continue;
    }
    if (change.start >= range.end) {
      continue;
    }

    range.start = Math.min(range.start, change.start);
    range.end = Math.max(change.currentEnd, range.end + change.delta);
  }
}

function addPendingHangulRange(start, end, options = {}) {
  const range = {
    start: Math.max(0, start),
    end: Math.max(start, end),
    force: Boolean(options.force),
    generation: options.generation || 0,
  };
  if (range.end > range.start) {
    pendingHangulRanges.push(range);
    return range;
  }
  return null;
}

function normalizedPendingHangulRanges() {
  const ranges = pendingHangulRanges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];

  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      previous.force = previous.force || range.force;
    } else {
      merged.push({
        start: range.start,
        end: range.end,
        force: range.force,
        generation: range.generation,
      });
    }
  }

  return merged;
}

function mapSelectionPosition(position, start, end, replacementLength) {
  if (position <= start) {
    return position;
  }
  if (position >= end) {
    return position + replacementLength - (end - start);
  }
  return start + replacementLength;
}

function hasForcedHangulTransform() {
  return (
    pendingHangulRanges.some((range) => range.force) ||
    Boolean(recentComposition && recentComposition.shouldTransform && recentComposition.force)
  );
}

function markPendingHangulTransformsForced() {
  for (const range of pendingHangulRanges) {
    range.force = true;
  }
  if (recentComposition && recentComposition.shouldTransform) {
    recentComposition.force = true;
    if (recentComposition.range) {
      recentComposition.range.force = true;
    }
  }
}

function scheduleHangulTransform(delay = 120) {
  const force = hasForcedHangulTransform();
  if (!force && currentScheme() !== "hangul") {
    return;
  }

  cancelScheduledHangulTransform();
  hangulTransformTimer = setTimeout(() => {
    hangulTransformTimer = 0;
    if (!isComposing) {
      transformHangulEditor({ force: hasForcedHangulTransform() });
    }
  }, delay);
}

function transformHangulEditor(options = {}) {
  const force = Boolean(options.force);
  if (isTransforming || isComposing || (!force && currentScheme() !== "hangul")) {
    return false;
  }

  const ranges = normalizedPendingHangulRanges();
  clearPendingHangulTransforms();
  if (!ranges.length) {
    return false;
  }

  let selectionStart = editor.selectionStart;
  let selectionEnd = editor.selectionEnd;
  const selectionDirection = editor.selectionDirection;
  const scrollTop = editor.scrollTop;
  const script = options.script || currentScript();

  isTransforming = true;
  for (const range of ranges.reverse()) {
    const start = Math.min(range.start, editor.value.length);
    const end = Math.min(range.end, editor.value.length);
    const original = editor.value.slice(start, end);
    const converted = KanaEngine.convertHangulPhonetic(original, { script });
    if (converted === original) {
      continue;
    }

    editor.setRangeText(converted, start, end, "preserve");
    selectionStart = mapSelectionPosition(selectionStart, start, end, converted.length);
    selectionEnd = mapSelectionPosition(selectionEnd, start, end, converted.length);
  }
  editor.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  editor.scrollTop = scrollTop;
  isTransforming = false;
  lastEditorValue = editor.value;
  return true;
}

function handleRomajiInput(key) {
  if (/^[a-zA-Z]$/.test(key) || key === "'") {
    romajiBuffer += key.toLowerCase();
    const converted = KanaEngine.convertRomaji(romajiBuffer, {
      final: false,
      script: currentScript(),
    });
    if (converted.text) {
      insertText(converted.text);
    }
    romajiBuffer = converted.rest;
    updateStatus();
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(ROMAJI_PUNCTUATION, key)) {
    flushBuffer();
    insertText(KanaEngine.convertScript(ROMAJI_PUNCTUATION[key], currentScript()));
    return true;
  }

  if (key === " ") {
    flushBuffer();
    insertText(" ");
    return true;
  }

  return false;
}

function handleJisKanaInput(event) {
  const kana = KanaEngine.jisKanaFromKey(event, currentScript());
  if (!kana) {
    return false;
  }

  if (kana === "゛" || kana === "゜") {
    const start = editor.selectionStart;
    if (start > 0 && start === editor.selectionEnd) {
      const previous = editor.value.slice(start - 1, start);
      const marked = KanaEngine.applyKanaMark(previous, kana, currentScript());
      if (marked.applied) {
        replacePreviousCharacter(marked.text);
        return true;
      }
    }
  }

  insertText(kana);
  return true;
}

editor.addEventListener("keydown", (event) => {
  if (
    isComposing ||
    event.isComposing ||
    event.key === "Process" ||
    event.keyCode === 229
  ) {
    return;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) {
    const shortcutKey = (event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (shortcutKey === "z" || shortcutKey === "y")) {
      romajiBuffer = "";
      updateStatus();
      return;
    }
    flushBuffer();
    return;
  }

  if (currentScheme() === "hangul") {
    return;
  }

  if (event.key === "Escape") {
    romajiBuffer = "";
    updateStatus();
    event.preventDefault();
    return;
  }

  if (event.key === "Backspace") {
    if (romajiBuffer) {
      romajiBuffer = romajiBuffer.slice(0, -1);
      updateStatus();
      event.preventDefault();
    }
    return;
  }

  if (event.key === "Enter") {
    flushBuffer();
    insertText("\n");
    event.preventDefault();
    return;
  }

  if (event.key === "Tab") {
    flushBuffer();
    insertText("\t");
    event.preventDefault();
    return;
  }

  if (
    event.key === "Delete" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "PageUp" ||
    event.key === "PageDown" ||
    (event.key || "").startsWith("Arrow")
  ) {
    flushBuffer();
    return;
  }

  const handled =
    currentScheme() === "romaji" ? handleRomajiInput(event.key) : handleJisKanaInput(event);

  if (handled) {
    event.preventDefault();
  }
});

editor.addEventListener("pointerdown", () => {
  flushBuffer();
});

editor.addEventListener("blur", () => {
  flushBuffer();
});

editor.addEventListener("beforeinput", (event) => {
  loadKanjiDictionary();
  beforeInputHint = {
    start: editor.selectionStart,
    end: editor.selectionEnd,
    value: editor.value,
    inputType: event.inputType || "",
  };
});

editor.addEventListener("compositionstart", () => {
  isComposing = true;
  cancelKanjiSuggestion();
  cancelScheduledHangulTransform();
  beforeInputHint = null;
  recentComposition = null;
  compositionGeneration += 1;
  const scheme = currentScheme();
  activeCompositionRange = {
    start: editor.selectionStart,
    end: editor.selectionEnd,
    initialValue: editor.value,
    changed: false,
    generation: compositionGeneration,
    scheme,
    shouldTransform: scheme === "hangul",
    force: false,
  };
});

editor.addEventListener("compositionend", (event) => {
  isComposing = false;
  if (activeCompositionRange) {
    const compositionRestoredInitialValue =
      !event.data && activeCompositionRange.initialValue === editor.value;
    const compositionCommitted =
      !compositionRestoredInitialValue &&
      (activeCompositionRange.changed ||
        activeCompositionRange.initialValue !== editor.value ||
        Boolean(event.data));
    if (compositionCommitted && activeCompositionRange.shouldTransform) {
      activeCompositionRange.end = Math.max(
        activeCompositionRange.start,
        editor.selectionStart,
        editor.selectionEnd,
      );
      const range = addPendingHangulRange(
        activeCompositionRange.start,
        activeCompositionRange.end,
        {
          force: activeCompositionRange.force,
          generation: activeCompositionRange.generation,
        },
      );
      recentComposition = {
        start: activeCompositionRange.start,
        end: activeCompositionRange.end,
        range,
        shouldTransform: true,
        force: activeCompositionRange.force,
        generation: activeCompositionRange.generation,
      };
    }
    activeCompositionRange = null;
  }

  scheduleHangulTransform();
});

editor.addEventListener("input", (event) => {
  const currentValue = editor.value;
  const inputHint = beforeInputHint;
  beforeInputHint = null;
  const change =
    findTextChangeFromBeforeInput(inputHint, currentValue, event.inputType) ||
    findTextChange(lastEditorValue, currentValue);

  if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
    cancelScheduledHangulTransform();
    clearPendingHangulTransforms();
    // 되돌렸는데 같은 제안이 다시 뜨면 무한 루프처럼 느껴진다.
    cancelKanjiSuggestion();
    lastEditorValue = currentValue;
    return;
  }

  if (change) {
    rebasePendingHangulRanges(change);

    if (activeCompositionRange) {
      activeCompositionRange.changed = true;
      activeCompositionRange.start = Math.min(activeCompositionRange.start, change.start);
      activeCompositionRange.end = Math.max(
        activeCompositionRange.start,
        activeCompositionRange.end + change.delta,
        change.currentEnd,
      );
    } else if (!isComposing && !event.isComposing) {
      const recentStart = recentComposition
        ? recentComposition.range
          ? recentComposition.range.start
          : recentComposition.start
        : 0;
      const recentEnd = recentComposition
        ? recentComposition.range
          ? recentComposition.range.end
          : recentComposition.end
        : 0;
      const touchesRecentComposition =
        recentComposition &&
        change.start <= recentEnd &&
        change.currentEnd >= recentStart;

      if (touchesRecentComposition) {
        const start = Math.min(recentStart, change.start);
        const end = Math.max(recentEnd, change.currentEnd);
        if (recentComposition.range) {
          recentComposition.range.start = start;
          recentComposition.range.end = end;
        } else {
          recentComposition.range = addPendingHangulRange(start, end, {
            force: recentComposition.force,
            generation: recentComposition.generation,
          });
        }
      } else if (
        currentScheme() === "hangul" &&
        change.currentEnd > change.start &&
        (!event.inputType || event.inputType.startsWith("insert"))
      ) {
        addPendingHangulRange(change.start, change.currentEnd);
      }
    }
  }

  if (!isComposing && !event.isComposing) {
    recentComposition = null;
  }
  lastEditorValue = currentValue;
  if (!isComposing && !event.isComposing) {
    scheduleHangulTransform();
    // 가나 변환(120ms)이 끝난 뒤에 조회하도록 더 긴 지연을 쓴다.
    scheduleKanjiSuggestion();
  } else {
    cancelKanjiSuggestion();
  }
});

for (const input of document.querySelectorAll('input[name="script"], input[name="scheme"]')) {
  input.addEventListener("change", () => {
    const previousScheme = activeScheme;
    const nextScheme = currentScheme();
    cancelScheduledHangulTransform();
    const leavingHangul = previousScheme === "hangul" && nextScheme !== "hangul";
    if (leavingHangul) {
      markPendingHangulTransformsForced();
    }
    if (activeCompositionRange && activeCompositionRange.shouldTransform) {
      activeCompositionRange.force = nextScheme !== "hangul";
    }

    if (!isComposing && pendingHangulRanges.length) {
      transformHangulEditor({
        force: previousScheme === "hangul" || hasForcedHangulTransform(),
        script: currentScript(),
      });
    } else if (!isComposing && (currentScheme() === "hangul" || hasForcedHangulTransform())) {
      scheduleHangulTransform();
    }
    flushBuffer();
    activeScheme = nextScheme;
    updateStatus();
    editor.focus();
  });
}

function legacyCopyEditorText() {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const direction = editor.selectionDirection;
  try {
    editor.focus();
    editor.select();
    const copied = document.execCommand("copy");
    editor.setSelectionRange(start, end, direction);
    return copied;
  } catch (_error) {
    editor.setSelectionRange(start, end, direction);
    return false;
  }
}

function showCopyResult(copied) {
  copyButton.textContent = copied ? "복사됐어요!" : "복사 실패";
  copyButton.classList.toggle("is-success", copied);
  feedback.textContent = copied
    ? "복사됐어요. 이제 판매글에 붙여넣으세요."
    : "복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.";
  feedback.classList.toggle("error", !copied);
  setTimeout(() => {
    copyButton.textContent = "복사하기";
    copyButton.classList.remove("is-success");
  }, 1600);
}

copyButton.addEventListener("click", async () => {
  cancelScheduledHangulTransform();
  flushBuffer();
  if (!isComposing && pendingHangulRanges.length) {
    transformHangulEditor({ force: hasForcedHangulTransform() });
  } else if (!isComposing && (currentScheme() === "hangul" || hasForcedHangulTransform())) {
    scheduleHangulTransform();
  }

  let copied = false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(editor.value);
      copied = true;
    } catch (_error) {
      copied = false;
    }
  }
  if (!copied) {
    copied = legacyCopyEditorText();
  }

  showCopyResult(copied);
  editor.focus();
});

clearButton.addEventListener("click", () => {
  const confirmClear =
    typeof window === "undefined" || typeof window.confirm !== "function"
      ? () => true
      : () => window.confirm("입력한 내용을 모두 지울까요?");
  if (editor.value && !confirmClear()) {
    editor.focus();
    return;
  }
  cancelScheduledHangulTransform();
  clearPendingHangulTransforms();
  beforeInputHint = null;
  editor.value = "";
  lastEditorValue = editor.value;
  romajiBuffer = "";
  cancelKanjiSuggestion();
  feedback.textContent = "";
  feedback.classList.remove("error");
  updateStatus();
  editor.focus();
});

function settlePendingHangul() {
  cancelScheduledHangulTransform();
  if (!isComposing && pendingHangulRanges.length) {
    transformHangulEditor({ force: hasForcedHangulTransform() });
  }
}

for (const button of insertButtons) {
  button.addEventListener("click", () => {
    settlePendingHangul();
    flushBuffer();
    insertText(button.dataset.insert);
    feedback.textContent = "";
    feedback.classList.remove("error");
    updateStatus();
    editor.focus();
  });
}

for (const button of sampleButtons) {
  button.addEventListener("click", () => {
    cancelScheduledHangulTransform();
    clearPendingHangulTransforms();
    beforeInputHint = null;
    flushBuffer();
    editor.value = KanaEngine.convertHangulPhonetic(button.dataset.sample, {
      script: currentScript(),
    });
    lastEditorValue = editor.value;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.focus();
  });
}

if (imeDebugEnabled) {
  for (const type of [
    "keydown",
    "beforeinput",
    "input",
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ]) {
    editor.addEventListener(type, (event) => {
      console.debug("[IME]", {
        time: Math.round(performance.now()),
        type,
        inputType: event.inputType || "",
        data: event.data || "",
        isComposing: Boolean(event.isComposing),
        key: event.key || "",
        code: event.code || "",
        keyCode: event.keyCode || 0,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
        selectionDirection: editor.selectionDirection,
        scheme: currentScheme(),
        script: currentScript(),
        value: editor.value,
      });
    });
  }
}


/* ---------- 한자 바꾸기 ----------
 * 원칙(AGENTS.md):
 *  - 한자를 절대 자동 삽입하지 않는다. 사용자가 눌러야 바뀐다.
 *  - 조합 중, Undo/Redo 직후, 카타카나 모드에서는 띄우지 않는다.
 *  - 사전 로딩이 실패하면 한자 기능만 조용히 죽고 가나 변환·복사는 산다.
 *  - 히트가 없으면 아무것도 렌더하지 않는다(실패 메시지 금지).
 */
const KANJI_DELAY = 250;
const KANJI_VISIBLE = 3;

let kanjiTimer = 0;
let kanjiDictState = "idle"; // idle | loading | ready | failed
let kanjiSpan = null; // { start, end, candidates, expanded }

function kanjiAvailable() {
  return Boolean(kanjiPanel && typeof KanjiEngine !== "undefined");
}

function hideKanjiPanel() {
  kanjiSpan = null;
  if (!kanjiPanel) return;
  kanjiPanel.hidden = true;
  kanjiChoices.textContent = "";
  if (kanjiMore) kanjiMore.hidden = true;
}

function cancelKanjiSuggestion() {
  if (kanjiTimer) {
    clearTimeout(kanjiTimer);
    kanjiTimer = 0;
  }
  hideKanjiPanel();
}

function loadKanjiDictionary() {
  if (kanjiDictState !== "idle" || !kanjiAvailable()) return;
  if (typeof fetch !== "function") {
    kanjiDictState = "failed";
    return;
  }
  kanjiDictState = "loading";
  fetch("dict/kanji.txt")
    .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
    .then((text) => {
      KanjiEngine.loadDictionary(text);
      kanjiDictState = "ready";
    })
    .catch(() => {
      kanjiDictState = "failed";
    });
}

function renderKanjiPanel() {
  const span = kanjiSpan;
  if (!span) return;
  const limit = span.expanded ? span.candidates.length : KANJI_VISIBLE;
  kanjiTarget.textContent = span.reading;
  kanjiChoices.textContent = "";

  span.candidates.slice(0, limit).forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kanji-choice";
    button.lang = "ja";

    const text = document.createElement("span");
    text.textContent = candidate;
    button.appendChild(text);

    if (index === 0) {
      const tag = document.createElement("span");
      tag.className = "kanji-tag";
      tag.textContent = "가나 그대로";
      button.appendChild(tag);
    }

    button.addEventListener("click", () => applyKanji(candidate));
    kanjiChoices.appendChild(button);
  });

  if (kanjiMore) {
    kanjiMore.hidden = span.expanded || span.candidates.length <= KANJI_VISIBLE;
  }
  kanjiPanel.hidden = false;
}

function applyKanji(candidate) {
  const span = kanjiSpan;
  if (!span) return;
  const start = Math.min(span.start, editor.value.length);
  const end = Math.min(span.end, editor.value.length);
  if (editor.value.slice(start, end) !== span.reading) {
    hideKanjiPanel();
    return;
  }
  beforeInputHint = null;
  const scrollTop = editor.scrollTop;
  editor.setRangeText(candidate, start, end, "end");
  editor.scrollTop = scrollTop;
  lastEditorValue = editor.value;
  hideKanjiPanel();
  editor.focus();
}

function suggestKanji() {
  if (!kanjiAvailable() || isComposing) return;
  if (currentScript() === "katakana") return; // 외래어에 한자 후보는 무의미하다
  if (kanjiDictState === "failed") return;
  if (kanjiDictState !== "ready") {
    loadKanjiDictionary();
    return;
  }
  if (editor.selectionStart !== editor.selectionEnd) return;

  const run = KanjiEngine.kanaRunBefore(editor.value, editor.selectionStart);
  if (!run.text || run.text.length < 2) {
    hideKanjiPanel();
    return;
  }

  const spans = KanjiEngine.convert(run.text);
  const words = spans.filter((s) => s.type === "word");
  if (!words.length) {
    hideKanjiPanel();
    return;
  }

  // 캐럿에 가장 가까운(마지막) 단어 스팬만 제안한다.
  const last = words[words.length - 1];
  const offset = run.text.lastIndexOf(last.text);
  if (offset < 0 || last.candidates.length < 2) {
    hideKanjiPanel();
    return;
  }

  kanjiSpan = {
    start: run.start + offset,
    end: run.start + offset + last.text.length,
    reading: last.text,
    candidates: last.candidates,
    expanded: false,
  };
  renderKanjiPanel();
}

function scheduleKanjiSuggestion() {
  if (!kanjiAvailable()) return;
  if (kanjiTimer) clearTimeout(kanjiTimer);
  kanjiTimer = setTimeout(() => {
    kanjiTimer = 0;
    suggestKanji();
  }, KANJI_DELAY);
}

if (kanjiMore) {
  kanjiMore.addEventListener("click", () => {
    if (!kanjiSpan) return;
    kanjiSpan.expanded = true;
    renderKanjiPanel();
    editor.focus();
  });
}

updateStatus();
