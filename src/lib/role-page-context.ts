import { z } from 'zod';
import { resolveClinicalActor, resolveWebSessionContext } from './auth';
import type { AppRole, SessionContext } from './auth-types';
import { isPatientSideRole, type ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { ensureDemoWorkspace } from './seed';

export type AssignedPatientSummary = {
  id: string;
  name: string;
  roleKind: 'patient' | 'individual';
  openUrgent: number;
  openWarning: number;
};

const assignedPatientRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roleKind: z.enum(['patient', 'individual']),
  openUrgent: z.coerce.number().int().min(0),
  openWarning: z.coerce.number().int().min(0),
});

const singlePatientNameSchema = z.object({
  name: z.string(),
});

export type RolePageContext = {
  session: SessionContext;
  isDemo: boolean;
  role: Exclude<AppRole, 'caregiver'>;
  actor: ClinicalActor;
  actorName: string;
  patientName: string;
  assignedPatients: AssignedPatientSummary[];
  selectedPatientId: string | null;
  storageUnavailable: boolean;
};

export async function resolveRolePageContext(
  expectedRole: 'doctor' | 'patient',
  requestedPatientId?: string | string[],
): Promise<RolePageContext | null> {
  const session = await resolveWebSessionContext();
  if (!session) return null;

  if (expectedRole === 'doctor' && session.role !== 'doctor') return null;
  if (expectedRole === 'patient' && !isPatientSideRole(session.role)) return null;

  if (session.kind === 'demo') {
    const workspace = await ensureDemoWorkspace(session.workspaceId).catch(() => null);
    if (!workspace) {
      return {
        session,
        isDemo: true,
        role: session.role,
        actor: {
          workspaceId: session.workspaceId,
          doctorId: null,
          patientId: null,
          role: session.role,
          isDemo: true,
        },
        actorName: session.role === 'doctor' ? 'Dr. Sardor' : 'Anvar aka',
        patientName: 'Anvar aka',
        assignedPatients: [],
        selectedPatientId: null,
        storageUnavailable: true,
      };
    }

    const actor: ClinicalActor = {
      workspaceId: session.workspaceId,
      role: session.role,
      doctorId: workspace.doctor.id,
      patientId: workspace.patient.id,
      isDemo: true,
    };

    return {
      session,
      isDemo: true,
      role: session.role,
      actor,
      actorName: session.role === 'doctor' ? workspace.doctor.name : workspace.patient.name,
      patientName: workspace.patient.name,
      assignedPatients: [],
      selectedPatientId: workspace.patient.id,
      storageUnavailable: false,
    };
  }

  // Real Supabase clinic/individual session (isDemo = false)
  const sql = getDatabase();
  if (!sql) {
    return {
      session,
      isDemo: false,
      role: session.role as Exclude<AppRole, 'caregiver'>,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: session.role === 'doctor' ? session.actorId : null,
        patientId: session.role === 'doctor' ? null : session.actorId,
        role: session.role,
        isDemo: false,
      },
      actorName: session.fullName ?? (session.role === 'doctor' ? 'Shifokor' : 'Bemor'),
      patientName: session.fullName ?? 'Bemor',
      assignedPatients: [],
      selectedPatientId: session.role === 'doctor' ? null : session.actorId,
      storageUnavailable: true,
    };
  }

  if (session.role === 'doctor') {
    const rows = await sql`
      SELECT p.id,
             p.name,
             p.role_kind AS "roleKind",
             (
               SELECT COUNT(*)::int
               FROM public.flags AS f
               JOIN public.evidence_logs AS ev ON ev.workspace_id = f.workspace_id AND ev.id = f.evidence_log_id
               JOIN public.task_instances AS t ON t.workspace_id = ev.workspace_id AND t.id = ev.task_instance_id
               JOIN public.plan_items AS pi ON pi.workspace_id = t.workspace_id AND pi.id = t.plan_item_id
               JOIN public.plans AS pl ON pl.workspace_id = pi.workspace_id AND pl.id = pi.plan_id
               WHERE f.workspace_id = p.workspace_id AND pl.patient_id = p.id AND f.decision IS NULL AND f.color = 'red'
             )
             + (
               SELECT COUNT(*)::int
               FROM public.urgent_symptoms AS us
               WHERE us.workspace_id = p.workspace_id AND us.patient_id = p.id AND us.review_decision IS NULL
             )
             + (
               SELECT COUNT(*)::int
               FROM public.exercise_attempts AS ea
               JOIN public.exercise_prescriptions AS ep ON ep.workspace_id = ea.workspace_id AND ep.id = ea.prescription_id
               WHERE ea.workspace_id = p.workspace_id AND ep.patient_id = p.id AND ea.review_decision IS NULL AND ea.flag_color = 'red'
             ) AS "openUrgent",
             (
               SELECT COUNT(*)::int
               FROM public.flags AS f
               JOIN public.evidence_logs AS ev ON ev.workspace_id = f.workspace_id AND ev.id = f.evidence_log_id
               JOIN public.task_instances AS t ON t.workspace_id = ev.workspace_id AND t.id = ev.task_instance_id
               JOIN public.plan_items AS pi ON pi.workspace_id = t.workspace_id AND pi.id = t.plan_item_id
               JOIN public.plans AS pl ON pl.workspace_id = pi.workspace_id AND pl.id = pi.plan_id
               WHERE f.workspace_id = p.workspace_id AND pl.patient_id = p.id AND f.decision IS NULL AND f.color = 'yellow'
             )
             + (
               SELECT COUNT(*)::int
               FROM public.exercise_attempts AS ea
               JOIN public.exercise_prescriptions AS ep ON ep.workspace_id = ea.workspace_id AND ep.id = ea.prescription_id
               WHERE ea.workspace_id = p.workspace_id AND ep.patient_id = p.id AND ea.review_decision IS NULL AND ea.flag_color = 'yellow'
             ) AS "openWarning"
      FROM public.patients AS p
      JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
      WHERE p.workspace_id = ${session.workspaceId}
        AND p.doctor_id = ${session.actorId}
      ORDER BY "openUrgent" DESC, "openWarning" DESC, p.name ASC, p.id ASC
    `;

    const assignedPatients = z.array(assignedPatientRowSchema).parse(rows);
    const rawId = typeof requestedPatientId === 'string' ? requestedPatientId.trim() : '';
    const validId = z.uuid().safeParse(rawId).success ? rawId : '';
    const selected =
      (validId ? assignedPatients.find((p) => p.id === validId) : undefined) ??
      assignedPatients[0] ??
      null;

    const resolved = await resolveClinicalActor(session, {
      patientId: selected?.id,
      allowDoctorWithoutPatient: true,
    });
    if (!resolved.ok) return null;

    return {
      session,
      isDemo: false,
      role: 'doctor',
      actor: resolved.actor,
      actorName: session.fullName ?? 'Shifokor',
      patientName: selected?.name ?? 'Bemor tanlanmagan',
      assignedPatients,
      selectedPatientId: selected?.id ?? null,
      storageUnavailable: false,
    };
  }

  const resolved = await resolveClinicalActor(session);
  if (!resolved.ok) return null;

  const [patRow] = await sql`
    SELECT name
    FROM public.patients
    WHERE workspace_id = ${session.workspaceId} AND id = ${session.actorId}
    LIMIT 1
  `;
  const patientName = patRow
    ? singlePatientNameSchema.parse(patRow).name
    : (session.fullName ?? 'Bemor');

  return {
    session,
    isDemo: false,
    role: session.role as 'patient' | 'individual',
    actor: resolved.actor,
    actorName: patientName,
    patientName,
    assignedPatients: [],
    selectedPatientId: resolved.actor.patientId,
    storageUnavailable: false,
  };
}
