'use client';

import {ActivityIcon, CpuIcon, Loader2Icon} from 'lucide-react';
import {useEffect, useState} from 'react';
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
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
  {key: '1s', label: 'Anlık', refresh: 30_000, hint: 'Son 1 saat, dakikalık'},
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

const tickFor = (range) => (t) => (range === '1s' || range === '24s' ? hourFmt.format(t) : dayFmt.format(t));

function bucketText(minutes) {
  if (minutes === 1) return 'dakikada';
  if (minutes < 60) return `${minutes} dakikada`;
  if (minutes === 60) return 'saatte';
  return `${minutes / 60} saatte`;
}

async function fetchMetrics(range) {
  const res = await fetch(`/api/metrics?aralik=${range}`, {cache: 'no-store'});
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function UsageCharts() {
  const [range, setRange] = useState('1s');
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
  const current = RANGES.find((r) => r.key === range);

  return (
    <section className="space-y-3" aria-label="Kullanım">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Kullanım</h2>
          <p className="text-xs text-muted-foreground">{current.hint}</p>
        </div>
        <div role="tablist" aria-label="Zaman aralığı" className="inline-flex rounded-lg bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                range === r.key ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          icon={<CpuIcon className="size-4" />}
          title="Sunucu kaynakları"
          description="Botun kullandığı CPU ve RAM, sunucu kapasitesinin yüzdesi"
          series={RESOURCE}
          points={points}
          range={range}
          loading={loading}
          hasData={hasData}
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
        <ChartCard
          icon={<ActivityIcon className="size-4" />}
          title="Oyuncu aktivitesi"
          description={data ? `Her nokta: ${bucketText(data.bucketMinutes)} kaç tane` : 'Oyunlardaki hareket'}
          series={ACTIVITY}
          points={points}
          range={range}
          loading={loading}
          hasData={hasData}
          format={(v) => intFmt.format(v)}
          latestText={(s) => (latest ? intFmt.format(latest[s.key]) : '—')}
          minMax={5}
          integer
        />
      </div>
    </section>
  );
}

function ChartCard({icon, title, description, series, points, range, loading, hasData, format, latestText, extra, minMax, integer}) {
  const max = Math.max(minMax, ...points.flatMap((p) => series.map((s) => p[s.key] ?? 0)));
  const ticks = niceTicks(max * 1.1, integer);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {loading ? (
          <CardAction>
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
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
              Bu aralıkta ölçüm yok.
              <br />
              Ajan güncellendikten sonra ölçümler dakikada bir gelmeye başlar.
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
                  content={<ChartTooltip series={series} format={format} extra={extra} />}
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

function ChartTooltip({active, payload, label, series, format, extra}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const note = extra?.(point);
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 text-muted-foreground">{fullFmt.format(label)}</div>
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

function DataTable({points, series, format}) {
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
            <td className="py-1">{fullFmt.format(p.t)}</td>
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
