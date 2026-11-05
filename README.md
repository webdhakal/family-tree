# Dynamic Centralized Family Tree Platform

Production-oriented specification and reference implementation blueprint for a tenant-isolated Supabase family genealogy platform. This repository is a blueprint, not a deployed or complete application.

Start with [the specification](docs/SPECIFICATION.md), then follow [the deployment guide](docs/DEPLOYMENT.md). See [verification and release requirements](docs/VERIFICATION.md) for checks performed and remaining integration work.

| Deliverable | Reference files |
|---|---|
| Tenant, Auth roles, profile privacy, approval queue, RLS, graph integrity | [001_schema.sql](blueprint/supabase/001_schema.sql) |
| Staged CSV import, two-pass linking, conflicts, private Storage | [002_imports_storage.sql](blueprint/supabase/002_imports_storage.sql) |
| Exact CSV mapping and validation | [csv.ts](blueprint/shared/csv.ts), [sample CSV](blueprint/examples/family.csv) |
| Shared SDK calls and conflict state | [api.ts](blueprint/shared/api.ts), [useParentConflict.ts](blueprint/shared/useParentConflict.ts) |
| Web conflict picker and interactive graph | [ParentConflict.tsx](blueprint/web/ParentConflict.tsx), [FamilyTree.tsx](blueprint/web/FamilyTree.tsx), [TreeScreen.tsx](blueprint/web/TreeScreen.tsx) |
| Native conflict picker and SVG graph | [ParentConflict.tsx](blueprint/mobile/ParentConflict.tsx), [FamilyTree.tsx](blueprint/mobile/FamilyTree.tsx) |
| Platform clients and layout | [web client](blueprint/web/client.ts), [mobile client](blueprint/mobile/client.ts), [layout.ts](blueprint/shared/layout.ts) |
| Optional authenticated Edge API | [parent-candidates](blueprint/supabase/functions/parent-candidates/index.ts) |
| Free hosting and Android APK configuration | [Vercel](blueprint/web/vercel.json), [Netlify](blueprint/web/netlify.toml), [Expo](blueprint/mobile/eas.json) |

There is one hosted Supabase project shared by all families, not one Supabase project per family. A creator can create one family. Each family always has one Admin; Moderators and Members are tenant-scoped. An Auth account and a genealogy person are separate identities.

Free-tier eligibility is conditional on quotas and provider terms. A personal web deployment and Android APK distribution can fit free plans. Standard iOS distribution, unlimited usage, guaranteed uptime, and a blanket zero-cost production promise cannot be supplied by these services. Current limits and primary sources are recorded in the deployment guide.
