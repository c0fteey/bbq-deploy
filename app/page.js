import Link from 'next/link';
import {
  ExternalLinkIcon,
  FileTextIcon,
  GitBranchIcon,
  KeyRoundIcon,
  LogOutIcon,
  PlayIcon,
  RotateCwIcon,
  ServerIcon,
  SquareIcon,
  UploadCloudIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import {cancelDeploy, controlBot, deployCommit, logout, newAgentToken, selectRepo} from './actions';
import {ActionButton} from '@/components/action-button';
import {AutoRefresh} from '@/components/auto-refresh';
import {Dashboard} from '@/components/dashboard';
import {ActivityChart, ResourceChart} from '@/components/usage-charts';
import {GithubIcon} from '@/components/github-icon';
import {SecretField} from '@/components/secret-field';
import {SetupScreen} from '@/components/setup-screen';
import {BotState, KindLabel, StatusBadge} from '@/components/status';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Button, buttonVariants} from '@/components/ui/button';
import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {agentVersion} from '@/lib/agent-script';
import {randomToken} from '@/lib/crypto';
import {getSettings, isConfigured, listDeploys, setSettings} from '@/lib/db';
import {duration, firstLine, isRecent, shortSha, timeAgo} from '@/lib/format';
import {installationRepos} from '@/lib/github';
import {allowedUser, getUser} from '@/lib/session';
import {cn} from '@/lib/utils';

const ONLINE_MS = 20_000;
const ERRORS = {
  yetki: 'Bu GitHub hesabının panele erişim izni yok.',
  giris: 'GitHub girişi tamamlanamadı, tekrar dene.',
  state: 'Giriş isteğinin süresi doldu, tekrar dene.',
};

