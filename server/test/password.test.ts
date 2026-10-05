import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  generatePassword,
  generateStrongPassword,
} from '../src/lib/password.js';

describe('generatePassword', () => {
  it('makes passwords that can be read aloud and typed on a tablet', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(/^[a-z]+-\d{4}$/);
      expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });
});

describe('generateStrongPassword', () => {
  it('makes 16 URL-safe characters', () => {
    const pw = generateStrongPassword();
    expect(pw).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(generateStrongPassword()).not.toBe(pw);
  });
});
