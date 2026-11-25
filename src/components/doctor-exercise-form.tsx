'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import type { PoseMovement } from '@/lib/pose/engine';

const subscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

const GRAND_FINAL_MOVEMENTS = new Set<PoseMovement>(['chair_stand', 'elbow_bend', 'seated_knee_ext']);

export function DoctorExercisePlanForm({
  isDemo = true,
  patientId = null,
}: {
  isDemo?: boolean;
  patientId?: string | null;
}) {
  const router = useRouter();
  const canSelectMovement = useSyncExternalStore(subscribe, isClient, isServer);
  const [movement, setMovement] = useState<PoseMovement>('chair_stand');
  const [targetReps, setTargetReps] = useState('5');
  const [targetAngle, setTargetAngle] = useState<string>(
    String(exerciseCatalog.chair_stand.defaultTargetAngle),
  );
  const [maxShallow, setMaxShallow] = useState('1');
  const [painColor, setPainColor] = useState<'yellow' | 'red'>('yellow');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const bounds = exerciseCatalog[movement].angleBounds;

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (pending || !patientId) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/clinical/exercise-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          movement,
          targetReps: Number(targetReps),
          targetAngle: Number(targetAngle),
          maxShallow: Number(maxShallow),
          painColor,
        }),
      });
      if (!response.ok) {
        setError('Mashq rejasini saqlab bo‘lmadi. Qiymatlarni tekshiring.');
        return;
      }
      toast.success('Mashq rejasi biriktirildi.');
      router.refresh();
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action="/api/demo/exercise-plan"
      method="post"
      onSubmit={(event) => void handleClinicSubmit(event)}
      className="mt-3 flex flex-col gap-3.5"
      aria-labelledby="exercise-heading"
    >
      <p className="text-sm text-muted-foreground">
        3 ta asosiy CV mashq (o‘tirib-turish, tirsak bukish, oyoq tekislash) tayyor namuna va kamera bilan ishlaydi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-movement-select" className="text-sm font-semibold">
            Mashq turi
          </label>
          <NativeSelect
            id="exercise-movement-select"
            name="movement"
            value={movement}
            disabled={!canSelectMovement}
            onChange={(event) => {
              const nextMovement = event.currentTarget.value as PoseMovement;
              setMovement(nextMovement);
              setTargetAngle(String(exerciseCatalog[nextMovement].defaultTargetAngle));
            }}
          >
            {Object.values(exerciseCatalog).map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortTitle}{GRAND_FINAL_MOVEMENTS.has(item.id) ? ' ★' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-target-reps" className="text-sm font-semibold">
            Takror soni
          </label>
          <Input
            id="exercise-target-reps"
            type="number"
            name="targetReps"
            value={targetReps}
            onChange={(e) => setTargetReps(e.currentTarget.value)}
            min={1}
            max={40}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-target-angle" className="text-sm font-semibold">
            Maqsad burchagi
          </label>
          <Input
            id="exercise-target-angle"
            type="number"
            name="targetAngle"
            value={targetAngle}
            onChange={(event) => setTargetAngle(event.currentTarget.value)}
            min={bounds.min}
            max={bounds.max}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-max-shallow" className="text-sm font-semibold">
            Chala takror chegarasi
          </label>
          <Input
            id="exercise-max-shallow"
            type="number"
            name="maxShallow"
            value={maxShallow}
            onChange={(e) => setMaxShallow(e.currentTarget.value)}
            min={0}
            max={40}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="exercise-pain-color" className="text-sm font-semibold">
            Og‘riq xabari
          </label>
          <NativeSelect
            id="exercise-pain-color"
            name="painColor"
            value={painColor}
            onChange={(e) => setPainColor(e.currentTarget.value as 'yellow' | 'red')}
          >
            <option value="yellow">Tekshirish</option>
            <option value="red">Tez ko‘rib chiqish</option>
          </NativeSelect>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending || (!isDemo && !patientId)}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />}
          <span>Mashqni biriktirish</span>
        </Button>
      </div>
    </form>
  );
}
