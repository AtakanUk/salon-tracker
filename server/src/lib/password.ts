import { randomBytes, randomInt } from 'node:crypto';

/** Shortest password accepted anywhere (login page can be public, see DEPLOY.md). */
export const MIN_PASSWORD_LENGTH = 8;

// Salon words, ASCII only: these get read aloud and typed on a tablet keyboard,
// so no Turkish characters and no easily confused letters.
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

/** One-off password for account resets, e.g. "makas-4821". */
export function generatePassword(): string {
  return `${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;
}

/**
 * Password for admin accounts. Deliberately not readable-aloud: an admin account
 * can be reached from the internet in the public publish mode, and it is typed
 * once on a real keyboard, not every morning on a tablet.
 */
export function generateStrongPassword(): string {
  return randomBytes(12).toString('base64url');
}
