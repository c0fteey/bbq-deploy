'use client';

import {ActivityIcon, CpuIcon, Loader2Icon} from 'lucide-react';
import {createContext, useContext, useEffect, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {cn} from '@/lib/utils';

// Renkler koyu yüzey için doğrulandı (renk körlüğü ayrımı, kontrast). Her seri hep aynı rengi taşır.
const RESOURCE = [
  {key: 'cpu', label: 'CPU', color: '#3987e5', unit: '%'},
  {key: 'ram', label: 'RAM', color: '#d95926', unit: '%'},
];
const ACTIVITY = [
  {key: 'moves', label: 'Kabul edilen kelime', color: '#199e70'},
  {key: 'rejected', label: 'Reddedilen mesaj', color: '#c98500'},
  {key: 'guesses', label: 'Kelime Avı tahmini', color: '#9085e9'},
];

const RANGES = [
  {key: 'canli', label: 'Canlı', refresh: 5_000, hint: 'Son 5 dakika, 5 saniyede bir yenilenir'},
  {key: '1s', label: '1 saat', refresh: 30_000, hint: 'Son 1 saat, dakikalık'},
  {key: '24s', label: '24 saat', refresh: 60_000, hint: '10 dakikalık aralıklar'},
  {key: '7g', label: '7 gün', refresh: 300_000, hint: 'Saatlik aralıklar'},
  {key: '30g', label: '30 gün', refresh: 300_000, hint: '3 saatlik aralıklar'},
];

const TZ = 'Europe/Istanbul';
const hourFmt = new Intl.DateTimeFormat('tr-TR', {hour: '2-digit', minute: '2-digit', timeZone: TZ});
const dayFmt = new Intl.DateTimeFormat('tr-TR', {day: 'numeric', month: 'short', timeZone: TZ});
const fullFmt = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const intFmt = new Intl.NumberFormat('tr-TR');
const pctFmt = new Intl.NumberFormat('tr-TR', {maximumFractionDigits: 1});

const secondFmt = new Intl.DateTimeFormat('tr-TR', {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ});

const tickFor = (range) => (t) =>
  range === 'canli' ? secondFmt.format(t) : range === '1s' || range === '24s' ? hourFmt.format(t) : dayFmt.format(t);

async function fetchMetrics(range) {
  const res = await fetch(`/api/metrics?aralik=${range}`, {cache: 'no-store'});
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const UsageContext = createContext(null);

/** İki grafik aynı aralığı ve aynı veriyi paylaşır; birinde aralık değişince diğeri de değişir. */
export function UsageProvider({children}) {
  const [range, setRange] = useState('canli');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      fetchMetrics(range).then(
        (result) => {
          if (!alive) return;
          setData(result);
          setError(null);
        },
        (e) => alive && setError(`Ölçümler alınamadı (${e.message})`),
      );
    run();
    const every = RANGES.find((r) => r.key === range).refresh;
    const timer = setInterval(() => document.visibilityState === 'visible' && run(), every);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [range]);

  // Yeni aralığın verisi gelene kadar yükleniyor sayılır.
  const loading = data?.range !== range && !error;
  const points = data?.range === range ? data.points : [];
  const hasData = points.some((p) => p.cpu !== null);
  const latest = [...points].reverse().find((p) => p.cpu !== null);
  const value = {range, setRange, data, error, loading, points, hasData, latest};
  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

function RangeTabs() {
  const {range, setRange} = useContext(UsageContext);
  return (
    <div role="tablist" aria-label="Zaman aralığı" className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={range === r.key}
          title={r.hint}
          onClick={() => setRange(r.key)}
          className={cn(
            'rounded-md px-2 py-0.5 text-xs transition-colors',
            range === r.key ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function ResourceChart() {
  const {latest, data, error} = useContext(UsageContext);
  return (
    <ChartCard
      icon={<CpuIcon className="size-4" />}
      title="Sunucu kaynakları"
      description="Botun kullandığı CPU ve RAM, sunucu kapasitesinin yüzdesi"
      series={RESOURCE}
      error={error}
      format={(v) => `%${pctFmt.format(v)}`}
      latestText={(s) =>
        latest
          ? s.key === 'ram'
            ? `%${pctFmt.format(latest.ram)} · ${intFmt.format(Math.round(latest.ramMb))} MB`
            : `%${pctFmt.format(latest.cpu)}`
          : '—'
      }
      extra={(p) => (p.ramMb !== null ? `RAM ${intFmt.format(Math.round(p.ramMb))} MB` : null)}
      minMax={5}
    />
  );
}

/** Her aralıkta bir çubuğun kapsadığı süre (dakika); dakikada ortalama hesaplanırken kullanılır. */
const BUCKET_MINUTES = {canli: 5 / 60, '1s': 1, '24s': 10, '7g': 60, '30g': 180};
const RANGE_NAMES = {canli: 'son 5 dakikada', '1s': 'son 1 saatte', '24s': 'son 24 saatte', '7g': 'son 7 günde', '30g': 'son 30 günde'};
const rateFmt = new Intl.NumberFormat('tr-TR', {maximumFractionDigits: 1});

/**
 * Oyuncu aktivitesi: üstte seçili aralığın toplamları, altta her aralıkta kaç hareket olduğunu gösteren yığılmış çubuklar.
 * Sayılan olaylar (kelime, ret, tahmin) çizgiyle değil çubukla gösterilir; boş aralıklar sıfırda üst üste binen çizgi yerine boş kalır.
 */
export function ActivityChart() {
  const {range, points, loading, hasData, error} = useContext(UsageContext);
  const measured = points.filter((p) => p.cpu !== null);
  const totals = Object.fromEntries(ACTIVITY.map((s) => [s.key, measured.reduce((sum, p) => sum + (p[s.key] ?? 0), 0)]));
  const minutes = measured.length * BUCKET_MINUTES[range];
  const bars = points.map((p) => ({...p, total: ACTIVITY.reduce((sum, s) => sum + (p[s.key] ?? 0), 0)}));
  const ticks = niceTicks(Math.max(5, ...bars.map((p) => p.total)) * 1.1, true);
  const bucketText = {canli: '5 saniye', '1s': '1 dakika', '24s': '10 dakika', '7g': '1 saat', '30g': '3 saat'}[range];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4" /> Oyuncu aktivitesi
        </CardTitle>
        <CardDescription>
          Oyunlardaki hareket, {RANGE_NAMES[range]} · her çubuk {bucketText}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {loading ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
          <RangeTabs />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {/* Toplamlar: renk yalnızca işarette, sayı ve ad metin renginde (lejant da bunlar) */}
        <ul className="grid grid-cols-3 gap-2">
          {ACTIVITY.map((s) => (
            <li key={s.key} className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-start gap-1.5 text-xs leading-tight text-muted-foreground">
                <span className="mt-0.5 size-2 shrink-0 rounded-sm" style={{background: s.color}} aria-hidden="true" />
                <span>{s.label}</span>
              </div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">{hasData ? intFmt.format(totals[s.key]) : '—'}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {hasData && minutes > 0 ? `dakikada ${rateFmt.format(totals[s.key] / minutes)}` : ' '}
              </div>
            </li>
          ))}
        </ul>

        <div className="h-52">
          {!hasData && !loading ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
              {range === 'canli' ? 'Canlı veri yok: ajan çevrimdışı ya da bot kapalı.' : 'Bu aralıkta ölçüm yok.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{top: 8, right: 8, bottom: 0, left: 0}} barCategoryGap={1}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={tickFor(range)}
                  tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={48}
                />
                <YAxis
                  width={36}
                  domain={[0, ticks.at(-1)]}
                  ticks={ticks}
                  tickFormatter={(v) => intFmt.format(v)}
                  tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{fill: 'var(--muted)', opacity: 0.5}}
                  content={<ActivityTooltip live={range === 'canli'} />}
                  isAnimationActive={false}
                />
                {ACTIVITY.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="aktivite"
                    fill={s.color}
                    // Yığındaki dilimler arasında kart renginde ince boşluk; en üstteki dilimin köşeleri yuvarlak.
                    stroke="var(--card)"
                    strokeWidth={1}
                    radius={i === ACTIVITY.length - 1 ? [3, 3, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Tablo olarak göster</summary>
          <DataTable points={points} series={ACTIVITY} format={(v) => intFmt.format(v ?? 0)} range={range} />
        </details>
      </CardContent>
    </Card>
  );
}

function ActivityTooltip({active, payload, live}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 text-muted-foreground">{(live ? secondFmt : fullFmt).format(point.t)}</div>
      {point.cpu === null ? (
        <div className="text-muted-foreground">Bu aralıkta ölçüm yok</div>
      ) : (
        <>
          {ACTIVITY.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-sm" style={{background: s.color}} aria-hidden="true" />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">{intFmt.format(point[s.key] ?? 0)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t pt-1">
            <span className="text-muted-foreground">Toplam</span>
            <span className="font-semibold tabular-nums">{intFmt.format(point.total)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({icon, title, description, series, error, format, latestText, extra, minMax, integer}) {
  const {range, points, loading, hasData} = useContext(UsageContext);
  const max = Math.max(minMax, ...points.flatMap((p) => series.map((s) => p[s.key] ?? 0)));
  const ticks = niceTicks(max * 1.1, integer);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {loading ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
          <RangeTabs />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {/* Lejant: her seri adıyla ve son değeriyle; renk yalnızca işarette, yazı her zaman metin renginde */}
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full" style={{background: s.color}} aria-hidden="true" />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums">{latestText(s)}</span>
            </li>
          ))}
        </ul>

        <div className="h-56">
          {!hasData && !loading ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
              {range === 'canli' ? 'Canlı veri yok: ajan çevrimdışı ya da bot kapalı.' : 'Bu aralıkta ölçüm yok.'}
              <br />
              {range === 'canli' ? 'Ajan bağlanınca 5 saniye içinde görünür.' : 'Dakikalık ölçümler ajan çalışırken birikir.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{top: 8, right: 8, bottom: 0, left: 0}}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={tickFor(range)}
                  tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={48}
                />
                <YAxis
                  width={44}
                  domain={[0, ticks.at(-1)]}
                  ticks={ticks}
                  tickFormatter={(v) => format(v)}
                  tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3'}}
                  content={<ChartTooltip series={series} format={format} extra={extra} live={range === 'canli'} />}
                  isAnimationActive={false}
                />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{r: 4, stroke: 'var(--card)', strokeWidth: 2}}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Tablo olarak göster</summary>
          <DataTable points={points} series={series} format={format} range={range} />
        </details>
      </CardContent>
    </Card>
  );
}

/** Eksen için yuvarlak adımlar (1, 2, 2,5, 5 × 10ⁿ): 0, 20, 40, 60 gibi okunur etiketler. */
function niceTicks(max, integer) {
  const raw = max / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= raw);
  if (integer) step = Math.max(1, Math.ceil(step));
  const count = Math.ceil(max / step);
  return Array.from({length: count + 1}, (_, i) => Math.round(i * step * 100) / 100);
}

function ChartTooltip({active, payload, label, series, format, extra, live}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const note = extra?.(point);
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 text-muted-foreground">{(live ? secondFmt : fullFmt).format(label)}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-0.5 w-3 rounded-full" style={{background: s.color}} aria-hidden="true" />
            {s.label}
          </span>
          <span className="font-semibold tabular-nums">{point[s.key] === null ? 'veri yok' : format(point[s.key])}</span>
        </div>
      ))}
      {note ? <div className="mt-1 border-t pt-1 text-muted-foreground">{note}</div> : null}
    </div>
  );
}

function DataTable({points, series, format, range}) {
  const timeFmt = range === 'canli' ? secondFmt : fullFmt;
  const rows = points.filter((p) => p.cpu !== null).slice(-12).reverse();
  if (!rows.length) return <p className="pt-2">Veri yok.</p>;
  return (
    <table className="mt-2 w-full tabular-nums">
      <thead>
        <tr className="text-left">
          <th className="py-1 font-medium">Zaman</th>
          {series.map((s) => (
            <th key={s.key} className="py-1 text-right font-medium">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.t} className="border-t border-border/50">
            <td className="py-1">{timeFmt.format(p.t)}</td>
            {series.map((s) => (
              <td key={s.key} className="py-1 text-right text-foreground">
                {format(p[s.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
