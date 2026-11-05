import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSupabaseConfig } from '../packages/core/src/config';
test('missing credentials produce setup mode rather than a broken network client', () => {
  assert.equal(parseSupabaseConfig('', '').configured, false);
});
test('rejects secret keys in public frontend configuration', () => {
  assert.throws(() => parseSupabaseConfig('https://example.supabase.co', 'sb_secret_unsafe'), /public|publishable/i);
});
test('accepts a public project URL and publishable key', () => {
  assert.equal(parseSupabaseConfig('https://example.supabase.co', 'sb_publishable_example').configured, true);
});
