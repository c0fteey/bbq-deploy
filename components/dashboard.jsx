'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripHorizontalIcon, RotateCcwIcon} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';
import {saveLayout} from '@/app/actions';
import {Button} from '@/components/ui/button';
import {UsageProvider} from '@/components/usage-charts';
import {cn} from '@/lib/utils';

// Tailwind sınıfları derlemede bulunabilsin diye tam yazılır.
const SPAN = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
};

/** Kayıtlı sırayı mevcut kartlarla eşleştirir: bilinmeyenler atılır, yeni kartlar sona eklenir. */
function normalize(saved, ids) {
  const known = Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : [];
  return [...new Set([...known, ...ids])];
}

/**
 * Panel kartları: üstteki tutamaçtan sürüklenip sıralanır. Sıra veritabanına kaydedilir,
 * böylece başka cihazdan girince de aynı düzen gelir. Klavye: tutamaca odaklan, boşluk, ok tuşları, boşluk.
 */
export function Dashboard({cards, initialOrder}) {
  const ids = cards.map((c) => c.id);
  const [order, setOrder] = useState(() => normalize(initialOrder, ids));
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const current = normalize(order, ids);
  const isDefault = current.every((id, i) => id === ids[i]);

  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
    useSensor(TouchSensor, {activationConstraint: {delay: 150, tolerance: 6}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  );

  function persist(next) {
    setOrder(next);
    saveLayout(next).catch(() => toast.error('Düzen kaydedilemedi'));
  }

  function onDragEnd({active, over}) {
    if (!over || active.id === over.id) return;
    persist(arrayMove(current, current.indexOf(active.id), current.indexOf(over.id)));
  }

  return (
    <UsageProvider>
      <div className="space-y-2">
        {!isDefault ? (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => persist(ids)}>
              <RotateCcwIcon /> Düzeni sıfırla
            </Button>
          </div>
        ) : null}
        <DndContext id="panel" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={current} strategy={rectSortingStrategy}>
            <div className="grid gap-4 lg:grid-cols-6">
              {current.map((id) => (
                <SortableCard key={id} id={id} span={byId[id].span}>
                  {byId[id].node}
                </SortableCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </UsageProvider>
  );
}

function SortableCard({id, span, children}) {
  const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({id});
  return (
    <div
      ref={setNodeRef}
      style={{transform: CSS.Translate.toString(transform), transition}}
      className={cn(
        'group/sortable relative min-w-0 [&>[data-slot=card]]:h-full',
        SPAN[span],
        isDragging && 'z-10 opacity-80 [&>[data-slot=card]]:ring-2 [&>[data-slot=card]]:ring-orange-500/60',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Kartı taşı"
        title="Sürükleyerek taşı"
        className={cn(
          'absolute top-0.5 left-1/2 z-10 flex h-4 w-10 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full',
          'text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none',
          'group-hover/sortable:text-muted-foreground active:cursor-grabbing',
        )}
      >
        <GripHorizontalIcon className="size-4" />
      </button>
      {children}
    </div>
  );
}
