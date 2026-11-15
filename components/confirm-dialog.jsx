'use client';

import {AlertDialog} from '@base-ui/react/alert-dialog';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';

/** Silme butonunun ne kadar basılı tutulacağı (ms). */
const HOLD_MS = 1200;

/**
 * Basılı tutunca dolan buton: HOLD_MS boyunca bırakılmazsa onComplete çağrılır, erken bırakılırsa sıfırlanır.
 * Fare, dokunma ve klavye (Space / Enter basılı) ile çalışır.
 */
export function HoldButton({onComplete, children, className, disabled}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const startedAt = useRef(0);
  const done = useRef(false);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (!done.current) setProgress(0);
  };
  const start = () => {
    if (disabled || frame.current || done.current) return;
    startedAt.current = performance.now();
    const tick = (now) => {
      const value = Math.min(1, (now - startedAt.current) / HOLD_MS);
      setProgress(value);
      if (value >= 1) {
        frame.current = 0;
        done.current = true;
        onComplete();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      aria-label={typeof children === 'string' ? children : undefined}
      className={cn(
        'relative touch-none overflow-hidden border-destructive/70 bg-transparent text-destructive select-none hover:bg-transparent hover:text-destructive dark:border-destructive/70 dark:bg-transparent dark:hover:bg-transparent',
        className,
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      onBlur={stop}
    >
      {/* Boş buton (çerçeve + kırmızı yazı); basılı tutunca üstüne soldan sağa dolu kırmızı kopyası açılır. */}
      <span className="inline-flex items-center gap-1.5">{children}</span>
      <span
        aria-hidden="true"
        data-fill=""
        className="absolute inset-0 flex items-center justify-center gap-1.5 bg-destructive text-white"
        style={{clipPath: `inset(0 ${100 - progress * 100}% 0 0)`}}
      >
        {children}
      </span>
    </Button>
  );
}

/**
 * Tarayıcının confirm() penceresi yerine panelin kendi modalı.
 * hold: true ise (silme gibi geri alınamaz işler) onay butonu basılı tutulunca çalışır; değilse tek tıkla.
 */
export function ConfirmDialog({open, onOpenChange, title, description, confirmLabel, hold = false, onConfirm}) {
  const confirm = () => {
    onOpenChange(false);
    onConfirm();
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={(value) => onOpenChange(value)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{description}</AlertDialog.Description>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close render={<Button variant="outline" />}>Vazgeç</AlertDialog.Close>
            {hold ? (
              <HoldButton onComplete={confirm}>{confirmLabel ?? 'Silmek için basılı tut'}</HoldButton>
            ) : (
              <Button onClick={confirm}>{confirmLabel ?? 'Onayla'}</Button>
            )}
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Tıklanınca önce modal açan buton. confirm: {title, description, confirmLabel, hold}; verilmezse doğrudan onConfirm.
 * Diğer bütün özellikler Button'a gider.
 */
export function ConfirmButton({confirm, onConfirm, children, ...props}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...props} onClick={() => (confirm ? setOpen(true) : onConfirm())}>
        {children}
      </Button>
      {confirm ? <ConfirmDialog {...confirm} open={open} onOpenChange={setOpen} onConfirm={onConfirm} /> : null}
    </>
  );
}
