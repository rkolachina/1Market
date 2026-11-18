// Login check for the API. Verifies the Cognito ID token on each request and
// exposes who the user is and which business they belong to.

import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "../src/config.js";

export interface AuthUser {
  sub: string;
  username: string;
  email: string;
  name?: string;
  businessId?: string;
}

const userPoolId = process.env.USER_POOL_ID;
const clientId = process.env.USER_POOL_CLIENT_ID;

export const authEnabled = Boolean(userPoolId && clientId);

const verifier = authEnabled
  ? CognitoJwtVerifier.create({ userPoolId: userPoolId!, clientId: clientId!, tokenUse: "id" })
  : undefined;

/** Returns the user for a valid "Bearer <id token>" header, or undefined. */
export async function verifyRequest(authorization: string | undefined): Promise<AuthUser | undefined> {
  if (!verifier) return undefined;
  if (!authorization?.startsWith("Bearer ")) {
    console.warn("[auth] request has no Bearer token");
    return undefined;
  }
  try {
    const p = await verifier.verify(authorization.slice(7));
    return {
      sub: p.sub,
      username: String(p["cognito:username"]),
      email: String(p.email ?? ""),
      name: p.name ? String(p.name) : undefined,
      businessId: p["custom:business_id"] ? String(p["custom:business_id"]) : undefined,
    };
  } catch (err) {
    console.warn(`[auth] token rejected: ${(err as Error).name}: ${(err as Error).message}`);
    return undefined;
  }
}

const cognito = new CognitoIdentityProviderClient({ region: config.region });

/** Attach a business to a user (only the backend can write this attribute). */
export async function setUserBusiness(username: string, businessId: string): Promise<void> {
  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [{ Name: "custom:business_id", Value: businessId }],
    }),
  );
}

/** Find a user's username by email (for admin scripts). */
export async function findUsernameByEmail(email: string): Promise<string | undefined> {
  const res = await cognito.send(
    new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email.replace(/"/g, "")}"`, Limit: 1 }),
  );
  return res.Users?.[0]?.Username;
}
