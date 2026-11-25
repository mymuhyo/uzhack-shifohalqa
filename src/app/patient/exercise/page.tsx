import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, PhoneCall } from 'lucide-react';
import { ExerciseClient } from '@/components/exercise-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { readExerciseAttempts, readExercisePlan, type ExerciseAttempt } from '@/lib/exercise-store';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import { resolveRolePageContext } from '@/lib/role-page-context';

export const metadata: Metadata = { title: 'Reabilitatsiya mashqi' };
export const dynamic = 'force-dynamic';

export default async function ExercisePage() {
  const ctx = await resolveRolePageContext('patient');
  if (!ctx) redirect('/');

  let plan: Awaited<ReturnType<typeof readExercisePlan>> = null;
  let attempts: ExerciseAttempt[] = [];
  let unavailable = ctx.storageUnavailable;

  if (!unavailable && ctx.actor.patientId) {
    try {
      [plan, attempts] = await Promise.all([
        readExercisePlan(ctx.actor),
        readExerciseAttempts(ctx.actor),
      ]);
    } catch {
      unavailable = true;
    }
  }

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1>{plan ? exerciseCatalog[plan.movement].title : 'O‘tirib-turish mashqi'}</h1>
        <Badge variant={ctx.isDemo ? 'secondary' : 'ok'}>
          {ctx.isDemo ? 'Demo' : 'Klinika'}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <a className="emergency" href="tel:103">
          <PhoneCall className="size-4" aria-hidden="true" />
          <span>Tez yordam · 103</span>
        </a>
        <Link className="text-action" href="/patient">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Bugungi vazifalarga qaytish</span>
        </Link>
      </div>

      {plan ? (
        <>
          <p className="lede">
            Shifokor rejasi · {plan.targetReps} takror · {exerciseCatalog[plan.movement].jointLabel.toLowerCase()} burchagi {plan.targetAngle}°.
          </p>
          <section className="ledger" aria-labelledby="exercise-replies">
            <h2 id="exercise-replies">Mashq bo‘yicha javoblar</h2>
            <form action="/patient/exercise#exercise-replies" method="get" aria-labelledby="exercise-replies">
              <button type="submit" className="text-action">Javoblarni yangilash</button>
            </form>
            <div className="mt-2 flex flex-col gap-3">
              {attempts.filter((attempt) => attempt.review).map((attempt) => (
                <Card key={attempt.id} className="border border-border bg-card">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base font-semibold">
                        {attempt.reason === 'pain' ? 'Og‘riq xabari' : 'Mashq qaydi'} · {attempt.scheduledDate}
                      </CardTitle>
                      <Badge variant={attempt.review?.decision === 'retake' ? 'warn' : 'ok'}>
                        {attempt.review?.decision === 'retake' ? 'Qayta o‘lchash so‘raldi' : 'Shifokor ko‘rib chiqdi'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground">{attempt.review?.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          <ExerciseClient
            movement={plan.movement}
            targetAngle={plan.targetAngle}
            targetReps={plan.targetReps}
            maxShallow={plan.maxShallow}
            painColor={plan.painColor}
            isDemo={ctx.isDemo}
          />
        </>
      ) : (
        <p className="notice">{unavailable ? 'Mashq rejasini ochib bo‘lmadi.' : 'Shifokor mashq rejasini hali biriktirmagan.'}</p>
      )}
    </main>
  );
}
