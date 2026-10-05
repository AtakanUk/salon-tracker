/**
 * Emergency password reset — the way back in when nobody can log in.
 * Needs server access only, no login:
 *   friseur password                                       (menu / interactive list)
 *   node server/dist/tools/reset-password.js admin s3cret-pw (direct)
 * A deactivated or deleted account is reopened, otherwise a locked-out
 * single admin could never be recovered.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { MIN_PASSWORD_LENGTH, generatePassword } from '../lib/password.js';
import { displayUsername } from '../lib/serialize.js';

const [usernameArg, passwordArg] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const stateLabel = (u: User) => (u.deletedAt ? '  [DELETED]' : u.active ? '' : '  [INACTIVE]');

const listUsers = () =>
  prisma.user.findMany({
    orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { active: 'desc' }, { name: 'asc' }],
  });

async function pickInteractively() {
  const users = await listUsers();
  if (users.length === 0) fail('There are no users.');

  console.log('\nUsers:');
  users.forEach((u, i) => {
    const role = u.role === 'ADMIN' ? 'Admin' : 'Employee';
    console.log(
      `  ${String(i + 1).padStart(2)}) ${displayUsername(u).padEnd(16)} ${u.name.padEnd(20)} ${role}${stateLabel(u)}`,
    );
  });

  const rl = createInterface({ input, output });
  try {
    const choice = await rl.question('\nWhose password should be reset? (number, Enter to cancel): ');
    if (!choice.trim()) {
      console.log('Cancelled.');
      process.exit(0);
    }
    const user = users[Number(choice) - 1];
    if (!user) fail('Invalid number.');
    const typed = await rl.question('New password (Enter = generate one): ');
    return { user, password: typed.trim() || generatePassword() };
  } finally {
    rl.close();
  }
}

async function pickByArgument(name: string) {
  const wanted = name.trim().toLowerCase();
  const users = await listUsers();
  const matches = users.filter((u) => displayUsername(u).toLowerCase() === wanted);

  // Live usernames are unique, but several deleted accounts can share the same
  // display name - never guess between them, that is how the wrong account
  // gets reopened.
  const live = matches.filter((u) => !u.deletedAt);
  const candidates = live.length > 0 ? live : matches;

  if (candidates.length === 0) fail(`No user called "${name}".`);
  if (candidates.length > 1) {
    fail(
      `Several deleted accounts are called "${name}".\n` +
        'Run without arguments to pick from the list:  friseur password',
    );
  }
  return { user: candidates[0], password: passwordArg?.trim() || generatePassword() };
}

const { user, password } = usernameArg ? await pickByArgument(usernameArg) : await pickInteractively();

if (password.length < MIN_PASSWORD_LENGTH)
  fail(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);

const blocked = !user.active || user.deletedAt !== null;
let username = user.username;

if (blocked && user.deletedAt) {
  // hand the plain username back unless a live account already took it
  const plain = displayUsername(user);
  const clash = await prisma.user.findUnique({ where: { username: plain } });
  if (!clash || clash.id === user.id) username = plain;
}

await prisma.user.update({
  where: { id: user.id },
  data: {
    passwordHash: await bcrypt.hash(password, 10),
    ...(blocked ? { active: true, deletedAt: null, username } : {}),
  },
});

console.log(`\n  Account  : ${user.name} (${username})`);
console.log(`  Password : ${password}\n`);
if (blocked) console.log('Note: the account was inactive/deleted and has been reopened.');
if (username !== displayUsername(user)) {
  console.log(`Note: "${displayUsername(user)}" is taken by someone else, so the login name stays "${username}".`);
}
console.log('After signing in, the user can change their own password.\n');

await prisma.$disconnect();
