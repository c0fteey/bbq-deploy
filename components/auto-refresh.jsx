'use client';

import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

/** Sayfa açıkken sunucu verisini belirli aralıkla yeniler. */
export function AutoRefresh({ms = 4000}) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, ms]);
  return null;
}
