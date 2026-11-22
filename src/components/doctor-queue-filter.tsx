'use client';

import { useState, type ReactNode } from 'react';

export type QueueFilterMode = 'all' | 'red' | 'yellow';

export type QueueFilterItem = {
  id: string;
  color: 'red' | 'yellow';
  node: ReactNode;
};

export function DoctorQueueFilter({
  items,
  listClassName,
}: {
  items: QueueFilterItem[];
  listClassName: string;
}) {
  const [mode, setMode] = useState<QueueFilterMode>('all');

  const redCount = items.filter((item) => item.color === 'red').length;
  const yellowCount = items.filter((item) => item.color === 'yellow').length;

  const visible = items.filter((item) => {
    if (mode === 'red') return item.color === 'red';
    if (mode === 'yellow') return item.color === 'yellow';
    return true;
  });

  return (
    <>
      <div className="filter-bar no-print" role="group" aria-label="Navbatni filtrlash">
        <button
          type="button"
          className="filter-chip"
          aria-pressed={mode === 'all'}
          onClick={() => setMode('all')}
        >
          Barchasi ({items.length})
        </button>
        {redCount > 0 && (
          <button
            type="button"
            className="filter-chip"
            aria-pressed={mode === 'red'}
            onClick={() => setMode('red')}
          >
            Tez ko‘rib chiqish ({redCount})
          </button>
        )}
        {yellowCount > 0 && (
          <button
            type="button"
            className="filter-chip"
            aria-pressed={mode === 'yellow'}
            onClick={() => setMode('yellow')}
          >
            Tekshirish ({yellowCount})
          </button>
        )}
      </div>
      <ul role="list" className={listClassName}>
        {visible.map((item) => item.node)}
      </ul>
    </>
  );
}
