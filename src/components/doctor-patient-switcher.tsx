import Link from 'next/link';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AssignedPatientSummary } from '@/lib/role-page-context';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'B';
}

export function DoctorPatientSwitcher({
  patients,
  selectedPatientId,
}: {
  patients: readonly AssignedPatientSummary[];
  selectedPatientId: string | null;
}) {
  if (patients.length === 0) {
    return (
      <p className="notice" role="status">
        Sizga hozircha bemor biriktirilmagan.
      </p>
    );
  }

  return (
    <section
      aria-label="Biriktirilgan bemorlar ro‘yxati"
      className="mt-4 rounded-2xl border border-border bg-card p-3.5 shadow-[var(--surface-shadow)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="size-4 text-primary" aria-hidden="true" />
          <span>Bemorlar navbati ({patients.length})</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          Ustuvorlik: qizil → sariq
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {patients.map((patient) => {
          const active = patient.id === selectedPatientId;
          const dotColor =
            patient.openUrgent > 0
              ? 'bg-[var(--urgent)]'
              : patient.openWarning > 0
                ? 'bg-[var(--warn)]'
                : 'bg-[var(--ok)]';
          return (
            <Link
              key={patient.id}
              href={`/doctor?patientId=${patient.id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold no-underline transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] ${
                active
                  ? 'border-primary bg-[var(--action-soft)] text-foreground shadow-[0_0_0_1px_var(--action)]'
                  : 'border-border bg-secondary/75 text-foreground hover:bg-secondary'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-semibold text-foreground">
                  {getInitials(patient.name)}
                  <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card ${dotColor}`} aria-hidden="true" />
                </span>
                <span className="truncate">{patient.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {patient.openUrgent > 0 && (
                  <Badge variant="urgent" className="tabular-nums">
                    {patient.openUrgent} qizil
                  </Badge>
                )}
                {patient.openWarning > 0 && (
                  <Badge variant="warn" className="tabular-nums">
                    {patient.openWarning} sariq
                  </Badge>
                )}
                {patient.openUrgent === 0 && patient.openWarning === 0 && (
                  <Badge variant="ok">Tinch</Badge>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
