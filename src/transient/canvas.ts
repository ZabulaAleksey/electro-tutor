type PlotOptions = { title: string; unit: string; color: string; zero: string; grid: string; ink: string };

/** Presentation only: the solver's Float64Array is never changed or retained here. */
export function drawSpatial(canvas: HTMLCanvasElement, values: Float64Array, options: PlotOptions): void {
  const width = Math.max(320, Math.round(canvas.getBoundingClientRect().width));
  const height = 220;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const left = 49, right = width - 17, top = 24, bottom = height - 31;
  let low = 0, high = 0;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const span = Math.max(1e-9, high - low);
  low -= span * 0.12;
  high += span * 0.12;
  if (high - low < 0.2) { low -= 0.1; high += 0.1; }
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  context.lineWidth = 1;
  context.strokeStyle = options.grid;
  context.fillStyle = options.ink;
  context.font = "12px system-ui, sans-serif";
  for (let index = 0; index <= 4; index++) {
    const value = low + (high - low) * index / 4;
    const py = y(value);
    context.beginPath();
    context.moveTo(left, py);
    context.lineTo(right, py);
    context.stroke();
    context.fillText(Number(value.toPrecision(3)).toString(), 3, py + 4);
  }
  context.strokeStyle = options.zero;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(left, y(0));
  context.lineTo(right, y(0));
  context.stroke();
  context.fillStyle = options.ink;
  context.fillText(options.title, left, 15);
  context.fillText(`0 ${options.unit}`, left, height - 8);
  context.fillText("x = l", right - 33, height - 8);

  if (values.length < 2) return;
  context.strokeStyle = options.color;
  context.lineWidth = 2.5;
  context.lineJoin = "round";
  context.beginPath();
  for (let index = 0; index < values.length; index++) {
    const px = left + (right - left) * index / (values.length - 1);
    const py = y(values[index]);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();
}
