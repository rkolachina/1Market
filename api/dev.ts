// Local API server for development: npm run api  (http://localhost:8787/api/...)
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`1Market API on http://localhost:${port}/api (dev auth: ${process.env.DEV_BUSINESS_ID ?? "biz_demo_brightside"})`);
});
