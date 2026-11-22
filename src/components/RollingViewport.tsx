import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Point2, RollingInput, RollingRun } from "../rolling/lab-model";
import { createRollingWebGLView, type RollingCamera } from "../rolling/webgl-view";
import type { Language } from "../types";
import "./RollingViewport.css";

const captions = {
  ru: {
    heading: "Визуализация качения", scene: "Тело качения на плоскости", empty: "Запустите расчёт, чтобы увидеть тело.",
    fallback: "3D недоступно. След и текущая точка контакта показаны на плоскости.",
    orbit: "Перетащите сцену для поворота. Сведите или разведите два пальца для масштаба.",
    camera: "Камера", left: "Повернуть влево", right: "Повернуть вправо", zoomIn: "Приблизить",
    zoomOut: "Отдалить", reset: "Сбросить вид", trace: "Заданный след", recovered: "Прямой расчёт",
    contact: "Точка контакта", plan: "Следы контакта в плоскости",
  },
  uk: {
    heading: "Візуалізація кочення", scene: "Тіло кочення на площині", empty: "Запустіть розрахунок, щоб побачити тіло.",
    fallback: "3D недоступне. Слід і поточну точку контакту показано на площині.",
    orbit: "Перетягніть сцену для обертання. Зведіть або розведіть два пальці для зміни масштабу.",
    camera: "Камера", left: "Повернути ліворуч", right: "Повернути праворуч", zoomIn: "Наблизити",
    zoomOut: "Віддалити", reset: "Скинути вид", trace: "Заданий слід", recovered: "Прямий розрахунок",
    contact: "Точка контакту", plan: "Сліди контакту на площині",
  },
} as const;

const initialCamera: RollingCamera = { azimuth: -1, elevation: 0.64, zoom: 1 };
const minZoom = 0.65;
const maxZoom = 2.4;
type Frame = { run: RollingRun | null; poseIndex: number; camera: RollingCamera; quality: RollingInput["quality"] };
type RollingViewportProps = Pick<Frame, "run" | "poseIndex" | "quality"> & { language: Language };
type ViewMode = "pending" | "webgl" | "2d";

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function rotate(camera: RollingCamera, azimuth: number, elevation = 0): RollingCamera {
  const angle = camera.azimuth + azimuth;
  return {
    ...camera, azimuth: Math.atan2(Math.sin(angle), Math.cos(angle)),
    elevation: clamp(camera.elevation + elevation, 0.12, 1.32),
  };
}

function zoom(camera: RollingCamera, multiplier: number): RollingCamera {
  return { ...camera, zoom: clamp(camera.zoom * multiplier, minZoom, maxZoom) };
}

function contactProjection(run: RollingRun) {
  const [startX, startY] = run.target[0];
  let xmin = startX, ymin = startY, xmax = startX, ymax = startY;
  for (const track of [run.target, run.contacts]) {
    for (const [x, y] of track) {
      xmin = Math.min(xmin, x); ymin = Math.min(ymin, y);
      xmax = Math.max(xmax, x); ymax = Math.max(ymax, y);
    }
  }
  const scale = Math.min(536 / Math.max(xmax - xmin, run.shape.radius * .3),
    300 / Math.max(ymax - ymin, run.shape.radius * .3));
  const map = ([x, y]: Point2): Point2 => [290 + (x - (xmin + xmax) / 2) * scale, 172 - (y - (ymin + ymax) / 2) * scale];
  return {
    target: run.target.map(point => map(point).join(",")).join(" "),
    recovered: run.contacts.map(point => map(point).join(",")).join(" "),
    contacts: run.poses.map(pose => map(pose.target)),
  };
}

