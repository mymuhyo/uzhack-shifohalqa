import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { getDemoSession } from '@/lib/demo-session';
import { readExercisePlan } from '@/lib/exercise-store';
import { ensureDemoWorkspace } from '@/lib/seed';

export const metadata: Metadata = { title: 'O‘tirib-turish mashqi' };
export const dynamic = 'force-dynamic';

export default async function ExercisePage() {
  const session = await getDemoSession();
  if (session?.role !== 'patient') redirect('/');

  let plan: Awaited<ReturnType<typeof readExercisePlan>> = null;
  let unavailable = false;
  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (workspace) plan = await readExercisePlan({
      workspaceId: session.workspaceId, role: session.role,
      doctorId: workspace.doctor.id, patientId: workspace.patient.id,
    });
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
          <ExerciseClient targetAngle={plan.targetAngle} />
        </>
      ) : <p className="notice">{unavailable ? 'Mashq rejasini ochib bo‘lmadi.' : 'Shifokor mashq rejasini hali biriktirmagan.'}</p>}
      <Link className="text-action" href="/patient">Bugungi vazifalarga qaytish</Link>
    </main>
  );
}
