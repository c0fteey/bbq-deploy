'use client';

import {EyeIcon, EyeOffIcon} from 'lucide-react';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {CopyButton} from './copy-button';

export function SecretField({value}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
        {shown ? value : '•'.repeat(32)}
      </code>
      <Button variant="ghost" size="icon-sm" onClick={() => setShown(!shown)} aria-label={shown ? 'Gizle' : 'Göster'}>
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}
