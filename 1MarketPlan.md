# 1Market MVP Build Plan

Build order for the MVP. **Each step depends only on steps before it**, so every step can be built and tested on its own before moving on.

**Stack:** web app with email notifications · AWS (AgentCore, Lambda, API Gateway, DynamoDB, S3, SES, EventBridge, Cognito) · Bedrock for copy · Nano Banana (Gemini API) for images · Meta Graph API (direct) for publishing.

---

## Step 0: Accounts and access
**Goal:** remove every external blocker up front. Some of these take days to approve.
- AWS account set up for the project (pick a region, e.g. us-east-1), with Bedrock model access enabled for the text model
- Meta developer app (Business type) owned by our Meta Business account
- Experiment first on our own FB Page (Standard Access, no App Review needed for accounts we manage)
- Start Meta Business Verification and App Review (`pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`) in the background — required before clients can log in themselves
- Pilot: he adds our business as a partner on his FB Page and IG Business account in Meta Business Suite
- Google Business Profile access for his listing
- Gemini API key for Nano Banana
- Domain for the app; SES domain verification and a request to leave the SES sandbox

**Done when:** every account is accessible and every credential is stored in Secrets Manager.
**Depends on:** nothing.

---

## Step 1: Infrastructure foundation
**Goal:** the skeleton everything else plugs into.
- Infrastructure as code (CDK or SAM)
- DynamoDB tables:
  - `businesses`: profile, brand kit, settings
  - `drafts`: `business_id`, status (`pending | approved | scheduled | posted | skipped | expired | failed`), per-platform copy, image keys, timestamps
  - `posts`: published records, platform post IDs, links
- S3 bucket for uploads and generated images, with folders split per `business_id`
- Secrets Manager entries for Meta Page tokens (per `business_id`), Gemini, and other keys
- `business_id` on every record

**Done when:** a script can create a business, create a draft, and read both back.
**Depends on:** 0.

---

## Step 2: Brand profile
**Goal:** the agent's source of truth about the business.
- Profile schema: name, services, offers, hours, phone, service area, tone of voice, audience, banned words and topics
- Brand kit: logo, colors, style keywords
- Website scrape, then extract facts, then fill the profile
- Pilot: seed his profile from the scrape plus a short manual review (a JSON file loaded into DynamoDB)
- Optional: Bedrock Knowledge Base over the profile and website text

**Done when:** his complete profile and logo are stored and retrievable by `business_id`.
**Depends on:** 1.

---

## Step 3: Copy generation
**Goal:** on-brand, platform-specific captions, testable from a script.
- Prompt templates per post type: promo, tip, seasonal or holiday, showcase, announcement
- Per-platform output in one call: IG (hook, hashtags), FB (longer, CTA), GBP (short, CTA button type)
- Inputs: request text, brand profile, recent post history
- 2 variants per platform
- Validation: character limits, required CTA, no placeholders, and every price, phone number, and offer must match the profile or the request
- Missing facts produce a question back to the owner, never a guess

**Done when:** `draft_copy(business_id, request)` returns valid captions for all three platforms for 10 test requests.
**Depends on:** 2.

---

## Step 4: Image generation
**Goal:** a branded visual for every draft.
- `generate_image(prompt, style, aspect)` calling Nano Banana 2.1, with the version pinned
- Every prompt gets the brand style block; logo and past posts can be passed as reference images
- `compose_branded_graphic()`: for promos, put the exact headline and price text and the logo onto the image with code
- Resize and crop per platform: IG 1:1 or 4:5, FB 1.91:1, GBP 4:3
- If the owner uploaded a photo, use it and apply the branding
- No fake "our work," staff, or customer imagery
- Save to S3

**Done when:** each of the 5 test post types produces correctly sized, on-brand images in S3.
**Depends on:** 1, 2.

---

## Step 5: Draft service
**Goal:** the draft lifecycle as plain code (no AI).
- `create_draft(business_id, copy, images)` produces a `pending` draft
- Edit caption, swap image, approve, skip, schedule (stores `scheduled_at`)
- Status transitions enforced; invalid moves are rejected
- Store the before and after of every owner edit (for future style learning)

**Done when:** a script can take a draft through every status transition, using outputs from Steps 3 and 4.
**Depends on:** 1, 3, 4.

---

## Step 6: Publishing (Make first, then Meta Graph API)
**Goal:** approved drafts reliably reach FB and IG. GBP comes later (Google API access or Ayrshare for that platform).
- **Now:** Make scenario (Custom Webhook → Facebook Pages → Webhook Response) posts to our own FB Page; get one business working end to end (`scripts/make-post.ts`)
- **Later:** once Meta developer access works, experiment with the Graph API directly and pivot `publish()` to it; nothing else changes
- Experiment first: post to our own FB Page with a Page access token
- Platform adapters calling the Graph API directly (pinned API version):
  - `publish_facebook(business_id, image_url, caption)`: `POST /{page-id}/photos`
  - `publish_instagram(business_id, image_url, caption)`: `POST /{ig-user-id}/media` then `POST /{ig-user-id}/media_publish`