export default function RollingViewport({ run, poseIndex, quality, language }: RollingViewportProps) {
  const copy = captions[language];
  const titleId = useId(), hintId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const webgl = useRef<ReturnType<typeof createRollingWebGLView>>(null);
  const [renderer, setRenderer] = useState<ViewMode>("pending");
  const [camera, setCamera] = useState(initialCamera);
  const frame = useRef<Frame>({ run, poseIndex, camera, quality });
  const pointers = useRef(new Map<number, Point2>());
  const index = run ? clamp(poseIndex, 0, run.poses.length - 1) : 0;
  const plane = useMemo(() => run && renderer === "2d" ? contactProjection(run) : null, [run, renderer]);

  const paint = useCallback(() => {
    const view = webgl.current;
    if (!view) return;
    const latest = frame.current;
    try {
      view.render(latest.run, latest.poseIndex, latest.camera, latest.quality);
    } catch {
      view.dispose();
      webgl.current = null;
      setRenderer("2d");
    }
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let active = true;
    function connect() {
      if (!active || !element) return;
      try {
        webgl.current = createRollingWebGLView(element);
      } catch {
        webgl.current = null;
      }
      setRenderer(webgl.current ? "webgl" : "2d");
    }
    function lose(event: Event) {
      event.preventDefault();
      webgl.current = null;
      pointers.current.clear();
      setRenderer("2d");
    }
    const observer = new ResizeObserver(paint);
    observer.observe(element);
    element.addEventListener("webglcontextlost", lose);
    element.addEventListener("webglcontextrestored", connect);
    queueMicrotask(connect);
    return () => {
      active = false;
      observer.disconnect();
      element.removeEventListener("webglcontextlost", lose);
      element.removeEventListener("webglcontextrestored", connect);
      webgl.current?.dispose();
      webgl.current = null;
    };
  }, [paint]);

  useEffect(() => {
    frame.current = { run, poseIndex: index, camera, quality };
    if (renderer === "webgl") paint();
  }, [run, index, camera, quality, renderer, paint]);

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next: Point2 = [event.clientX, event.clientY];
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
        const after = Math.hypot(next[0] - other[0], next[1] - other[1]);
        if (Math.min(before, after) > 4) setCamera(value => zoom(value, after / before));
      }
      return;
    }
    setCamera(value => rotate(value, (previous[0] - next[0]) * 0.009, (next[1] - previous[1]) * 0.009));
  }
  function pointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
  }
  function keyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    switch (event.key) {
      case "ArrowLeft": setCamera(value => rotate(value, -0.2)); break;
      case "ArrowRight": setCamera(value => rotate(value, 0.2)); break;
      case "ArrowUp": setCamera(value => rotate(value, 0, 0.15)); break;
      case "ArrowDown": setCamera(value => rotate(value, 0, -0.15)); break;
      case "+": case "=": setCamera(value => zoom(value, 1.2)); break;
      case "-": setCamera(value => zoom(value, 1 / 1.2)); break;
      case "Home": setCamera(initialCamera); break;
      default: return;
    }
    event.preventDefault();
  }

  const contact = plane?.contacts[index];
  const showWebGL = !!run && renderer === "webgl";
  return (
    <section className="rolling-viewport" aria-labelledby={titleId} data-rolling-view
      data-renderer={renderer} data-camera-zoom={camera.zoom.toFixed(3)}
      data-camera-azimuth={camera.azimuth.toFixed(3)}>
      <h2 id={titleId}>{copy.heading}</h2>
      <div className="rolling-view-frame">
        <canvas ref={canvas} className="rolling-view-canvas" data-rolling-canvas hidden={!showWebGL}
          role="img" tabIndex={showWebGL ? 0 : -1} aria-label={copy.scene} aria-describedby={showWebGL ? hintId : undefined}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyDown} />
        {plane && contact && <svg className="rolling-view-plane" data-rolling-fallback viewBox="0 0 580 344"
          role="img" aria-label={copy.plan}>
          <polyline className="rolling-view-target" points={plane.target} />
          <polyline className="rolling-view-recovered" points={plane.recovered} />
          <circle className="rolling-view-contact" cx={contact[0]} cy={contact[1]} r="5" data-rolling-contact-index={index} />
        </svg>}
        {!run && <p className="rolling-view-empty">{copy.empty}</p>}
      </div>
      {run && <div className="rolling-view-legend">
        <span className="rolling-view-key-target">{copy.trace}</span>
        <span className="rolling-view-key-recovered">{copy.recovered}</span>
        <span className="rolling-view-key-contact">{copy.contact}</span>
      </div>}
      {plane && <p className="rolling-view-note" role="status">{copy.fallback}</p>}
      {showWebGL && <>
        <div className="rolling-view-actions" role="group" aria-label={copy.camera}>
          <button type="button" aria-label={copy.left} title={copy.left}
            onClick={() => setCamera(value => rotate(value, -0.3))}>←</button>
          <button type="button" aria-label={copy.right} title={copy.right}
            onClick={() => setCamera(value => rotate(value, 0.3))}>→</button>
          <button type="button" aria-label={copy.zoomOut} title={copy.zoomOut} disabled={camera.zoom <= minZoom}
            onClick={() => setCamera(value => zoom(value, 1 / 1.2))}>−</button>
          <button type="button" aria-label={copy.zoomIn} title={copy.zoomIn} data-rolling-zoom-in disabled={camera.zoom >= maxZoom}
            onClick={() => setCamera(value => zoom(value, 1.2))}>+</button>
          <button type="button" data-rolling-camera-reset onClick={() => setCamera(initialCamera)}>{copy.reset}</button>
        </div>
        <p className="rolling-view-note" id={hintId}>{copy.orbit}</p>
      </>}
    </section>
  );
}
