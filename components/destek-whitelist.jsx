'use client';

import {HashIcon, HelpCircleIcon, Loader2Icon, PlusIcon, ShieldIcon, XIcon} from 'lucide-react';
import {useState, useTransition} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const TYPE = {user: 'Kullanıcı', role: 'Rol', channel: 'Kanal', unknown: 'Bulunamadı'};
const date = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul'});

/** Beyaz listedeki bir ID: resim/simge, ad, ID ve çıkarma düğmesi. */
function Badge({entry, item, onRemove, removing}) {
  const {id} = entry;
  const title = [
    item ? TYPE[item.type] : 'Adı birazdan görünür',
    item?.username ? `@${item.username}` : null,
    id,
    entry.author ? `ekleyen: ${entry.author}` : null,
    entry.createdAt ? date.format(new Date(entry.createdAt)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tint = item?.type === 'role' && item.color ? item.color : null;
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-0.5 text-xs">
      {item?.type === 'user' && item.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- Micup CDN'den küçük profil resmi
        <img src={item.avatar} alt="" width={18} height={18} className="size-[18px] shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground"
          style={tint ? {backgroundColor: tint, color: '#fff'} : undefined}
        >
          {item?.type === 'channel' ? (
            <HashIcon className="size-3" />
          ) : item?.type === 'role' ? (
            <ShieldIcon className="size-3" />
          ) : item?.type === 'user' ? (
            (item.name ?? '?').slice(0, 1).toUpperCase()
          ) : (
            <HelpCircleIcon className="size-3" />
          )}
        </span>
      )}
      <span className="truncate font-medium" style={tint ? {color: tint} : undefined}>
        {item?.type === 'channel' ? `#${item.name}` : item?.type === 'role' ? `@${item.name}` : (item?.name ?? (item ? 'Bulunamadı' : '…'))}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        aria-label={`${id} listeden çıkar`}
      >
        {removing ? <Loader2Icon className="size-3 animate-spin" /> : <XIcon className="size-3" />}
      </button>
    </span>
  );
}

function List({list, label, entries, info, add, remove}) {
  const [value, setValue] = useState('');
  const [adding, startAdd] = useTransition();
  const [removing, setRemoving] = useState(null);
  const submit = (event) => {
    event.preventDefault();
    startAdd(async () => {
      try {
        const added = await add(list, value);
        setValue('');
        toast.success(added ? `${added} ID eklendi; bot birkaç saniye içinde uygular` : 'Zaten listedeydi');
      } catch (error) {
        toast.error(error?.message || 'Eklenemedi');
      }
    });
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={`wl-${list}`}>
        {label} <span className="font-normal text-muted-foreground">({entries.length})</span>
      </Label>
      <form onSubmit={submit} className="flex gap-2">
        <Input id={`wl-${list}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Kullanıcı, rol ya da kanal ID'si" inputMode="numeric" />
        <Button type="submit" variant="outline" disabled={adding || !value.trim()}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Ekle
        </Button>
      </form>
      {entries.length ? (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <Badge
              key={entry.id}
              entry={entry}
              item={info?.[entry.id]}
              removing={removing === entry.id}
              onRemove={async () => {
                setRemoving(entry.id);
                try {
                  await remove(list, entry.id);
                  toast.success(`${info?.[entry.id]?.name ?? entry.id} çıkarıldı`);
                } catch (error) {
                  toast.error(error?.message || 'Çıkarılamadı');
                } finally {
                  setRemoving(null);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Boş.</p>
      )}
    </div>
  );
}

/** Beyaz liste (veritabanında). Ekleme/çıkarma botu yeniden başlatmaz; ajan çalışan bota iletir. */
export function DestekWhitelist({lists, info, add, remove}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <List list="link" label="Link beyaz listesi" entries={lists.link} info={info} add={add} remove={remove} />
      <List list="kufur" label="Küfür beyaz listesi" entries={lists.kufur} info={info} add={add} remove={remove} />
    </div>
  );
}
