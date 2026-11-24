// Admin: connect a business to the Facebook Page it posts to (Option 1: one Make scenario,
// Page chosen per post). Only admins can set this; owners can't change it in the app.
//
//   npm run connect-facebook -- --email owner@example.com --page-id 1234567890 --page-name "Their Page"
//   npm run connect-facebook -- --business biz_123 --page-id 1234567890 --page-name "Their Page"
//   npm run connect-facebook -- --email owner@example.com --remove
//   npm run connect-facebook -- --list

import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { parseArgs } from "node:util";
import { config } from "../src/config.js";
import { getBusiness, setFacebookConnection, TABLES } from "../src/db/index.js";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    business: { type: "string" },
    "page-id": { type: "string" },
    "page-name": { type: "string" },
    remove: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

if (values.list) {
  const res = await new DynamoDBClient({ region: config.region }).send(
    new ScanCommand({ TableName: TABLES.businesses, ProjectionExpression: "business_id, #n, connections", ExpressionAttributeNames: { "#n": "name" } }),
  );
  for (const item of (res.Items ?? []).map((i) => unmarshall(i))) {
    const fb = item.connections?.facebook;
    console.log(`${item.business_id}  ${item.name}  →  ${fb ? `${fb.page_name ?? "(no name)"} [${fb.page_id}]` : "not connected"}`);
  }
  process.exit(0);
}

async function businessIdForEmail(email: string): Promise<string> {
  const cognito = new CognitoIdentityProviderClient({ region: config.region });
  const res = await cognito.send(
    new ListUsersCommand({ UserPoolId: process.env.USER_POOL_ID, Filter: `email = "${email.replace(/"/g, "")}"`, Limit: 1 }),
  );
  const user = res.Users?.[0];
  if (!user) throw new Error(`No login for ${email}. Have them sign up in the app first.`);
  const id = user.Attributes?.find((a) => a.Name === "custom:business_id")?.Value;
  if (!id) throw new Error(`${email} hasn't finished setting up their business yet.`);
  return id;
}

const businessId = values.business ?? (values.email ? await businessIdForEmail(values.email) : undefined);
if (!businessId) {
  console.error("Give --email or --business (or --list).");
  process.exit(1);
}
const business = await getBusiness(businessId);
if (!business) {
  console.error(`No business ${businessId}`);
  process.exit(1);
}

if (values.remove) {
  await setFacebookConnection(businessId, null);
  console.log(`Removed the Facebook Page from ${business.name} (${businessId}). Its posts can't be published until it's connected again.`);
  process.exit(0);
}

const pageId = values["page-id"]?.trim();
if (!pageId || !/^\d{5,25}$/.test(pageId)) {
  console.error("--page-id must be the Page's numeric ID (Page → About → Page transparency).");
  process.exit(1);
}
await setFacebookConnection(businessId, {
  page_id: pageId,
  page_name: values["page-name"]?.trim() || undefined,
  connected_at: new Date().toISOString(),
});
console.log(`Connected ${business.name} (${businessId}) → Facebook Page ${values["page-name"] ?? ""} [${pageId}].`);
