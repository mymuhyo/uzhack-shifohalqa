'use client';

import { useState } from 'react';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import type { PoseMovement } from '@/lib/pose/engine';
import styles from './doctor-clinical.module.css';

/**
 * Client-side exercise assignment form that keeps target angle bounds
 * and default targets synchronized with the selected movement.
 */
export function DoctorExercisePlanForm() {
  const [movement, setMovement] = useState<PoseMovement>('chair_stand');
  const [targetAngle, setTargetAngle] = useState<string>(
    String(exerciseCatalog.chair_stand.defaultTargetAngle),
  );
  const bounds = exerciseCatalog[movement].angleBounds;

  return (
    <form action="/api/demo/exercise-plan" method="post" className={styles.form} aria-labelledby="exercise-heading">
      <p>Namuna qiymatlarini biriktirishdan oldin ko‘rib chiqing.</p>
      <div className={styles.pair}>
        <label className={styles.field}>
          Mashq turi
          <select
            name="movement"
            value={movement}
            onChange={(event) => {
              const nextMovement = event.currentTarget.value as PoseMovement;
              setMovement(nextMovement);
              setTargetAngle(String(exerciseCatalog[nextMovement].defaultTargetAngle));
            }}
          >
            {Object.values(exerciseCatalog).map((item) => (
              <option key={item.id} value={item.id}>{item.shortTitle}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>Takror soni <input type="number" name="targetReps" defaultValue={5} min={1} max={40} required /></label>
        <label className={styles.field}>
          Maqsad burchagi
          <input
            type="number"
            name="targetAngle"
            value={targetAngle}
            onChange={(event) => setTargetAngle(event.currentTarget.value)}
            min={bounds.min}
            max={bounds.max}
            required
          />
        </label>
        <label className={styles.field}>Chala takror chegarasi <input type="number" name="maxShallow" defaultValue={1} min={0} max={40} required /></label>
        <label className={styles.field}>Og‘riq xabari <select name="painColor"><option value="yellow">Tekshirish</option><option value="red">Tez ko‘rib chiqish</option></select></label>
      </div>
      <button className={styles.submit} type="submit">Mashqni biriktirish</button>
    </form>
  );
}
