// Mirrors server/src/lib/password.ts (the two packages share no code).
// ASCII only: these get read aloud and typed on a tablet keyboard.

/** Keep in step with MIN_PASSWORD_LENGTH on the server; it rejects anything shorter. */
export const MIN_PASSWORD_LENGTH = 8;

const WORDS = [
  'makas',
  'tarak',
  'ayna',
  'havlu',
  'firca',
  'koltuk',
  'salon',
  'usta',
  'kesim',
  'sakal',
  'boya',
  'perma',
];

/** Suggestion for a reset password, e.g. "makas-4821". */
export function generatePassword(): string {
  const pick = (n: number) => Math.floor(Math.random() * n);
  return `${WORDS[pick(WORDS.length)]}-${1000 + pick(9000)}`;
}
