// Branded images built with code (exact text, real logo — never AI-rendered text).
// The background is either the brand color or a Nano Banana photo (generate.ts).

import sharp, { type OverlayOptions } from "sharp";
import { type Business } from "../db/index.js";
import { getMedia } from "./index.js";

const SIZE = 1080; // square works for Facebook and Instagram feeds

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Split a headline into at most 3 lines of ~16 chars. */
function wrap(text: string, max = 16): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function brand(business: Business) {
  const kit = (business.brand_kit ?? {}) as { colors?: Record<string, string>; logo_key?: string };
  const profile = (business.profile ?? {}) as { phone?: string; website?: string };
  return {
    primary: kit.colors?.primary ?? "#222222",
    accent: kit.colors?.accent ?? "#FFFFFF",
    logoKey: kit.logo_key,
    footer: [profile.phone, profile.website?.replace(/^https?:\/\//, "")].filter(Boolean).join("  •  "),
  };
}

async function logoBuffer(business: Business, size: number): Promise<Buffer | undefined> {
  const { logoKey } = brand(business);
  if (!logoKey) return undefined;
  const raw = await getMedia(business.business_id, logoKey);
  return sharp(raw).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/**
 * Promo/announcement graphic: exact headline, logo, contact footer. The background is
 * the brand color, or the given photo (e.g. from Nano Banana) under a brand-color tint
 * so the headline stays readable.
 */
export async function composeBrandedGraphic(business: Business, headline: string, background?: Buffer): Promise<Buffer> {
  const b = brand(business);
  const lines = wrap(headline || business.name);
  const fontSize = lines.length > 2 ? 104 : 120;
  const startY = 470 - ((lines.length - 1) * fontSize * 1.1) / 2;
  const text = lines
    .map(
      (l, i) =>
        `<text x="540" y="${startY + i * fontSize * 1.1}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#FFFFFF">${esc(l)}</text>`,
    )
    .join("");
  // Over a photo: a lighter tint, strongest behind the headline, so the photo shows through.
  const stops = background
    ? `<stop offset="0" stop-color="${b.primary}" stop-opacity="0.55"/><stop offset="0.45" stop-color="${b.primary}" stop-opacity="0.65"/><stop offset="0.8" stop-color="${b.primary}" stop-opacity="0.15"/>`
    : `<stop offset="0" stop-color="${b.primary}"/><stop offset="1" stop-color="${b.primary}" stop-opacity="0.85"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
    <rect x="390" y="${startY + lines.length * fontSize * 1.1 - 40}" width="300" height="12" rx="6" fill="${b.accent}"/>
    ${text}
    <rect y="900" width="${SIZE}" height="180" fill="#FFFFFF"/>
    <text x="60" y="1000" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="600" fill="${b.primary}">${esc(b.footer)}</text>
  </svg>`;
  const layers: OverlayOptions[] = [];
  const logo = await logoBuffer(business, 150);
  if (logo) layers.push({ input: logo, top: 915, left: SIZE - 150 - 50 });
  if (!background) return sharp(Buffer.from(svg)).composite(layers).jpeg({ quality: 90 }).toBuffer();
  const photo = await sharp(background).resize(SIZE, SIZE, { fit: "cover" }).toBuffer();
  return sharp(photo)
    .composite([{ input: Buffer.from(svg) }, ...layers])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Owner photo: square crop, small logo badge in the corner. */
export async function brandOwnerPhoto(business: Business, photo: Buffer): Promise<Buffer> {
  const base = await sharp(photo).rotate().resize(SIZE, SIZE, { fit: "cover" }).toBuffer();
  const logo = await logoBuffer(business, 170);
  const layers: OverlayOptions[] = logo ? [{ input: logo, top: SIZE - 170 - 40, left: SIZE - 170 - 40 }] : [];
  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
}
