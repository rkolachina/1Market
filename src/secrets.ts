// Deployed Lambdas keep API keys in one Secrets Manager secret (JSON: { "ANTHROPIC_API_KEY": ..., "GEMINI_API_KEY": ... }),
// named by API_KEYS_SECRET. This copies them into process.env once per cold start, so the
// rest of the code reads keys the same way it does locally (from .env).

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { config } from "./config.js";

let loaded: Promise<void> | undefined;

export function loadApiKeys(): Promise<void> {
  loaded ??= (async () => {
    const secretId = process.env.API_KEYS_SECRET;
    if (!secretId) return;
    const client = new SecretsManagerClient({ region: config.region });
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    let values: Record<string, unknown> = {};
    try {
      values = JSON.parse(res.SecretString ?? "{}");
    } catch {
      throw new Error(`${secretId} must be a JSON object of API keys`);
    }
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "string" && v && !process.env[k]) process.env[k] = v;
    }
  })();
  return loaded;
}
