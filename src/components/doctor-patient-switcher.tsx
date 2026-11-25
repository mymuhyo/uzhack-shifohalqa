import Link from 'next/link';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AssignedPatientSummary } from '@/lib/role-page-context';

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
      className="mt-4 rounded-xl border border-border bg-card p-3.5 shadow-[var(--surface-shadow)]"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="size-4 text-primary" aria-hidden="true" />
          <span>Bemorlar navbati ({patients.length})</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Ustuvorlik: shoshilinch → tekshirish
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {patients.map((patient) => {
          const active = patient.id === selectedPatientId;
          return (
            <Link
              key={patient.id}
              href={`/doctor?patientId=${patient.id}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold no-underline transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-secondary'
              }`}
            >
              <span>{patient.name}</span>
              {patient.openUrgent > 0 && (
                <Badge variant={active ? 'secondary' : 'urgent'} className="tabular-nums">
                  {patient.openUrgent} qizil
                </Badge>
              )}
              {patient.openWarning > 0 && (
                <Badge variant={active ? 'secondary' : 'warn'} className="tabular-nums">
                  {patient.openWarning} sariq
                </Badge>
              )}
              {patient.openUrgent === 0 && patient.openWarning === 0 && (
                <Badge variant={active ? 'secondary' : 'ok'}>Tinch</Badge>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
