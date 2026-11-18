import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

// Pool-model multi-tenancy: every table's partition key is business_id,
// so each business's records live in their own partition.
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const tableDefaults = {
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
    };

    // businesses: one item per business. PK: business_id
    const businesses = new Table(this, "Businesses", {
      ...tableDefaults,
      tableName: "onemarket-businesses",
      partitionKey: { name: "business_id", type: AttributeType.STRING },
    });

    // drafts: PK business_id, SK draft_id (ULID, time-sortable)
    // GSI by_status: PK business_id, SK status_created ("pending#<iso time>")
    const drafts = new Table(this, "Drafts", {
      ...tableDefaults,
      tableName: "onemarket-drafts",
      partitionKey: { name: "business_id", type: AttributeType.STRING },
      sortKey: { name: "draft_id", type: AttributeType.STRING },
    });
    drafts.addGlobalSecondaryIndex({
      indexName: "by_status",
      partitionKey: { name: "business_id", type: AttributeType.STRING },
      sortKey: { name: "status_created", type: AttributeType.STRING },
    });

    // posts: PK business_id, SK post_key ("<posted_at>#<platform>#<platform_post_id>")
    const posts = new Table(this, "Posts", {
      ...tableDefaults,
      tableName: "onemarket-posts",
      partitionKey: { name: "business_id", type: AttributeType.STRING },
      sortKey: { name: "post_key", type: AttributeType.STRING },
    });

    // Media bucket: objects stored under businesses/<business_id>/...
    const media = new Bucket(this, "Media", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Make webhook URL. Value is set out-of-band (never committed).
    const makeWebhook = new Secret(this, "MakeWebhookSecret", {
      secretName: "1market/make/webhook-url",
      description: "Make scenario Custom Webhook URL for publishing",
    });

    new CfnOutput(this, "BusinessesTable", { value: businesses.tableName });
    new CfnOutput(this, "DraftsTable", { value: drafts.tableName });
    new CfnOutput(this, "PostsTable", { value: posts.tableName });
    new CfnOutput(this, "MediaBucket", { value: media.bucketName });
    new CfnOutput(this, "MakeWebhookSecretName", { value: makeWebhook.secretName });
  }
}
