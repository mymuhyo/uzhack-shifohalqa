'use client';

import { useState } from 'react';
import { BookOpenCheck, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClinicalClient } from '@/lib/clinical-client-fetch';
import type { PlanInput } from '@/lib/clinical-types';
import type { TeachBackStatus } from '@/lib/teach-back-store';
import styles from './patient-clinical.module.css';

type Question = {
  id: string;
  prompt: string;
  options: { id: string; label: string; correct: boolean }[];
};

const unitDisplay: Record<string, string> = {
  mg: 'mg',
  mcg: 'mkg',
  g: 'g',
  iu: 'IU',
};

export function PatientTeachBack({
  plan,
  initialStatus = null,
}: {
  plan: PlanInput;
  initialStatus?: TeachBackStatus | null;
}) {
  const client = useClinicalClient();
  const unit = unitDisplay[plan.medicationStrengthUnit ?? 'mg'] ?? 'mg';
  const strength = plan.medicationStrengthMg;
  const wrongStrength = strength ? strength * 2 : 10;
  const lowBpText =
    plan.targets.minSystolic !== undefined && plan.targets.minDiastolic !== undefined
      ? ` yoki ${plan.targets.minSystolic}/${plan.targets.minDiastolic} mmHg dan pastga tushsa`
      : '';

  const [simplifiedPrompts, setSimplifiedPrompts] = useState<Record<string, string>>({});
  const [simplifying, setSimplifying] = useState(false);
  const [persistedBadge, setPersistedBadge] = useState<string | null>(
    initialStatus?.latestAttempt
      ? `${initialStatus.latestAttempt.score}/${initialStatus.latestAttempt.totalQuestions}`
      : null,
  );
  const [saving, setSaving] = useState(false);

  const questions: Question[] = [
    {
      id: 'drug',
      prompt: simplifiedPrompts.med_schedule ?? '1. Shifokor yozgan dorini qaysi vaqtda ichish kerak?',
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
          label: strength ? `${strength} ${unit} yozilgan qutini` : 'Shifokor yozgan aniq nomdagi qutini',
          correct: true,
        },
        { id: 'double', label: `${wrongStrength} ${unit} li boshqa qutini`, correct: false },
      ],
    },
    {
      id: 'redflag',
      prompt: simplifiedPrompts.safety_target ?? `3. Bosim ${plan.targets.maxSystolic}/${plan.targets.maxDiastolic} mmHg dan oshsa${lowBpText} yoki ko‘krak og‘risa nima qilasiz?`,
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

  async function persistAnswers(nextAnswers: Record<string, string>) {
    if (!initialStatus?.hasPlan || saving) return;
    const drugAns = nextAnswers.drug;
    const safetyAns = nextAnswers.redflag;
    if (!drugAns || !safetyAns) return;

    const payloadAnswers = [
      { questionId: 'med_schedule' as const, selectedOptionId: (drugAns === 'plan_time' ? 'b' : 'a') as 'a' | 'b' | 'c' },
      { questionId: 'safety_target' as const, selectedOptionId: (safetyAns === 'report' ? 'a' : 'b') as 'a' | 'b' | 'c' },
    ].filter((item) => initialStatus.questions.some((q) => q.id === item.questionId));

    if (payloadAnswers.length !== initialStatus.questions.length) return;

    setSaving(true);
    try {
      const response = await client.fetchJson('/api/clinical/teach-back', {
        method: 'POST',
        body: JSON.stringify({ answers: payloadAnswers }),
      });
      if (response.ok) {
        const data = (await response.json()) as { attempt?: { score: number; totalQuestions: number } };
        if (data.attempt) {
          setPersistedBadge(`${data.attempt.score}/${data.attempt.totalQuestions}`);
        }
      }
    } catch {
      // Keep client-side teach-back interactive even offline
    } finally {
      setSaving(false);
    }
  }

  async function simplifyWithAi() {
    if (simplifying) return;
    setSimplifying(true);
    try {
      const response = await client.fetchJson('/api/clinical/teach-back?simplify=1');
      if (!response.ok) return;
      const data = (await response.json()) as TeachBackStatus;
      const map: Record<string, string> = {};
      for (const q of data.questions) {
        map[q.id] = q.promptUz;
      }
      setSimplifiedPrompts(map);
    } finally {
      setSimplifying(false);
    }
  }

  function chooseAnswer(questionId: string, optionId: string) {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    void persistAnswers(next);
  }

  return (
    <section aria-labelledby="teachback-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="teachback-heading" className="inline-flex items-center gap-2">
          <BookOpenCheck className="size-5 text-primary" aria-hidden="true" />
          <span>Rejani tekshirish (Teach-Back)</span>
        </h2>
        {persistedBadge && (
          <Badge variant="ok" className="tabular-nums">
            Saqlangan: {persistedBadge}
          </Badge>
        )}
      </div>

      <details className={styles.disclosure}>
        <summary>
          {correctCount === questions.length
            ? 'Reja tushunildi (3/3) ✓'
            : `Qisqa 3 ta savol bilan rejani tekshiring (${correctCount}/3)`}
        </summary>
        <div className={styles.fields}>
          {initialStatus?.hasPlan && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={simplifying}
                onClick={() => void simplifyWithAi()}
              >
                {simplifying ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <Sparkles data-icon="inline-start" aria-hidden="true" />
                )}
                <span>Soddaroq tilda (AI)</span>
              </Button>
            </div>
          )}

          {questions.map((question) => {
            const chosen = answers[question.id];
            const chosenOpt = question.options.find((opt) => opt.id === chosen);
            return (
              <fieldset key={question.id} className={styles.record}>
                <legend className={styles.recordTitle}>{question.prompt}</legend>
                <div className="template-chips mt-2">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="template-chip"
                      aria-pressed={chosen === option.id}
                      onClick={() => chooseAnswer(question.id, option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {chosenOpt && (
                  <p role="status" className="mt-2 text-sm font-medium">
                    {chosenOpt.correct ? 'To‘g‘ri!' : 'Rejaga ko‘ra boshqa javob to‘g‘ri. Qayta urinib ko‘ring.'}
                  </p>
                )}
              </fieldset>
            );
          })}

          {correctCount === questions.length && (
            <p className="status-pill status-ok inline-flex items-center gap-1.5" role="status">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>Reja tushunildi (3/3)</span>
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
