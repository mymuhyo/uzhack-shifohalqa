'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { UrgentSymptomType } from '@/lib/clinical-types';
import styles from './patient-clinical.module.css';

const symptomLabels: Record<UrgentSymptomType, string> = {
  chest_pain: 'Ko‘krak og‘rig‘i',
  dizziness: 'Bosh aylanishi',
  shortness_of_breath: 'Nafas qisishi',
  severe_headache: 'Kuchli bosh og‘rig‘i',
};

export function PatientUrgentSymptomForm({ isDemo }: { isDemo: boolean }) {
  const router = useRouter();
  const [symptom, setSymptom] = useState<UrgentSymptomType>('chest_pain');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/clinical/symptom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptom, note: note.trim() }),
      });
      if (!response.ok) {
        toast.error('Xabarni yuborib bo‘lmadi.');
        return;
      }
      setNote('');
      toast.success('Shoshilinch simptom shifokorga yuborildi.');
      router.refresh();
    } catch {
      toast.error('Tarmoq xatosi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.disclosure}>
      <summary>Shoshilinch simptom bildirish</summary>
      <form
        className={styles.fields}
        action="/api/demo/symptom"
        method="post"
        onSubmit={(event) => void handleClinicSubmit(event)}
      >
        <label htmlFor="urgent-symptom-select" className="text-sm font-semibold">
          Belgi turi
        </label>
        <NativeSelect
          id="urgent-symptom-select"
          name="symptom"
          required
          value={symptom}
          onChange={(e) => setSymptom(e.currentTarget.value as UrgentSymptomType)}
        >
          {Object.entries(symptomLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>

        <label htmlFor="urgent-symptom-note" className="text-sm font-semibold">
          Qisqa izoh (ixtiyoriy)
        </label>
        <Input
          id="urgent-symptom-note"
          name="note"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Masalan: kechqurun boshlandi"
        />

        <Button type="submit" size="lg" variant="destructive" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
          ) : (
            <AlertOctagon data-icon="inline-start" aria-hidden="true" />
          )}
          <span>Shifokorga yuborish</span>
        </Button>
      </form>
    </details>
  );
}
