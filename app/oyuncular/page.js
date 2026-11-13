import Link from 'next/link';
import {ArrowLeftIcon} from 'lucide-react';
import {Players} from '@/components/players';
import {StatusBadge} from '@/components/status';
import {buttonVariants} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {db} from '@/lib/db';
import {timeAgo} from '@/lib/format';
import {requireUser} from '@/lib/session';

export const metadata = {title: 'Oyuncular · bbq-deploy'};

const LABELS = {
  lookup: 'Görüntüleme',
  setMoney: 'Para ayarlandı',
  addMoney: 'Para eklendi',
  setXp: 'XP ayarlandı',
  setShards: 'Shard ayarlandı',
  setItem: 'Eşya ayarlandı',
  setAnimal: 'Hayvan ayarlandı',
  addWeapon: 'Silah verildi',
  deleteWeapon: 'Silah silindi',
  deletePlayer: 'Oyuncu silindi',
};
const STATUS = {pending: 'pending', running: 'running', done: 'success', failed: 'failed'};

function paramText(action, text) {
  try {
    const p = JSON.parse(text);
    if (action === 'setMoney' || action === 'setXp' || action === 'setShards') return String(p.value);
    if (action === 'addMoney') return String(p.amount);
    if (action === 'setItem') return `${p.item} = ${p.count}`;
    if (action === 'setAnimal') return `${p.animal} = ${p.count}`;
    if (action === 'addWeapon') return `${p.type}${p.rarity ? ` (${p.rarity})` : ''}`;
    if (action === 'deleteWeapon') return p.code;
  } catch {}
  return '';
}

export default async function PlayersPage({searchParams}) {
  await requireUser();
  const params = await searchParams;
  const c = await db();
  const {rows} = await c.execute(
    `SELECT id, action, user_id, user_name, params, author, status, created_at FROM admin_jobs WHERE action != 'lookup' ORDER BY id DESC LIMIT 30`,
  );

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 md:p-8">
      <Link href="/" className={buttonVariants({variant: 'ghost', size: 'sm'})}>
        <ArrowLeftIcon /> Panele dön
      </Link>
      <Players initialId={/^\d{5,25}$/.test(params?.id ?? '') ? params.id : ''} />
      <Card>
        <CardHeader>
          <CardTitle>Son işlemler</CardTitle>
          <CardDescription>Panelden oyunculara yapılan değişiklikler</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İşlem</TableHead>
                  <TableHead>Oyuncu</TableHead>
                  <TableHead>Değer</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Zaman</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{LABELS[r.action] ?? r.action}</TableCell>
                    <TableCell>
                      <Link className="hover:underline" href={`/oyuncular?id=${r.user_id}`}>
                        {r.user_name ? <span className="font-medium">{r.user_name}</span> : null}{' '}
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.user_name ? `(${r.user_id})` : r.user_id}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{paramText(r.action, r.params)}</TableCell>
                    <TableCell>
                      <StatusBadge status={STATUS[r.status] ?? r.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz işlem yok.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
