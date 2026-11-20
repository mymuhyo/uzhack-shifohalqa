import { z } from "zod";
import { getDatabase } from "./db";

const workspaceIdSchema = z.uuid();
const actorRowSchema = z.object({
  doctor_id: z.uuid(),
  doctor_name: z.string().min(1),
  patient_id: z.uuid(),
  patient_name: z.string().min(1),
});

const primaryDemoKey = "primary";

export async function ensureDemoWorkspace(workspaceId: string) {
  const id = workspaceIdSchema.parse(workspaceId);
  const sql = getDatabase();
  if (!sql) return null;

  // Each statement sees the rows committed by a concurrent initialization
  // before a preceding ON CONFLICT DO NOTHING finished waiting for them.
  const [, , , actorRows] = await sql.transaction((tx) => [
    tx`
      INSERT INTO shifohalqa.demo_workspaces (id)
      VALUES (${id})
      ON CONFLICT (id) DO NOTHING
    `,
    tx`
      INSERT INTO shifohalqa.doctors (workspace_id, demo_key, name)
      VALUES (${id}, ${primaryDemoKey}, 'Dr. Sardor')
      ON CONFLICT (workspace_id, demo_key) DO NOTHING
    `,
    tx`
      INSERT INTO shifohalqa.patients (workspace_id, doctor_id, demo_key, name)
      SELECT workspace_id, id, ${primaryDemoKey}, 'Anvar aka'
      FROM shifohalqa.doctors
      WHERE workspace_id = ${id} AND demo_key = ${primaryDemoKey}
      ON CONFLICT (workspace_id, demo_key) DO NOTHING
    `,
    tx`
      SELECT doctor.id AS doctor_id, doctor.name AS doctor_name,
             patient.id AS patient_id, patient.name AS patient_name
      FROM shifohalqa.doctors AS doctor
      JOIN shifohalqa.patients AS patient
        ON patient.workspace_id = doctor.workspace_id AND patient.doctor_id = doctor.id
      WHERE doctor.workspace_id = ${id}
        AND doctor.demo_key = ${primaryDemoKey} AND patient.demo_key = ${primaryDemoKey}
    `,
  ], { isolationLevel: "ReadCommitted" });

  const row = actorRowSchema.parse(actorRows[0]);
  return {
    doctor: { id: row.doctor_id, name: row.doctor_name },
    patient: { id: row.patient_id, name: row.patient_name },
  };
}
