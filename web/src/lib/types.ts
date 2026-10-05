export type Role = 'ADMIN' | 'EMPLOYEE';
export type Locale = 'tr' | 'de' | 'en';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  locale: Locale;
  active: boolean;
  /** deleted accounts stay in the database so past records keep their name */
  deleted: boolean;
}

export interface Service {
  id: number;
  nameTr: string;
  nameDe: string;
  priceCents: number;
  sortOrder: number;
  active: boolean;
  /** custom service: the amount is typed in when finishing, priceCents is unused */
  custom: boolean;
}

export interface SessionItem {
  id: number;
  serviceId: number;
  nameTr: string;
  nameDe: string;
  priceCents: number;
  quantity: number;
  custom: boolean;
  note: string | null;
}

/** What the picker hands back: an amount and a note only for custom services. */
export interface PickedItem {
  serviceId: number;
  quantity: number;
  priceCents?: number;
  note?: string;
}

export interface Session {
  id: number;
  employeeId: number;
  employee?: { id: number; name: string };
  startedAt: string;
  finishedAt: string | null;
  status: SessionStatus;
  editedAt: string | null;
  items?: SessionItem[];
  totalCents: number;
  durationMinutes: number | null;
}

export interface Board {
  active: Session | null;
  lastCompleted: Session | null;
  lastCompletedEditable: boolean;
  /** today's completed sessions, newest first */
  today: { count: number; revenueCents: number; sessions: Session[] };
  /** server clock, so the stopwatch does not depend on the device's own */
  now: string;
}

export interface Overview {
  revenueCents: number;
  sessionCount: number;
  avgDurationMinutes: number;
  byEmployee: {
    id: number;
    name: string;
    revenueCents: number;
    sessionCount: number;
    avgDurationMinutes: number;
  }[];
  byService: {
    id: number;
    nameTr: string;
    nameDe: string;
    count: number;
    revenueCents: number;
  }[];
}

export interface SystemStatus {
  uptimeSeconds: number;
  dbOk: boolean;
  disk: { freeMb: number; totalMb: number } | null;
  lastBackup: {
    startedAt: string;
    finishedAt: string;
    ok: boolean;
    files: string[];
    dump: { ok: boolean; error?: string };
    excel: { ok: boolean; error?: string };
    json: { ok: boolean; error?: string };
    mail: { sent: boolean; error?: string };
  } | null;
  backupFiles: { name: string; sizeKb: number }[];
  backupRunning: boolean;
  mailConfigured: boolean;
  errors: { time: string; method: string; url: string; message: string }[];
}

export interface Timeseries {
  granularity: 'day' | 'week' | 'month';
  employees: { id: number; name: string }[];
  rows: {
    bucket: string;
    employees: { id: number; revenueCents: number; sessionCount: number }[];
    revenueCents: number;
    sessionCount: number;
  }[];
}
