"use client";

import { useEffect, useRef, useState } from "react";
import CircularGallery from "./CircularGallery";

const AGENTS = [
  { name: "KPI Summary", desc: "Trends, best and worst weeks across your KPIs, plus the next step." },
  { name: "KPI Insight", desc: "TL;DR and key insights on each person's weekly KPIs vs target." },
  { name: "KPIs at Risk", desc: "Flags the red and amber numbers slipping before they cost the quarter." },
  { name: "Priority Next Action", desc: "The next move on each Rock so behind-schedule priorities don't stall." },
  { name: "Priority Health", desc: "A week-by-week read on whether your 3–5 Rocks are on track." },
  { name: "Accountability Check", desc: "Who owns what, and where commitments are slipping on the team." },
  { name: "Item Insight", desc: "Reads your WWW list and highlights overdue or stuck action items." },
  { name: "OPSP Summary", desc: "A plain-language digest of your One-Page Strategic Plan." },
  { name: "BHAG Progress Check", desc: "How far you've moved toward your Big Hairy Audacious Goal." },
  { name: "Rocks Health Check", desc: "Aggregates Rock status to show which priorities are at risk." },
  { name: "Strategy Gap Analysis", desc: "Compares targets vs achieved on the OPSP and flags the gaps." },
  { name: "BHAG Trajectory", desc: "Whether your current pace puts the long-range goal in reach." },
  { name: "Member 360°", desc: "One person's full picture — KPIs, priorities, feedback and reviews." },
  { name: "Team Health", desc: "Rolls member KPIs and priorities into one team health read." },
  { name: "Feedback Summary", desc: "Peer and manager feedback grouped into recognition and themes." },
  { name: "Values Stories", desc: "Moments that show your Core Values lived out across the company." },
  { name: "Goals Health", desc: "Tracks review-cycle goals and flags which are off pace." },
  { name: "Goal Insight", desc: "What's driving each goal and the next step to close it." },
  { name: "Executive Summary", desc: "A CEO-level recap of the quarter — KPIs, priorities and rhythm." },
  { name: "Bottleneck Analysis", desc: "Pinpoints the constraints and overloaded owners slowing execution." },
  { name: "Momentum Report", desc: "Whether the business is speeding up or stalling quarter on quarter." },
  { name: "Daily Huddle Summary", desc: "Recaps the daily huddle — attendance, blockers and focus." },
  { name: "Weekly Meeting Summary", desc: "Digests the weekly agenda — gaps, WWW and feedback — into actions." },
  { name: "Meeting Dashboard Brief", desc: "Meeting-health across teams and clients, at a glance." },
  { name: "Engagement Drama Check", desc: "Scans 1:1 mood and feedback for early signs of friction." },
  { name: "1:1 Prep Notes", desc: "Auto-builds talking points and actions before each check-in." },
  { name: "SOP Generator", desc: "Turns a core process into a documented, owned procedure." },
  { name: "Create Action Item", desc: "Captures a who-what-when into your WWW list from the conversation." },
];

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makeCard(title: string, desc: string, index: number): string {
  const w = 760;
  const h = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const radius = 56;
  const padX = 72;

  // Card background — deep purple gradient
  const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
  grad.addColorStop(0, "#3c2c63");
  grad.addColorStop(1, "#241a3f");
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner hairline border
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, 10, 10, w - 20, h - 20, radius - 8);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Eyebrow
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "600 30px Inter, system-ui, sans-serif";
  ctx.fillText("AI AGENT", padX, 130);

  // Accent divider
  ctx.strokeStyle = "rgba(160,130,230,0.6)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(padX, 162);
  ctx.lineTo(padX + 96, 162);
  ctx.stroke();

  // Big faint index number — watermark
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font = "700 170px Georgia, 'Times New Roman', serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(index).padStart(2, "0"), padX, 360);

  // Title — left-aligned, wrapped
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 72px Inter, system-ui, sans-serif";
  const titleLines = wrapLines(ctx, title, w - padX * 2);
  const titleLineH = 86;
  const y = 460;
  titleLines.forEach((l, i) => ctx.fillText(l, padX, y + i * titleLineH));

  // Description — left-aligned, bottom-anchored to the card
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = "400 34px Inter, system-ui, sans-serif";
  const descLines = wrapLines(ctx, desc, w - padX * 2);
  const descLineH = 48;
  const descBottomPad = 90;
  const descStartY = h - descBottomPad - (descLines.length - 1) * descLineH;
  descLines.forEach((l, i) => ctx.fillText(l, padX, descStartY + i * descLineH));

  return canvas.toDataURL();
}

export default function AIAgents() {
  const [items, setItems] = useState<{ image: string; text: string }[]>([]);
  const sectionRef = useRef<HTMLElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const build = () => {
      if (cancelled) return;
      setItems(
        AGENTS.map((a, i) => ({ image: makeCard(a.name, a.desc, i + 1), text: "" })),
      );
    };
    // Wait for Inter to be ready so the cards render with the right font
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    } else {
      build();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Drive the gallery from page scroll while the section is pinned
  useEffect(() => {
    if (items.length === 0) return;
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      const app = appRef.current;
      if (!app || !app.medias || !app.medias[0]) return;
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = Math.min(
        1,
        Math.max(0, -section.getBoundingClientRect().top / scrollable),
      );
      const span = app.medias[0].width * (AGENTS.length - 1);
      app.scroll.target = progress * span;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  return (
    <section
      id="ai-agents"
      className="surface-card agent-gallery-section"
      ref={sectionRef}
    >
      <div className="agent-gallery-pin">
        <div className="agent-gallery-head">
          <p className="roll-headline">
            <span className="roll-line-soft">Your whole business,</span>
            <span className="roll-line-soft">
              <span className="roll-line-em serif-bold">AI-reviewed</span> every week.
            </span>
          </p>
          <p className="roll-caption">28 agents. Zero setup. Zero extra cost.</p>
        </div>

        <div className="agent-gallery-stage">
          {items.length > 0 && (
            <CircularGallery
              items={items}
              bend={3}
              textColor="#ffffff"
              borderRadius={0.05}
              scrollSpeed={2.6}
              scrollEase={0.12}
              disableInteraction
              loop={false}
              appRef={appRef}
            />
          )}
        </div>
      </div>
    </section>
  );
}
