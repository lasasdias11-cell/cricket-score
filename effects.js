let modalResolver;
let modalReturnFocus;
let modalKeyHandler;

export function initRippleSystem() {
  const layer = document.getElementById("ripple-layer");
  if (!layer) throw new Error("Ripple layer is missing.");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const isInteractive = target.closest("[data-ripple], button, .btn, .run-btn, .nav-btn, .mode-option, .theme-card, .prow, .innings-tab, .team-chip, .card, .glass-card, .icon");
    const isEmptyBackground = target === document.body || target.matches(".bg, .content, section:empty, #app");
    if (!isInteractive && !isEmptyBackground) return;

    const ripple = document.createElement("span");
    ripple.className = "ripple tc-water-wave";
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    layer.append(ripple);
    if (reducedMotion.matches) {
      requestAnimationFrame(() => ripple.remove());
    } else {
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    }
  }, { passive: true });
}

export function attachRippleEffect() {
  initRippleSystem();
}

function finishModal(result) {
  const modal = document.getElementById("glass-modal");
  if (!modal || !modalResolver) return;
  const resolve = modalResolver;
  modalResolver = undefined;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.replaceChildren();
  if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
  modalKeyHandler = undefined;
  resolve(result);
  modalReturnFocus?.focus?.();
  modalReturnFocus = undefined;
}

export function closeGlassModal(result = "close") {
  finishModal(result);
}

export function openGlassModal({ title, body = "", actions = [] }) {
  const modal = document.getElementById("glass-modal");
  if (!modal) return Promise.reject(new Error("Glass modal container is missing."));
  if (modalResolver) finishModal("replaced");
  modalReturnFocus = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "glass-modal__backdrop";
  backdrop.addEventListener("click", () => finishModal("backdrop"));
  const panel = document.createElement("section");
  panel.className = "glass-modal__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "glass-modal-title");

  const header = document.createElement("div");
  header.className = "glass-modal__header";
  const heading = document.createElement("h2");
  heading.id = "glass-modal-title";
  heading.textContent = String(title ?? "Thursday Cricket");
  const close = document.createElement("button");
  close.className = "glass-modal__close";
  close.type = "button";
  close.setAttribute("aria-label", "Close dialog");
  close.textContent = "×";
  close.addEventListener("click", () => finishModal("close"));
  header.append(heading, close);

  const content = document.createElement("div");
  content.className = "glass-modal__body";
  if (body instanceof Node) content.append(body);
  else content.innerHTML = String(body);

  const actionBar = document.createElement("div");
  actionBar.className = "glass-modal__actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = `glass-modal__action${action.primary ? " is-primary" : ""}`;
    button.type = "button";
    button.textContent = String(action.label ?? action.id);
    button.addEventListener("click", async () => {
      try {
        if (typeof action.onClick === "function") {
          const shouldClose = await action.onClick();
          if (shouldClose === false) return;
        }
        finishModal(action.id);
      } catch (error) {
        let errorMessage = content.querySelector("[data-modal-error]");
        if (!errorMessage) {
          errorMessage = document.createElement("p");
          errorMessage.dataset.modalError = "true";
          errorMessage.className = "inline-error";
          errorMessage.setAttribute("role", "alert");
          content.append(errorMessage);
        }
        errorMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    actionBar.append(button);
  }
  panel.append(header, content, actionBar);
  modal.replaceChildren(backdrop, panel);
  modalResolver = undefined;
  const resultPromise = new Promise((resolve) => { modalResolver = resolve; });
  modalKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishModal("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", modalKeyHandler);
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    modal.classList.add("is-open");
    (panel.querySelector("button") ?? panel).focus();
  });
  return resultPromise;
}
