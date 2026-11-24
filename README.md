# 1Market

**Social media on autopilot for local service businesses, with the owner always in control.**

A business owner types something like *"post about our fall gutter special"*. 1Market writes on-brand captions for Facebook, Instagram and Google Business Profile, prepares a branded image, and saves it as a draft. The owner approves, edits, skips or schedules it, and 1Market publishes it. Nothing posts without the owner's OK.

The full build plan is in [`1MarketPlan.md`](1MarketPlan.md).

## How it works

```
Owner request ──▶ Agent (Strands + Claude) ──▶ pending draft ──▶ owner approves ──▶ publish() ──▶ Make ──▶ Facebook
"post about our    reads the business profile,                    (web app)          plain code,
 fall special"     writes + fact-checks captions,                                    no AI
                   prepares the image
```

- **The agent only creates drafts.** It has no publish tool. Publishing happens in plain code after a person approves.
- **Facts are checked by code.** Every price, phone number, link and offer in a caption must match the business profile or the owner's request. Missing facts become questions for the owner, never guesses.
- **Each business's data is separate.** Every record is keyed by `business_id`, and the API reads `business_id` only from the owner's verified login token.

## Status

| Area | Status |
|---|---|
| Database and storage (DynamoDB, S3, Secrets Manager) | ✅ Deployed |
| Login: passwordless email codes (Cognito + SES) | ✅ Deployed (SES in sandbox) |
| Web app: Home, Draft review, Calendar, Posts, Business profile, Log in / Sign up | ✅ Deployed (CloudFront) |
| API (Hono) with login check on every request | ✅ Deployed (Lambda + API Gateway, behind CloudFront at `/api`) |
| Publishing to Facebook through Make (text and photo) | ✅ Working |
| Draft lifecycle: approve, edit, skip, schedule, unschedule, post now | ✅ Working |
| Request box → assistant: drafts, clarifying questions, attached photo, requested date | ✅ Deployed (agent Lambda on an SQS queue) |
| Agent (Strands), caption writer with fact checks, branded images | ✅ Working (Claude through the Anthropic API) |
| Recommendations: timely post ideas (season, holidays, offers, recent posts, open dates) the owner can edit and send | ✅ Deployed |
| Onboarding: fill in the profile from the business website (owner reviews before saving) | ✅ Deployed |
| Scheduled posts firing on their date (EventBridge Scheduler → publisher Lambda) | ✅ Deployed |
| AI background images (Nano Banana / Gemini) | ✅ Working (layout still to polish; one square size for every platform) |
| Instagram and Google Business Profile publishing | ⏳ Planned |
| Email notifications with one-click approve | ⏳ Planned |

## Tech stack

| Layer | Choice |
|---|---|
| Web app | React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query, Amplify Auth, Phosphor icons |
| API | Hono on Lambda + API Gateway (same app runs locally), Zod validation |
| Agent | Strands Agents (TypeScript) on Lambda, fed by an SQS queue; Claude Sonnet 5.5 through the Anthropic API (Amazon Bedrock available with `LLM_PROVIDER=bedrock`) |
| Images | Nano Banana 2.1 (Gemini API) backgrounds, with headline, contact details and logo added in code (sharp) |
| Publishing | Make scenario → Facebook Pages (Meta Graph API directly later) |
| Data | DynamoDB (businesses, drafts, posts, requests), S3 (images), Secrets Manager (Make webhook; Anthropic + Gemini keys in `1market/app/api-keys`) |
| Auth | Amazon Cognito (Essentials tier, email one-time codes) + Amazon SES |
| Infrastructure | AWS CDK (TypeScript) |

## Repo layout

```
api/        HTTP API (Hono): routes, login check, local dev server
src/        Backend logic: db access, draft service, publish(), captions, images, agent
web/        React web app
infra/      CDK stacks: OneMarketData (tables, bucket, secret), OneMarketAuth (Cognito)
scripts/    CLI tools: seeding, drafts, agent, smoke tests
seed/       Demo business data (fictional Brightside Gutter & Window Co.)
.claude/skills/  Design language (1market-design) and UI/UX guidelines (ui-ux-pro-max)
```

## Getting started

**Prerequisites:** Node 22 (`nvm use` reads `.nvmrc`), AWS CLI logged in to the project account (`aws login`), and the deployed CDK stacks.

```bash
npm install
cd web && npm install && cd ..
```

**Environment.** Create `.env` in the repo root (git-ignored):

```
MAKE_WEBHOOK_URL=        # Make scenario webhook (also stored in Secrets Manager)
USER_POOL_ID=            # from the OneMarketAuth stack outputs
USER_POOL_CLIENT_ID=     # from the OneMarketAuth stack outputs
SENDER_EMAIL=            # SES-verified address that sends login codes
ANTHROPIC_API_KEY=       # Claude, from console.anthropic.com
GEMINI_API_KEY=          # Nano Banana images, from aistudio.google.com (optional: without it, posts get a plain branded graphic)
# LLM_PROVIDER=bedrock   # optional: use Claude on Amazon Bedrock instead
```

and `web/.env.local`:

```
VITE_USER_POOL_ID=
VITE_USER_POOL_CLIENT_ID=
```

**Run it** (two terminals):

```bash
npm run api    # API on http://localhost:8787
npm run web    # app on http://localhost:5173
```

Open http://localhost:5173 and create an account. While SES is in sandbox mode, codes only reach verified email addresses.

## Useful commands

| Command | What it does |
|---|---|
| `npm run seed` | Load the demo business (profile, logo, past posts) |
| `npm run seed:drafts` | Add demo drafts across the month |
| `npm run link-user -- <email> <business_id>` | Attach a login to an existing business |
| `npm run drafts -- list \| show \| create \| approve \| edit \| skip \| retry` | Manage drafts from the terminal |
| `npm run agent -- "post about…"` | Send a request to the agent from the terminal |
| `npm run image:test -- "scene" "headline"` | Make one post image (Nano Banana + headline/logo) into `out/` |
| `npm run db:smoke` | Check the tables, including that businesses can't see each other's data |
| `npm run post:test -- --caption "…" [--image url]` | Send a test post straight to the Make scenario |
| `npm run deploy` | Build the web app and deploy the app stack (`OneMarketApp`) |
| `npx cdk diff` / `npx cdk deploy <Stack>` | Preview or deploy infrastructure |

## Design

The UI follows the **"friendly workshop"** design language in [`.claude/skills/1market-design/SKILL.md`](.claude/skills/1market-design/SKILL.md): warm paper and ink colors (no orange), condensed headings, mono labels for dates and statuses, rounded cards, and plain, friendly copy.
