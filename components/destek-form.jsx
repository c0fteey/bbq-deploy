'use client';

import {Loader2Icon, SaveIcon} from 'lucide-react';
import {useTransition} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

/** Destek botu ayarları. Token alanı boş bırakılırsa kayıtlı token değişmez. */
const TEXTAREA =
  'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function DestekForm({action, hasToken, logChannel, allowed, linkWhitelist, kufurWhitelist}) {
  const [pending, start] = useTransition();
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
        <div className="space-y-1.5">
          <Label htmlFor="linkWhitelist">Link beyaz listesi</Label>
          <textarea id="linkWhitelist" name="linkWhitelist" defaultValue={linkWhitelist} className={TEXTAREA} placeholder={'123456789012345678\n# notlar # ile yazılabilir'} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kufurWhitelist">Küfür beyaz listesi</Label>
          <textarea id="kufurWhitelist" name="kufurWhitelist" defaultValue={kufurWhitelist} className={TEXTAREA} placeholder={'123456789012345678\n# notlar # ile yazılabilir'} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Kullanıcı, rol ya da kanal ID&apos;si: o kişi, o role sahip herkes ya da o kanalda yazılanlar o denetimden muaf olur. Virgülle ya da alt
          alta yaz; satırda # sonrası not sayılır. Yetkililer (Mesajları Yönet) zaten muaf.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Kaydet
      </Button>
    </form>
  );
}
