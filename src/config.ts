// Central config. Values come from env vars (set by Lambda/AgentCore later),
// falling back to the resources deployed by the OneMarketData stack.

/** Where Claude runs: the Anthropic API (needs ANTHROPIC_API_KEY) or Amazon Bedrock. */
export type LlmProvider = "anthropic" | "bedrock";
const llmProvider: LlmProvider = process.env.LLM_PROVIDER === "bedrock" ? "bedrock" : "anthropic";

// Model IDs differ by provider: Bedrock uses the global cross-region inference profile.
const MODELS = {
  anthropic: { main: "claude-sonnet-5-5", fallback: "claude-sonnet-5" },
  bedrock: { main: "global.anthropic.claude-sonnet-5-5", fallback: "global.anthropic.claude-sonnet-5" },
}[llmProvider];

export const config = {
  region: process.env.AWS_REGION ?? "us-east-1",
  mediaBucket: process.env.MEDIA_BUCKET ?? "onemarketdata-mediaa721a567-lygowz5wcgoj",
  makeWebhookSecret: process.env.MAKE_WEBHOOK_SECRET ?? "1market/make/webhook-url",
  llmProvider,
  agentModelId: process.env.AGENT_MODEL_ID ?? MODELS.main,
  copyModelId: process.env.COPY_MODEL_ID ?? MODELS.main,
  /** Bedrock only: model to retry on when the main one declines. The Anthropic API falls back server side. */
  copyFallbackModelId: process.env.COPY_FALLBACK_MODEL_ID ?? MODELS.fallback,
  /** Nano Banana 2.1 on the Gemini API (needs GEMINI_API_KEY). Pinned so images don't change unannounced. */
  imageModelId: process.env.IMAGE_MODEL_ID ?? "gemini-nano-banana-2.1",
};