- Page tokens stored per `business_id` in Secrets Manager (long-lived, derived from a long-lived user token)
- Images served to Meta via presigned S3 URLs
- `publish(draft_id)` calls the adapters synchronously, marks the draft `posted` or `failed`, writes a `posts` record
- Idempotency: a `publishing` status plus a per-platform key so retries never double-post
- Retries and a dead-letter queue for failures
- Scheduled publishing: an EventBridge Scheduler one-time event at `scheduled_at` calls `publish(draft_id)`
- After App Review: "Connect Facebook" OAuth flow so clients log in themselves (used in Step 11)

**Done when:** an approved test draft posts to our FB Page (then his FB and IG), both immediately and at a scheduled time, and the statuses update.
**Depends on:** 1, 5.

---

## Step 7: Agent
**Goal:** one brain that turns a request into a finished draft.
- Strands Agents (TypeScript SDK) on AgentCore Runtime, sharing `src/db` and tool code; `business_id` is bound from the session, never passed by the model
- Tools are our own tested functions, wrapped for the agent:
  - `get_brand_profile`, `get_post_history`
  - `draft_copy`, `generate_image`, `compose_branded_graphic`
  - `create_draft`
- Agent picks the post type, calls the tools, and returns a draft ID or a clarifying question
- Agent does **not** publish; publishing goes through the draft service after approval

**Done when:** `invoke_agent(business_id, "post about our fall special")` produces a complete pending draft for all three platforms.
**Depends on:** 2, 3, 4, 5.

---

## Step 8: API and auth
**Goal:** a secure backend the front end can call.
- Cognito user pool (owner login), with a user mapped to a `business_id`
- API Gateway plus Lambda endpoints:
  - `POST /requests`: invoke the agent
  - `GET /drafts`, `PATCH /drafts/{id}` (edit, approve, skip, schedule)
  - `GET /posts`: history
  - `POST /media`: presigned S3 upload URL
  - `GET/PUT /profile`
- Approve endpoint calls `publish()` from Step 6

**Done when:** every endpoint works through Postman or curl with a logged-in test user.
**Depends on:** 1, 2, 5, 6, 7.

---

## Step 9: Web app (core)
**Goal:** the owner's main working screen. Mobile-first.
- Login
- **Home:** chat-style request box with photo attach, showing the agent's response and the resulting draft inline
- **Draft review:** preview card per platform, editable caption, regenerate, image swap, Approve / Skip / Schedule, approve-all
- **Queue:** pending drafts and scheduled posts
- **History:** published posts with links to the live posts

**Done when:** he can log in, request a post, edit it, approve it, and see it live without touching anything else.
**Depends on:** 8.

---

## Step 10: Email notifications
**Goal:** reach him when he's not in the app.
- `notify(business_id, event, draft)` as a single function, so other channels (SMS, push) are easy to add later
- SES templates:
  - **Draft ready:** preview with one-click **Approve / Edit / Skip**
  - **Posted ✅:** confirmation with links
  - **Failed:** sent to you (admin), not the owner
- Signed, expiring, single-use approval tokens (`approval_tokens` table)
- `GET /approve?token=…` approves and publishes without login; Edit opens the web app

**Done when:** a draft-ready email arrives, Approve posts it, and the confirmation email follows.
**Depends on:** 5, 6, 8, 9.

---

## Step 11: Onboarding
**Goal:** a new business can set itself up (the pilot is the first user).
- Signup creates a business and its Cognito user
- Profile form, photo library upload, logo and brand colors
- Website URL triggers the Step 2 scrape to prefill the form
- Account connection: "Connect Facebook" login (needs Meta App Review); for the pilot, he adds us as a partner in Meta Business Suite instead

**Done when:** a brand-new test business goes from signup to its first approved post.
**Depends on:** 2, 8, 9.

---

## Step 12: Hardening and admin
**Goal:** safe to run unattended.
- CloudWatch alarms on errors, failed publishes, and webhook gaps
- DLQ processing and re-run of failed publishes
- Admin page for you: all businesses, drafts, and failures
- Audit log of what was posted, when, and who approved it
- Model cost tracking per business

**Done when:** a forced failure triggers an alert and can be re-run from the admin page.
**Depends on:** 6, 8, 10.

---

## Step 13: Pilot launch
- Onboard him with real accounts
- 1–2 weeks of real use; track how fast he approves and how often he edits captions
- Retro: what he edits most, what's missing, whether email approval is too slow
- Feed the findings into P1 (proactive engine, review watchers, autopilot rules, calendar, weekly summary)

**Depends on:** all of the above.

---

## Dependency summary
| Step | Depends on |
|---|---|
| 0 Accounts | none |
| 1 Infra | 0 |
| 2 Brand profile | 1 |
| 3 Copy generation | 2 |
| 4 Image generation | 1, 2 |
| 5 Draft service | 1, 3, 4 |
| 6 Publishing (Meta API) | 1, 5 |
| 7 Agent | 2, 3, 4, 5 |
| 8 API and auth | 1, 2, 5, 6, 7 |
| 9 Web app | 8 |
| 10 Email | 5, 6, 8, 9 |
| 11 Onboarding | 2, 8, 9 |
| 12 Hardening | 6, 8, 10 |
| 13 Pilot | all |

Steps 3 and 4 can run in parallel, and so can 6 and 7.
