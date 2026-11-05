# Free-tier setup and deployment

Limits checked against official sources on 2026-11-05. Recheck them immediately before launch. This blueprint has not provisioned accounts, deployed a project, or generated signed APKs.

## 1. What can run at zero hosting cost

| Service | Current free allowance / condition | Design response |
|---|---|---|
| Supabase | 2 active free projects, 500 MB database per project, 1 GB files, 50,000 MAU, 5 GB uncached + 5 GB cached egress | One project shared by tenants; optionally use the other for staging. Minimize full-tree queries and image downloads. |
| Supabase Edge Functions | 500,000 invocations | Use direct database RPCs for core flows; invoke Edge only for integrations. |
| Supabase Realtime | 2 million messages, 200 peak connections | Refetch-on-focus by default; no permanent global subscriptions. |
| Supabase availability | Low-activity free projects can pause after a 7-day period | Accept downtime and manual restoration. Do not promise a production SLA or use artificial keep-alive traffic. |
| Vercel Hobby | Personal non-commercial use | Suitable for an eligible personal family site, not a blanket free commercial SaaS promise. |
| Netlify Free | 300 credits/month across deploys, requests, bandwidth and compute | Alternative static host; monitor the combined credit budget. |
| Expo Free | 15 Android + 15 iOS builds, low-priority queue; Update allowance 1,000 MAU | Use cloud builds for milestones, local development between builds; avoid requiring EAS Update initially. |
| Android distribution | APK can be shared directly | No Play Store publishing required for the zero-cost path. |
| iOS distribution | EAS build allowance does not waive Apple signing/distribution requirements | Standard Ad Hoc and App Store distribution require the relevant paid Apple program. Use Expo Go for supported development/testing; it is not a standalone production distribution substitute. |

Primary sources: [Supabase pricing](https://supabase.com/pricing), [Supabase billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Netlify pricing](https://www.netlify.com/pricing/), [Expo pricing](https://expo.dev/pricing), and [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

These are service quotas, not guaranteed application capacities. As an initial operating budget, alert at 70% and freeze optional uploads/imports at 85% of measured database/storage/egress allowances. Reserve room for indexes, audit metadata and migration work. Client warnings alone are insufficient; before broad launch, implement server-enforced tenant quotas and a trusted global usage check. This reference enforces per-request import and image limits, not aggregate billing quotas. Keep accounts on Free and avoid paid add-ons or paid-plan automatic usage billing if zero spend is essential. Exhausted quotas can interrupt service.

Free-tier availability and backup guarantees do not meet every production requirement. Arrange encrypted logical database exports and a separate copy of private Storage objects, retain off-platform copies, and test restoration to a scratch project. Do not assume the Free plan includes Pro daily backup retention or PITR. Choose recovery objectives explicitly; a small volunteer deployment might accept daily exports and manual recovery, whereas a critical application needs funded operational guarantees.

## 2. Create and secure Supabase

1. Create a Supabase Free organization/project near users. Save the project reference and database password privately. Do not create one project for each family.
2. Copy project URL and publishable key from the dashboard. Frontends get these public values only. Keep the database password and service-role/secret key out of source control and client environment files.
3. Run `blueprint/supabase/001_schema.sql`, then `002_imports_storage.sql`, using the Supabase SQL Editor or a migration pipeline. Use a fresh project: the first migration revokes grants across `public`.
4. In API settings expose `public` as required; never expose `private`. Verify every application table has RLS. Confirm grants and function execution permissions using the verification guide and the Supabase Security Advisor.
5. Configure Auth Site URL and explicit redirect allowlists for localhost, production web, and `familytree://auth/callback`. Avoid broad wildcard production redirects. Choose OAuth providers and/or email-password Auth.
6. For normal email signup, confirmation, invitations and recovery, configure a custom SMTP provider. Supabase's default sender only delivers to project team addresses and is for testing. A separate provider's free plan, sender domain and delivery limits are additional dependencies. For a strict zero-cost pilot, OAuth signup plus manually shared application invitations avoids a requirement to send app invitation mail; OAuth still requires provider configuration. Do not disable email confirmation to work around invite verification.
7. Register/sign in the operator account, then bootstrap Super Admin from trusted SQL using that account's real Auth UUID:

   ```sql
   insert into private.super_admins(user_id) values ('REAL-AUTH-USER-UUID');
   ```

   There is no public RPC to become Super Admin. Record provisioning and recovery actions in operator change records.
8. A signed-in user creates a family via `supabase.rpc('create_family', {p_name:'Example Family'})`. A second creation from the same creator is rejected by a unique constraint.
9. Admin calls `create_invitation(family,email)` and shares the returned token privately. The recipient signs up/signs in, confirms the matching email, then calls `accept_invitation(token)`. The app token grants family membership; it is separate from a Supabase Auth invitation. Do not put tokens in analytics or server access logs. Prefer a URL fragment handled by the app, then immediately clear it from navigation state.
10. Promote a trusted existing member through `set_role`, not an SQL client write. Test with two distinct families and several real Auth users before adding real genealogy records.

Sources: [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function security](https://supabase.com/docs/guides/database/functions), [custom SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp), and [React Native Auth setup](https://supabase.com/docs/guides/auth/quickstarts/react-native).

## 3. Assemble the web application

The reference files are deliberately small feature modules, not a complete scaffold with screens and navigation. The following commands are implementation instructions; they have not been run in this repository.

```bash
npm create vite@latest apps/web -- --template react-ts
cd apps/web
npm install @supabase/supabase-js@2 @tanstack/react-query@5 papaparse @xyflow/react@12 @dagrejs/dagre
npm install -D @types/papaparse tailwindcss @tailwindcss/vite
```

Copy `blueprint/shared` to `apps/web/src/family/shared` and `blueprint/web` source files to `apps/web/src/family/web`; this preserves the supplied relative imports. Put `vercel.json` or `netlify.toml` at `apps/web/`, not under `src`. Include `assets.d.ts` in TypeScript's source tree. In an eventual workspace monorepo, move shared modules into a package and replace relative imports with package exports; do not maintain divergent web/mobile service implementations.

Add the Tailwind Vite plugin to generated `vite.config.ts` alongside React, and import Tailwind in application CSS:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

```css
@import "tailwindcss";
```

Use `.env.local` at the web app root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

Mount one `QueryClientProvider` at the app root, handle Auth session restoration, then show `TreeScreen` with an authorized family and selected member. Example provider setup:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  mutations: { retry: false }
} });
// Render inside your root component:
// <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

