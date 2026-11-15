'use client';

import {Loader2Icon} from 'lucide-react';
import {useTransition} from 'react';
import {toast} from 'sonner';
import {ConfirmButton} from '@/components/confirm-dialog';

/**
 * Sunucu işlemini çağıran, bekleme ve bildirim gösteren buton.
 * confirm: {title, description, confirmLabel, hold} verilirse önce panelin modalı açılır (hold: basılı tutarak onay).
 */
export function ActionButton({action, args = [], success, confirm, children, ...props}) {
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      {...props}
      confirm={confirm}
      disabled={pending || props.disabled}
      onConfirm={() =>
        start(async () => {
          try {
            await action(...args);
            if (success) toast.success(success);
          } catch (error) {
            toast.error(error?.message || 'İşlem başarısız');
          }
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </ConfirmButton>
  );
}
