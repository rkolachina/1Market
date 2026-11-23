// Try the image pipeline without the agent: Nano Banana background + code-drawn headline/logo.
//
//   npm run image:test -- "two-story suburban house, autumn leaves, sunny" "Fall Gutter Cleaning"
//
// Writes out/background.png (raw Nano Banana output) and out/post.jpg (final image).

import { mkdirSync, writeFileSync } from "node:fs";
import { getBusiness } from "../src/db/index.js";
import { composeBrandedGraphic } from "../src/media/compose.js";
import { generateBackground } from "../src/media/generate.js";

const [scene = "a two-story suburban house with clean gutters, autumn leaves on the lawn, sunny afternoon", headline = "Fall Gutter Cleaning"] =
  process.argv.slice(2);
const business = (await getBusiness("biz_demo_brightside"))!;

const t = Date.now();
const background = await generateBackground(business, scene);
const secs = ((Date.now() - t) / 1000).toFixed(1);
const post = await composeBrandedGraphic(business, headline, background);

mkdirSync("out", { recursive: true });
writeFileSync("out/background.png", background);
writeFileSync("out/post.jpg", post);
console.log(`Nano Banana: ${secs}s. Wrote out/background.png and out/post.jpg`);
