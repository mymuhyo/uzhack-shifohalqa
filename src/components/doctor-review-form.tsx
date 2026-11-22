'use client';

import { useState } from 'react';
import { doctorReplyTemplates } from '@/lib/clinical-templates';
import styles from './doctor-clinical.module.css';

export function DoctorReviewForm({
  action,
  idFieldName,
  idFieldValue,
  ruleKey,
  headingId,
  titleId,
}: {
  action: string;
  idFieldName: 'flagId' | 'symptomId';
  idFieldValue: string;
  ruleKey: string;
  headingId: string;
  titleId: string;
}) {
  const [reply, setReply] = useState('');
  const replyId = `review-reply-${idFieldValue}`;
  const noteId = `review-note-${idFieldValue}`;
  const templates = doctorReplyTemplates(ruleKey);

  return (
    <form
      method="post"
      action={action}
      className={styles.form}
      aria-labelledby={`${headingId} ${titleId}`}
    >
      <input type="hidden" name={idFieldName} value={idFieldValue} />
      <div className={styles.field}>
        <span>Tezkor javob shablonlari (1 klik)</span>
        <div className="template-chips">
          {templates.map((template) => (
            <button
              key={template}
              type="button"
              className="template-chip"
              aria-pressed={reply === template}
              onClick={() => setReply(template)}
            >
              {template}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={replyId}>Bemorga javob</label>
        <textarea
          id={replyId}
          name="reply"
          rows={3}
          maxLength={500}
          required
          value={reply}
          onChange={(event) => setReply(event.currentTarget.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={noteId}>Ichki izoh (ixtiyoriy)</label>
        <textarea id={noteId} name="note" rows={2} maxLength={500} />
      </div>
      <div className={styles.buttons}>
        <button className={styles.submit} name="decision" value="approved" type="submit">Qaydni tasdiqlash</button>
        <button className={styles.secondary} name="decision" value="retake" type="submit">Qayta o‘lchashni so‘rash</button>
      </div>
    </form>
  );
}
