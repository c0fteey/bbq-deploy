'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState, useTransition} from 'react';
import {Loader2Icon, PlusIcon, SaveIcon, SearchIcon, Trash2Icon} from 'lucide-react';
import {toast} from 'sonner';
import {adminJob, queueAdmin} from '@/app/oyuncular/actions';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (n) => Number(n ?? 0).toLocaleString('tr-TR');
const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30';

/** İşi sıraya koyar ve ajan bota iletip sonuç gelene kadar bekler (en çok ~70 sn). */
async function runJob(action, userId, params) {
  const id = await queueAdmin(action, userId, params);
  for (let i = 0; i < 140; i++) {
    await sleep(i < 10 ? 500 : 1000);
    const {status, result} = await adminJob(id);
    if (status === 'done') return result;
    if (status === 'failed') throw new Error(result?.error || 'İşlem başarısız');
  }
  throw new Error('Ajan cevap vermedi. Ajan ya da bot kapalı olabilir.');
}

export function Players({initialId = ''}) {
  const router = useRouter();
  const [userId, setUserId] = useState(initialId);
  const [data, setData] = useState(null); // {player, catalog}
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const started = useRef(false);

  function act(action, params = {}, {success, id = data?.player?.userId ?? userId} = {}) {
    setBusy(action);
    start(async () => {
      try {
        const result = await runJob(action, id, params);
        setData({player: result.player, catalog: result.catalog});
        if (success) toast.success(typeof success === 'function' ? success(result.result) : success);
        if (action !== 'lookup') router.refresh();
      } catch (error) {
        toast.error(error?.message || 'İşlem başarısız');
      } finally {
        setBusy(null);
      }
    });
  }

  useEffect(() => {
    if (initialId && !started.current) {
      started.current = true;
      act('lookup', {}, {id: initialId});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca ilk açılışta
  }, []);

  const p = data?.player;
  const catalog = data?.catalog;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Oyuncular</CardTitle>
          <CardDescription>
            Kullanıcı ID’siyle oyuncuyu getir. İşlemler ajan üzerinden bota gider, birkaç saniye sürer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = userId.trim();
              if (!/^\d{5,25}$/.test(id)) return toast.error('Kullanıcı ID’si yalnızca rakamlardan oluşmalı');
              router.replace(`/oyuncular?id=${id}`, {scroll: false});
              act('lookup', {}, {id});
            }}
          >
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Kullanıcı ID (ör. 123456789012345678)"
              inputMode="numeric"
              className="font-mono"
            />
            <Button type="submit" disabled={pending}>
              {busy === 'lookup' ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} Getir
            </Button>
          </form>
        </CardContent>
      </Card>

      {p ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-mono">{p.userId}</CardTitle>
              <CardDescription>
                {p.exists ? `Seviye ${p.level.level} · ${num(p.level.current)} / ${num(p.level.needed)} XP` : 'Bu oyuncunun hiç verisi yok.'}
                {p.rulesAccepted ? '' : ' · Kuralları onaylamamış'}
                {p.marriage ? ` · Evli: ${p.marriage.partnerId}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <ValueEditor key={`m${p.money}`} label="Para" value={p.money} disabled={pending} onSave={(value) => act('setMoney', {value}, {success: 'Para ayarlandı'})}>
                  <AddMoney disabled={pending} onAdd={(amount) => act('addMoney', {amount}, {success: 'Para eklendi'})} />
                </ValueEditor>
                <ValueEditor key={`x${p.xp}`} label="Toplam XP" value={p.xp} disabled={pending} onSave={(value) => act('setXp', {value}, {success: 'XP ayarlandı'})} />
                <ValueEditor key={`s${p.shards}`} label="Weapon Shard" value={p.shards} disabled={pending} onSave={(value) => act('setShards', {value}, {success: 'Shard ayarlandı'})} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Info label="Şans">{p.luck}</Info>
                <Info label="Kurabiye">{p.cookies}</Info>
                <Info label="Daily serisi">{p.dailyStreak}</Info>
                <Info label="Wallpaper">{p.wallpaper ?? 'varsayılan'}</Info>
              </dl>
              {p.title || p.about ? (
                <p className="text-sm text-muted-foreground">
                  {p.title ? <b>{p.title}</b> : null} {p.about}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <CountList
            title="Envanter"
            empty="Envanter boş."
            rows={p.inventory.map((row) => ({key: row.item, label: `${row.id ?? ''} ${row.name}`.trim(), count: row.count}))}
            options={catalog.items.map((item) => ({key: item.key, label: `${item.id} · ${item.name}`}))}
            disabled={pending}
            onSet={(item, count) => act('setItem', {item, count}, {success: 'Envanter güncellendi'})}
          />

          <CountList
            title="Hayvanlar"
            empty="Hiç hayvanı yok."
            description="Adet değişince toplam yakalanan (zoo puanı) düşmez."
            rows={p.zoo.map((row) => ({key: row.animal, label: `${row.emoji} ${row.name}${row.nickname ? ` (${row.nickname})` : ''}`, count: row.count, extra: `toplam ${row.total}`}))}
            options={catalog.animals.map((animal) => ({key: animal.key, label: `${animal.emoji} ${animal.name} · ${animal.rarity}`}))}
            disabled={pending}
            onSet={(animal, count) => act('setAnimal', {animal, count}, {success: 'Hayvan güncellendi'})}
          />

          <Weapons player={p} catalog={catalog} disabled={pending} act={act} />

          <DangerZone player={p} disabled={pending} onDelete={() => act('deletePlayer', {}, {success: 'Oyuncunun verisi silindi'})} />
        </>
      ) : null}
    </>
  );
}

function Info({label, children}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ValueEditor({label, value, disabled, onSave, children}) {
  const [text, setText] = useState(String(value));
  const changed = text.replace(/[\s.,_]/g, '') !== String(value);
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{num(value)}</div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) onSave(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" className="font-mono" />
        <Button type="submit" size="icon" variant="outline" disabled={disabled || !changed} title="Kaydet">
          <SaveIcon />
        </Button>
      </form>
      {children}
    </div>
  );
}

function AddMoney({disabled, onAdd}) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim());
        setText('');
      }}
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ / − ekle" inputMode="numeric" className="font-mono" />
      <Button type="submit" size="icon" variant="outline" disabled={disabled || !text.trim()} title="Ekle">
        <PlusIcon />
      </Button>
    </form>
  );
}

function CountRow({row, disabled, onSet}) {
  const [text, setText] = useState(String(row.count));
  return (
    <TableRow>
      <TableCell>{row.label}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.extra ?? ''}</TableCell>
      <TableCell className="w-48">
        <form
          className="flex justify-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSet(row.key, text);
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" className="w-24 font-mono" />
          <Button type="submit" size="icon" variant="outline" disabled={disabled || text === String(row.count)} title="Kaydet">
            <SaveIcon />
          </Button>
          <Button type="button" size="icon" variant="ghost" disabled={disabled} title="Sil (0 yap)" onClick={() => onSet(row.key, 0)}>
            <Trash2Icon />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

function CountList({title, description, empty, rows, options, disabled, onSet}) {
  const [key, setKey] = useState(options[0]?.key ?? '');
  const [count, setCount] = useState('1');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          <Table>
            <TableBody>
              {rows.map((row) => (
                <CountRow key={`${row.key}:${row.count}`} row={row} disabled={disabled} onSet={onSet} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
        <form
          className="flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const have = rows.find((row) => row.key === key)?.count ?? 0;
            onSet(key, have + Number(count || 0));
          }}
        >
          <select className={selectClass} value={key} onChange={(e) => setKey(e.target.value)}>
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <Input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" className="w-24 font-mono" />
          <Button type="submit" variant="outline" disabled={disabled || !key || !Number(count)}>
            <PlusIcon /> Ekle
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const RARITY_COLORS = {
  common: 'text-zinc-400',
  uncommon: 'text-emerald-400',
  rare: 'text-sky-400',
  epic: 'text-violet-400',
  mythical: 'text-amber-400',
};

function Weapons({player, catalog, disabled, act}) {
  const types = catalog.weaponTypes.filter((type) => !type.disabled);
  const [type, setType] = useState(String(types[0]?.id ?? ''));
  const [rarity, setRarity] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Silahlar</CardTitle>
        <CardDescription>{player.weapons.length} silah</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {player.weapons.length ? (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kod</TableHead>
                  <TableHead>Silah</TableHead>
                  <TableHead>Kalite</TableHead>
                  <TableHead>Takılı</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {player.weapons.map((weapon) => (
                  <TableRow key={weapon.code}>
                    <TableCell className="font-mono text-xs">{weapon.code}</TableCell>
                    <TableCell>
                      {weapon.name}
                      {weapon.favorite ? ' ⭐' : ''}
                      {weapon.empowered ? ' ✨' : ''}
                    </TableCell>
                    <TableCell className={RARITY_COLORS[weapon.rarity]}>
                      {weapon.rarity} {weapon.quality}%
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{weapon.animal ?? ''}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        title="Sil"
                        onClick={() => {
                          if (window.confirm(`${weapon.code} (${weapon.name}) silinsin mi?`)) act('deleteWeapon', {code: weapon.code}, {success: 'Silah silindi'});
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Hiç silahı yok.</p>
        )}
        <form
          className="flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            act('addWeapon', {type: Number(type), rarity: rarity || null}, {success: (r) => `Silah verildi: ${r.code}`});
          }}
        >
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">Rastgele (kasadan çıkmış gibi)</option>
            {catalog.weaponRarities.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={disabled || !type}>
            <PlusIcon /> Silah ver
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone({player, disabled, onDelete}) {
  const [text, setText] = useState('');
  return (
    <Card className="border-red-500/40">
      <CardHeader>
        <CardTitle className="text-red-400">Oyuncuyu sil</CardTitle>
        <CardDescription>
          Para, XP, envanter, hayvanlar, takımlar, silahlar, gemler, evlilik ve wallpaper’lar silinir. Geri alınamaz. Onaylamak
          için ID’yi yaz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() !== player.userId) return;
            onDelete();
            setText('');
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={player.userId} className="font-mono" />
          <Button type="submit" variant="destructive" disabled={disabled || text.trim() !== player.userId}>
            <Trash2Icon /> Sil
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
