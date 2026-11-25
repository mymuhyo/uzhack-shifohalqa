'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { doctorReplyTemplates } from '@/lib/clinical-templates';

export function DoctorReviewForm({
  action,
  idFieldName,
  idFieldValue,
  ruleKey,
  headingId,
  titleId,
  isDemo = true,
  patientId = null,
}: {
  action: string;
  idFieldName: 'flagId' | 'symptomId';
  idFieldValue: string;
  ruleKey: string;
  headingId: string;
  titleId: string;
  isDemo?: boolean;
  patientId?: string | null;
}) {
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [pendingDecision, setPendingDecision] = useState<'approved' | 'retake' | null>(null);
  const [error, setError] = useState('');
  const replyId = `review-reply-${idFieldValue}`;
  const noteId = `review-note-${idFieldValue}`;
  const templates = doctorReplyTemplates(ruleKey);

  async function submitDecision(decision: 'approved' | 'retake') {
    if (isDemo || pendingDecision) return;
    if (!reply.trim()) {
      setError('Bemorga javob matnini kiriting.');
      return;
    }
    setPendingDecision(decision);
    setError('');
    try {
      const endpoint = idFieldName === 'flagId' ? '/api/clinical/review' : '/api/clinical/symptom-review';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(patientId ? { patientId } : {}),
          [idFieldName]: idFieldValue,
          decision,
          reply: reply.trim(),
          note: note.trim(),
        }),
      });
      if (!response.ok) {
        setError('Qarorni saqlab bo‘lmadi. Sahifani yangilab qayta urinib ko‘ring.');
        return;
      }
      toast.success(decision === 'approved' ? 'Qayd L4 darajasida tasdiqlandi.' : 'Qayta o‘lchash so‘raldi.');
      router.refresh();
    } catch {
      setError('Tarmoq xatosi. Qayta urinib ko‘ring.');
    } finally {
      setPendingDecision(null);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === 'retake' ? 'retake' : 'approved';
    void submitDecision(decision);
  }

  return (
    <form
      method="post"
      action={action}
      onSubmit={handleFormSubmit}
      className="mt-3 flex flex-col gap-3.5 border-t border-border pt-3.5"
      aria-labelledby={`${headingId} ${titleId}`}
    >
      <input type="hidden" name={idFieldName} value={idFieldValue} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Tezkor javob shablonlari (1 klik)</span>
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor={replyId} className="text-sm font-semibold">
          Bemorga javob
        </label>
        <Textarea
          id={replyId}
          name="reply"
          rows={3}
          maxLength={500}
          required
          value={reply}
          onChange={(event) => setReply(event.currentTarget.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border bg-secondary/45 p-3">
        <label htmlFor={noteId} className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Ichki izoh (ixtiyoriy)</span>
        </label>
        <p className="text-xs text-muted-foreground">
          Faqat shifokor ko‘radi — bemor va yaqinimga chiqarilmaydi.
        </p>
        <Textarea
          id={noteId}
          name="note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button name="decision" value="approved" type="submit" disabled={pendingDecision !== null}>
          {pendingDecision === 'approved' ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
          <span>Qaydni tasdiqlash</span>
        </Button>
        <Button name="decision" value="retake" type="submit" variant="outline" disabled={pendingDecision !== null}>
          {pendingDecision === 'retake' ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <RotateCcw data-icon="inline-start" aria-hidden="true" />}
          <span>Qayta o‘lchashni so‘rash</span>
        </Button>
      </div>
    </form>
  );
}
