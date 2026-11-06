export const genderOptions = {
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
} as const;

export type Gender = keyof typeof genderOptions;

export function parseGender(value: string | null): Gender | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!Object.hasOwn(genderOptions, normalized)) throw new Error('Invalid Gender value');
  return normalized as Gender;
}
