# Kinship — Dynamic Family Tree

A responsive, tenant-isolated React application backed by Supabase. Each family has one Admin, with Moderators and Members. Includes sign-in/signup/recovery, family onboarding and invitations, interactive ancestor/descendant views, member records and profile claims, reviewed edits, CSV staging and approval, missing-parent resolution, feature settings and global tenant administration.

## Run locally

Requirements: Node.js 24 LTS, npm, and a configured Supabase project.

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in that file.
npm run dev
```

The default development port is 5173. If occupied, run `npm run dev -- --port 5175`. The application also provides a browser connection form when public connection variables are missing. Never supply a secret or service-role key to that form or any frontend environment variable.

Apply the SQL files in `supabase/migrations` in filename order to a **fresh** project. The initial migration revokes grants across `public`; do not run it unchanged in an unrelated populated project. Configure Supabase Auth's Site URL and allowed redirects for the actual application origin. Email signup/recovery needs configured SMTP for addresses outside the project's own team. Google sign-in needs the Google provider configured.

```bash
npm test       # Configuration, CSV and isolated PostgreSQL security scenarios
npm run check # Strict shared/web TypeScript checks
npm run build # Production app in apps/web/dist
```

## Repository layout

- `apps/web`: working Vite/React/Tailwind application.
- `packages/core`: shared Supabase service calls, CSV parsing, query hooks, graph layout and connection validation.
- `supabase/migrations`: authoritative application schema and RPCs.
- `tests`: configuration, CSV and embedded PostgreSQL checks, using Supabase Auth/Storage fixtures.
- `blueprint`: original native/web reference components, Expo build examples and optional Edge Function.
- `docs`: architecture, provider deployment guidance and verification requirements.

Native Android/iOS components and EAS configuration remain reference modules under `blueprint/mobile`; an assembled mobile binary has not been built or published by the web deployment.

## Hosting

For Vercel, import this repository, select `apps/web` as the root directory, use the Vite preset, `npm run build` and `dist`. Include workspace files outside the root directory. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before deployment. The publishable key is public; tenant records are protected by database grants, RLS and authorized RPCs.

The selected GitHub repository is [webdhakal/family-tree](https://github.com/webdhakal/family-tree). See [launch record](docs/LAUNCH.md) for the actual service setup and verification status.

## Architecture and operations

Start with [the specification](docs/SPECIFICATION.md), [the deployment guide](docs/DEPLOYMENT.md), and [verification requirements](docs/VERIFICATION.md). The architecture document includes wider production milestones beyond the current release, including dynamic field registry enforcement, payload retention jobs, aggregate quotas, export/deletion workflows and extended relationship types.

One Supabase project is shared by all families. A creator can create one family; an account can join additional families. Auth accounts are separate from genealogical people. Normal members never write canonical records directly. Contact profiles are private to verified owners and reviewers. Admin responsibility transfers atomically; cross-family ancestry and cycles are rejected.

Free plans have capacity and availability limits. Vercel Hobby is for personal non-commercial use, Supabase Free can pause inactive projects, and standard iOS distribution is outside a blanket zero-cost promise. Monitor quotas and maintain encrypted database and Storage backups before using important family records.
