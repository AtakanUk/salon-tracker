/**
 * Seeds the database with an admin account, example employees and a price list.
 * Idempotent: safe to run multiple times, never touches an account that exists.
 *
 * Passwords are generated and printed once, at creation. There are no default
 * passwords: in the public publish mode the login page is on the internet, and a
 * shipped "admin123" would be found within hours.
 *
 * Set SEED_DEMO=1 to also generate ~60 days of fake sessions for testing the
 * admin dashboard (only runs when the sessions table is empty).
 * SEED_LOCALE (tr | de | en, default en) is the interface language of the new
 * accounts; everyone can switch it later.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generatePassword, generateStrongPassword } from './lib/password.js';

const prisma = new PrismaClient();

const TZ = process.env.SALON_TZ || 'Europe/Berlin';
const LOCALE = ['tr', 'de', 'en'].includes(process.env.SEED_LOCALE ?? '')
  ? process.env.SEED_LOCALE!
  : 'en';

const USERS: { name: string; username: string; role: Role }[] = [
  { name: 'Patron', username: 'admin', role: Role.ADMIN },
  { name: 'Ali', username: 'ali', role: Role.EMPLOYEE },
  { name: 'Mehmet', username: 'mehmet', role: Role.EMPLOYEE },
  { name: 'Deniz', username: 'deniz', role: Role.EMPLOYEE },
];

const SERVICES: { nameTr: string; nameDe: string; priceCents: number }[] = [
  { nameTr: 'Saç kesimi', nameDe: 'Haarschnitt', priceCents: 2000 },
  { nameTr: 'Sakal tıraşı', nameDe: 'Bartschnitt', priceCents: 1200 },
  { nameTr: 'Saç yıkama', nameDe: 'Haarwäsche', priceCents: 500 },
  { nameTr: 'Çocuk tıraşı', nameDe: 'Kinderhaarschnitt', priceCents: 1500 },
  { nameTr: 'Saç boyama', nameDe: 'Haare färben', priceCents: 3500 },
  { nameTr: 'Fön / Şekillendirme', nameDe: 'Föhnen / Styling', priceCents: 800 },
  { nameTr: 'Ağda', nameDe: 'Waxing', priceCents: 800 },
];

function tzOffsetMs(tz: string, utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - utcDate.getTime();
}

function zonedTimeToUtc(dateStr: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset);
}

function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

async function main() {
  const created: { username: string; password: string }[] = [];

  for (const u of USERS) {
    if (await prisma.user.findUnique({ where: { username: u.username } })) continue;
    const password = u.role === Role.ADMIN ? generateStrongPassword() : generatePassword();
    await prisma.user.create({
      data: {
        name: u.name,
        username: u.username,
        passwordHash: await bcrypt.hash(password, 10),
        role: u.role,
        locale: LOCALE,
      },
    });
    created.push({ username: u.username, password });
  }

  for (const s of SERVICES) {
    const existing = await prisma.service.findFirst({ where: { nameTr: s.nameTr } });
    if (!existing) {
      await prisma.service.create({
        data: { ...s, sortOrder: SERVICES.indexOf(s) },
      });
    }
  }

  console.log('Seeded users and services.');

  if (created.length > 0) {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  NEW ACCOUNTS — these passwords are NOT shown again       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    for (const c of created) console.log(`   ${c.username.padEnd(10)} ${c.password}`);
    console.log('');
    console.log('   Write them down now. Lost one? On the server: friseur password');
    console.log('   In development: npm run reset-password -w server');
    console.log('');
  }

  if (process.env.SEED_DEMO === '1') {
    const sessionCount = await prisma.session.count();
    if (sessionCount > 0) {
      console.log('Sessions already exist, skipping demo data.');
      return;
    }
    await seedDemo();
  }
}

async function seedDemo() {
  const employees = await prisma.user.findMany({ where: { role: Role.EMPLOYEE } });
  const services = await prisma.service.findMany();
  const byName = (tr: string) => services.find((s) => s.nameTr === tr)!;

  // probability that a session includes each service + rough duration each adds
  const menu = [
    { service: byName('Saç kesimi'), p: 0.85, minutes: 25 },
    { service: byName('Sakal tıraşı'), p: 0.45, minutes: 10 },
    { service: byName('Saç yıkama'), p: 0.2, minutes: 5 },
    { service: byName('Çocuk tıraşı'), p: 0.1, minutes: 20 },
    { service: byName('Saç boyama'), p: 0.06, minutes: 40 },
    { service: byName('Fön / Şekillendirme'), p: 0.15, minutes: 8 },
  ];
  // employees have different workloads so charts look realistic
  const workload: Record<string, number> = { ali: 9, mehmet: 7, deniz: 5 };

  let created = 0;
  for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
    const day = dayKey(new Date(Date.now() - daysAgo * 86_400_000), TZ);
    const [y, m, d] = day.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekday === 0) continue; // closed on Sundays

    for (const emp of employees) {
      const base = workload[emp.username] ?? 6;
      const count = Math.max(1, Math.round(base + (Math.random() - 0.5) * 4));
      for (let i = 0; i < count; i++) {
        const startHour = 9 + Math.random() * 9.5; // 09:00 - 18:30
        const startedAt = zonedTimeToUtc(day, Math.floor(startHour), Math.floor((startHour % 1) * 60), TZ);
        if (startedAt.getTime() > Date.now() - 3_600_000) continue;

        const picked = menu.filter((entry) => Math.random() < entry.p);
        if (picked.length === 0) picked.push(menu[0]);
        const durationMin = picked.reduce((a, entry) => a + entry.minutes, 0) + Math.round(Math.random() * 8);
        const finishedAt = new Date(startedAt.getTime() + durationMin * 60_000);

        // sessions older than 30 days were recorded before a price increase:
        // haircut cost 2 EUR less back then. Demonstrates that snapshots are kept.
        const oldPrices = daysAgo > 30;
        await prisma.session.create({
          data: {
            employeeId: emp.id,
            startedAt,
            finishedAt,
            status: 'COMPLETED',
            items: {
              create: picked.map((entry) => ({
                serviceId: entry.service.id,
                quantity: 1,
                priceCentsSnapshot:
                  oldPrices && entry.service.nameTr === 'Saç kesimi'
                    ? entry.service.priceCents - 200
                    : entry.service.priceCents,
              })),
            },
          },
        });
        created++;
      }
    }
  }
  console.log(`Created ${created} demo sessions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
