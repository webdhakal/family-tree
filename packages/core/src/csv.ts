import Papa from 'papaparse';

export type ImportRow = {
  record_id: string; full_name: string; father_name: string | null; mother_name: string | null;
  father_record_id: string | null; mother_record_id: string | null;
  custom_fields: Record<string, string>;
  profile: {
    dob: string | null; address: string | null; street_address: string | null;
    original_address: string | null; phone: string | null; email: string | null;
    map_url: string | null; social_links: Record<string, string>; extra_fields: Record<string, string>;
  };
};
const mapped = new Set([
  'Full Name', 'Address', 'Street Address', 'Original Address', "Father's Name", "Mother's Name",
  'DOB', 'Phone', 'Email', 'Social Links', 'Map URL', 'Record ID', 'Father Record ID', 'Mother Record ID',
]);
function https(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label}: HTTPS URL required`);
  return url.href;
}
function dateOnly(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('DOB must use YYYY-MM-DD (Gregorian)');
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.valueOf()) || d.toISOString().slice(0, 10) !== value || value < '1000-01-01'
    || value > new Date().toISOString().slice(0, 10)) throw new Error('Invalid DOB');
  return value;
}
// Text input also works on Expo after DocumentPicker + File.text(); no browser File dependency.
export function parseFamilyCsv(text: string): ImportRow[] {
  if (new TextEncoder().encode(text).length > 1_048_576) throw new Error('Maximum CSV size is 1 MiB');
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true, skipEmptyLines: 'greedy', dynamicTyping: false, transformHeader: h => h.trim(),
  });
  if (result.errors.length) throw new Error(result.errors.map(e => `row ${e.row}: ${e.message}`).join('; '));
  if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) throw new Error('Duplicate headers');
  if (!result.meta.fields?.includes('Full Name')) throw new Error('Full Name column required');
  if (!result.data.length || result.data.length > 200) throw new Error('Use 1–200 rows per import');
  const seen = new Set<string>();
  return result.data.map((row, index) => {
    const read = (key: string) => row[key]?.trim() || null;
    const recordId = read('Record ID') || `row:${index + 1}`;
    if (seen.has(recordId)) throw new Error(`Duplicate Record ID ${recordId}`);
    seen.add(recordId);
    const name = read('Full Name');
    if (!name || name.length > 160) throw new Error(`Row ${index + 2}: Full Name required, max 160 characters`);
    const social: unknown = JSON.parse(read('Social Links') || '{}');
    if (!social || Array.isArray(social) || typeof social !== 'object') throw new Error('Social Links must be a JSON object');
    const links: Record<string, string> = {};
    for (const [key, value] of Object.entries(social)) {
      const normalized = key.toLowerCase();
      if (!['facebook', 'tiktok', 'instagram'].includes(normalized) || typeof value !== 'string') throw new Error('Unsupported social link');
      links[normalized] = https(value, key);
    }
    // Unknown columns are private by default; promotion to lineage metadata needs registry review.
    const extra = Object.fromEntries(Object.entries(row).filter(([key]) => !mapped.has(key)));
    return {
      record_id: recordId, full_name: name, father_name: read("Father's Name"), mother_name: read("Mother's Name"),
      father_record_id: read('Father Record ID'), mother_record_id: read('Mother Record ID'), custom_fields: {},
      profile: {
        dob: dateOnly(read('DOB') || ''), address: read('Address'), street_address: read('Street Address'),
        original_address: read('Original Address'), phone: read('Phone'), email: read('Email'),
        social_links: links, map_url: read('Map URL') ? https(read('Map URL')!, 'Map URL') : null, extra_fields: extra,
      },
    };
  });
}
