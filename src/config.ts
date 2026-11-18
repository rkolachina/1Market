// Central config. Values come from env vars (set by Lambda/AgentCore later),
// falling back to the resources deployed by the OneMarketData stack.
export const config = {
  region: process.env.AWS_REGION ?? "us-east-1",
  mediaBucket: process.env.MEDIA_BUCKET ?? "onemarketdata-mediaa721a567-lygowz5wcgoj",
  makeWebhookSecret: process.env.MAKE_WEBHOOK_SECRET ?? "1market/make/webhook-url",
  // Claude on Bedrock (global cross-region inference profile)
  agentModelId: process.env.AGENT_MODEL_ID ?? "global.anthropic.claude-sonnet-5-5",
};
