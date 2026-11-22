import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { getDemoSession } from '@/lib/demo-session';
import { readExerciseAttempts, readExercisePlan, type ExerciseAttempt } from '@/lib/exercise-store';
import { ensureDemoWorkspace } from '@/lib/seed';

export const metadata: Metadata = { title: 'O‘tirib-turish mashqi' };
export const dynamic = 'force-dynamic';

export default async function ExercisePage() {
  const session = await getDemoSession();
  if (session?.role !== 'patient') redirect('/');

  let plan: Awaited<ReturnType<typeof readExercisePlan>> = null;
  let attempts: ExerciseAttempt[] = [];
  let unavailable = false;
  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (workspace) {
      const actor = { workspaceId: session.workspaceId, role: session.role,
        doctorId: workspace.doctor.id, patientId: workspace.patient.id };
      [plan, attempts] = await Promise.all([readExercisePlan(actor), readExerciseAttempts(actor)]);
    }
    else unavailable = true;
  } catch {
    unavailable = true;
  }
  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>O‘tirib-turish mashqi</h1>
      <a className="emergency" href="tel:103">Tez yordam · 103</a>
      {plan ? (
        <>
          <p className="lede">Shifokor rejasi · {plan.targetReps} takror.</p>
          <section className="ledger" aria-labelledby="exercise-replies">
            <h2 id="exercise-replies">Mashq bo‘yicha javoblar</h2>
            <form action="/patient/exercise#exercise-replies" method="get" aria-labelledby="exercise-replies">
              <button type="submit" className="text-action">Javoblarni yangilash</button>
            </form>
            {attempts.filter(attempt => attempt.review).map(attempt => (
              <article key={attempt.id}>
                <h3>{attempt.reason === 'pain' ? 'Og‘riq xabari' : 'Mashq qaydi'} · {attempt.scheduledDate}</h3>
                <p>{attempt.review?.decision === 'retake' ? 'Qayta o‘lchash so‘raldi' : 'Shifokor ko‘rib chiqdi'}</p>
                <p>{attempt.review?.body}</p>
              </article>
            ))}
          </section>
          <ExerciseClient targetAngle={plan.targetAngle} />
        </>
      ) : <p className="notice">{unavailable ? 'Mashq rejasini ochib bo‘lmadi.' : 'Shifokor mashq rejasini hali biriktirmagan.'}</p>}
      <Link className="text-action" href="/patient">Bugungi vazifalarga qaytish</Link>
    </main>
  );
}
