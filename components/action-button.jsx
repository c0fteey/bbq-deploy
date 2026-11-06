'use client';

import {Loader2Icon} from 'lucide-react';
import {useTransition} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';

/** Sunucu işlemini çağıran, bekleme ve bildirim gösteren buton. */
export function ActionButton({action, args = [], success, confirm, children, ...props}) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            await action(...args);
            if (success) toast.success(success);
          } catch (error) {
            toast.error(error?.message || 'İşlem başarısız');
          }
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
