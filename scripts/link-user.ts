// Attach an existing login to an existing business (admin only).
// Usage: npm run link-user -- you@example.com biz_demo_brightside
// The user must log out and back in (or refresh their session) to pick it up.

import { findUsernameByEmail, setUserBusiness } from "../api/auth.js";
import { getBusiness } from "../src/db/index.js";

const [email, businessId] = process.argv.slice(2);
if (!email || !businessId) {
  console.error("Usage: npm run link-user -- <email> <business_id>");
  process.exit(1);
}
if (!process.env.USER_POOL_ID) {
  console.error("USER_POOL_ID is not set (add it to .env)");
  process.exit(1);
}
const business = await getBusiness(businessId);
if (!business) {
  console.error(`No business ${businessId}`);
  process.exit(1);
}
const username = await findUsernameByEmail(email);
if (!username) {
  console.error(`No login found for ${email}. Sign up in the app first.`);
  process.exit(1);
}
await setUserBusiness(username, businessId);
console.log(`Linked ${email} → ${businessId} (${business.name}). Log out and back in to see it.`);
