import Link from 'next/link';
import {ArrowLeftIcon, RotateCwIcon, ShieldIcon, TrashIcon, UploadCloudIcon} from 'lucide-react';
import {removeDestekToken, restartDestekBot, saveDestek, updateDestek} from './actions';
import {ActionButton} from '@/components/action-button';
import {AutoRefresh} from '@/components/auto-refresh';
import {DestekForm} from '@/components/destek-form';
import {BotState} from '@/components/status';
import {buttonVariants} from '@/components/ui/button';
import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {getSettings} from '@/lib/db';
import {destekRepo} from '@/lib/destek';
import {duration, isRecent, shortSha} from '@/lib/format';
import {requireUser} from '@/lib/session';

export const metadata = {title: 'Destek botu · bbq-deploy'};

function safeJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export default async function DestekPage() {
  await requireUser();
  const settings = await getSettings();
  const online = isRecent(settings.agent_seen, 20_000);
  const agent = safeJson(settings.agent_info) ?? {};
  const d = agent.destek;
  const {repo, branch} = destekRepo(settings);
  const hasToken = Boolean(settings.destek_token);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-8">
      <AutoRefresh ms={5000} />
      <Link href="/" className={buttonVariants({variant: 'ghost', size: 'sm'})}>
        <ArrowLeftIcon /> Panele dön
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldIcon className="size-4" /> Destek botu (guard)
          </CardTitle>
          <CardDescription>
            {d ? (
              <BotState state={d.installed ? d.state : 'stopped'} online={online} />
            ) : (
              'Ajan 1.7.0 ya da üstü gerekiyor (kendini birkaç dakika içinde günceller).'
            )}
          </CardDescription>
          <CardAction className="flex gap-2">
            <ActionButton action={updateDestek} variant="outline" size="sm" success="Güncelleme sıraya alındı">
              <UploadCloudIcon /> Güncelle
            </ActionButton>
            <ActionButton action={restartDestekBot} variant="outline" size="sm" disabled={!hasToken} success="Yeniden başlatma sıraya alındı">
              <RotateCwIcon /> Yeniden başlat
            </ActionButton>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Repo:{' '}
            <a className="font-mono hover:underline" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">
              {repo}
            </a>{' '}
            <span className="text-muted-foreground">({branch})</span> · sürüm <span className="font-mono">{shortSha(d?.sha)}</span>
          </p>
          {d ? (
            <p className="text-muted-foreground">
              {d.installed ? 'VDS’te kurulu' : 'VDS’te henüz kurulu değil (token girilince kendiliğinden kurulur)'}
              {online && d.state === 'running' ? ` · ${duration(d.since)} açık` : ''}
              {d.crashes ? ` · 24 saatte ${d.crashes} çökme` : ''}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Link ve küfür içeren mesajları siler; yetkililere (Mesajları Yönet) dokunmaz. Botun sunucuda <b>Mesajları Yönet</b> izni olmalı. Repoya
            push edince kendiliğinden güncellenir. Çıktısı ana sayfadaki bot çıktısında <code>[destek]</code> satırlarında; VDS’te ayrı pencerede
            izlemek için <code>C:\Barbeque\destek-izle.cmd</code>.
          </p>
          <p className="text-muted-foreground">
            Kurulum ya da güncelleme erişim hatası verirse: GitHub’da bbq-deploy uygulamasının ayarlarından (Repository access){' '}
            <span className="font-mono">{repo}</span> reposunu ekle.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ayarlar</CardTitle>
          <CardDescription>{hasToken ? 'Token kayıtlı.' : 'Token girilince ajan botu kurar ve başlatır.'}</CardDescription>
          {hasToken ? (
            <CardAction>
              <ActionButton
                action={removeDestekToken}
                variant="ghost"
                size="sm"
                confirm="Token kaldırılsın mı? Destek botu durur."
                success="Token kaldırıldı, destek botu duracak"
              >
                <TrashIcon /> Token’ı kaldır
              </ActionButton>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <DestekForm action={saveDestek} hasToken={hasToken} logChannel={settings.destek_log_channel ?? ''} allowed={settings.destek_allowed ?? 'micup.gg'}
            linkWhitelist={(settings.destek_wl_link ?? '').split(',').filter(Boolean).join('\n')}
            kufurWhitelist={(settings.destek_wl_kufur ?? '').split(',').filter(Boolean).join('\n')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
