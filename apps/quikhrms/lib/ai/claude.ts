import Anthropic from "@anthropic-ai/sdk";

const API_KEY = process.env.ANTHROPIC_API_KEY;

export const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
