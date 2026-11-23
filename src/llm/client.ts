// Claude for one-shot JSON calls, on the Anthropic API (default) or Amazon Bedrock
// (LLM_PROVIDER=bedrock). One helper: ask for JSON matching a Zod schema, validated
// on the way back.

import Anthropic from "@anthropic-ai/sdk";
import {
  BedrockRuntimeClient,
  type ContentBlock,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { config } from "../config.js";

export const COPY_MODEL = config.copyModelId;

export type ChatTurn = { role: "user" | "assistant"; text: string };
type Effort = "low" | "medium" | "high";

export interface JsonResult<T> {
  /** Parsed and validated output, or undefined if the model declined / returned invalid JSON. */
  data?: T;
  stopReason?: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface CallArgs<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  turns: ChatTurn[];
  effort: Effort;
}

function parseJson<T>(schema: z.ZodType<T>, text: string): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined; // not JSON (e.g. a refusal message)
  }
}

// ---- Anthropic API ----

let anthropic: Anthropic | undefined;

async function callAnthropic<T>(a: CallArgs<T>): Promise<JsonResult<T>> {
  anthropic ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await anthropic.beta.messages.create({
    model: config.copyModelId,
    max_tokens: 16000,
    system: a.system,
    messages: a.turns.map((t) => ({ role: t.role, content: t.text })),
    output_config: {
      effort: a.effort,
      format: { type: "json_schema", schema: z.toJSONSchema(a.schema) as Record<string, unknown> },
    },
    // If the model declines, the API reruns the request on a fallback model it picks.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return {
    data: res.stop_reason === "refusal" ? undefined : parseJson(a.schema, text),
    stopReason: res.stop_reason ?? undefined,
    model: res.model,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}

// ---- Amazon Bedrock (Converse API) ----

let bedrock: BedrockRuntimeClient | undefined;

async function callBedrock<T>(modelId: string, a: CallArgs<T>): Promise<JsonResult<T>> {
  bedrock ??= new BedrockRuntimeClient({ region: config.region });
  const messages: Message[] = a.turns.map((t) => ({
    role: t.role,
    content: [{ text: t.text } as ContentBlock],
  }));
  const res = await bedrock.send(
    new ConverseCommand({
      modelId,
      system: [{ text: a.system }],
      messages,
      inferenceConfig: { maxTokens: 16000 },
      outputConfig: {
        effort: a.effort,
        textFormat: {
          type: "json_schema",
          structure: { jsonSchema: { name: a.schemaName, schema: JSON.stringify(z.toJSONSchema(a.schema)) } },
        },
      },
    }),
  );
  const text = (res.output?.message?.content ?? [])
    .map((b) => ("text" in b ? (b.text ?? "") : ""))
    .join("");
  return {
    data: parseJson(a.schema, text),
    stopReason: res.stopReason,
    model: modelId,
    usage: { inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens },
  };
}

/** JSON output from Claude. If the main model declines, it falls back to another model. */
export async function claudeJson<T>(opts: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  turns: ChatTurn[];
  effort?: Effort;
}): Promise<JsonResult<T>> {
  const args: CallArgs<T> = { ...opts, effort: opts.effort ?? "medium" };
  if (config.llmProvider === "anthropic") return callAnthropic(args);

  // Bedrock has no server-side fallback, so retry once on the fallback model.
  const first = await callBedrock(config.copyModelId, args);
  if (first.data || first.stopReason === "max_tokens") return first;
  return callBedrock(config.copyFallbackModelId, args);
}
