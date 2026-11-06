'use client';

import {CheckIcon, CopyIcon} from 'lucide-react';
import {useState} from 'react';
import {Button} from '@/components/ui/button';

export function CopyButton({value, label = 'Kopyala'}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? 'Kopyalandı' : label}
    </Button>
  );
}
