import { renderJsonTree } from "./jsonTreeRenderer.js";

export function writeJson(element: HTMLElement | null | undefined, value: unknown): void {
  if (!element) {
    return;
  }

  const jsonText = JSON.stringify(value, null, 2);
  element.dataset.rawJson = jsonText;
  element.classList.add("diagnostic-json");
  element.replaceChildren(renderJsonTree(value));
}
