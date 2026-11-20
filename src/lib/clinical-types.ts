import type { MedicationBoxEvidence } from './dorimos-contract';

export type ClinicalActor = {
  workspaceId: string;
  doctorId: string;
  patientId: string;
  role: 'doctor' | 'patient';
};

export type BloodPressureTargets = {
  maxSystolic: number;
  maxDiastolic: number;
  warnSystolic: number;
  warnDiastolic: number;
};

export type PlanInput = {
  medicationName: string;
  medicationStrengthMg: number | null;
  medicationTime: string;
  vitalsTime: string;
  targets: BloodPressureTargets;
  supplyFollowUp: boolean;
};

export type MissedReason = 'out_of_supply' | 'side_effects' | 'forgot' | 'other';

export type EvidencePayload =
  | { kind: 'medication'; status: 'taken' }
  | { kind: 'medication'; status: 'missed'; reason: MissedReason }
  | { kind: 'vitals'; systolic: number | null; diastolic: number | null; chestPain: boolean };

export type EvidenceFlag = {
  color: 'red' | 'yellow';
  ruleKey: string;
  metric?: 'systolic' | 'diastolic';
  observed?: number;
  threshold?: number;
};

export type ReviewInput = {
  flagId: string;
  decision: 'approved' | 'retake';
  reply: string;
  note: string;
};

export type EvidenceWrite = {
  taskId: string;
  payload: EvidencePayload;
  level: 0;
  source: 'self_report';
  aiMode: 'none' | 'manual';
  flag: EvidenceFlag | null;
};

export type EvidenceView = Pick<EvidenceWrite, 'taskId'> & {
  id: string;
  payload: EvidencePayload | MedicationBoxEvidence;
  level: 0 | 2 | 4;
  source: 'self_report' | 'photo_ocr';
  aiMode: 'none' | 'manual' | 'live';
  createdAt: string;
  review: { decision: ReviewInput['decision']; reply: string; reviewedAt: string } | null;
};

export type ClinicalTask = {
  id: string;
  type: EvidencePayload['kind'];
  title: string;
  date: string;
  dueTime: string;
  status: 'pending' | 'taken' | 'missed' | 'recorded';
  evidence: EvidenceView | null;
  boxEvidence: EvidenceView | null;
  lateReview?: true;
};

export type ClinicalFlag = EvidenceFlag & { id: string; evidence: EvidenceView };

export type ClinicalView = { plan: PlanInput | null; tasks: ClinicalTask[]; flags: ClinicalFlag[] };

export type TaskContext = {
  type: ClinicalTask['type'];
  date: string;
  plan: PlanInput;
  previousMedication: { date: string; status: 'taken' | 'missed' | 'unanswered' } | null;
};

export type MutationResult = 'saved' | 'already_saved' | 'not_found';
