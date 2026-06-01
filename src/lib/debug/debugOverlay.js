import { renderJsonTree } from "./jsonTreeRenderer.js";

export function writeJson(element, value) {
  if (!element) {
    return;
  }

  const jsonText = JSON.stringify(value, null, 2);
  element.dataset.rawJson = jsonText;
  element.classList.add("diagnostic-json");
  element.replaceChildren(renderJsonTree(value));
}
