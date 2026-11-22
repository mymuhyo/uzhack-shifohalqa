'use client';

import { useState } from 'react';
import type { PlanInput } from '@/lib/clinical-types';
import styles from './patient-clinical.module.css';

type Question = {
  id: string;
  prompt: string;
  options: { id: string; label: string; correct: boolean }[];
};

export function PatientTeachBack({ plan }: { plan: PlanInput }) {
  const strength = plan.medicationStrengthMg;
  const wrongStrength = strength ? strength * 2 : 10;

  const questions: Question[] = [
    {
      id: 'drug',
      prompt: '1. Shifokor yozgan dorini qaysi vaqtda ichish kerak?',
      options: [
        { id: 'plan_time', label: `${plan.medicationName} · soat ${plan.medicationTime} da`, correct: true },
        { id: 'only_pain', label: 'Faqat bosh og‘riganda ichish kerak', correct: false },
      ],
    },
    {
      id: 'strength',
      prompt: '2. Dorixonadan qaysi quvvatdagi qutini olishingiz kerak?',
      options: [
        {
          id: 'exact',
          label: strength ? `${strength} mg yozilgan qutini` : 'Shifokor yozgan aniq nomdagi qutini',
          correct: true,
        },
        { id: 'double', label: `${wrongStrength} mg li boshqa qutini`, correct: false },
      ],
    },
    {
      id: 'redflag',
      prompt: `3. Bosim ${plan.targets.maxSystolic}/${plan.targets.maxDiastolic} mmHg dan oshsa yoki ko‘krak og‘risa nima qilasiz?`,
      options: [
        { id: 'report', label: 'Qaydni yuboraman va ahvol og‘irlashsa 103 ga qo‘ng‘iroq qilaman', correct: true },
        { id: 'ignore', label: 'Hech narsa qilmay keyingi haftagacha kutaman', correct: false },
      ],
    },
  ];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const correctCount = questions.filter((q) => {
    const selected = answers[q.id];
    return q.options.some((opt) => opt.id === selected && opt.correct);
  }).length;

  return (
    <section aria-labelledby="teachback-heading">
      <h2 id="teachback-heading">Rejani tekshirish (Teach-Back)</h2>
      <details className={styles.disclosure}>
        <summary>
          {correctCount === questions.length
            ? 'Reja tushunildi (3/3) ✓'
            : `Qisqa 3 ta savol bilan rejani tekshiring (${correctCount}/3)`}
        </summary>
        <div className={styles.fields}>
          {questions.map((question) => {
            const chosen = answers[question.id];
            const chosenOpt = question.options.find((opt) => opt.id === chosen);
            return (
              <fieldset key={question.id} className={styles.record}>
                <legend className={styles.recordTitle}>{question.prompt}</legend>
                <div className="template-chips">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="template-chip"
                      aria-pressed={chosen === option.id}
                      onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {chosenOpt && (
                  <p role="status">
                    {chosenOpt.correct ? 'To‘g‘ri!' : 'Rejaga ko‘ra boshqa javob to‘g‘ri. Qayta urinib ko‘ring.'}
                  </p>
                )}
              </fieldset>
            );
          })}
          {correctCount === questions.length && (
            <p className="status-pill status-ok" role="status">
              Reja tushunildi (3/3)
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
