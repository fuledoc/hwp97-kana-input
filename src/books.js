/* 책 목록 페이지: 글자를 눌러 항목별로 복사한다.
   알라딘 상품 등록 화면의 칸에 하나씩 붙여넣는 용도라 항목을 나눠 둔다.
   입력기 본체(app.js)와 상태를 공유하지 않는 독립 스크립트다. */

const TOAST_MS = 1100;
let toastEl = null;
let toastTimer = 0;

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

/* 누른 자리 바로 위에 잠깐 띄운다. 화면 위쪽 안내줄에만 적으면
   목록을 내려 보는 중에는 보이지 않아 복사됐는지 알 수 없다. */
function showToast(chip, copied) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "copy-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = copied ? "복사됨" : "복사 실패";
  toastEl.classList.toggle("is-error", !copied);

  /* 먼저 보이게 해야 크기를 잴 수 있다. */
  toastEl.classList.add("is-on");

  const box = chip.getBoundingClientRect();
  const size = toastEl.getBoundingClientRect();
  const gap = 8;
  let left = box.left + box.width / 2 - size.width / 2;
  left = Math.max(gap, Math.min(left, window.innerWidth - size.width - gap));
  let top = box.top - size.height - gap;
  if (top < gap) {
    top = box.bottom + gap; /* 화면 맨 위 항목이면 아래쪽에 띄운다 */
  }
  toastEl.style.left = `${Math.round(left)}px`;
  toastEl.style.top = `${Math.round(top)}px`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-on");
  }, TOAST_MS);
}

function flashChip(chip, copied) {
  chip.classList.remove("is-success", "is-error");
  /* 연속으로 같은 글자를 눌러도 다시 깜빡이도록 재적용을 강제한다. */
  void chip.offsetWidth;
  chip.classList.add(copied ? "is-success" : "is-error");
  setTimeout(() => chip.classList.remove("is-success", "is-error"), TOAST_MS);
}

document.addEventListener("click", async (event) => {
  const chip = event.target.closest(".copy-text");
  if (!chip || !chip.dataset.copy) {
    return;
  }

  const copied = await copyText(chip.dataset.copy);
  flashChip(chip, copied);
  showToast(chip, copied);
});
