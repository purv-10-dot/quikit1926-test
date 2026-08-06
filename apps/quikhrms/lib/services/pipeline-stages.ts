type StageMailTemplate =
  | "interview"
  | "offer-branded"
  | "offer-default"
  | "welcome"
  | "joining-letter"
  | null;

function canStageHaveMail(stageName: string): boolean {
  return /interview|phonescreen|assessment|finalround|offer|hired|joining/i.test(stageName);
}

export interface StageConfig {
  name: string;
  sendMail: boolean;
  mailTemplate: StageMailTemplate;
}

function inferDefaultTemplate(stageName: string): StageMailTemplate {
  if (/interview|phonescreen|assessment|finalround/i.test(stageName)) return "interview";
  if (/offer/i.test(stageName)) return "offer-branded";
  if (/joining/i.test(stageName)) return "joining-letter";
  if (/hired/i.test(stageName)) return "welcome";
  return null;
}

export function normalizeStages(raw: unknown): StageConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    let name: string;
    let sendMail = false;
    let mailTemplate: StageMailTemplate = null;
    if (typeof s === "string") {
      name = s;
      mailTemplate = inferDefaultTemplate(s);
    } else if (s && typeof s === "object" && "name" in s) {
      const o = s as Record<string, unknown>;
      name = String(o.name);
      sendMail = Boolean(o.sendMail);
      mailTemplate = (o.mailTemplate as StageMailTemplate) ?? inferDefaultTemplate(name);
    } else {
      name = String(s);
      mailTemplate = inferDefaultTemplate(name);
    }
    // Force off if stage name doesn't match a supported mail category.
    if (!canStageHaveMail(name)) {
      sendMail = false;
      mailTemplate = null;
    }
    return { name, sendMail, mailTemplate };
  });
}

export function stageNames(raw: unknown): string[] {
  return normalizeStages(raw).map((s) => s.name);
}

export function getStageConfig(stages: unknown, name: string): StageConfig | null {
  return normalizeStages(stages).find((s) => s.name === name) ?? null;
}

const REQUIRED_STAGES = ["Screening", "PhoneScreen", "HRInterview", "Offer", "Hired"] as const;

/** Ensure required stages exist — insert any missing at sensible positions. */
export function ensureRequiredStages(stages: StageConfig[]): StageConfig[] {
  const next = [...stages];
  for (const req of REQUIRED_STAGES) {
    if (next.some((s) => s.name.toLowerCase() === req.toLowerCase())) continue;
    const cfg: StageConfig = { name: req, sendMail: false, mailTemplate: inferDefaultTemplate(req) };
    if (req === "Screening") {
      next.unshift(cfg);
    } else if (req === "PhoneScreen") {
      // Phone Screen comes right after Source (Screening), before any other round.
      const screeningIdx = next.findIndex((s) => s.name.toLowerCase() === "screening");
      if (screeningIdx >= 0) next.splice(screeningIdx + 1, 0, cfg);
      else next.unshift(cfg);
    } else if (req === "HRInterview") {
      // HR Interview is the last interview round — keep it just before Offer/Hired.
      const offerIdx = next.findIndex((s) => /^(offer|hired)$/i.test(s.name));
      if (offerIdx >= 0) next.splice(offerIdx, 0, cfg);
      else next.push(cfg);
    } else {
      next.push(cfg);
    }
  }
  return next;
}
