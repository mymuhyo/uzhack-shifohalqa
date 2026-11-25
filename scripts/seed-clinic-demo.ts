import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const WORKSPACE_ID = 'd0000000-0000-4000-8000-000000000001';
const DOCTOR_ID = 'd0000000-0000-4000-8000-000000000010';
const DOCTOR_EMAIL = 'shifokor@demo.shifohalqa.uz';
const DOCTOR_NAME = 'Dr. Kamola Karimova';

type SeedPatientSpec = {
  id: string;
  email: string;
  name: string;
  planId: string;
  medItemId: string;
  vitalsItemId: string;
  medicationName: string;
  strengthMg: number;
  supplyFollowUp: boolean;
  dailyStepGoal: number;
};

const PATIENTS: readonly SeedPatientSpec[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000101',
    email: 'anvar@demo.shifohalqa.uz',
    name: 'Anvar Toshmatov',
    planId: 'd0000000-0000-4000-8000-000000000201',
    medItemId: 'd0000000-0000-4000-8000-000000000211',
    vitalsItemId: 'd0000000-0000-4000-8000-000000000221',
    medicationName: 'Amlodipin',
    strengthMg: 5,
    supplyFollowUp: false,
    dailyStepGoal: 3000,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000102',
    email: 'malika@demo.shifohalqa.uz',
    name: 'Malika Rahimova',
    planId: 'd0000000-0000-4000-8000-000000000202',
    medItemId: 'd0000000-0000-4000-8000-000000000212',
    vitalsItemId: 'd0000000-0000-4000-8000-000000000222',
    medicationName: 'Lozartan',
    strengthMg: 50,
    supplyFollowUp: true,
    dailyStepGoal: 3500,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000103',
    email: 'rustam@demo.shifohalqa.uz',
    name: 'Rustam Alimov',
    planId: 'd0000000-0000-4000-8000-000000000203',
    medItemId: 'd0000000-0000-4000-8000-000000000213',
    vitalsItemId: 'd0000000-0000-4000-8000-000000000223',
    medicationName: 'Bisoprolol',
    strengthMg: 5,
    supplyFollowUp: false,
    dailyStepGoal: 4000,
  },
];

const EXERCISE_PRESCRIPTIONS = [
  {
    id: 'd0000000-0000-4000-8000-000000000302',
    patientId: 'd0000000-0000-4000-8000-000000000102',
    movement: 'chair_stand',
    targetAngle: 100,
    targetReps: 5,
    maxShallow: 1,
    painColor: 'yellow',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000303',
    patientId: 'd0000000-0000-4000-8000-000000000103',
    movement: 'elbow_bend',
    targetAngle: 95,
    targetReps: 5,
    maxShallow: 1,
    painColor: 'yellow',
  },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function ensureAuthUser(
  sql: postgres.Sql,
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
  defaultRole: 'doctor' | 'patient',
): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM auth.users WHERE lower(email) = lower(${email}) LIMIT 1
  `;

  let userId: string;
  if (existing[0]?.id) {
    userId = existing[0].id;
    const updated = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, default_role: defaultRole },
    });
    if (updated.error) {
      throw new Error(`Failed to update auth user ${email}: ${updated.error.message}`);
    }
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, default_role: defaultRole },
    });
    if (created.error || !created.data.user) {
      throw new Error(`Failed to create auth user ${email}: ${created.error?.message ?? 'unknown error'}`);
    }
    userId = created.data.user.id;
  }

  await sql`
    INSERT INTO public.profiles (id, full_name, default_role)
    VALUES (${userId}, ${fullName}, ${defaultRole})
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        default_role = EXCLUDED.default_role,
        updated_at = CURRENT_TIMESTAMP
  `;

  return userId;
}

async function ensureTodayTask(
  sql: postgres.Sql,
  planItemId: string,
  status: 'pending' | 'taken' | 'missed' | 'recorded',
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.task_instances (workspace_id, plan_item_id, scheduled_date, status)
    VALUES (${WORKSPACE_ID}, ${planItemId}, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, ${status})
    ON CONFLICT (workspace_id, plan_item_id, scheduled_date) DO UPDATE
    SET status = CASE
      WHEN public.task_instances.status = 'pending' THEN EXCLUDED.status
      ELSE public.task_instances.status
    END
    RETURNING id
  `;
  return rows[0]!.id;
}

