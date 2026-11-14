import {
  BanIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  UploadCloudIcon,
  DownloadIcon,
  XCircleIcon,
  GitCommitHorizontalIcon,
  ArchiveRestoreIcon,
  GaugeIcon,
} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';

const STATUS = {
  pending: {label: 'Bekliyor', icon: ClockIcon, className: 'bg-muted text-muted-foreground'},
  running: {label: 'Uygulanıyor', icon: Loader2Icon, className: 'bg-sky-500/15 text-sky-400', spin: true},
  success: {label: 'Başarılı', icon: CheckCircle2Icon, className: 'bg-emerald-500/15 text-emerald-400'},
  failed: {label: 'Başarısız', icon: XCircleIcon, className: 'bg-red-500/15 text-red-400'},
  rolled_back: {label: 'Geri alındı', icon: RotateCcwIcon, className: 'bg-amber-500/15 text-amber-400'},
  skipped: {label: 'Atlandı', icon: BanIcon, className: 'bg-muted text-muted-foreground'},
};

export function StatusBadge({status}) {
  const s = STATUS[status] ?? STATUS.pending;
  const Icon = s.icon;
  return (
    <Badge className={cn('border-0', s.className)}>
      <Icon className={cn(s.spin && 'animate-spin')} />
      {s.label}
    </Badge>
  );
}

const KIND = {
  push: {label: 'Push', icon: GitCommitHorizontalIcon},
  deploy: {label: 'Yeniden yükleme', icon: UploadCloudIcon},
  install: {label: 'Kurulum', icon: DownloadIcon},
  restart: {label: 'Yeniden başlatma', icon: RotateCwIcon},
  stop: {label: 'Durdurma', icon: SquareIcon},
  start: {label: 'Başlatma', icon: PlayIcon},
  restore: {label: 'Yedekten geri yükleme', icon: ArchiveRestoreIcon},
  loadtest: {label: 'Yük testi', icon: GaugeIcon},
};

export function KindLabel({kind}) {
  const k = KIND[kind] ?? {label: kind, icon: GitCommitHorizontalIcon};
  const Icon = k.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      {k.label}
    </span>
  );
}

const BOT = {
  running: {label: 'Çalışıyor', dot: 'bg-emerald-500'},
  starting: {label: 'Başlıyor', dot: 'bg-sky-500'},
  stopping: {label: 'Duruyor', dot: 'bg-amber-500'},
  stopped: {label: 'Durduruldu', dot: 'bg-zinc-500'},
  crashed: {label: 'Çöktü, yeniden deneniyor', dot: 'bg-red-500'},
  updating: {label: 'Güncelleniyor', dot: 'bg-sky-500'},
};

export function BotState({state, online}) {
  const b = online ? (BOT[state] ?? {label: 'Bilinmiyor', dot: 'bg-zinc-500'}) : {label: 'Bilinmiyor (ajan çevrimdışı)', dot: 'bg-zinc-600'};
  return (
    <span className="inline-flex items-center gap-2 font-medium">
      <span className="relative flex size-2.5">
        {online && state === 'running' ? (
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', b.dot)} />
        ) : null}
        <span className={cn('relative inline-flex size-2.5 rounded-full', b.dot)} />
      </span>
      {b.label}
    </span>
  );
}
