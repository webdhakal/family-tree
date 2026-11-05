# Family Tree Application Launch Implementation Plan

**Goal:** Assemble, verify and deploy the approved Supabase family-tree architecture, then open the working application in Chrome.

**Architecture:** npm workspace with a Vite React web app and shared typed data modules. Supabase remains the sole authoritative backend. Existing blueprint migrations and rendering modules are retained and integrated. The current checkout is reused and existing staged blueprint files are preserved.

**Constraints:** Free-tier services only; no service-role keys in clients; no direct canonical writes; approvals remain atomic and tenant-scoped. Use the existing GitHub account and user-completed Supabase/Vercel authentication. Keep new repositories private by default.

- [ ] Configuration and data foundation: `packages/core/src/config.ts`, `apps/web/src/lib.ts`, `supabase/migrations/*`. Check missing/public/secret credentials with `npm test`; run database approval and isolation scenarios.
- [ ] Application shell and identity: `apps/web/src/App.tsx`, `components/Auth.tsx`, `components/Shell.tsx`. Session restoration, sign-in/recovery, family selection/create/join, account logout and query clearing. Verify loading, unauthorized and empty states in Chrome.
- [ ] Family workspace: `pages/Tree.tsx`, `pages/Members.tsx`, `pages/Review.tsx`, `pages/Import.tsx`, `pages/Settings.tsx`. Integrate graph, profile requests/claims, conflict choices, review, staged import preview and final approval, invitations and role assignment. Run `npm run check`, `npm test`, and `npm run build`.
- [ ] Backend provisioning: use the signed-in Supabase dashboard, create a dedicated Free project, let the user enter its database password, apply migrations through its SQL editor, configure Auth redirects and public credentials, and verify authenticated reads and approval behavior.
- [ ] Git and deployment: commit the verified source, create a private GitHub repository, push through supported local Git authentication, connect Vercel, configure public environment variables, deploy, and verify the actual URL in Chrome. Record operational limits and any required user action.

Run these stages inline in the current session. Finish the authorized local work while any login handoff is pending; do not mistake a login handoff for permission to weaken authentication.
