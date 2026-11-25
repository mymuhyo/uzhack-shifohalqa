import type { Metadata } from 'next';
import { DemoRolePage } from '@/components/demo-role-page';

export const metadata: Metadata = { title: 'Shifokor sahifasi' };

export default async function DoctorPage({ searchParams }: PageProps<'/doctor'>) {
  const { result, patientId } = await searchParams;
  return <DemoRolePage role="doctor" result={result} patientId={patientId} />;
}
