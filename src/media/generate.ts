// AI background images with Nano Banana (Gemini API).
// The model only paints the scene: no text, logos or prices. Code adds those on top
// (composeBrandedGraphic), so every word and number on the image is exact.

import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { type Business } from "../db/index.js";

let gemini: GoogleGenAI | undefined;

/** True when a Gemini key is set, so image generation can be tried. */
export const canGenerateImages = () => Boolean(process.env.GEMINI_API_KEY);

function styleBlock(business: Business): string {
  const kit = (business.brand_kit ?? {}) as { colors?: Record<string, string>; style_keywords?: string[] };
  const colors = Object.values(kit.colors ?? {}).join(", ");
  return [
    kit.style_keywords?.length ? `Mood: ${kit.style_keywords.join(", ")}.` : "",
    colors ? `Work these brand colors in subtly where natural: ${colors}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generate a square background photo for a post. Throws if Gemini returns no image
 * (e.g. a safety block); callers fall back to the plain branded graphic.
 */
export async function generateBackground(business: Business, scene: string): Promise<Buffer> {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `A realistic, well-lit photo for a local home-services company's social media post.

Scene: ${scene}

${styleBlock(business)}

Rules:
- No text, letters, numbers, signs, logos or watermarks anywhere in the image.
- No recognizable faces. Don't show company uniforms, branded vehicles or anything that suggests these are the company's own workers or a real job.
- Keep the upper-middle of the frame simple and uncluttered; a headline will be placed there.`;

  const res = await gemini.models.generateContent({
    model: config.imageModelId,
    contents: prompt,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
    },
  });
  for (const part of res.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return Buffer.from(part.inlineData.data, "base64");
  }
  const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? "no image returned";
  throw new Error(`Nano Banana returned no image (${reason})`);
}
