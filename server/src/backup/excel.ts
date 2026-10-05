import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { dayKey } from '../lib/dates.js';
import { displayUsername } from '../lib/serialize.js';
import { sessionWhere, type ExportRange } from './range.js';

const timeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: config.salonTz,
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_TR: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
  ACTIVE: 'Devam ediyor',
};

function sheetHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Human-readable data archive. Used by the nightly backup (no range = all data),
 * by the admin "download Excel" button and by the period archive (with range).
 */
export async function buildWorkbook(range?: ExportRange): Promise<ExcelJS.Workbook> {
  const where = sessionWhere(range);
  const [sessions, services, users] = await Promise.all([
    prisma.session.findMany({
      where,
      include: { items: { include: { service: true } }, employee: true },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // --- sheet 1: sessions ---
  const s1 = wb.addWorksheet('Kayıtlar');
  s1.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Tarih / Datum', key: 'date', width: 12 },
    { header: 'Saat / Uhrzeit', key: 'time', width: 9 },
    { header: 'Çalışan / Mitarbeiter', key: 'emp', width: 18 },
    { header: 'İşlemler / Leistungen', key: 'items', width: 50 },
    { header: 'Süre dk / Dauer Min.', key: 'dur', width: 12 },
    { header: 'Toplam € / Gesamt €', key: 'total', width: 14 },
    { header: 'Durum / Status', key: 'status', width: 14 },
    { header: 'Düzeltildi / Korrigiert', key: 'edited', width: 12 },
  ];
  for (const s of sessions) {
    s1.addRow({
      id: s.id,
      date: dayKey(s.startedAt, config.salonTz),
      time: timeFmt.format(s.startedAt),
      emp: s.employee.name,
      items: s.items
        .map(
          (i) =>
            `${i.service.nameTr}${i.note ? ` (${i.note})` : ''}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`,
        )
        .join(', '),
      dur: s.finishedAt
        ? Math.round((s.finishedAt.getTime() - s.startedAt.getTime()) / 60_000)
        : null,
      total: s.items.reduce((a, i) => a + i.priceCentsSnapshot * i.quantity, 0) / 100,
      status: STATUS_TR[s.status] ?? s.status,
      edited: s.editedAt ? 'Evet / Ja' : '',
    });
  }
  s1.getColumn('total').numFmt = '#,##0.00';
  sheetHeader(s1);

  // --- sheet 2: line items with snapshot prices ---
  const s2 = wb.addWorksheet('Kalemler');
  s2.columns = [
    { header: 'Kayıt ID', key: 'sid', width: 10 },
    { header: 'Tarih / Datum', key: 'date', width: 12 },
    { header: 'Çalışan / Mitarbeiter', key: 'emp', width: 18 },
    { header: 'İşlem (TR)', key: 'tr', width: 24 },
    { header: 'Leistung (DE)', key: 'de', width: 24 },
    { header: 'Açıklama / Notiz', key: 'note', width: 24 },
    { header: 'Birim € / Einzel €', key: 'price', width: 12 },
    { header: 'Adet / Anzahl', key: 'qty', width: 10 },
    { header: 'Tutar € / Betrag €', key: 'line', width: 12 },
  ];
  for (const s of sessions) {
    for (const i of s.items) {
      s2.addRow({
        sid: s.id,
        date: dayKey(s.startedAt, config.salonTz),
        emp: s.employee.name,
        tr: i.service.nameTr,
        de: i.service.nameDe,
        note: i.note ?? '',
        price: i.priceCentsSnapshot / 100,
        qty: i.quantity,
        line: (i.priceCentsSnapshot * i.quantity) / 100,
      });
    }
  }
  s2.getColumn('price').numFmt = '#,##0.00';
  s2.getColumn('line').numFmt = '#,##0.00';
  sheetHeader(s2);

  // --- sheet 3: price list ---
  const s3 = wb.addWorksheet('Fiyat Listesi');
  s3.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'İsim (TR)', key: 'tr', width: 24 },
    { header: 'Name (DE)', key: 'de', width: 24 },
    { header: 'Fiyat € / Preis €', key: 'price', width: 12 },
    { header: 'Aktif / Aktiv', key: 'active', width: 10 },
  ];
  for (const svc of services) {
    s3.addRow({
      id: svc.id,
      tr: svc.nameTr,
      de: svc.nameDe,
      // a custom service has no price of its own, 0 would read as "free"
      price: svc.custom ? 'Her kayıtta girilir / Pro Eintrag' : svc.priceCents / 100,
      active: svc.active ? 'Evet / Ja' : 'Hayır / Nein',
    });
  }
  s3.getColumn('price').numFmt = '#,##0.00';
  sheetHeader(s3);

  // --- sheet 4: employees (no password hashes) ---
  const s4 = wb.addWorksheet('Çalışanlar');
  s4.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'İsim / Name', key: 'name', width: 20 },
    { header: 'Kullanıcı adı / Benutzername', key: 'username', width: 20 },
    { header: 'Rol / Rolle', key: 'role', width: 12 },
    { header: 'Durum / Status', key: 'state', width: 18 },
  ];
  for (const u of users) {
    s4.addRow({
      id: u.id,
      name: u.name,
      username: displayUsername(u),
      role: u.role === 'ADMIN' ? 'Yönetici / Chef' : 'Çalışan / Mitarbeiter',
      // deleted accounts stay listed so the archive still explains who is who
      state: u.deletedAt ? 'Silindi / Gelöscht' : u.active ? 'Aktif / Aktiv' : 'Pasif / Inaktiv',
    });
  }
  sheetHeader(s4);

  return wb;
}
