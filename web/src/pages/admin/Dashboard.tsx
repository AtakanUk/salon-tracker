import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
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
import { ChartBar, Clock, Coins, TrendDown, TrendUp, UsersThree } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { dateInputValue, euros, eurosCompact, intlLocale, serviceName } from '../../lib/format';
import { colorMap, useChartTheme } from '../../lib/palette';
import type { Overview, Timeseries, User } from '../../lib/types';
import {
  AnimatedNumber,
  Avatar,
  Card,
  CardTitle,
  EASE_OUT,
  EmptyState,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  TableWrap,
  TextInput,
  stagger,
  tableCls,
} from '../../components/ui';
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
  const up = pct >= 0;
  return (
    <div className="flex items-center gap-2 mt-3 text-[13px]">
      <span
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-full font-semibold tabular-nums ${
          up ? 'bg-go-soft text-go-text' : 'bg-danger-soft text-danger-text'
        }`}
      >
        {up ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}
        {pct > 0 ? '+' : ''}
        {pct}%
      </span>
      <span className="text-ink-3">{t('dashboard.vsPrev')}</span>
    </div>
  );
}

/** The figure's recent history, drawn from the same series as the chart below. */
function Sparkline({ values }: { values: number[] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (values.length < 2) return null;
  const w = 120;
  const h = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - (v / max) * (h - 8)]);
  const line = `M${pts.map((p) => p.join(',')).join('L')}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-28 h-10 overflow-visible shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={`spark${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--accent)] [stop-opacity:.22]" />
          <stop offset="100%" className="[stop-color:var(--accent)] [stop-opacity:0]" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line}L${w},${h}L0,${h}Z`}
        fill={`url(#spark${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: EASE_OUT }}
      />
      <circle cx={lx} cy={ly} r="3.5" strokeWidth="2" className="fill-accent stroke-surface" />
    </svg>
  );
}

function Kpi({
  icon,
  label,
  value,
  children,
  trend,
  i,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  children?: ReactNode;
  trend?: number[];
  i: number;
}) {
  return (
    <Card className="stagger flex flex-col" style={stagger(i)}>
      <div className="flex items-center gap-2.5 text-[14px] font-medium text-ink-2">
        <span className="grid place-items-center size-8 rounded-xl bg-accent-soft text-accent-text">{icon}</span>
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-[34px] font-semibold tracking-[-0.035em] leading-none text-ink">{value}</div>
        {trend && <Sparkline values={trend} />}
      </div>
      {children}
    </Card>
  );
}

/**
 * A stacked column is one bar with a single rounded end: only the segment on
 * top of each column gets the 4px radius, every other segment stays square.
 */
function stackShape(topKeyByBucket: Map<string, string>) {
  return function StackSegment(props: unknown) {
    const { x, y, width, height, fill, stroke, strokeWidth, payload, dataKey } = props as {
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      payload: { bucket: string };
      dataKey: string;
    };
    if (!height || height <= 0) return <g />;
    const r = topKeyByBucket.get(payload.bucket) === dataKey ? Math.min(4, height, width / 2) : 0;
    const d = `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  };
}

