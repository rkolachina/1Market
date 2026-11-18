import { App, Tags } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";

const app = new App();

new DataStack(app, "OneMarketData", {
  env: { account: "433868816667", region: "us-east-1" },
  terminationProtection: true,
  description: "1Market data layer: DynamoDB tables, media bucket, secrets",
});

Tags.of(app).add("project", "1Market");
