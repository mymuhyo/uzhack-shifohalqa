'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, PackageX, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { MissedReason } from '@/lib/clinical-types';

const missedReasons: Record<MissedReason, string> = {
  out_of_supply: 'Dori tugadi',
  side_effects: 'Nojo‘ya ta’sir sezdim',
  forgot: 'Unutdim',
  other: 'Boshqa sabab',
};

export function PatientMedicationActions({
  taskId,
  taskTitle,
  isDemo,
}: {
  taskId: string;
  taskTitle: string;
  isDemo: boolean;
}) {
  const router = useRouter();
  const reasonId = `reason-${taskId}`;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<'taken' | 'missed' | null>(null);
  const [error, setError] = useState('');

  async function submitJson(payload: Record<string, unknown>, mode: 'taken' | 'missed') {
    if (isDemo || pendingAction) return;
    setPendingAction(mode);
    setError('');
    try {
      const response = await fetch('/api/clinical/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError('Saqlab bo‘lmadi. Qayta urinib ko‘ring.');
        return;
      }
      setSheetOpen(false);
      toast.success(mode === 'taken' ? 'Dori ichilgani saqlandi.' : 'Sabab shifokorga yuborildi.');
      router.refresh();
    } catch {
      setError('Internet aloqasi uzildi. Aloqa tiklangach qayta urinib ko‘ring.');
    } finally {
      setPendingAction(null);
    }
  }

  function handleTakenSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    void submitJson({ taskId, medicationStatus: 'taken' }, 'taken');
  }

  function handleMissedSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (!reason) {
      setError('Sababni tanlang.');
      return;
    }
    void submitJson({ taskId, medicationStatus: 'missed', reason }, 'missed');
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2.5">
      <form
        action="/api/demo/evidence"
        method="post"
        onSubmit={handleTakenSubmit}
        aria-labelledby={`taken-${taskId}`}
        className="flex-1 min-w-36"
      >
        <input type="hidden" name="taskId" value={taskId} />
        <Button
          id={`taken-${taskId}`}
          type="submit"
          name="medicationStatus"
          value="taken"
          size="lg"
          className="w-full"
          disabled={pendingAction !== null}
        >
          {pendingAction === 'taken' ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Check data-icon="inline-start" aria-hidden="true" />
          )}
          <span>Ichdim</span>
        </Button>
      </form>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="lg" className="flex-1 min-w-36">
            <XCircle data-icon="inline-start" aria-hidden="true" />
            <span>Icha olmadim</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{taskTitle} — qabul qilinmagan sababi</SheetTitle>
            <SheetDescription>
              Sababni tanlang. «Dori tugadi» tanlansa shifokor navbatiga darhol xabar chiqadi.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex flex-col gap-3.5 px-4 pb-5"
            action="/api/demo/evidence"
            method="post"
            onSubmit={handleMissedSubmit}
          >
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="medicationStatus" value="missed" />

            <div className="flex flex-wrap gap-2" role="group" aria-label="Tezkor sabab tanlash">
              {(Object.entries(missedReasons) as [MissedReason, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="template-chip inline-flex items-center gap-1.5"
                  aria-pressed={reason === value}
                  onClick={() => {
                    setReason(value);
                    setError('');
                  }}
                >
                  {value === 'out_of_supply' && <PackageX className="size-3.5 text-[var(--warn)]" aria-hidden="true" />}
                  <span>{label}</span>
                  {value === 'out_of_supply' && <Badge variant="warn">Shifokorga</Badge>}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={reasonId} className="text-sm font-semibold">
                Nega icha olmadingiz?
              </label>
              <NativeSelect
                id={reasonId}
                name="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                  setError('');
                }}
                required
              >
                <option value="" disabled>
                  Sababni tanlang
                </option>
                {Object.entries(missedReasons).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {error && (
              <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" disabled={pendingAction !== null}>
              {pendingAction === 'missed' && (
                <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              )}
              <span>Sababni yuborish</span>
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
