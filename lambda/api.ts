// API Lambda: the same Hono app as local dev, behind API Gateway (HTTP API) and CloudFront.
import { handle } from "hono/aws-lambda";
import { app } from "../api/app.js";

export const handler = handle(app);
