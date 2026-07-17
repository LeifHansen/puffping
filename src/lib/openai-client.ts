import OpenAI from "openai";

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Vision-capable model used for image analysis + copy assistance.
export const OPENAI_VISION_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
