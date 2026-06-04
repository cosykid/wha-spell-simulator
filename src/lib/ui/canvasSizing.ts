import type { StrokeStore } from "../types.js";

interface CanvasSizingElements {
  canvasShell: HTMLElement;
  glyphCanvas: HTMLCanvasElement;
  effectCanvas: HTMLCanvasElement;
}

export function setupCanvasSizing({
  elements,
  store,
  onCanvasResized
}: {
  elements: CanvasSizingElements;
  store: StrokeStore;
  onCanvasResized: () => void;
}): ResizeObserver {
  function syncCanvasSize(): void {
    const rect = elements.canvasShell.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const previousWidth = elements.glyphCanvas.width;
    const previousHeight = elements.glyphCanvas.height;

    if (previousWidth === width && previousHeight === height) {
      return;
    }

    elements.glyphCanvas.width = width;
    elements.glyphCanvas.height = height;
    elements.effectCanvas.width = width;
    elements.effectCanvas.height = height;

    if (store.count() > 0 && previousWidth > 0 && previousHeight > 0) {
      store.scale(width / previousWidth, height / previousHeight);
    }

    onCanvasResized();
  }

  syncCanvasSize();
  const resizeObserver = new ResizeObserver(syncCanvasSize);
  resizeObserver.observe(elements.canvasShell);
  window.addEventListener("orientationchange", syncCanvasSize);
  return resizeObserver;
}
