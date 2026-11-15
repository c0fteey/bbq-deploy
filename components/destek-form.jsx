'use client';

import {Loader2Icon, SaveIcon} from 'lucide-react';
import {useTransition} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

/** Destek botu ayarları. Yalnızca token değişince bot yeniden başlar; kanallar ve alan adları anında uygulanır. Token alanı boş bırakılırsa kayıtlı token değişmez. */
export function DestekForm({action, hasToken, logChannel, joinChannel, leaveChannel, allowed}) {
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
            toast.success(data.get('token') ? 'Kaydedildi; yeni token ile destek botu birkaç saniye içinde yeniden başlar' : 'Kaydedildi; birkaç saniye içinde uygulanır, bot yeniden başlamaz');
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="joinChannel">Sunucuya eklendi kanalı</Label>
          <Input id="joinChannel" name="joinChannel" inputMode="numeric" defaultValue={joinChannel} placeholder="Kanal ID'si" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leaveChannel">Sunucudan çıkarıldı kanalı</Label>
          <Input id="leaveChannel" name="leaveChannel" inputMode="numeric" defaultValue={leaveChannel} placeholder="Kanal ID'si" />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Barbeque bir sunucuya eklenince ya da atılınca Lucia bu kanallara sunucunun adını, ID&apos;sini, resmini, banner&apos;ını ve üye sayısını
          yazar. Boş bırakılan kanala yazılmaz; ikisi aynı kanal olabilir. Lucia&apos;nın o kanalda mesaj gönderme izni olmalı.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="allowed">İzinli alan adları</Label>
        <Input id="allowed" name="allowed" defaultValue={allowed} placeholder="micup.gg, youtube.com" />
        <p className="text-xs text-muted-foreground">Virgülle ayır. Alt alan adları da izinli olur. Davet linkleri her zaman silinir.</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Kaydet
      </Button>
    </form>
  );
}
