import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Point = { x: number; y: number };
type View = { scale: number; graph: Point; at: Point };
type Pinch = { distance: number; scale: number; graph: Point };
const minScale = 0.75;
const maxScale = 2.5;
const limit = (scale: number) => Math.min(maxScale, Math.max(minScale, scale));

function localPoint(view: HTMLElement, p: Point): Point {
  const rect = view.getBoundingClientRect();
  return { x: p.x - rect.left - view.clientLeft, y: p.y - rect.top - view.clientTop };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point) {
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

export function useTopologyViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const applied = useRef(1);
  const pending = useRef<View | null>(null);
  const contacts = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);

  const position = useCallback(() => {
    const view = viewportRef.current;
    const change = pending.current;
    if (!view || !change) return;
    view.scrollLeft = change.graph.x * change.scale - change.at.x;
    view.scrollTop = change.graph.y * change.scale - change.at.y;
    pending.current = null;
  }, []);
  useLayoutEffect(() => {
    applied.current = zoom;
    if (pending.current?.scale === zoom) position();
  }, [zoom, position]);

  const graphAt = useCallback((at: Point): Point => {
    const view = viewportRef.current!;
    const request = pending.current;
    if (request) return {
      x: request.graph.x + (at.x - request.at.x) / request.scale,
      y: request.graph.y + (at.y - request.at.y) / request.scale,
    };
    return { x: (view.scrollLeft + at.x) / applied.current, y: (view.scrollTop + at.y) / applied.current };
  }, []);

  const changeView = useCallback((scale: number, at: Point, graph: Point) => {
    const next = limit(scale);
    pending.current = { scale: next, graph, at };
    setZoom(next);
    if (next === applied.current) position();
  }, [position]);

  const zoomBy = useCallback((factor: number, point?: Point) => {
    const view = viewportRef.current;
    if (!view) return;
    const anchor = point ? localPoint(view, point) : { x: view.clientWidth / 2, y: view.clientHeight / 2 };
    changeView((pending.current?.scale ?? applied.current) * factor, anchor, graphAt(anchor));
  }, [changeView, graphAt]);

  useEffect(() => {
    const view = viewportRef.current;
    if (!view) return;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view!.clientHeight : 1;
      const delta = Math.min(360, Math.max(-360, event.deltaY * unit));
      zoomBy(Math.exp(-delta * 0.002), { x: event.clientX, y: event.clientY });
    }
    // The viewport owns board drags. Suppress the browser's compatibility
    // gesture only during a captured pan/pinch, leaving button taps native.
    function touchMove(event: TouchEvent) {
      if (contacts.current.size && event.cancelable) event.preventDefault();
    }
    view.addEventListener("wheel", wheel, { passive: false });
    view.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      view.removeEventListener("wheel", wheel);
      view.removeEventListener("touchmove", touchMove);
    };
  }, [zoomBy]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const pointers = contacts.current;
    if (event.button !== 0 || pointers.size === 2) return;
    if (event.target instanceof Element && event.target.closest("button,input,select,a,textarea")) return;
    const view = event.currentTarget;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    view.setPointerCapture(event.pointerId);
    view.focus({ preventScroll: true });
    view.dataset.panning = "true";
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const at = localPoint(view, midpoint(a, b));
      pinch.current = { distance: distance(a, b), scale: pending.current?.scale ?? applied.current, graph: graphAt(at) };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pointers = contacts.current;
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const after = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, after);
    const view = event.currentTarget;
    const gesture = pinch.current;
    if (gesture && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      changeView(gesture.scale * distance(a, b) / gesture.distance, localPoint(view, midpoint(a, b)), gesture.graph);
    } else {
      view.scrollLeft -= after.x - before.x;
      view.scrollTop -= after.y - before.y;
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    const pointers = contacts.current;
    if (!pointers.delete(event.pointerId)) return;
    pinch.current = null;
    if (!pointers.size) delete event.currentTarget.dataset.panning;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey) return;
    const view = event.currentTarget;
    const amount = event.shiftKey ? 128 : 40;
    switch (event.key) {
      case "ArrowLeft": view.scrollLeft -= amount; break;
      case "ArrowRight": view.scrollLeft += amount; break;
      case "ArrowUp": view.scrollTop -= amount; break;
      case "ArrowDown": view.scrollTop += amount; break;
      default: return;
    }
    event.preventDefault();
  }

  const resetZoom = useCallback(() => changeView(1, { x: 0, y: 0 }, { x: 0, y: 0 }), [changeView]);

  return {
    viewportRef,
    zoom,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
    resetZoom,
    viewportEvents: {
      onKeyDown, onPointerDown, onPointerMove,
      onPointerUp: finishPointer, onPointerCancel: finishPointer, onLostPointerCapture: finishPointer,
    },
  };
}
