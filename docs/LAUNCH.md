# Application launch record

Date: 2026-11-05.

- GitHub: https://github.com/webdhakal/family-tree
- Supabase project: Kinship Family Tree (`yftoatpydcxwedvfmcdw`), Web Dhakal Org, Free, Mumbai.
- Supabase URL: https://yftoatpydcxwedvfmcdw.supabase.co
- Database: migrations `202611050001_schema.sql`, `202611050002_imports_storage.sql`, `202611050003_app.sql` applied successfully through the dashboard SQL Editor. Source migrations are tracked here; dashboard execution does not populate Supabase CLI migration history.
- Local browser preview: http://127.0.0.1:5175 while the development server is running.
- Hosting: Vercel project setup in progress; final deployment address recorded after verification.

Only the public publishable key is used by the web app. Database credentials are not saved in this repository. Browser creation of the database password was completed by the user.

Checks completed: strict TypeScript, production build, configuration validation, exact CSV parsing cases and isolated PostgreSQL tenant/approval/import/graph/claim/Storage scenarios. The embedded database tests use Auth/Storage fixtures and do not substitute for real concurrent approval tests or physical device QA.

Account setup still requires an application Auth account (separate from the Supabase dashboard login). The first family creator becomes its Admin. A trusted operator can separately bootstrap Super Admin after that account exists, by adding its Auth UUID to `private.super_admins` through the dashboard SQL Editor.
