import type { Service, Session, SessionItem, User } from '@prisma/client';

/**
 * Deleted accounts carry a "#<id>" suffix on their username so the original one
 * can be handed to a new account; that suffix is internal, never shown.
 */
export const displayUsername = (u: User) =>
  u.deletedAt ? u.username.split('#')[0] : u.username;

export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    username: displayUsername(u),
    role: u.role,
    locale: u.locale,
    active: u.active,
    deleted: u.deletedAt !== null,
    createdAt: u.createdAt,
  };
}

type SessionWithRelations = Session & {
  items?: (SessionItem & { service: Service })[];
  employee?: User;
};

export function sessionOut(s: SessionWithRelations) {
  const items = s.items?.map((i) => ({
    id: i.id,
    serviceId: i.serviceId,
    nameTr: i.service.nameTr,
    nameDe: i.service.nameDe,
    priceCents: i.priceCentsSnapshot,
    quantity: i.quantity,
    // the picker has to know it may edit this amount when correcting a record
    custom: i.service.custom,
    note: i.note,
  }));
  return {
    id: s.id,
    employeeId: s.employeeId,
    employee: s.employee ? { id: s.employee.id, name: s.employee.name } : undefined,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    status: s.status,
    editedAt: s.editedAt,
    items,
    totalCents: items?.reduce((a, i) => a + i.priceCents * i.quantity, 0) ?? 0,
    durationMinutes: s.finishedAt
      ? Math.round((s.finishedAt.getTime() - s.startedAt.getTime()) / 60_000)
      : null,
  };
}
