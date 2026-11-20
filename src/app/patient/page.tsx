import type { Metadata } from 'next';
import { DemoRolePage } from '@/components/demo-role-page';

export const metadata: Metadata = { title: 'Bemor sahifasi' };

export default async function PatientPage({ searchParams }: PageProps<'/patient'>) {
  const { result } = await searchParams;
  return <DemoRolePage role="patient" result={result} />;
}
