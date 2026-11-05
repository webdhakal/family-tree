# Verification record and release checks

Checked 2026-11-05. No hosted Supabase project, frontend host, cloud build or real personal data was used.

## Checks actually performed

| Check | Result and scope |
|---|---|
| Apply both SQL migrations | Passed on PGlite 0.5.15, an isolated PostgreSQL runtime. Supabase `auth` and `storage` schemas/roles were represented by minimal test fixtures. |
| Tenant and role boundary scenarios | Passed: two families, cross-tenant reads denied, direct member mutations denied, role self-assignment denied, privileged private helper invocation denied, anonymous reads denied. |
| Membership/invitation scenarios | Passed: confirmed-email acceptance, single-use token, creator limited to one tree, role promotion and Admin transfer; former Admin immediately loses promotion permission. |
| Import lifecycle | Passed: staging does not write members, stage retries reuse a batch, approval retries reuse results, child-before-parent input works, duplicate father names stay unresolved. |
| Approval/graph scenarios | Passed: Member cannot approve; Moderator can approve another person's link; Moderator cannot self-approve; approved graph updates resolve import issues; cyclic ancestry fails; cross-family parent FK fails. |
| Profile and claims | Passed: unrelated tenant members cannot read private contact rows; approved identity claim grants access to the claimant's own row. |
| Additional approval cases | Passed: create-proposal approval returns the same new member ID on retry; server rejects future DOB; ancestor and descendant windows return expected fixture people. |
| Global settings | Passed: operator can suspend a family, suspension hides its records and blocks traversal; Super Admin does not automatically gain private-profile access. |
| Storage policy fixtures | Passed: reviewer upload, tenant read, Member upload denied, other-tenant read denied. These are PostgreSQL policy checks against fixtures, not live object uploads. |
| Shared and web TypeScript | Strict type checking passed with the isolated installed libraries. |
| Native and Edge source | TypeScript syntax/emit check passed. Native package type compatibility and Deno runtime behavior have not been verified. |
| CSV behavior | Passed: sample exact-column mapping, social key normalization, private extra fields, BOM/Unicode and phone preservation; invalid calendar DOB, duplicate headers, duplicate record IDs and unsafe map URL rejected. |
| Local references | Markdown links and JSON configurations checked locally. |

Validation dependencies were installed in `/tmp/family-tree-blueprint-check`, outside the repository. The repository does not contain an assembled app, package lockfile or committed integration test suite. Temporary verification scripts are session-local. SQL fixtures confirm database behavior, not Supabase gateway, Auth email delivery or Storage service integration.

Docker was inaccessible and no system PostgreSQL client was installed. An isolated downloaded PGlite runtime provided executable SQL validation instead. It does not establish concurrent multi-session correctness; run real PostgreSQL/Supabase concurrency tests before release.

## Required real-project checks

1. Apply migrations to a disposable Supabase project and regenerate TypeScript database types. Review all exposed tables, views, grants and EXECUTE permissions. Never test destructive SQL on a family's real project.
2. Sign in as real Supabase users: a Super Admin, Admin A, Moderator A, Member A, Admin B and an unaffiliated account. Exercise every RPC directly, not only through hidden UI buttons.
3. From authenticated and anonymous API clients, attempt direct writes to `members`, `member_private`, `user_roles`, `pending_changes`, `import_batches`, `invitations` and `audit_events`. All must fail. Approved transactions must still work.
4. Submit two changes against the same version. After one approval increments the version, approving the second must fail without applying its patch. Submit concurrent claims for one person and verify only one can bind.
5. Run two database sessions approving opposite parent links concurrently. The shared tenant lock must serialize them, and the second approval must detect and reject the cycle. Repeat across father and mother slots and across import/approval operations.
6. Retry a timed-out submit/stage/approval with the original request key. Verify exactly one proposal/batch and one authoritative apply. Reuse of a key with different intended data should show the existing request, not silently imply a new request succeeded; the completed UI should prevent that reuse.
7. Import child-before-parent rows, missing/duplicate names, duplicate full names with distinct IDs, missing explicit parent IDs, malformed social JSON, invalid dates and parent cycles. Any transactional failure must leave no partial approved import. Confirm the original staged payload remains available for review.
8. Attempt cross-tenant parent IDs, member IDs, family IDs and storage paths; altered reviewer/submitting-user IDs; unauthorized role strings; unknown patch keys and forged Auth metadata. Confirm no privilege escalation or PII leak.
9. Verify live private Storage upload/read/delete, file limits and signed URL expiry. A short-lived signed URL may work until expiry after membership or feature revocation; avoid claiming instant revocation of an already issued URL.
10. Test SMTP/OAuth, confirmation and recovery, invitation token mismatch/expiry/reuse, logout, account switching and every redirect. Test native PKCE callbacks from both terminated and foreground app states.
11. Build web with its resolved lockfile. Test direct SPA routes, keyboard navigation, screen readers, small screens and slow networks. Test native modules on physical Android and iOS devices. Render a shared-ancestor graph and disconnected roots without duplicated person identities.
12. Measure query plans and egress for realistic families, including a wide descendant tree. Descendant traversal must fail with a narrowing prompt over its 500-person window. The optional native chart needs separate pinch-zoom work if that becomes a release requirement.
13. Complete dynamic field registry validation/form generation, Auth/navigation, moderation and import dashboards, abuse throttling, aggregate quotas, retention jobs and export/deletion/recovery procedures. Use documented operator review for actions without a public RPC.
14. Run an encrypted backup export and a restore drill including Storage objects. Set usage thresholds, verify hosting eligibility and provider limits, and document the accepted downtime/recovery targets.

## Useful read-only SQL checks

```sql
-- RLS on every application table in public.
select schemaname, tablename, rowsecurity
from pg_tables where schemaname='public' order by tablename;

-- Inspect privileged RPC search paths and ownership.
select n.nspname, p.proname, p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') order by 1,2;

-- Verify the authenticated role cannot bypass the approval gate.
select has_table_privilege('authenticated','public.members','UPDATE') as member_update,
       has_table_privilege('authenticated','public.user_roles','INSERT') as role_insert,
       has_function_privilege('authenticated','private.apply_patch(uuid,uuid,jsonb)','EXECUTE') as helper_execute;
-- Expected: false, false, false.

-- Ensure every tenant Admin is also a membership row.
select f.id from public.families f
left join public.user_roles r on r.family_id=f.id and r.user_id=f.admin_user_id
where r.user_id is null;
-- Expected: no rows.
```
