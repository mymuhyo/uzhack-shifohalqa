'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DoctorFollowupAckForm({
  followupId,
  noteId,
  titleId,
  isDemo,
  patientId,
}: {
  followupId: string;
  noteId: string;
  titleId: string;
  isDemo: boolean;
  patientId: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/clinical/followup-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(patientId ? { patientId } : {}),
          followupId,
          note: note.trim(),
        }),
      });
      if (!response.ok) {
        toast.error('Nazoratni yopib bo‘lmadi.');
        return;
      }
      toast.success('Nazorat shifokor tomonidan yopildi.');
      router.refresh();
    } catch {
      toast.error('Tarmoq xatosi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action="/api/demo/followup-ack"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      className="mt-3 flex flex-col gap-2.5"
      aria-labelledby={titleId}
    >
      <input type="hidden" name="followupId" value={followupId} />
      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border bg-secondary/45 p-2.5">
        <label htmlFor={noteId} className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Ichki izoh (ixtiyoriy)</span>
        </label>
        <Input
          id={noteId}
          name="note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Masalan: bemor bilan telefon orqali bog‘landim"
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <CheckCheck data-icon="inline-start" aria-hidden="true" />}
          <span>Bog‘landim · Nazoratni yopish</span>
        </Button>
      </div>
    </form>
  );
}
