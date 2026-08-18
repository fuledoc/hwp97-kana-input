/* 책 목록 페이지: 제목별 복사 버튼과, 글자를 눌러 바로 복사하는 기능.
   알라딘 상품 등록 화면의 각 칸에 하나씩 붙여넣는 용도라 항목별로 따로 복사한다.
   입력기 본체(app.js)와 상태를 공유하지 않는 독립 스크립트다. */

const feedback = document.querySelector("#bookFeedback");
const resetTimers = new WeakMap();

function legacyCopyText(text) {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const holder = document.createElement("textarea");
  holder.value = text;
  holder.setAttribute("readonly", "");
  holder.style.position = "fixed";
  holder.style.top = "-1000px";
  holder.style.opacity = "0";
  document.body.appendChild(holder);

  try {
    holder.select();
    holder.setSelectionRange(0, holder.value.length);
    return document.execCommand("copy");
  } catch (_error) {
    return false;
  } finally {
    document.body.removeChild(holder);
  }
}

async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      /* 로컬 파일이나 권한 제한이면 아래 예전 방식으로 넘어간다. */
    }
  }
  return legacyCopyText(text);
}

function showResult(button, title, copied) {
  const previous = resetTimers.get(button);
  if (previous) {
    clearTimeout(previous);
  }

  button.textContent = copied ? "복사됨" : "실패";
  button.classList.toggle("is-success", copied);
  button.classList.toggle("is-error", !copied);

  /* 제목 자체가 「」로 시작하는 책이 있어 바깥에 따옴표를 덧대지 않는다. */
  feedback.textContent = copied
    ? `복사했어요 — ${title} · 판매글에 붙여넣으세요.`
    : "복사하지 못했어요. 제목을 직접 선택해 복사해 주세요.";
  feedback.classList.toggle("error", !copied);

  resetTimers.set(
    button,
    setTimeout(() => {
      button.textContent = "복사";
      button.classList.remove("is-success", "is-error");
      resetTimers.delete(button);
    }, 1600)
  );
}

/* 글자 자체를 누른 경우. 버튼 글자가 곧 내용이므로 텍스트를 바꾸지 않고
   짧게 강조만 하고, 안내는 상단 안내줄에 남긴다. */
function showChipResult(chip, copied) {
  const previous = resetTimers.get(chip);
  if (previous) {
    clearTimeout(previous);
  }

  chip.classList.toggle("is-success", copied);
  chip.classList.toggle("is-error", !copied);

  feedback.textContent = copied
    ? `복사했어요 — ${chip.dataset.copy}`
    : "복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.";
  feedback.classList.toggle("error", !copied);

  resetTimers.set(
    chip,
    setTimeout(() => {
      chip.classList.remove("is-success", "is-error");
      resetTimers.delete(chip);
    }, 1200)
  );
}

document.addEventListener("click", async (event) => {
  const chip = event.target.closest(".copy-text");
  if (chip && chip.dataset.copy) {
    showChipResult(chip, await copyText(chip.dataset.copy));
    return;
  }

  const button = event.target.closest(".copy-button");
  if (!button || button.disabled) {
    return;
  }

  const title = button.dataset.copy;
  if (!title) {
    return;
  }

  showResult(button, title, await copyText(title));
});
