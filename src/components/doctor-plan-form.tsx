'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { StrengthUnit } from '@/lib/clinical-types';

type MedDraft = {
  name: string;
  strength: string;
  strengthUnit: StrengthUnit;
  times: string[];
};

const UNIT_OPTIONS: { value: StrengthUnit; label: string }[] = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mkg (mcg)' },
  { value: 'g', label: 'g' },
  { value: 'iu', label: 'IU' },
];

const pressureFields = [
  { name: 'warnSystolic', label: 'Sistolik kuzatuv chegarasi', defaultValue: '135' },
  { name: 'warnDiastolic', label: 'Diastolik kuzatuv chegarasi', defaultValue: '85' },
  { name: 'maxSystolic', label: 'Sistolik yuqori chegara', defaultValue: '150' },
  { name: 'maxDiastolic', label: 'Diastolik yuqori chegara', defaultValue: '95' },
] as const;

export function DoctorPlanForm({
  patientName,
  patientId,
  isDemo,
}: {
  patientName: string;
  patientId: string | null;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [meds, setMeds] = useState<MedDraft[]>([
    { name: 'Namuna dori', strength: '5', strengthUnit: 'mg', times: ['08:00'] },
  ]);
  const [vitalsTime, setVitalsTime] = useState('09:00');
  const [dailyStepGoal, setDailyStepGoal] = useState('3000');
  const [bpValues, setBpValues] = useState({
    warnSystolic: '135',
    warnDiastolic: '85',
    maxSystolic: '150',
    maxDiastolic: '95',
    minSystolic: '',
    minDiastolic: '',
  });
  const [supplyFollowUp, setSupplyFollowUp] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const useMultiMedJson =
    meds.length > 1 || meds[0]!.times.length > 1 || meds[0]!.strengthUnit !== 'mg';

  function buildMedicationsPayload() {
    return meds.map((m) => ({
      name: m.name.trim(),
      strength: m.strength.trim() ? Number(m.strength) : null,
      strengthUnit: m.strengthUnit,
      times: m.times.filter((t) => /^\d{2}:\d{2}$/.test(t)),
    }));
  }

  function updateMed(index: number, patch: Partial<MedDraft>) {
    setMeds((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function addMedication() {
    if (meds.length >= 3) return;
    setMeds((prev) => [
      ...prev,
      { name: '', strength: '10', strengthUnit: 'mg', times: ['20:00'] },
    ]);
  }

  function removeMedication(index: number) {
    if (meds.length <= 1) return;
    setMeds((prev) => prev.filter((_, idx) => idx !== index));
  }

  function toggleSecondTime(index: number) {
    setMeds((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (item.times.length > 1) {
          return { ...item, times: [item.times[0]!] };
        }
        return { ...item, times: [item.times[0]!, item.times[0] === '20:00' ? '08:00' : '20:00'] };
      }),
    );
  }

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return; // Native form POST handles demo sessions
    event.preventDefault();
    if (pending || !patientId) return;
    setPending(true);
    setError('');

    try {
      const payload = {
        patientId,
        medications: buildMedicationsPayload(),
        vitalsTime,
        warnSystolic: Number(bpValues.warnSystolic),
        warnDiastolic: Number(bpValues.warnDiastolic),
        maxSystolic: Number(bpValues.maxSystolic),
        maxDiastolic: Number(bpValues.maxDiastolic),
        ...(bpValues.minSystolic.trim() ? { minSystolic: Number(bpValues.minSystolic) } : {}),
        ...(bpValues.minDiastolic.trim() ? { minDiastolic: Number(bpValues.minDiastolic) } : {}),
        supplyFollowUp,
        dailyStepGoal: Number(dailyStepGoal),
      };

      const response = await fetch('/api/clinical/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError('Reja qiymatlarini tekshiring (masalan, bosim chegaralari tartibi yoki dori nomi).');
        return;
      }

      toast.success('Uy rejasi bemorga biriktirildi.');
      router.refresh();
    } catch {
      setError('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  const firstMed = meds[0]!;

  return (
    <Card className="border border-border bg-card shadow-[var(--surface-shadow)]">
      <CardHeader>
        <CardTitle className="text-xl font-medium">
          <h2 id="plan-heading" className="text-inherit font-inherit leading-inherit">
            Uy rejasini biriktirish
          </h2>
        </CardTitle>
        <CardDescription id="plan-hint">
          {patientName} uchun reja (1–3 dori, Toshkent vaqti, yuqori va past bosim chegaralari).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          method="post"
          action="/api/demo/plan"
          onSubmit={(event) => void handleClinicSubmit(event)}
          aria-labelledby="plan-heading"
          aria-describedby="plan-hint"
        >
          {useMultiMedJson && (
            <input
              type="hidden"
              name="medicationsJson"
              value={JSON.stringify(buildMedicationsPayload())}
            />
          )}

          <div className="flex flex-col gap-3">
            {meds.map((med, idx) => {
              const isPrimary = idx === 0;
              return (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {idx + 1}-dori jadvali
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => toggleSecondTime(idx)}
                      >
                        {med.times.length > 1 ? '1 ta vaqtga tushirish' : '+ 2-qabul vaqti'}
                      </Button>
                      {!isPrimary && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => removeMedication(idx)}
                          aria-label={`${idx + 1}-dorini olib tashlash`}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label htmlFor={isPrimary ? 'medication-name' : `medication-name-${idx}`} className="text-sm font-semibold">
                        {isPrimary ? 'Dori nomi' : `${idx + 1}-dori nomi`}
                      </label>
                      <Input
                        id={isPrimary ? 'medication-name' : `medication-name-${idx}`}
                        name={isPrimary && !useMultiMedJson ? 'medicationName' : undefined}
                        value={med.name}
                        onChange={(e) => updateMed(idx, { name: e.currentTarget.value })}
                        maxLength={80}
                        pattern={String.raw`.*\p{L}.*`}
                        title="Dori nomida kamida bitta harf bo‘lsin."
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={isPrimary ? 'medication-strength' : `medication-strength-${idx}`} className="text-sm font-semibold">
                        {isPrimary ? 'Qutida yozilgan kuch (mg)' : 'Qutida yozilgan kuch'}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id={isPrimary ? 'medication-strength' : `medication-strength-${idx}`}
                          name={isPrimary && !useMultiMedJson ? 'medicationStrengthMg' : undefined}
                          type="number"
                          min="0.001"
                          max="999999.999"
                          step="0.001"
                          value={med.strength}
                          onChange={(e) => updateMed(idx, { strength: e.currentTarget.value })}
                          required
                        />
                        <NativeSelect
                          aria-label={`${idx + 1}-dori birligi`}
                          name={isPrimary && !useMultiMedJson ? 'medicationStrengthUnit' : undefined}
                          value={med.strengthUnit}
                          onChange={(e) => updateMed(idx, { strengthUnit: e.currentTarget.value as StrengthUnit })}
                          className="min-w-24"
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={isPrimary ? 'medication-time' : `medication-time-${idx}`} className="text-sm font-semibold">
                        {isPrimary ? 'Dori vaqti' : '1-vaqt'}
                      </label>
                      <Input
                        id={isPrimary ? 'medication-time' : `medication-time-${idx}`}
                        name={isPrimary && !useMultiMedJson ? 'medicationTime' : undefined}
                        type="time"
                        value={med.times[0] ?? '08:00'}
                        onChange={(e) => {
                          const next = [...med.times];
                          next[0] = e.currentTarget.value;
                          updateMed(idx, { times: next });
                        }}
                        required
                      />
                    </div>

                    {med.times.length > 1 && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`medication-time2-${idx}`} className="text-sm font-semibold">
                          2-dori vaqti (Toshkent)
                        </label>
                        <Input
                          id={`medication-time2-${idx}`}
                          type="time"
                          value={med.times[1] ?? '20:00'}
                          onChange={(e) => {
                            const next = [...med.times];
                            next[1] = e.currentTarget.value;
                            updateMed(idx, { times: next });
                          }}
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {meds.length < 3 && (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={addMedication}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                <span>Yana dori qo‘shish ({meds.length}/3)</span>
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vitals-time" className="text-sm font-semibold">
                Bosim o‘lchash vaqti
              </label>
              <Input
                id="vitals-time"
                name="vitalsTime"
                type="time"
                value={vitalsTime}
                onChange={(e) => setVitalsTime(e.currentTarget.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="daily-step-goal" className="text-sm font-semibold">
                Kunlik qadam maqsadi
              </label>
              <Input
                id="daily-step-goal"
                name="dailyStepGoal"
                type="number"
                min={100}
                max={50000}
                value={dailyStepGoal}
                onChange={(e) => setDailyStepGoal(e.currentTarget.value)}
                required
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-3.5">
            <legend className="px-1 text-sm font-semibold">Bosim chegaralari (mmHg)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {pressureFields.map(({ name, label }) => (
                <div className="flex flex-col gap-1.5" key={name}>
                  <label htmlFor={name} className="text-sm font-semibold">
                    {label}
                  </label>
                  <Input
                    id={name}
                    name={name}
                    type="number"
                    min={30}
                    max={260}
                    value={bpValues[name]}
                    onChange={(e) => setBpValues((prev) => ({ ...prev, [name]: e.currentTarget.value }))}
                    required
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minSystolic" className="text-sm font-semibold">
                  Sistolik past chegara (ixtiyoriy)
                </label>
                <Input
                  id="minSystolic"
                  name="minSystolic"
                  type="number"
                  min={50}
                  max={200}
                  placeholder="Masalan: 90"
                  value={bpValues.minSystolic}
                  onChange={(e) => setBpValues((prev) => ({ ...prev, minSystolic: e.currentTarget.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minDiastolic" className="text-sm font-semibold">
                  Diastolik past chegara (ixtiyoriy)
                </label>
                <Input
                  id="minDiastolic"
                  name="minDiastolic"
                  type="number"
                  min={30}
                  max={130}
                  placeholder="Masalan: 60"
                  value={bpValues.minDiastolic}
                  onChange={(e) => setBpValues((prev) => ({ ...prev, minDiastolic: e.currentTarget.value }))}
                />
              </div>
            </div>
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              name="supplyFollowUp"
              type="checkbox"
              value="yes"
              checked={supplyFollowUp}
              onChange={(e) => setSupplyFollowUp(e.currentTarget.checked)}
              className="size-5 accent-[var(--action)]"
            />
            <span>«Dori tugadi» xabarini tekshiruv navbatiga chiqarish</span>
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-[var(--urgent)]/40 bg-[var(--urgent-bg)] px-3 py-2 text-sm font-semibold text-[var(--urgent)]">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={pending || (!isDemo && !patientId) || !firstMed.name.trim()}>
            {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />}
            <span>Rejani biriktirish</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
