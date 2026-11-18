// Local API server for development: npm run api  (http://localhost:8787/api/...)
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { authEnabled } from "./auth.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  const mode = authEnabled
    ? `login required (Cognito pool ${process.env.USER_POOL_ID})`
    : `login OFF, every request acts as ${process.env.DEV_BUSINESS_ID ?? "biz_demo_brightside"}`;
  console.log(`1Market API on http://localhost:${port}/api (${mode})`);
});
