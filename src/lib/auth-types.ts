import type { AppRole } from './clinical-types';

export type { AppRole };

export type SupabaseSessionContext = {
  kind: 'supabase';
  userId: string;
  workspaceId: string;
  role: AppRole;
  actorId: string;
  isDemo: false;
  email?: string | null;
  fullName?: string | null;
};

export type DemoSessionContext = {
  kind: 'demo';
  workspaceId: string;
  role: 'doctor' | 'patient' | 'individual';
  actorId: string;
  isDemo: true;
};

export type SessionContext = SupabaseSessionContext | DemoSessionContext;

export type AuthenticatedSupabaseUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  defaultRole: AppRole | null;
};

export type PendingMembershipInvite = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  role: 'patient' | 'caregiver';
  actorId: string;
  patientName: string;
  createdAt: string;
};
