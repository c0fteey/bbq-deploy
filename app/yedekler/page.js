import Link from 'next/link';
import {AlertTriangleIcon, ArchiveRestoreIcon, ArrowLeftIcon, DatabaseBackupIcon, DownloadIcon} from 'lucide-react';
import {requestBackup, restoreBackup} from './actions';
import {ActionButton} from '@/components/action-button';
import {AutoRefresh} from '@/components/auto-refresh';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {buttonVariants} from '@/components/ui/button';
import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {REASONS, isBlobConfigured, listBackups, plan} from '@/lib/backups';
import {getSettings} from '@/lib/db';
import {dateTime, timeAgo} from '@/lib/format';
import {requireUser} from '@/lib/session';

export const metadata = {title: 'Yedekler · bbq-deploy'};

function size(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BackupsPage() {
  await requireUser();
  const settings = await getSettings();
  const configured = isBlobConfigured();
  let backups = [];
  let listError = null;
  if (configured) {
    try {
      backups = await listBackups();
    } catch (error) {
      listError = error.message;
    }
  }
  const {keep} = plan(backups);
  const total = backups.reduce((sum, b) => sum + (b.size || 0), 0);
  const lastAt = Number(settings.backup_last_at) || 0;
  const errorAt = Number(settings.backup_error_at) || 0;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 md:p-8">
      <AutoRefresh ms={10000} />
      <Link href="/" className={buttonVariants({variant: 'ghost', size: 'sm'})}>
        <ArrowLeftIcon /> Panele dön
      </Link>

      {!configured ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Yedek deposu bağlı değil</AlertTitle>
          <AlertDescription>
            <p>
              Vercel&apos;de bbq-deploy projesi → <b>Storage</b> → <b>Create</b> → <b>Blob</b> → erişim olarak <b>Private</b> seç →
              projeye bağla (Connect). <code>BLOB_READ_WRITE_TOKEN</code> kendiliğinden eklenir; sonra projeyi yeniden
              deploy et. Ajan bundan sonra saatte bir yedek alır.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Veritabanı yedekleri</CardTitle>
          <CardDescription>
            VDS&apos;ten bağımsız, Vercel Blob&apos;da (gizli) durur. Saklama: son 24 saat saatlik, son 7 gün günlük, son 4 hafta
            haftalık.
          </CardDescription>
          <CardAction>
            <ActionButton action={requestBackup} disabled={!configured} success="Ajan birkaç saniye içinde yedek alacak">
              <DatabaseBackupIcon /> Şimdi yedek al
            </ActionButton>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Son yedek: <b>{lastAt ? `${timeAgo(lastAt)} (${dateTime(lastAt)})` : 'henüz yok'}</b>
            {lastAt && settings.backup_last_raw ? (
              <span className="text-muted-foreground">
                {' '}
                · veritabanı {size(settings.backup_last_raw)}, sıkıştırılmış {size(settings.backup_last_size)}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground">
            Depoda {backups.length} yedek, toplam {size(total)}
          </p>
          {settings.backup_error && errorAt > lastAt ? (
            <p className="text-red-400">
              Son deneme başarısız ({timeAgo(errorAt)}): {settings.backup_error}
            </p>
          ) : null}
          {listError ? <p className="text-red-400">Yedekler listelenemedi: {listError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {backups.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Boyut</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.pathname}>
                    <TableCell>
                      <div className="font-medium">{dateTime(b.time)}</div>
                      <div className="text-xs text-muted-foreground">{timeAgo(b.time)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {keep.get(b.pathname) ?? 'Silinecek'}
                      {b.reason !== 'saatlik' ? <span className="text-muted-foreground"> · {REASONS[b.reason] ?? b.reason}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{size(b.size)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <a
                          href={`/api/backups/download?path=${encodeURIComponent(b.pathname)}`}
                          className={buttonVariants({variant: 'outline', size: 'sm'})}
                        >
                          <DownloadIcon /> İndir
                        </a>
                        <ActionButton
                          action={restoreBackup}
                          args={[b.pathname]}
                          variant="outline"
                          size="sm"
                          confirm={`${dateTime(b.time)} yedeği geri yüklensin mi?\n\nBot kısa süre durur. Şu anki veri önce yedeklenir, sonra bu yedek yerine konur. Bu yedekten sonraki bütün oyuncu değişiklikleri geri alınır.`}
                          success="Geri yükleme sıraya alındı, ilerlemesi ana sayfadaki güncelleme listesinde"
                        >
                          <ArchiveRestoreIcon /> Geri yükle
                        </ActionButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{configured ? 'Henüz yedek yok.' : 'Depo bağlanınca yedekler burada listelenir.'}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
