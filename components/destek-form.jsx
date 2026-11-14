'use client';

import {HashIcon, HelpCircleIcon, Loader2Icon, SaveIcon, ShieldIcon, XIcon} from 'lucide-react';
import {useState, useTransition} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

/** Destek botu ayarları. Token alanı boş bırakılırsa kayıtlı token değişmez. */
const TEXTAREA =
  'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** Kutudaki ID'ler (satırdaki # sonrası not sayılır). */
const idsOf = (text) => [
  ...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, ''))
      .join(',')
      .split(/[\s,]+/)
      .map((id) => id.replace(/[<@&!>]/g, ''))
      .filter((id) => /^\d{5,25}$/.test(id)),
  ),
];

/** ID'yi kutudan çıkarır; yalnızca o ID'nin olduğu satır tümden silinir. */
function removeId(text, id) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [body, ...note] = line.split('#');
      const ids = body.split(/[\s,]+/).filter(Boolean);
      if (!ids.some((x) => x.replace(/[<@&!>]/g, '') === id)) return line;
      const rest = ids.filter((x) => x.replace(/[<@&!>]/g, '') !== id);
      return rest.length ? rest.join(', ') + (note.length ? ` #${note.join('#')}` : '') : null;
    })
    .filter((line) => line !== null)
    .join('\n');
}

const TYPE = {user: 'Kullanıcı', role: 'Rol', channel: 'Kanal', unknown: 'Bulunamadı'};

/** Beyaz listedeki bir ID: resim/simge, ad, ID ve çıkarma düğmesi. */
function WhitelistBadge({id, item, onRemove}) {
  const title = item ? `${TYPE[item.type] ?? ''}${item.username ? ` · @${item.username}` : ''} · ${id}` : `${id} · kaydedince adı görünür`;
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-0.5 text-xs">
      {item?.type === 'user' && item.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- Micup CDN'den küçük profil resmi
        <img src={item.avatar} alt="" width={18} height={18} className="size-[18px] shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          style={item?.type === 'role' && item.color ? {backgroundColor: item.color, color: '#fff'} : undefined}
        >
          {item?.type === 'channel' ? <HashIcon className="size-3" /> : item?.type === 'role' ? <ShieldIcon className="size-3" /> : item?.type === 'user' ? (item.name ?? '?').slice(0, 1).toUpperCase() : <HelpCircleIcon className="size-3" />}
        </span>
      )}
      <span className="truncate font-medium" style={item?.type === 'role' && item.color ? {color: item.color} : undefined}>
        {item?.type === 'channel' ? `#${item.name}` : item?.type === 'role' ? `@${item.name}` : (item?.name ?? (item ? 'Bulunamadı' : 'Yeni'))}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${id} listeden çıkar`}>
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function WhitelistField({name, label, value, onChange, info}) {
  const ids = idsOf(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label} <span className="font-normal text-muted-foreground">({ids.length})</span>
      </Label>
      <textarea id={name} name={name} value={value} onChange={(e) => onChange(e.target.value)} className={TEXTAREA} placeholder={'123456789012345678\n# notlar # ile yazılabilir'} />
      {ids.length ? (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <WhitelistBadge key={id} id={id} item={info?.[id]} onRemove={() => onChange(removeId(value, id))} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DestekForm({action, hasToken, logChannel, allowed, linkWhitelist, kufurWhitelist, info}) {
  const [pending, start] = useTransition();
  const [linkList, setLinkList] = useState(linkWhitelist ?? '');
  const [kufurList, setKufurList] = useState(kufurWhitelist ?? '');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const data = new FormData(formElement);
        start(async () => {
          try {
            await action(data);
            formElement.elements.namedItem('token').value = '';
            toast.success('Kaydedildi; ajan birkaç saniye içinde destek botunu yeni ayarlarla başlatır');
          } catch (error) {
            toast.error(error?.message || 'Kaydedilemedi');
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="token">Destek botunun token&apos;ı</Label>
        <Input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          placeholder={hasToken ? 'Kayıtlı (değiştirmek için yenisini yapıştır)' : 'Micup > Uygulamalar > destek botu > token'}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="logChannel">Log kanalı ID&apos;si (isteğe bağlı)</Label>
        <Input id="logChannel" name="logChannel" inputMode="numeric" defaultValue={logChannel} placeholder="Silinen mesajlar bu kanala yazılır" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="allowed">İzinli alan adları</Label>
        <Input id="allowed" name="allowed" defaultValue={allowed} placeholder="micup.gg, youtube.com" />
        <p className="text-xs text-muted-foreground">Virgülle ayır. Alt alan adları da izinli olur. Davet linkleri her zaman silinir.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <WhitelistField name="linkWhitelist" label="Link beyaz listesi" value={linkList} onChange={setLinkList} info={info} />
        <WhitelistField name="kufurWhitelist" label="Küfür beyaz listesi" value={kufurList} onChange={setKufurList} info={info} />
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Kullanıcı, rol ya da kanal ID&apos;si: o kişi, o role sahip herkes ya da o kanalda yazılanlar o denetimden muaf olur. Virgülle ya da alt
          alta yaz; satırda # sonrası not sayılır. Yeni eklenenlerin adı ve resmi kaydedince görünür; × ile çıkarıp Kaydet&apos;e bas. Yetkililer
          (Mesajları Yönet) zaten muaf.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Kaydet
      </Button>
    </form>
  );
}
