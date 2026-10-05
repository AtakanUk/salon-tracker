import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { dateInputValue, euros, eurosCompact, intlLocale, serviceName } from '../../lib/format';
import { CHART_INK, colorMap } from '../../lib/palette';
import type { Overview, Timeseries, User } from '../../lib/types';
import { Card, Select, Spinner, TextInput, tableCols } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';

type Granularity = 'day' | 'week' | 'month';
type Metric = 'revenue' | 'sessions';
type Preset = 'today' | 'last7' | 'thisMonth' | 'last30' | 'custom';

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateInputValue(new Date(y, m - 1, d + n));
}

function rangeDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86_400_000,
  ) + 1;
}

function bucketLabel(bucket: string, granularity: Granularity, lang: string): string {
  const loc = intlLocale(lang);
  if (granularity === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    return new Intl.DateTimeFormat(loc, { month: 'short', year: '2-digit' }).format(
      new Date(y, m - 1, 1),
    );
  }
  const [y, m, d] = bucket.split('-').map(Number);
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const { t } = useTranslation();
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const color = pct >= 0 ? CHART_INK.deltaGood : CHART_INK.deltaBad;
  return (
    <div className="text-xs font-semibold mt-1" style={{ color }}>
      {pct >= 0 ? '▲' : '▼'} {pct > 0 ? '+' : ''}
      {pct}% <span className="text-slate-400 font-normal">{t('dashboard.vsPrev')}</span>
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = dateInputValue(new Date());
  const narrow = useMediaQuery('(max-width: 639px)');

  // opens on today: what the owner looks at first is how the day is going
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<Granularity | 'auto'>('auto');
  const [metric, setMetric] = useState<Metric>('revenue');

  const [users, setUsers] = useState<User[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [prev, setPrev] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Timeseries | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'today') {
      setFrom(today);
      setTo(today);
    } else if (p === 'last7') {
      setFrom(addDays(today, -6));
      setTo(today);
    } else if (p === 'thisMonth') {
      setFrom(`${today.slice(0, 7)}-01`);
      setTo(today);
    } else if (p === 'last30') {
      setFrom(addDays(today, -29));
      setTo(today);
    }
  };

  const days = rangeDays(from, to);
  const gran: Granularity =
    granularity !== 'auto' ? granularity : days <= 31 ? 'day' : days <= 130 ? 'week' : 'month';

  useEffect(() => {
    api<{ users: User[] }>('/users').then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  useEffect(() => {
    if (from > to) return;
    let stale = false;
    setLoading(true);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(from, -days);
    Promise.all([
      api<Overview>(`/stats/overview?from=${from}&to=${to}`),
      api<Overview>(`/stats/overview?from=${prevFrom}&to=${prevTo}`),
      api<Timeseries>(`/stats/timeseries?from=${from}&to=${to}&granularity=${gran}`),
    ])
      .then(([o, p, s]) => {
        if (stale) return;
        setOverview(o);
        setPrev(p);
        setSeries(s);
      })
      .catch(() => {})
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [from, to, gran, days]);

  // stable color per employee id across all filters
  const colors = useMemo(() => colorMap(users.map((u) => u.id)), [users]);
  const seriesEmployees = useMemo(
    () => (series ? [...series.employees].sort((a, b) => a.id - b.id) : []),
    [series],
  );

  const chartData = useMemo(
    () =>
      series?.rows.map((r) => {
        const row: Record<string, number | string> = { bucket: r.bucket };
        for (const e of r.employees) {
          row[`e${e.id}`] = metric === 'revenue' ? e.revenueCents / 100 : e.sessionCount;
        }
        return row;
      }) ?? [],
    [series, metric],
  );

  const fmtMetric = (v: number) =>
    metric === 'revenue' ? euros(Math.round(v * 100), lang) : String(v);

  const empName = (id: number) => seriesEmployees.find((e) => e.id === id)?.name ?? `#${id}`;

  const presets: { key: Preset; label: string }[] = [
    { key: 'today', label: t('dashboard.today') },
    { key: 'last7', label: t('dashboard.last7') },
    { key: 'thisMonth', label: t('dashboard.thisMonth') },
    { key: 'last30', label: t('dashboard.last30') },
    { key: 'custom', label: t('dashboard.custom') },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* filter row */}
      <Card className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${
              preset === p.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-2">
            <TextInput
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="!w-auto !py-1.5"
            />
            <span className="text-slate-400">–</span>
            <TextInput
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="!w-auto !py-1.5"
            />
          </span>
        )}
        <span className="grow" />
        <Select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity | 'auto')}
          className="!py-1.5 text-sm"
        >
          <option value="auto">{t('dashboard.day')}/{t('dashboard.week')}/{t('dashboard.month')} (auto)</option>
          <option value="day">{t('dashboard.day')}</option>
          <option value="week">{t('dashboard.week')}</option>
          <option value="month">{t('dashboard.month')}</option>
        </Select>
        {loading && <Spinner />}
      </Card>

      {/* KPI tiles */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="text-sm font-medium text-slate-500">{t('dashboard.revenue')}</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">
              {euros(overview.revenueCents, lang)}
            </div>
            {prev && <Delta current={overview.revenueCents} previous={prev.revenueCents} />}
          </Card>
          <Card>
            <div className="text-sm font-medium text-slate-500">{t('dashboard.sessions')}</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">{overview.sessionCount}</div>
            {prev && <Delta current={overview.sessionCount} previous={prev.sessionCount} />}
          </Card>
          <Card>
            <div className="text-sm font-medium text-slate-500">{t('dashboard.avgDuration')}</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">
              {overview.avgDurationMinutes} {t('work.minutes')}
            </div>
          </Card>
        </div>
      )}

      {overview && overview.sessionCount === 0 && !loading && (
        <Card className="text-center text-slate-500 py-10">{t('dashboard.noData')}</Card>
      )}

      {/* revenue trend, stacked by employee */}
      {series && chartData.length > 0 && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-bold text-slate-800">
              {metric === 'revenue' ? t('dashboard.trend') : t('dashboard.trendSessions')}
            </h2>
            {/* wraps on phones: the toggle used to get squeezed and clipped */}
            <div className="flex items-center justify-end gap-x-3 gap-y-2 flex-wrap grow">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {seriesEmployees.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: colors.get(e.id) }}
                    />
                    {e.name}
                  </span>
                ))}
              </div>
              <div className="inline-flex rounded-xl border border-slate-300 overflow-hidden shrink-0">
                {(['revenue', 'sessions'] as Metric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={`px-3 py-1 text-sm font-semibold ${
                      metric === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'
                    }`}
                  >
                    {m === 'revenue' ? t('dashboard.metricRevenue') : t('dashboard.metricSessions')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-72 [font-variant-numeric:tabular-nums]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(b: string) => bucketLabel(b, gran, lang)}
                  tick={{ fontSize: 12, fill: CHART_INK.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_INK.grid }}
                  minTickGap={20}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    metric === 'revenue' ? eurosCompact(Math.round(v * 100), lang) : String(v)
                  }
                  tick={{ fontSize: 12, fill: CHART_INK.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15,23,42,0.06)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
                        <div className="font-bold text-slate-800 mb-1">
                          {bucketLabel(String(label), gran, lang)}
                        </div>
                        {[...payload].reverse().map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ background: (p as { fill?: string }).fill ?? p.color }}
                            />
                            <span className="text-slate-600 grow">
                              {empName(Number(String(p.dataKey).slice(1)))}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {fmtMetric(Number(p.value))}
                            </span>
                          </div>
                        ))}
                        {payload.length > 1 && (
                          <div className="flex items-center gap-2 border-t border-slate-100 mt-1 pt-1">
                            <span className="w-2.5" />
                            <span className="text-slate-600 grow">{t('common.total')}</span>
                            <span className="font-bold text-slate-800">{fmtMetric(total)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {seriesEmployees.map((e) => (
                  <Bar
                    key={e.id}
                    dataKey={`e${e.id}`}
                    stackId="rev"
                    fill={colors.get(e.id)}
                    name={e.name}
                    maxBarSize={40}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* contribution donut + per-employee table */}
      {overview && overview.sessionCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h2 className="font-bold text-slate-800 mb-1">{t('dashboard.contribution')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.byEmployee.map((e) => ({ id: e.id, name: e.name, value: e.revenueCents }))}
                    dataKey="value"
                    nameKey="name"
                    // a phone-width card has no room for labels around a full-size ring
                    innerRadius={narrow ? '42%' : '55%'}
                    outerRadius={narrow ? '62%' : '80%'}
                    stroke="#ffffff"
                    strokeWidth={2}
                    label={(props: {
                      cx?: number;
                      cy?: number;
                      midAngle?: number;
                      outerRadius?: number;
                      name?: string;
                      value?: number;
                    }) => {
                      const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name, value = 0 } = props;
                      const share = value / overview.revenueCents;
                      if (share < 0.06) return <g />;
                      const rad = (-midAngle * Math.PI) / 180;
                      const x = cx + (outerRadius + (narrow ? 8 : 14)) * Math.cos(rad);
                      const y = cy + (outerRadius + (narrow ? 8 : 14)) * Math.sin(rad);
                      return (
                        // text wears ink, not the series color; the slice carries identity
                        <text
                          x={x}
                          y={y}
                          fill="#52514e"
                          fontSize={narrow ? 11 : 13}
                          fontWeight={600}
                          textAnchor={x > cx ? 'start' : 'end'}
                          dominantBaseline="central"
                        >
                          {`${name} ${Math.round(share * 100)}%`}
                        </text>
                      );
                    }}
                    labelLine={false}
                  >
                    {overview.byEmployee.map((e) => (
                      <Cell key={e.id} fill={colors.get(e.id)} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-800">{p.name}</span>{' '}
                          <span className="text-slate-600">{euros(Number(p.value), lang)}</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-slate-800 mb-2">{t('dashboard.employee')}</h2>
            <table className={`w-full text-sm [font-variant-numeric:tabular-nums] ${tableCols}`}>
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 font-medium">{t('dashboard.employee')}</th>
                  <th className="py-2 font-medium text-right">{t('dashboard.count')}</th>
                  <th className="py-2 font-medium text-right">{t('dashboard.revenue')}</th>
                  <th className="py-2 font-medium text-right">{t('dashboard.avgDuration')}</th>
                  <th className="py-2 font-medium text-right">{t('dashboard.share')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.byEmployee.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ background: colors.get(e.id) }}
                        />
                        {e.name}
                      </span>
                    </td>
                    <td className="py-2 text-right">{e.sessionCount}</td>
                    <td className="py-2 text-right font-semibold">{euros(e.revenueCents, lang)}</td>
                    <td className="py-2 text-right">
                      {e.avgDurationMinutes} {t('work.minutes')}
                    </td>
                    <td className="py-2 text-right">
                      {overview.revenueCents > 0
                        ? Math.round((e.revenueCents / overview.revenueCents) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* service breakdown */}
      {overview && overview.byService.length > 0 && (
        <Card>
          <h2 className="font-bold text-slate-800 mb-2">{t('dashboard.serviceBreakdown')}</h2>
          <table className={`w-full text-sm [font-variant-numeric:tabular-nums] ${tableCols}`}>
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 font-medium">{t('dashboard.service')}</th>
                <th className="py-2 font-medium text-right">{t('dashboard.count')}</th>
                <th className="py-2 font-medium text-right">{t('dashboard.revenue')}</th>
                <th className="py-2 font-medium text-right">{t('dashboard.share')}</th>
              </tr>
            </thead>
            <tbody>
              {overview.byService.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 font-semibold text-slate-800">{serviceName(s, lang)}</td>
                  <td className="py-2 text-right">{s.count}</td>
                  <td className="py-2 text-right font-semibold">{euros(s.revenueCents, lang)}</td>
                  <td className="py-2 text-right">
                    {overview.revenueCents > 0
                      ? Math.round((s.revenueCents / overview.revenueCents) * 100)
                      : 0}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