export default async function Home({searchParams}) {
  const params = await searchParams;

  if (!isConfigured() || !allowedUser()) {
    return (
      <SetupScreen title="Kurulum eksik" description="Vercel'de ortam değişkenleri ayarlanmamış.">
        <p>Vercel → Project → Settings → Environment Variables bölümüne şunları ekle, sonra yeniden deploy et:</p>
        <ul className="list-inside list-disc space-y-1 font-mono text-xs">
          <li className={cn(isConfigured() && 'line-through opacity-50')}>TURSO_DATABASE_URL</li>
          <li className={cn(isConfigured() && 'line-through opacity-50')}>TURSO_AUTH_TOKEN</li>
          <li className={cn(allowedUser() && 'line-through opacity-50')}>ALLOWED_GITHUB_USER</li>
        </ul>
      </SetupScreen>
    );
  }

  const settings = await getSettings();

  if (!settings.app_id) {
    return (
      <SetupScreen
        title="GitHub bağlantısı"
        description="Panel, repona erişmek ve push'ları duymak için kendi GitHub App'ini kullanır."
      >
        <p className="text-muted-foreground">
          Butona basınca GitHub açılır, adı değiştirmeden <b>Create GitHub App</b> de. İzinler yalnızca repo içeriğini
          okumak ve push bildirimi almak. Hesap: <b>{allowedUser()}</b>
        </p>
        <a href="/api/github/create" className={cn(buttonVariants({size: 'lg'}), 'w-full')}>
          <GithubIcon /> GitHub App oluştur
        </a>
      </SetupScreen>
    );
  }

  const user = await getUser();
  if (!user) {
    return (
      <SetupScreen title="bbq-deploy" description="Barbeque botunun güncelleme paneli">
        {params?.hata ? (
          <Alert variant="destructive">
            <AlertDescription>{ERRORS[params.hata] ?? 'Giriş başarısız.'}</AlertDescription>
          </Alert>
        ) : null}
        <a href="/api/auth/login" className={cn(buttonVariants({size: 'lg'}), 'w-full')}>
          <GithubIcon /> GitHub ile giriş yap
        </a>
      </SetupScreen>
    );
  }

  if (!settings.agent_token) {
    settings.agent_token = randomToken(32);
    await setSettings({agent_token: settings.agent_token});
  }

  const deploys = await listDeploys(40);
  const online = isRecent(settings.agent_seen, ONLINE_MS);
  const agent = safeJson(settings.agent_info) ?? {};
  const bot = agent.bot ?? {};
  const botLog = safeJson(settings.bot_log) ?? [];
  const pickRepo = !settings.repo || params?.repo === 'degistir';
  const repos = settings.installation_id && pickRepo ? await installationRepos(settings).catch(() => null) : null;
  const installUrl = `https://github.com/apps/${settings.app_slug}/installations/new`;
  const busy = deploys.some((d) => d.status === 'running' || d.status === 'pending');

  const botCard = (
      <Card>
        <CardHeader>
          <CardTitle>Bot</CardTitle>
          <CardDescription>
            <BotState state={bot.state} online={online} />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
            <Stat label="Sürüm" mono>
              {agent.sha && settings.repo ? (
                <a
                  className="hover:underline"
                  href={`https://github.com/${settings.repo}/commit/${agent.sha}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortSha(agent.sha)}
                </a>
              ) : (
                shortSha(agent.sha)
              )}
            </Stat>
            <Stat label="Açık kalma">{online && bot.state === 'running' ? duration(bot.since) : '—'}</Stat>
            <Stat label="Çökme (24 sa)">{online ? (bot.crashes ?? 0) : '—'}</Stat>
            <Stat label="Ajan">{settings.agent_seen ? timeAgo(settings.agent_seen) : 'hiç bağlanmadı'}</Stat>
            <Stat label="Ajan sürümü">
              <AgentVersion current={agent.version} latest={agentVersion()} />
            </Stat>
          </dl>
          <div className="flex flex-wrap gap-2">
            <ActionButton action={controlBot} args={['restart']} variant="outline" success="Yeniden başlatma sıraya alındı">
              <RotateCwIcon /> Yeniden başlat
            </ActionButton>
            {bot.state === 'stopped' ? (
              <ActionButton action={controlBot} args={['start']} variant="outline" success="Başlatma sıraya alındı">
                <PlayIcon /> Başlat
              </ActionButton>
            ) : (
              <ActionButton
                action={controlBot}
                args={['stop']}
                variant="outline"
                confirm="Bot durdurulsun mu? Panelden tekrar başlatana kadar kapalı kalır."
                success="Durdurma sıraya alındı"
              >
                <SquareIcon /> Durdur
              </ActionButton>
            )}
            <ActionButton action={deployCommit} args={[null]} success="Son sürüm sıraya alındı">
              <UploadCloudIcon /> Son sürümü yükle
            </ActionButton>
          </div>
          {!online ? (
            <Alert>
              <ServerIcon />
              <AlertTitle>Ajan çevrimdışı</AlertTitle>
              <AlertDescription>
                VDS’deki ajan son {ONLINE_MS / 1000} saniyedir bağlanmadı. İşler sıraya alınır, ajan bağlanınca
                uygulanır.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
  );

  const repoCard = (
      <Card>
        <CardHeader>
          <CardTitle>Repo</CardTitle>
          <CardDescription>Push gelince bot güncellenir</CardDescription>
          {settings.repo && !pickRepo ? (
            <CardAction>
              <Link href="/?repo=degistir" className={buttonVariants({variant: 'ghost', size: 'sm'})}>
                Değiştir
              </Link>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!settings.installation_id ? (
            <>
              <p className="text-muted-foreground">GitHub App’i bot reposuna kur. Yalnızca o repoyu seçmen yeterli.</p>
              <a href={installUrl} className={cn(buttonVariants(), 'w-full')}>
                <GithubIcon /> Repoyu bağla
              </a>
            </>
          ) : pickRepo ? (
            repos === null ? (
              <p className="text-red-400">Repo listesi alınamadı.</p>
            ) : (
              <form action={selectRepo} className="space-y-2">
                <select
                  name="repo"
                  defaultValue={settings.repo ?? repos[0]?.fullName}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName} className="bg-background">
                      {r.fullName}
                    </option>
                  ))}
                </select>
                <input
                  name="branch"
                  placeholder="Dal (boş = varsayılan dal)"
                  defaultValue={settings.branch ?? ''}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Kaydet
                  </Button>
                  <a href={installUrl} className={buttonVariants({variant: 'outline'})}>
                    Repo ekle
                  </a>
                </div>
              </form>
            )
          ) : (
            <>
              <a
                href={`https://github.com/${settings.repo}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-medium hover:underline"
              >
                <GithubIcon className="size-4" /> {settings.repo} <ExternalLinkIcon className="size-3" />
              </a>
              <p className="flex items-center gap-2 text-muted-foreground">
                <GitBranchIcon className="size-4" /> {settings.branch}
              </p>
            </>
          )}
        </CardContent>
      </Card>
  );

  const deploysCard = (
      <Card>
        <CardHeader>
          <CardTitle>Güncellemeler</CardTitle>
          <CardDescription>Son 40 işlem</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {deploys.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Henüz bir işlem yok. Bot reposuna push ettiğinde burada görünecek.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Commit</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="hidden md:table-cell">Kim</TableHead>
                  <TableHead className="hidden sm:table-cell">Ne zaman</TableHead>
                  <TableHead className="pr-4 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deploys.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-48 pl-4 sm:max-w-md">
                      <Link href={`/deploys/${d.id}`} className="block truncate font-medium hover:underline">
                        {firstLine(d.message) || '—'}
                      </Link>
                      <span className="flex items-center gap-2">
                        <KindLabel kind={d.kind} />
                        {d.sha ? <span className="font-mono text-xs text-muted-foreground">{shortSha(d.sha)}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{d.author || '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{timeAgo(d.created_at)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/deploys/${d.id}`}
                          className={buttonVariants({variant: 'ghost', size: 'icon-sm'})}
                          aria-label="Log"
                          title="Log"
                        >
                          <FileTextIcon />
                        </Link>
                        {d.status === 'pending' ? (
                          <ActionButton action={cancelDeploy} args={[Number(d.id)]} variant="ghost" size="icon-sm" title="İptal">
                            <XIcon />
                          </ActionButton>
                        ) : d.sha && d.status !== 'running' ? (
                          <ActionButton
                            action={deployCommit}
                            args={[Number(d.id)]}
                            variant="ghost"
                            size="icon-sm"
                            title="Bu sürümü yükle"
                            confirm={`${shortSha(d.sha)} sürümü yüklensin mi?`}
                            success="Sıraya alındı"
                          >
                            <UploadCloudIcon />
                          </ActionButton>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
  );

  const botlogCard = (
      <Card>
        <CardHeader>
          <CardTitle>Bot çıktısı</CardTitle>
          <CardDescription>Son satırlar, ajan 10 saniyede bir gönderir</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-lg bg-black/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
            {botLog.length ? botLog.join('\n') : 'Henüz çıktı yok.'}
          </pre>
        </CardContent>
      </Card>
  );

  const tokenCard = (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" /> Ajan token’ı
          </CardTitle>
          <CardDescription>VDS kurulumunda bu değer istenir</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SecretField value={settings.agent_token} />
          <p className="text-xs text-muted-foreground">
            Ajan sürümü: {agent.version ?? '—'}. Token’ı yenilersen VDS’de <code>C:\Barbeque\agent\config.json</code>{' '}
            dosyasına yenisini yazman gerekir.
          </p>
          <ActionButton
            action={newAgentToken}
            variant="destructive"
            size="sm"
            confirm="Yeni token oluşturulsun mu? Eski token hemen geçersiz olur."
            success="Yeni token oluşturuldu"
          >
            Token’ı yenile
          </ActionButton>
        </CardContent>
      </Card>
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
      <AutoRefresh ms={busy ? 2000 : 5000} />

      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit logo */}
          <img src="/logo.png" alt="Barbeque" width={36} height={36} className="size-9 object-contain" />
          <div>
            <h1 className="leading-tight font-semibold">bbq-deploy</h1>
            <p className="text-xs text-muted-foreground">Barbeque bot paneli</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/oyuncular" className={buttonVariants({variant: 'outline', size: 'sm'})}>
            <UsersIcon /> Oyuncular
          </Link>
          <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
            <GithubIcon className="size-4" /> {user}
          </span>
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOutIcon /> Çıkış
            </Button>
          </form>
        </div>
      </header>

      <Dashboard
        initialOrder={safeJson(settings.layout)}
        cards={[
          {id: 'bot', span: 4, node: botCard},
          {id: 'repo', span: 2, node: repoCard},
          {id: 'resources', span: 3, node: <ResourceChart />},
          {id: 'activity', span: 3, node: <ActivityChart />},
          {id: 'deploys', span: 6, node: deploysCard},
          {id: 'botlog', span: 4, node: botlogCard},
          {id: 'token', span: 2, node: tokenCard},
        ]}
      />
    </div>
  );
}

/** "1.3.0" < "1.4.0" */
function olderVersion(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

/**
 * VDS'deki ajanın bildirdiği sürüm ve paneldeki en yeni sürümle karşılaştırması. Ajan eskiyse birkaç dakika içinde
 * kendini günceller (1.1.0 ve sonrası); güncellenmezse kur.bat yeniden çalıştırılmalı.
 */
function AgentVersion({current, latest}) {
  if (!current) return <span className="text-muted-foreground">—</span>;
  const behind = latest && olderVersion(current, latest);
  return (
    <span className="flex flex-col">
      <span className="font-mono">{current}</span>
      {behind ? (
        <span className="text-xs font-normal text-amber-500" title="Ajan birkaç dakika içinde kendini günceller; güncellenmezse VDS'de kur.bat'ı yeniden çalıştır.">
          {latest} bekleniyor
        </span>
      ) : (
        <span className="text-xs font-normal text-emerald-500">güncel</span>
      )}
    </span>
  );
}

function Stat({label, children, mono}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-medium', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

function safeJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