Clear that client on sign-out/account change. Implement Auth, family selection, profile details, import preview/approval, and moderation screens according to the specification. The generated default Vite screen is not the finished application. Generate database types after migrations and replace the reference adapter's generic result casts with typed Supabase RPC results:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/database.types.ts
npm run build
```

Commit the resolved dependency lockfile in the assembled app, use its supported Node LTS version in CI and hosting, and run dependency/security checks. This blueprint's isolated type checks used Supabase JS 2.119.0, TanStack Query 5.106.1, PapaParse 5.7.0, React Flow 12.12.1, Dagre 3.1.3, React 19.3.1 and TypeScript 7.0.2; no application dependency lockfile is installed here.

A file import action is deliberately two separate decisions:

```ts
const rows = parseFamilyCsv(await file.text());
// Show preview, warnings and normalized fields first.
const batch = await api.stageImport(familyId, rows, crypto.randomUUID());
// Later, after the Admin reviews the staged batch:
const report = await api.approveImport(batch, true);
// Refresh tree and issue queries; report.unresolved indicates follow-up work.
```

Persist the request UUID while retrying a stage request. Generating a new UUID on each retry defeats idempotency. For more than 200 rows, create deliberate bounded batches with separate previews; cross-batch parent resolution uses existing names or later approved links. Do not arbitrarily split a file with explicit cross-row parent IDs.

## 4. Deploy to Vercel or Netlify

For Vercel:

1. Push the assembled application to your own Git repository. Import it into an eligible Vercel Hobby account.
2. Set root directory to `apps/web`, framework to Vite, build command to `npm run build`, and output to `dist`.
3. Add the two public `VITE_` variables to Production/Preview as appropriate. Redeploy after variable changes because Vite embeds them at build time.
4. Include `vercel.json` for SPA navigation fallback. Test a direct page load under `/family/...`, static assets, and Auth callbacks.
5. Add the final HTTPS domain to Supabase's Site URL/redirect configuration and any OAuth provider callbacks as required by that provider.
6. Test authentication, tenant isolation, invitation acceptance, an import with duplicate parents, and approval from a second browser session.

For Netlify, import the repository, use `apps/web` as the base directory and the supplied `netlify.toml`; add the same public environment variables and update Auth redirects to the Netlify domain. Monitor the current Free credit pool. Avoid a custom domain purchase by using the host's free subdomain when zero spend is required.

The reference SPA configuration is a routing baseline. Before public release, set appropriate CSP and security headers for your final asset/Auth connections, avoid raw HTML rendering, and verify Auth redirects on the actual host. Do not cache authenticated API responses in a service worker.

## 5. Assemble Expo and build an Android APK

```bash
npx create-expo-app@latest apps/mobile --template blank-typescript
cd apps/mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill react-native-svg expo-crypto expo-document-picker expo-file-system
npm install @tanstack/react-query@5 papaparse @dagrejs/dagre
npm install -D @types/papaparse
```

Copy shared modules to `apps/mobile/src/family/shared` and mobile source modules to `apps/mobile/src/family/mobile`. Copy the example `eas.json` to the mobile root. Merge `app.json` with the generated configuration, replacing the example Android package and iOS bundle identifier with your own stable identifiers. Keep EAS-generated project identifiers when configuring builds.

Set public Expo environment variables:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

Provide these values to the EAS build environment as well as local development; a gitignored `.env` file may not be present in cloud builds. These variables are bundled and must never contain secrets.

Mount the same QueryClientProvider pattern. Run `watchAuthRefresh()` once in a root effect and return its cleanup. Implement `Linking` handling for `familytree://auth/callback`; validate the callback path and use `supabase.auth.exchangeCodeForSession(code)` for a PKCE authorization code. The callback must return to the device that initiated the PKCE flow. Test warm and cold app starts; `detectSessionInUrl:false` means the supplied client does not handle native deep links automatically. Use Expo AuthSession/Linking and the chosen provider's current recommended callback flow when assembling Auth screens.