function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-raised/90 backdrop-blur-xl shadow-raised px-3.5 py-2.5 text-[13px] min-w-44">
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = dateInputValue(new Date());
  const narrow = useMediaQuery('(max-width: 639px)');
  const chart = useChartTheme();

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
  const colors = useMemo(() => colorMap(users.map((u) => u.id), chart.categorical), [users, chart]);
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

  /** Which employee's segment sits on top of each column (stack order = id order). */
  const topKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of chartData) {
      for (const e of seriesEmployees) {
        if (Number(row[`e${e.id}`]) > 0) m.set(String(row.bucket), `e${e.id}`);
      }
    }
    return m;
  }, [chartData, seriesEmployees]);
  const segment = useMemo(() => stackShape(topKey), [topKey]);

  const fmtMetric = (v: number) =>
    metric === 'revenue' ? euros(Math.round(v * 100), lang) : String(v);

  const empName = (id: number) => seriesEmployees.find((e) => e.id === id)?.name ?? `#${id}`;

  const presets: { value: Preset; label: string }[] = [
    { value: 'today', label: t('dashboard.today') },
    { value: 'last7', label: t('dashboard.last7') },
    { value: 'thisMonth', label: t('dashboard.thisMonth') },
    { value: 'last30', label: t('dashboard.last30') },
    { value: 'custom', label: t('dashboard.custom') },
  ];

  const revenueTrend = series?.rows.map((r) => r.revenueCents);
  const sessionTrend = series?.rows.map((r) => r.sessionCount);
  const share = (cents: number) =>
    overview && overview.revenueCents > 0 ? Math.round((cents / overview.revenueCents) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.dashboard')} />

      {/* filter row */}
      <div className="flex flex-wrap items-center gap-2.5 animate-enter">
        {/* scrolls sideways on a phone; the faded edge says there is more */}
        <div className="-mx-4 px-4 overflow-x-auto max-w-[calc(100%+2rem)] [scrollbar-width:none] mask-[linear-gradient(to_right,#000_85%,transparent)] sm:mask-none sm:mx-0 sm:px-0 sm:max-w-full">
          <Segmented options={presets} value={preset} onChange={applyPreset} />
        </div>
        {preset === 'custom' && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="flex items-center gap-2"
          >
            <TextInput
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-auto! h-9! rounded-full! text-[14px]"
            />
            <span className="text-ink-3">–</span>
            <TextInput
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-auto! h-9! rounded-full! text-[14px]"
            />
          </motion.span>
        )}
        <span className="grow" />
        {loading && <Spinner className="size-4" />}
        <Select
          size="sm"
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity | 'auto')}
        >
          <option value="auto">{t('dashboard.day')}/{t('dashboard.week')}/{t('dashboard.month')} (auto)</option>
          <option value="day">{t('dashboard.day')}</option>
          <option value="week">{t('dashboard.week')}</option>
          <option value="month">{t('dashboard.month')}</option>
        </Select>
      </div>

      {/* KPI tiles */}
      {overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi
            i={1}
            icon={<Coins size={18} />}
            label={t('dashboard.revenue')}
            value={<AnimatedNumber value={overview.revenueCents} format={(v) => euros(Math.round(v), lang)} />}
            trend={revenueTrend}
          >
            {prev && <Delta current={overview.revenueCents} previous={prev.revenueCents} />}
          </Kpi>
          <Kpi
            i={2}
            icon={<UsersThree size={18} />}
            label={t('dashboard.sessions')}
            value={<AnimatedNumber value={overview.sessionCount} format={(v) => String(Math.round(v))} />}
            trend={sessionTrend}
          >
            {prev && <Delta current={overview.sessionCount} previous={prev.sessionCount} />}
          </Kpi>
          <Kpi
            i={3}
            icon={<Clock size={18} />}
            label={t('dashboard.avgDuration')}
            value={
              <>
                <AnimatedNumber value={overview.avgDurationMinutes} format={(v) => String(Math.round(v))} />
                <span className="ml-1.5 text-[17px] font-medium tracking-normal text-ink-2">{t('work.minutes')}</span>
              </>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} spotlight={false}>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-9 w-40 mt-5" />
              <Skeleton className="h-6 w-28 mt-3" />
            </Card>
          ))}
        </div>
      )}

      {overview && overview.sessionCount === 0 && !loading && (
        <Card>
          <EmptyState icon={<ChartBar size={22} />}>{t('dashboard.noData')}</EmptyState>
        </Card>
      )}

      {/* revenue trend, stacked by employee */}
      {series && chartData.length > 0 && overview && overview.sessionCount > 0 && (
        <Card className="stagger" style={stagger(4)}>
          <CardTitle
            aside={
              <Segmented
                size="sm"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'revenue', label: t('dashboard.metricRevenue') },
                  { value: 'sessions', label: t('dashboard.metricSessions') },
                ]}
              />
            }
          >
            {metric === 'revenue' ? t('dashboard.trend') : t('dashboard.trendSessions')}
          </CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
            {seriesEmployees.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: colors.get(e.id) }} />
                {e.name}
              </span>
            ))}
          </div>
          <div className="h-72 [font-variant-numeric:tabular-nums]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(b: string) => bucketLabel(b, gran, lang)}
                  tick={{ fontSize: 12, fill: chart.axis }}
                  tickLine={false}
                  axisLine={{ stroke: chart.grid }}
                  minTickGap={20}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    metric === 'revenue' ? eurosCompact(Math.round(v * 100), lang) : String(v)
                  }
                  tick={{ fontSize: 12, fill: chart.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor, radius: 8 } as object}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
                    return (
                      <TooltipBox>
                        <div className="font-semibold text-ink mb-1.5">{bucketLabel(String(label), gran, lang)}</div>
                        {[...payload].reverse().map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
                            <span
                              className="size-2.5 rounded-[3px]"
                              style={{ background: (p as { fill?: string }).fill ?? p.color }}
                            />
                            <span className="text-ink-2 grow">{empName(Number(String(p.dataKey).slice(1)))}</span>
                            <span className="font-semibold text-ink tabular-nums">{fmtMetric(Number(p.value))}</span>
                          </div>
                        ))}
                        {payload.length > 1 && (
                          <div className="flex items-center gap-2 border-t border-line mt-1.5 pt-1.5">
                            <span className="text-ink-2 grow">{t('common.total')}</span>
                            <span className="font-semibold text-ink tabular-nums">{fmtMetric(total)}</span>
                          </div>
                        )}
                      </TooltipBox>
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
                    maxBarSize={24}
                    stroke={chart.surface}
                    strokeWidth={2}
                    shape={segment}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* contribution donut + per-employee table */}
      {overview && overview.sessionCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
          <Card className="stagger" style={stagger(5)}>
            <CardTitle>{t('dashboard.contribution')}</CardTitle>
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.byEmployee.map((e) => ({ id: e.id, name: e.name, value: e.revenueCents }))}
                    dataKey="value"
                    nameKey="name"
                    // a phone-width card has no room for labels around a full-size ring
                    innerRadius={narrow ? '52%' : '60%'}
                    outerRadius={narrow ? '72%' : '80%'}
                    stroke={chart.surface}
                    strokeWidth={2}
                    cornerRadius={4}
                    paddingAngle={overview.byEmployee.length > 1 ? 1 : 0}
                    animationDuration={900}
                    label={(props: {
                      cx?: number;
                      cy?: number;
                      midAngle?: number;
                      outerRadius?: number;
                      name?: string;
                      value?: number;
                    }) => {
                      const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name, value = 0 } = props;
                      const s = value / overview.revenueCents;
                      if (s < 0.06 || narrow) return <g />;
                      const rad = (-midAngle * Math.PI) / 180;
                      const x = cx + (outerRadius + 14) * Math.cos(rad);
                      const y = cy + (outerRadius + 14) * Math.sin(rad);
                      return (
                        // text wears ink, not the series color; the slice carries identity
                        <text
                          x={x}
                          y={y}
                          fill={chart.label}
                          fontSize={12}
                          fontWeight={600}
                          textAnchor={x > cx ? 'start' : 'end'}
                          dominantBaseline="central"
                        >
                          {`${name} ${Math.round(s * 100)}%`}
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
                        <TooltipBox>
                          <span className="font-semibold text-ink">{p.name}</span>{' '}
                          <span className="text-ink-2 tabular-nums">{euros(Number(p.value), lang)}</span>
                        </TooltipBox>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* the whole the slices are parts of */}
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-[12px] font-medium text-ink-3">{t('common.total')}</div>
                  <div className="text-[20px] font-semibold tracking-[-0.025em] tabular-nums">
                    {eurosCompact(overview.revenueCents, lang)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="stagger" style={stagger(6)}>
            <CardTitle>{t('dashboard.employee')}</CardTitle>
            <TableWrap>
              <table className={tableCls}>
                <thead>
                  <tr className="text-left">
                    <th>{t('dashboard.employee')}</th>
                    <th className="text-right">{t('dashboard.count')}</th>
                    <th className="text-right">{t('dashboard.revenue')}</th>
                    {/* phones: the average already sits in the KPI tile above */}
                    <th className="text-right hidden sm:table-cell">{t('dashboard.avgDuration')}</th>
                    <th className="text-right">{t('dashboard.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.byEmployee.map((e, i) => (
                    <tr key={e.id} className="stagger" style={stagger(7 + i)}>
                      <td>
                        <span className="inline-flex items-center gap-2.5 font-semibold text-ink whitespace-nowrap">
                          <Avatar name={e.name} color={colors.get(e.id)} className="size-7 text-[11px]" />
                          {e.name}
                        </span>
                      </td>
                      <td className="text-right text-ink-2">{e.sessionCount}</td>
                      <td className="text-right font-semibold whitespace-nowrap">{euros(e.revenueCents, lang)}</td>
                      <td className="text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">
                        {e.avgDurationMinutes} {t('work.minutes')}
                      </td>
                      <td className="text-right">
                        <ShareBar pct={share(e.revenueCents)} color={colors.get(e.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </div>
      )}

      {/* service breakdown */}
      {overview && overview.byService.length > 0 && (
        <Card className="stagger" style={stagger(8)}>
          <CardTitle>{t('dashboard.serviceBreakdown')}</CardTitle>
          <TableWrap>
            <table className={tableCls}>
              <thead>
                <tr className="text-left">
                  <th>{t('dashboard.service')}</th>
                  <th className="text-right">{t('dashboard.count')}</th>
                  <th className="text-right">{t('dashboard.revenue')}</th>
                  <th className="text-right">{t('dashboard.share')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.byService.map((s, i) => (
                  <tr key={s.id} className="stagger" style={stagger(9 + i)}>
                    <td className="font-semibold text-ink">{serviceName(s, lang)}</td>
                    <td className="text-right text-ink-2">{s.count}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{euros(s.revenueCents, lang)}</td>
                    <td className="text-right">
                      <ShareBar pct={share(s.revenueCents)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/** A share as a number and a bar that grows to it; the bar wears the row's series color. */
function ShareBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2.5 w-full">
      <span className="hidden sm:block relative h-1.5 w-20 rounded-full bg-fill overflow-hidden">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full origin-left"
          style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
        />
      </span>
      <span className="w-9 text-right tabular-nums text-ink-2">{pct}%</span>
    </span>
  );
}
