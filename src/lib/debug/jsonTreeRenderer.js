export function renderJsonTree(value, key = null) {
  const row = document.createElement("div");
  row.className = "json-row";

  if (value && typeof value === "object") {
    const isArray = Array.isArray(value);
    const entries = Object.entries(value);
    const details = document.createElement("details");
    details.className = "json-node";
    details.open = true;

    const summary = document.createElement("summary");
    summary.className = "json-summary";
    if (key !== null) {
      summary.append(createKey(key), document.createTextNode(": "));
    }
    summary.append(createPunctuation(isArray ? "[" : "{"));
    summary.append(createMeta(entries.length));
    summary.append(createPunctuation(isArray ? "]" : "}"));
    details.append(summary);

    const children = document.createElement("div");
    children.className = "json-children";
    entries.forEach(([childKey, childValue]) => {
      children.append(renderJsonTree(childValue, childKey));
    });
    details.append(children);
    row.append(details);
    return row;
  }

  if (key !== null) {
    row.append(createKey(key), document.createTextNode(": "));
  }
  row.append(createScalar(value));
  return row;
}

function createKey(key) {
  const span = document.createElement("span");
  span.className = "json-key";
  span.textContent = JSON.stringify(key);
  return span;
}

function createPunctuation(value) {
  const span = document.createElement("span");
  span.className = "json-punctuation";
  span.textContent = value;
  return span;
}

function createMeta(count) {
  const span = document.createElement("span");
  span.className = "json-meta";
  span.textContent = count === 0 ? " empty " : ` ${count} ${count === 1 ? "item" : "items"} `;
  return span;
}

function createScalar(value) {
  const span = document.createElement("span");
  const type = value === null ? "null" : typeof value;
  span.className = `json-value json-${type}`;
  span.textContent = type === "undefined" ? "undefined" : JSON.stringify(value);
  return span;
}
