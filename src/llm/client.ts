// Claude on Amazon Bedrock via the Converse API (the same API Strands uses).
// One helper: ask for JSON matching a Zod schema, validated on the way back.

import {
  BedrockRuntimeClient,
  type ContentBlock,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { config } from "../config.js";

export const COPY_MODEL = process.env.COPY_MODEL_ID ?? "global.anthropic.claude-sonnet-5-5";
const FALLBACK_MODEL = process.env.COPY_FALLBACK_MODEL_ID ?? "global.anthropic.claude-sonnet-5";

const bedrock = new BedrockRuntimeClient({ region: config.region });

export type ChatTurn = { role: "user" | "assistant"; text: string };

export interface JsonResult<T> {
  /** Parsed and validated output, or undefined if the model declined / returned invalid JSON. */
  data?: T;
  stopReason?: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

async function callOnce<T>(
  modelId: string,
  schema: z.ZodType<T>,
  schemaName: string,
  system: string,
  turns: ChatTurn[],
  effort: string,
): Promise<JsonResult<T>> {
  const messages: Message[] = turns.map((t) => ({
    role: t.role,
    content: [{ text: t.text } as ContentBlock],
  }));
  const res = await bedrock.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages,
      inferenceConfig: { maxTokens: 16000 },
      outputConfig: {
        effort,
        textFormat: {
          type: "json_schema",
          structure: { jsonSchema: { name: schemaName, schema: JSON.stringify(z.toJSONSchema(schema)) } },
        },
      },
    }),
  );
  const text = (res.output?.message?.content ?? [])
    .map((b) => ("text" in b ? (b.text ?? "") : ""))
    .join("");
  let data: T | undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) data = parsed.data;
  } catch {
    // not JSON (e.g. a refusal message)
  }
  return {
    data,
    stopReason: res.stopReason,
    model: modelId,
    usage: { inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens },
  };
}

/** JSON output from Claude; retries once on the fallback model if the primary declines. */
export async function claudeJson<T>(opts: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  turns: ChatTurn[];
  effort?: "low" | "medium" | "high";
}): Promise<JsonResult<T>> {
  const effort = opts.effort ?? "medium";
  const first = await callOnce(COPY_MODEL, opts.schema, opts.schemaName, opts.system, opts.turns, effort);
  if (first.data || first.stopReason === "max_tokens") return first;
  return callOnce(FALLBACK_MODEL, opts.schema, opts.schemaName, opts.system, opts.turns, effort);
}
