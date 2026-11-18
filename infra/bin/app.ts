import { App, Tags } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";

const app = new App();
const env = { account: "433868816667", region: "us-east-1" };

new DataStack(app, "OneMarketData", {
  env,
  terminationProtection: true,
  description: "1Market data layer: DynamoDB tables, media bucket, secrets",
});

// Sender for login codes: SENDER_EMAIL in .env (or -c senderEmail=you@example.com)
const senderEmail = app.node.tryGetContext("senderEmail") ?? process.env.SENDER_EMAIL;
if (senderEmail) {
  new AuthStack(app, "OneMarketAuth", {
    env,
    senderEmail,
    terminationProtection: true,
    description: "1Market owner logins (Cognito, passwordless email codes)",
  });
}

Tags.of(app).add("project", "1Market");
