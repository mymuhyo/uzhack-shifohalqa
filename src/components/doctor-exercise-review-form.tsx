'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DoctorExerciseReviewForm({
  attemptId,
  isDemo,
  patientId,
}: {
  attemptId: string;
  isDemo: boolean;
  patientId: string | null;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'reviewed' | 'retake'>('reviewed');
  const [reply, setReply] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (pending || !reply.trim()) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/clinical/exercise-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(patientId ? { patientId } : {}),
          attemptId,
          decision,
          reply: reply.trim(),
        }),
      });
      if (!response.ok) {
        setError('Javobni saqlab bo‘lmadi.');
        return;
      }
      toast.success('Mashq bo‘yicha javob saqlandi.');
      router.refresh();
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="mt-3">
      <summary className="min-h-10 w-fit cursor-pointer py-2 text-sm font-semibold underline underline-offset-4">
        Ko‘rib chiqish
      </summary>
      <form
        action="/api/demo/exercise-review"
        method="post"
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-2 flex flex-col gap-3 rounded-[7.2px] border border-border bg-background/70 p-3.5"
        aria-labelledby={`exercise-review-${attemptId}`}
      >
        <h4 id={`exercise-review-${attemptId}`} className="text-sm font-semibold">
          Bemorga javob
        </h4>
        <input type="hidden" name="attemptId" value={attemptId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Qaror</legend>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              name="decision"
              type="radio"
              value="reviewed"
              checked={decision === 'reviewed'}
              onChange={() => setDecision('reviewed')}
              className="size-4 accent-[var(--action)]"
            />
            <span>Ko‘rib chiqildi</span>
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              name="decision"
              type="radio"
              value="retake"
              checked={decision === 'retake'}
              onChange={() => setDecision('retake')}
              className="size-4 accent-[var(--action)]"
            />
            <span>Qayta o‘lchash so‘ralsin</span>
          </label>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`exercise-reply-${attemptId}`} className="text-sm font-semibold">
            Mashq bo‘yicha javob (majburiy)
          </label>
          <Textarea
            id={`exercise-reply-${attemptId}`}
            name="reply"
            maxLength={500}
            rows={3}
            required
            value={reply}
            onChange={(e) => setReply(e.currentTarget.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
            <span>Javobni yuborish</span>
          </Button>
        </div>
      </form>
    </details>
  );
}
