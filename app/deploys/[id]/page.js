import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeftIcon, ExternalLinkIcon} from 'lucide-react';
import {AutoRefresh} from '@/components/auto-refresh';
import {KindLabel, StatusBadge} from '@/components/status';
import {buttonVariants} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {getDeploy, getSettings} from '@/lib/db';
import {dateTime, duration, shortSha} from '@/lib/format';
import {requireUser} from '@/lib/session';

export default async function DeployPage({params}) {
  await requireUser();
  const {id} = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [d, settings] = await Promise.all([getDeploy(Number(id)), getSettings()]);
  if (!d) notFound();
  const live = d.status === 'pending' || d.status === 'running';

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 md:p-8">
      {live ? <AutoRefresh ms={1500} /> : null}
      <Link href="/" className={buttonVariants({variant: 'ghost', size: 'sm'})}>
        <ArrowLeftIcon /> Panele dön
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg">#{d.id}</CardTitle>
            <StatusBadge status={d.status} />
            <KindLabel kind={d.kind} />
          </div>
          <CardDescription className="whitespace-pre-wrap">{d.message || '—'}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Item label="Commit">
              {d.sha && settings.repo ? (
                <a
                  href={`https://github.com/${settings.repo}/commit/${d.sha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:underline"
                >
                  {shortSha(d.sha)} <ExternalLinkIcon className="size-3" />
                </a>
              ) : (
                '—'
              )}
            </Item>
            <Item label="Kim">{d.author || '—'}</Item>
            <Item label="Oluşturuldu">{dateTime(d.created_at)}</Item>
            <Item label="Süre">{d.started_at ? duration(d.started_at, d.finished_at) : '—'}</Item>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto rounded-lg bg-black/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
            {d.log || (d.status === 'pending' ? 'Ajanın bu işi alması bekleniyor…' : 'Log yok.')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Item({label, children}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
