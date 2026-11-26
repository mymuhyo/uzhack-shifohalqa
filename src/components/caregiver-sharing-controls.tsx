'use client';

import { useRef, useState } from 'react';
import { Copy, Link2, Share2, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClinicalClient, useHydrated } from '@/lib/clinical-client-fetch';
import styles from './caregiver-sharing.module.css';

type Sharing = { path: string | null; expiresAt: string | null };

const expiryFormat = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

export function CaregiverSharingControls({
  initialExpiresAt,
  isDemo = true,
}: {
  initialExpiresAt: string | null;
  isDemo?: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const endpoint = client.bearerToken ? '/api/clinical/caregiver' : (isDemo ? '/api/demo/caregiver' : '/api/clinical/caregiver');
  const [override, setOverride] = useState<Sharing | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const linkField = useRef<HTMLInputElement>(null);

  const sharing: Sharing = override
    ? override
    : { path: null, expiresAt: initialExpiresAt };

  async function changeSharing(action: 'enable' | 'disable') {
    setPending(true);
    setFeedback('');
    try {
      const response = await client.fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error();
      const result: Sharing = await response.json();
      setOverride({
        expiresAt: result.expiresAt,
        path: result.path ? new URL(result.path, window.location.origin).href : null,
      });
      client.hapticNotify('success');
      setFeedback(result.path ? 'Havola yaratildi.' : 'Ulashish o‘chirildi.');
    } catch {
      client.hapticNotify('error');
      setFeedback('Amal bajarilmadi. Sahifani yangilab, yana urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!sharing.path) return;
    try {
      await navigator.clipboard.writeText(sharing.path);
      setFeedback('Havola nusxalandi.');
    } catch {
      linkField.current?.focus();
      linkField.current?.select();
      setFeedback('Havolani ajratilgan maydondan nusxalang.');
    }
  }

  return (
    <div className={styles.controls}>
      {sharing.expiresAt ? (
        <p>
          Ulashish yoqilgan. Havola{' '}
          <time dateTime={sharing.expiresAt}>{expiryFormat.format(new Date(sharing.expiresAt))}</time> gacha amal qiladi · Toshkent.
        </p>
      ) : (
        <p>Ulashish o‘chiq. Yangi havola 24 soat ishlaydi.</p>
      )}
      {sharing.path && (
        <div className={styles.link}>
          <label htmlFor="caregiver-share-link" className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="size-4 text-primary" aria-hidden="true" />
            <span>Yaqiningizga beriladigan havola</span>
          </label>
          <Input id="caregiver-share-link" ref={linkField} value={sharing.path} readOnly spellCheck={false} />
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            <Copy data-icon="inline-start" aria-hidden="true" />
            <span>Havolani nusxalash</span>
          </Button>
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className="text-action" disabled={!hydrated || pending} onClick={() => void changeSharing('enable')}>
          <Share2 className="size-4" aria-hidden="true" />
          <span>{sharing.expiresAt ? 'Havolani yangilash' : 'Ulashishni yoqish'}</span>
        </button>
        {sharing.expiresAt && (
          <button type="button" className="text-action" disabled={!hydrated || pending} onClick={() => void changeSharing('disable')}>
            <ShieldOff className="size-4" aria-hidden="true" />
            <span>Ulashishni o‘chirish</span>
          </button>
        )}
      </div>
      {sharing.expiresAt && (
        <p>
          Havolani yangilash oldingi havolani bekor qiladi. Demodan chiqsangiz ham faol havola muddatigacha ishlaydi. Ulashishni tugatish uchun chiqishdan oldin «Ulashishni o‘chirish»ni bosing.
        </p>
      )}
      <p role="status" className={styles.feedback}>
        {feedback}
      </p>
    </div>
  );
}
