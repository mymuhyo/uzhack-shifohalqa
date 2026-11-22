'use client';

import { useState } from 'react';
import { evaluateBpZone } from '@/lib/clinical-triage';
import type { BloodPressureTargets } from '@/lib/clinical-types';
import styles from './patient-clinical.module.css';

function BpZoneBanner({
  systolic,
  diastolic,
  chestPain,
  targets,
}: {
  systolic: string;
  diastolic: string;
  chestPain: boolean;
  targets: BloodPressureTargets | null;
}) {
  const zone = evaluateBpZone({ systolic, diastolic, chestPain, targets });
  if (!zone) return null;

  return (
    <p
      role="status"
      className={`bp-zone ${zone.tone === 'urgent' ? 'bp-zone-urgent' : zone.tone === 'warn' ? 'bp-zone-warn' : 'bp-zone-ok'}`}
    >
      {zone.textUz}
    </p>
  );
}

export function PatientBpForm({
  taskId,
  targets,
}: {
  taskId: string;
  targets: BloodPressureTargets | null;
}) {
  const hintId = `pressure-hint-${taskId}`;
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [chestPain, setChestPain] = useState(false);

  return (
    <form className={styles.controls} action="/api/demo/evidence" method="post" aria-labelledby={`pressure-${taskId}`}>
      <input type="hidden" name="taskId" value={taskId} />
      <fieldset aria-describedby={hintId}>
        <legend id={`pressure-${taskId}`}>Qon bosimi (mm sim. ust.)</legend>
        <div className={styles.readings}>
          <label htmlFor={`systolic-${taskId}`}>
            Sistolik bosim
            <input
              className={styles.field}
              id={`systolic-${taskId}`}
              name="systolic"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              step={1}
              value={systolic}
              onChange={(event) => setSystolic(event.currentTarget.value)}
            />
          </label>
          <label htmlFor={`diastolic-${taskId}`}>
            Diastolik bosim
            <input
              className={styles.field}
              id={`diastolic-${taskId}`}
              name="diastolic"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              step={1}
              value={diastolic}
              onChange={(event) => setDiastolic(event.currentTarget.value)}
            />
          </label>
        </div>
        <p id={hintId}>Bosimni qayd etish uchun ikkala qiymatni kiriting. Faqat og‘riq haqida xabar bersangiz, ularni bo‘sh qoldiring.</p>
      </fieldset>
      <label className={styles.symptom}>
        <input
          type="checkbox"
          name="chestPain"
          value="yes"
          checked={chestPain}
          onChange={(event) => setChestPain(event.currentTarget.checked)}
        />
        Ko‘krak og‘rig‘i bor
      </label>
      <BpZoneBanner systolic={systolic} diastolic={diastolic} chestPain={chestPain} targets={targets} />
      <button className={styles.submit} type="submit">Qaydni yuborish</button>
    </form>
  );
}

export function PatientRetakeBpForm({
  flagId,
  targets,
}: {
  flagId: string;
  targets: BloodPressureTargets | null;
}) {
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [chestPain, setChestPain] = useState(false);

  return (
    <form className={styles.controls} action="/api/demo/followup" method="post">
      <input type="hidden" name="flagId" value={flagId} />
      <input type="hidden" name="kind" value="retake_vitals" />
      <div className={styles.readings}>
        <label>
          Qayta sistolik
          <input
            className={styles.field}
            name="systolic"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            required
            value={systolic}
            onChange={(event) => setSystolic(event.currentTarget.value)}
          />
        </label>
        <label>
          Qayta diastolik
          <input
            className={styles.field}
            name="diastolic"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            required
            value={diastolic}
            onChange={(event) => setDiastolic(event.currentTarget.value)}
          />
        </label>
      </div>
      <label className={styles.symptom}>
        <input
          type="checkbox"
          name="chestPain"
          value="yes"
          checked={chestPain}
          onChange={(event) => setChestPain(event.currentTarget.checked)}
        />
        Ko‘krak og‘rig‘i bor
      </label>
      <BpZoneBanner systolic={systolic} diastolic={diastolic} chestPain={chestPain} targets={targets} />
      <button className={styles.submit} type="submit">Qayta o‘lchovni yuborish</button>
    </form>
  );
}
