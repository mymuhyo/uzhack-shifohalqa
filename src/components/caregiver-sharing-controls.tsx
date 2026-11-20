'use client';

import { useRef, useState } from 'react';
import styles from './caregiver-sharing.module.css';

type Sharing = { path: string | null; expiresAt: string | null };

const expiryFormat = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent',
});

export function CaregiverSharingControls({ initialExpiresAt }: { initialExpiresAt: string | null }) {
  const [sharing, setSharing] = useState<Sharing>({ path: null, expiresAt: initialExpiresAt });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const linkField = useRef<HTMLInputElement>(null);

  async function changeSharing(action: 'enable' | 'disable') {
    setPending(true);
    setFeedback('');
    try {
      const response = await fetch('/api/demo/caregiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error();
      const result: Sharing = await response.json();
      setSharing({
        expiresAt: result.expiresAt,
        path: result.path ? new URL(result.path, window.location.origin).href : null,
      });
      setFeedback(result.path ? 'Havola yaratildi.' : 'Ulashish o‘chirildi.');
    } catch {
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
        <p>Ulashish yoqilgan. Havola <time dateTime={sharing.expiresAt}>{expiryFormat.format(new Date(sharing.expiresAt))}</time> gacha amal qiladi · Toshkent.</p>
      ) : <p>Ulashish o‘chiq. Yangi havola 24 soat ishlaydi.</p>}
      {sharing.path && (
        <div className={styles.link}>
          <label htmlFor="caregiver-share-link">Yaqiningizga beriladigan havola</label>
          <input id="caregiver-share-link" ref={linkField} value={sharing.path} readOnly spellCheck={false} />
          <button type="button" className="text-action" onClick={copyLink}>Havolani nusxalash</button>
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className="text-action" disabled={pending} onClick={() => changeSharing('enable')}>
          {sharing.expiresAt ? 'Havolani yangilash' : 'Ulashishni yoqish'}
        </button>
        {sharing.expiresAt && (
          <button type="button" className="text-action" disabled={pending} onClick={() => changeSharing('disable')}>
            Ulashishni o‘chirish
          </button>
        )}
      </div>
      {sharing.expiresAt && <p>Havolani yangilash oldingi havolani bekor qiladi.</p>}
      <p role="status" className={styles.feedback}>{feedback}</p>
    </div>
  );
}
