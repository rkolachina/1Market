import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AllowedMethods,
  CacheHeaderBehavior,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction, type NodejsFunctionProps, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, CacheControl, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARP_VERSION = "0.35.5";

export interface AppStackProps extends StackProps {
  userPoolId: string;
  userPoolClientId: string;
  mediaBucketName: string;
}

// The running app: API, agent and publisher Lambdas, the agent queue, scheduled
// publishing, and the web app on CloudFront. Data (tables, bucket) lives in OneMarketData.
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // ---- Existing data (OneMarketData) ----
    const businesses = Table.fromTableName(this, "Businesses", "onemarket-businesses");
    const drafts = Table.fromTableAttributes(this, "Drafts", { tableName: "onemarket-drafts", globalIndexes: ["by_status"] });
    const posts = Table.fromTableName(this, "Posts", "onemarket-posts");
    const requests = Table.fromTableName(this, "Requests", "onemarket-requests");
    const media = Bucket.fromBucketName(this, "Media", props.mediaBucketName);
    const makeWebhook = Secret.fromSecretNameV2(this, "MakeWebhook", "1market/make/webhook-url");

    // Anthropic + Gemini keys, as JSON. The value is set out-of-band (never committed).
    const apiKeys = new Secret(this, "ApiKeys", {
      secretName: "1market/app/api-keys",
      description: 'JSON: {"ANTHROPIC_API_KEY": "...", "GEMINI_API_KEY": "..."}',
    });

    // ---- Lambda bundling ----
    // ESM bundle for Node 22 on ARM. sharp has native code, so its Linux ARM build is
    // installed next to the bundle instead of being bundled.
    const bundled = (entry: string, extra: Partial<NodejsFunctionProps> = {}): NodejsFunctionProps => ({
      entry: join(ROOT, "lambda", entry),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      logRetention: RetentionDays.ONE_MONTH,
      ...extra,
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        MEDIA_BUCKET: props.mediaBucketName,
        FONTCONFIG_PATH: "/var/task/fonts", // fonts for text on images (Lambda has none)
        ...extra.environment,
      },
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        sourceMap: true,
        // Some dependencies call require(); give the ESM bundle one.
        banner: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
        externalModules: ["sharp"],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_in: string, out: string) => [
            `npm install --prefix "${out}" --no-save --no-package-lock --no-audit --no-fund --os=linux --cpu=arm64 --libc=glibc sharp@${SHARP_VERSION}`,
            `cp -R "${join(ROOT, "assets", "fonts")}" "${out}/fonts"`,
          ],
        },
      },
    });

    // ---- Publisher (EventBridge Scheduler → publish) ----
    const publisherFn = new NodejsFunction(this, "PublisherFn", bundled("publisher.ts", { timeout: Duration.minutes(1), memorySize: 512 }));
    drafts.grantReadWriteData(publisherFn);
    posts.grantReadWriteData(publisherFn);
    media.grantRead(publisherFn);
    makeWebhook.grantRead(publisherFn);

    const schedulerRole = new Role(this, "SchedulerRole", { assumedBy: new ServicePrincipal("scheduler.amazonaws.com") });
    publisherFn.grantInvoke(schedulerRole);

    // ---- Agent (SQS → runRequest) ----
    const dlq = new Queue(this, "AgentDlq", { retentionPeriod: Duration.days(14) });
    const agentQueue = new Queue(this, "AgentQueue", {
      visibilityTimeout: Duration.minutes(10), // longer than the agent Lambda's timeout
      deadLetterQueue: { queue: dlq, maxReceiveCount: 2 },
    });
    const agentFn = new NodejsFunction(
      this,
      "AgentFn",
      bundled("agent.ts", {
        timeout: Duration.minutes(5),
        memorySize: 2048,
        environment: { API_KEYS_SECRET: apiKeys.secretName },
      }),
    );
    agentFn.addEventSource(new SqsEventSource(agentQueue, { batchSize: 1, maxConcurrency: 5 }));
    for (const t of [businesses, drafts, posts, requests]) t.grantReadWriteData(agentFn);
    media.grantReadWrite(agentFn);
    apiKeys.grantRead(agentFn);

    // ---- API (Hono) ----
    const apiFn = new NodejsFunction(
      this,
      "ApiFn",
      bundled("api.ts", {
        timeout: Duration.seconds(29),
        memorySize: 1024,
        environment: {
          USER_POOL_ID: props.userPoolId,
          USER_POOL_CLIENT_ID: props.userPoolClientId,
          AGENT_QUEUE_URL: agentQueue.queueUrl,
          PUBLISHER_FUNCTION_ARN: publisherFn.functionArn,
          SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        },
      }),
    );
    for (const t of [businesses, drafts, posts, requests]) t.grantReadWriteData(apiFn);
    media.grantReadWrite(apiFn);
    makeWebhook.grantRead(apiFn); // "Post now" / approve publish right away
    agentQueue.grantSendMessages(apiFn);
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["cognito-idp:AdminUpdateUserAttributes"],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.userPoolId}`],
      }),
    );
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"],
        resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/publish-*`],
      }),
    );
    apiFn.addToRolePolicy(
      new PolicyStatement({ effect: Effect.ALLOW, actions: ["iam:PassRole"], resources: [schedulerRole.roleArn] }),
    );

    const httpApi = new HttpApi(this, "HttpApi", {
      description: "1Market API (reached through CloudFront at /api/*)",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", apiFn),
    });

    // ---- Web app (S3 + CloudFront), with /api/* going to the API ----
    const webBucket = new Bucket(this, "Web", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    // Single-page app: paths without a file extension (/calendar, /drafts/123) get index.html.
    const spaRewrite = new CfFunction(this, "SpaRewrite", {
      code: FunctionCode.fromInline(`function handler(event) {
  var r = event.request;
  if (r.uri.indexOf('.') === -1) r.uri = '/index.html';
  return r;
}`),
    });

    // The API sees the owner's login token, and nothing is cached.
    const apiCache = new CachePolicy(this, "ApiCache", {
      comment: "1Market API: pass Authorization, cache nothing",
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(1),
      headerBehavior: CacheHeaderBehavior.allowList("Authorization"),
    });

    const distribution = new Distribution(this, "WebDistribution", {
      comment: "1Market web app",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Upload the built web app (npm run deploy builds it first).
    const webDist = join(ROOT, "web", "dist");
    if (existsSync(webDist)) {
      // Built JS/CSS have content hashes in their names, so they can be cached for good.
      const assets = new BucketDeployment(this, "WebDeploy", {
        sources: [Source.asset(webDist, { exclude: ["index.html"] })],
        destinationBucket: webBucket,
        cacheControl: [CacheControl.fromString("public, max-age=31536000, immutable")],
        prune: false, // keep older hashed files so open tabs still load after a deploy
      });
      // index.html must always be checked, or browsers keep loading the previous version.
      const html = new BucketDeployment(this, "WebDeployHtml", {
        sources: [Source.asset(webDist, { exclude: ["*", "!index.html"] })],
        destinationBucket: webBucket,
        cacheControl: [CacheControl.fromString("no-cache")],
        prune: false,
        distribution,
        distributionPaths: ["/*"],
      });
      html.node.addDependency(assets);
    }

    new CfnOutput(this, "AppUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "ApiKeysSecretName", { value: apiKeys.secretName });
    new CfnOutput(this, "AgentDlqUrl", { value: dlq.queueUrl });
    new CfnOutput(this, "PublisherFunctionArn", { value: publisherFn.functionArn });
    new CfnOutput(this, "SchedulerRoleArn", { value: schedulerRole.roleArn });
  }
}