Use DocumentPicker to obtain a CSV and Expo FileSystem's `File` API to read text, then call `parseFamilyCsv(text)`. Only Admin navigation should expose import, and database checks still apply.

```bash
npx expo start
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile requests an installable APK with internal distribution. EAS can generate/manage the Android keystore; retain access and follow credential backup guidance. Download the resulting APK from your EAS build page and share the link privately. Installers must allow installation from that source. Test on at least one physical Android device before distributing family records. When free cloud build slots are exhausted, wait for the quota reset or use a correctly configured local Android build environment; do not assume unlimited free cloud builds.

The `production` profile creates an AAB for a future store release; an AAB is not a directly installable APK. App-store developer registration is a separate requirement from free EAS building. iOS Ad Hoc distribution requires registered test devices and the applicable paid Apple developer account. Source support for iOS is included; zero-cost standalone iOS distribution is not promised.

## 6. Optional Edge gateway

Copy `blueprint/supabase/functions/parent-candidates` into the assembled Supabase functions directory. Set `WEB_ORIGIN` to the exact production origin. The function uses Supabase's injected project URL/anon key only with a caller JWT; it does not need a service-role key. It independently validates the user with `getUser` before calling the RPC.

```bash
npx supabase functions deploy parent-candidates --project-ref YOUR_PROJECT_REF
npx supabase secrets set WEB_ORIGIN=https://YOUR_SITE --project-ref YOUR_PROJECT_REF
```

Review JWT gateway verification settings for your project's signing keys. If gateway JWT verification is disabled to accommodate the current key model, retain the explicit server-side `getUser` validation in the handler. Never replace it with decoding an unverified JWT. The direct-RPC baseline works without deploying this optional facade. Add trusted rate limiting before exposing high-traffic public integrations; the per-body limit is not a full abuse prevention system.

## 7. Release and recovery

Run the complete verification checklist, inspect SQL Security Advisor warnings and query performance, confirm SMTP/OAuth and redirects, measure initial database/storage use, and perform an export/restore drill. Make a private operator runbook for restoring paused projects, rotating compromised keys, removing an account and transferring orphaned family ownership. Document the free-plan downtime/traffic limitations for participating families. Do not put real personal records into an unverified preview deployment.