async function ensureTaskEvidenceAndFlag(
  sql: postgres.Sql,
  options: {
    taskId: string;
    patientId: string;
    aiMode: 'none' | 'manual';
    payload: postgres.JSONValue;
    flag?: { color: 'red' | 'yellow'; ruleKey: string; detail: postgres.JSONValue };
  },
): Promise<void> {
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO public.evidence_logs (workspace_id, task_instance_id, entry_kind, level, source, ai_mode, payload)
    VALUES (${WORKSPACE_ID}, ${options.taskId}, 'task', 0, 'self_report', ${options.aiMode}, ${sql.json(options.payload)}::jsonb)
    ON CONFLICT (workspace_id, task_instance_id, entry_kind) DO NOTHING
    RETURNING id
  `;
  const evidenceId = inserted[0]?.id;
  if (!evidenceId) return;

  await sql`
    INSERT INTO public.audit_events (workspace_id, evidence_log_id, actor_id, action)
    VALUES (${WORKSPACE_ID}, ${evidenceId}, ${options.patientId}, 'record_evidence')
  `;

  if (options.flag) {
    await sql`
      INSERT INTO public.flags (workspace_id, evidence_log_id, color, rule_key, detail)
      VALUES (${WORKSPACE_ID}, ${evidenceId}, ${options.flag.color}, ${options.flag.ruleKey}, ${sql.json(options.flag.detail)}::jsonb)
    `;
  }
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const expectedEnvId = requireEnv('SHIFO_ENV_ID');
  const password = process.env.SEED_CLINIC_DEMO_PASSWORD?.trim() || 'ShifoDemo2026!';

  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 4,
    connect_timeout: 10,
    transform: { undefined: null },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const envRows = await sql<{ envId: string }[]>`
      SELECT env_id AS "envId"
      FROM public.environment_identity
      WHERE singleton = true
      LIMIT 1
    `;
    const actualEnvId = envRows[0]?.envId?.trim() ?? '';
    if (actualEnvId !== expectedEnvId) {
      throw new Error(`Environment mismatch: SHIFO_ENV_ID="${expectedEnvId}", DB has "${actualEnvId || 'missing'}".`);
    }

    await sql`
      INSERT INTO public.workspaces (id, is_demo, kind, name)
      VALUES (${WORKSPACE_ID}, false, 'clinic', 'ShifoHalqa Namuna Klinikasi (Sintetik)')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
      WHERE public.workspaces.is_demo = false AND public.workspaces.kind = 'clinic'
    `;

    await sql`
      INSERT INTO public.doctors (id, workspace_id, name)
      VALUES (${DOCTOR_ID}, ${WORKSPACE_ID}, ${DOCTOR_NAME})
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
    `;

    const doctorUserId = await ensureAuthUser(sql, admin, DOCTOR_EMAIL, password, DOCTOR_NAME, 'doctor');
    await sql`
      INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
      VALUES (${doctorUserId}, ${WORKSPACE_ID}, false, 'doctor', ${DOCTOR_ID}, 'active')
      ON CONFLICT (user_id, workspace_id, role, actor_id) DO UPDATE
      SET status = 'active'
    `;

    const seededPatients: Array<{ id: string; email: string; name: string }> = [];
    for (const patient of PATIENTS) {
      await sql`
        INSERT INTO public.patients (id, workspace_id, doctor_id, role_kind, name)
        VALUES (${patient.id}, ${WORKSPACE_ID}, ${DOCTOR_ID}, 'patient', ${patient.name})
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            doctor_id = EXCLUDED.doctor_id
      `;

      const patientUserId = await ensureAuthUser(sql, admin, patient.email, password, patient.name, 'patient');
      await sql`
        INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
        VALUES (${patientUserId}, ${WORKSPACE_ID}, false, 'patient', ${patient.id}, 'active')
        ON CONFLICT (user_id, workspace_id, role, actor_id) DO UPDATE
        SET status = 'active'
      `;

      const targets = { maxSystolic: 140, maxDiastolic: 90, warnSystolic: 130, warnDiastolic: 85 };
      await sql`
        INSERT INTO public.plans (id, workspace_id, patient_id, doctor_id, vitals_target, supply_follow_up, daily_step_goal)
        VALUES (
          ${patient.planId},
          ${WORKSPACE_ID},
          ${patient.id},
          ${DOCTOR_ID},
          ${sql.json(targets)}::jsonb,
          ${patient.supplyFollowUp},
          ${patient.dailyStepGoal}
        )
        ON CONFLICT (workspace_id, patient_id) DO NOTHING
      `;

      await sql`
        INSERT INTO public.plan_items (id, workspace_id, plan_id, type, title, due_time, box_strength_mg)
        VALUES
          (${patient.medItemId}, ${WORKSPACE_ID}, ${patient.planId}, 'medication', ${patient.medicationName}, '08:00'::time, ${patient.strengthMg}),
          (${patient.vitalsItemId}, ${WORKSPACE_ID}, ${patient.planId}, 'vitals', 'Qon bosimi', '09:00'::time, NULL)
        ON CONFLICT (id) DO NOTHING
      `;

      seededPatients.push({ id: patient.id, email: patient.email, name: patient.name });
    }

    for (const rx of EXERCISE_PRESCRIPTIONS) {
      await sql`
        INSERT INTO public.exercise_prescriptions (
          id, workspace_id, patient_id, doctor_id, movement, target_angle, target_reps, max_shallow, pain_color
        )
        VALUES (
          ${rx.id}, ${WORKSPACE_ID}, ${rx.patientId}, ${DOCTOR_ID},
          ${rx.movement}, ${rx.targetAngle}, ${rx.targetReps}, ${rx.maxShallow}, ${rx.painColor}
        )
        ON CONFLICT (workspace_id, patient_id) DO NOTHING
      `;
    }

    // Patient 1 (Anvar): open red bp_max flag (158/98) for doctor priority queue
    const p1 = PATIENTS[0]!;
    await ensureTodayTask(sql, p1.medItemId, 'pending');
    const p1VitalsTaskId = await ensureTodayTask(sql, p1.vitalsItemId, 'recorded');
    await ensureTaskEvidenceAndFlag(sql, {
      taskId: p1VitalsTaskId,
      patientId: p1.id,
      aiMode: 'manual',
      payload: { kind: 'vitals', systolic: 158, diastolic: 98, chestPain: false },
      flag: { color: 'red', ruleKey: 'bp_max', detail: { metric: 'systolic', observed: 158, threshold: 140 } },
    });

    // Patient 2 (Malika): missed medication (out_of_supply) yellow flag
    const p2 = PATIENTS[1]!;
    const p2MedTaskId = await ensureTodayTask(sql, p2.medItemId, 'missed');
    await ensureTodayTask(sql, p2.vitalsItemId, 'pending');
    await ensureTaskEvidenceAndFlag(sql, {
      taskId: p2MedTaskId,
      patientId: p2.id,
      aiMode: 'none',
      payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
      flag: { color: 'yellow', ruleKey: 'medication_out_of_supply', detail: {} },
    });

    // Patient 3 (Rustam): taken medication + normal BP + daily steps
    const p3 = PATIENTS[2]!;
    const p3MedTaskId = await ensureTodayTask(sql, p3.medItemId, 'taken');
    const p3VitalsTaskId = await ensureTodayTask(sql, p3.vitalsItemId, 'recorded');
    await ensureTaskEvidenceAndFlag(sql, {
      taskId: p3MedTaskId,
      patientId: p3.id,
      aiMode: 'none',
      payload: { kind: 'medication', status: 'taken' },
    });
    await ensureTaskEvidenceAndFlag(sql, {
      taskId: p3VitalsTaskId,
      patientId: p3.id,
      aiMode: 'manual',
      payload: { kind: 'vitals', systolic: 124, diastolic: 80, chestPain: false },
    });
    await sql`
      INSERT INTO public.daily_step_counts (workspace_id, patient_id, activity_date, step_count, source)
      VALUES (${WORKSPACE_ID}, ${p3.id}, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, 3400, 'self_report')
      ON CONFLICT (workspace_id, patient_id, activity_date) DO NOTHING
    `;

    console.log(
      JSON.stringify(
        {
          ok: true,
          envId: actualEnvId,
          workspaceId: WORKSPACE_ID,
          isDemo: false,
          doctor: { id: DOCTOR_ID, email: DOCTOR_EMAIL, name: DOCTOR_NAME },
          patients: seededPatients,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
