/**
 * Chart images for the recruiter-report Excel export — drawn straight from
 * data onto a <canvas>, not screenshotted from the live on-screen chart.
 *
 * An earlier version cloned the rendered recharts <svg> and rasterized it via
 * an Image element; that depended on the DOM element's live layout size at
 * click time and produced a near-invisible image whenever that came back 0
 * (or otherwise unstable). Drawing directly from the same data the on-screen
 * chart uses has a fixed, known canvas size every time — no DOM dependency,
 * no timing window to get wrong.
 */

export interface ChartDatum {
  name: string;
  value: number;
}

interface ChartResult {
  dataUrl: string;
  width: number;
  height: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeCanvas(width: number, height: number, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

export function drawBarChartPng(data: ChartDatum[], opts: { width?: number; height?: number; color?: string; scale?: number } = {}): ChartResult {
  const width = opts.width ?? 460;
  const rowHeight = 32;
  const height = opts.height ?? Math.max(80, data.length * rowHeight + 20);
  const scale = opts.scale ?? 2;
  const color = opts.color ?? "#8b5cf6";
  const { canvas, ctx } = makeCanvas(width, height, scale);

  const padding = { top: 10, right: 40, left: 170 };
  const chartW = width - padding.left - padding.right;
  const max = Math.max(1, ...data.map((d) => d.value));

  ctx.textBaseline = "middle";
  data.forEach((d, i) => {
    const y = padding.top + i * rowHeight + rowHeight / 2;
    const barH = 18;

    ctx.fillStyle = "#374151";
    ctx.textAlign = "right";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText(d.name, padding.left - 8, y);

    const w = Math.max(2, (d.value / max) * chartW);
    ctx.fillStyle = color;
    roundRect(ctx, padding.left, y - barH / 2, w, barH, 3);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.font = "bold 11px Arial, sans-serif";
    ctx.fillText(String(d.value), padding.left + w + 6, y);
  });

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

export function drawMultiLineChartPng(
  data: Array<{ name: string; [k: string]: number | string }>,
  series: { key: string; label: string; color: string }[],
  opts: { width?: number; height?: number; scale?: number } = {},
): ChartResult {
  const width = opts.width ?? 560;
  const height = opts.height ?? 220;
  const scale = opts.scale ?? 2;
  const { canvas, ctx } = makeCanvas(width, height, scale);

  const padding = { top: 14, right: 16, bottom: 34, left: 32 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;
  const yFor = (v: number) => padding.top + chartH - (v / max) * chartH;
  const xFor = (i: number) => padding.left + i * stepX;

  // gridlines + y-axis labels (0, mid, max)
  ctx.strokeStyle = "#f1f5f9";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  [0, 0.5, 1].forEach((frac) => {
    const y = padding.top + chartH - frac * chartH;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
    ctx.fillText(String(Math.round(max * frac)), padding.left - 6, y);
  });

  // x-axis labels — thin out if too many points to stay legible
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  data.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== data.length - 1) return;
    ctx.fillText(String(d.name), xFor(i), height - padding.bottom + 8);
  });

  // one polyline per series
  series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = xFor(i);
      const y = yFor(Number(d[s.key]) || 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = s.color;
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(xFor(i), yFor(Number(d[s.key]) || 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // legend, top-right, wrapping under the title row
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "10px Arial, sans-serif";
  let lx = padding.left;
  const ly = 6;
  series.forEach((s) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, ly - 4, 9, 9);
    ctx.fillStyle = "#374151";
    ctx.fillText(s.label, lx + 13, ly);
    lx += ctx.measureText(s.label).width + 30;
  });

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

export function drawDonutChartPng(data: ChartDatum[], opts: { width?: number; height?: number; colors?: string[]; scale?: number } = {}): ChartResult {
  const height = opts.height ?? 200;
  const width = opts.width ?? height + 160;
  const scale = opts.scale ?? 2;
  const colors = opts.colors ?? ["#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#ec4899"];
  const { canvas, ctx } = makeCanvas(width, height, scale);

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = height / 2;
  const cy = height / 2;
  const rOuter = Math.min(cx, cy) - 14;
  const rInner = rOuter * 0.58;

  let angle = -Math.PI / 2;
  data.forEach((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    angle += slice;
  });
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "11px Arial, sans-serif";
  const lx = height + 8;
  let ly = 16;
  data.forEach((d, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, ly - 5, 10, 10);
    ctx.fillStyle = "#374151";
    ctx.fillText(`${d.name} (${d.value})`, lx + 16, ly);
    ly += 20;
  });

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}
