import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildWorkbook } from '../backup/excel.js';
import { DATE_RE, addDaysStr, startOfDayUtc } from '../lib/dates.js';
import { config } from '../config.js';

export default async function exportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAdmin);

  app.get('/sessions.xlsx', async (req, reply) => {
    const q = z
      .object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) })
      .parse(req.query);
    const wb = await buildWorkbook({
      from: startOfDayUtc(q.from, config.salonTz),
      to: startOfDayUtc(addDaysStr(q.to, 1), config.salonTz),
    });
    const buffer = await wb.xlsx.writeBuffer();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="friseur-${q.from}_${q.to}.xlsx"`);
    return reply.send(Buffer.from(buffer));
  });
}
