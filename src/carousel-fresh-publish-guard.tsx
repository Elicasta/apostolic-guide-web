"use client";

import { useEffect } from "react";

function buttonByLabel(root: HTMLElement, label: string) {
  return [...root.querySelectorAll<HTMLButtonElement>(".creative-head-actions button")]
    .find((button) => button.textContent?.trim().toLowerCase().includes(label.toLowerCase())) ?? null;
}

async function waitForRender(root: HTMLElement, renderButton: HTMLButtonElement) {
  const started = Date.now();
  let sawBusy = renderButton.disabled || /rendering/i.test(renderButton.textContent || "");
  while (Date.now() - started < 120_000) {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const saveError = root.querySelector<HTMLElement>(".creative-save-state.is-error");
    if (saveError) throw new Error(saveError.textContent?.trim() || "Render failed.");
    const busy = renderButton.disabled || /rendering/i.test(renderButton.textContent || "");
    if (busy) sawBusy = true;
    if (sawBusy && !busy && /render/i.test(renderButton.textContent || "")) return;
  }
  throw new Error("The fresh publish render timed out. Try Render once, then Publish again.");
}

export function CarouselFreshPublishGuard({ projectId }: { projectId: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    if (!root) return;
    const publishButton = buttonByLabel(root, "Publish");
    if (!publishButton) return;

    let running = false;
    const onPublish = async (event: MouseEvent) => {
      if (running) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      const renderButton = buttonByLabel(root, "Render");
      if (!renderButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      running = true;
      publishButton.disabled = true;
      const originalLabel = publishButton.textContent || "Publish";
      publishButton.dataset.freshPublish = "working";
      publishButton.setAttribute("aria-busy", "true");
      publishButton.textContent = "Refreshing preview…";

      try {
        renderButton.click();
        await waitForRender(root, renderButton);
        window.location.assign(`/admin/publishing?projectId=${encodeURIComponent(projectId)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Fresh render failed.";
        publishButton.title = message;
        publishButton.textContent = "Render failed · tap again";
        window.setTimeout(() => {
          publishButton.textContent = originalLabel;
          publishButton.disabled = false;
          publishButton.removeAttribute("aria-busy");
          delete publishButton.dataset.freshPublish;
          running = false;
        }, 1800);
        return;
      }
    };

    publishButton.addEventListener("click", onPublish);
    return () => publishButton.removeEventListener("click", onPublish);
  }, [projectId]);

  return null;
}
