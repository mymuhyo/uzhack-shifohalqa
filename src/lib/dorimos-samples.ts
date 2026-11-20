export const dorimosPracticePrescription = {
  drugName: 'Namuna dori',
  strength: 5,
  unit: 'mg',
} as const;

export const dorimosSampleIds = [
  'box-5mg',
  'box-10mg',
  'box-other',
  'box-unreadable',
  'box-5mg-angled',
  'box-5mg-low-light',
  'box-2-5mg',
  'box-20mg',
  'box-label-covered',
  'box-side-only',
] as const;

export type DorimosSampleId = (typeof dorimosSampleIds)[number];

type SampleExpectation =
  | { status: 'readable'; drugName: string; strength: number; unit: 'mg' }
  | { status: 'unreadable' };

function sample(
  id: DorimosSampleId,
  label: string,
  demo: boolean,
  expected: SampleExpectation,
) {
  return { id, label, demo, imagePath: `/demo/${id}.png`, expected };
}

export const dorimosSamples = {
  'box-5mg': sample('box-5mg', 'Namuna dori 5 mg', true, {
    status: 'readable', ...dorimosPracticePrescription,
  }),
  'box-10mg': sample('box-10mg', 'Namuna dori 10 mg', true, {
    status: 'readable', ...dorimosPracticePrescription, strength: 10,
  }),
  'box-other': sample('box-other', 'Andoza dori 5 mg', true, {
    status: 'readable', ...dorimosPracticePrescription, drugName: 'Andoza dori',
  }),
  'box-unreadable': sample('box-unreadable', 'Xira quti', true, {
    status: 'unreadable',
  }),
  'box-5mg-angled': sample('box-5mg-angled', 'Namuna dori 5 mg · qiya', false, {
    status: 'readable', ...dorimosPracticePrescription,
  }),
  'box-5mg-low-light': sample('box-5mg-low-light', 'Namuna dori 5 mg · xira yorug‘lik', false, {
    status: 'readable', ...dorimosPracticePrescription,
  }),
  'box-2-5mg': sample('box-2-5mg', 'Namuna dori 2.5 mg', false, {
    status: 'readable', ...dorimosPracticePrescription, strength: 2.5,
  }),
  'box-20mg': sample('box-20mg', 'Namuna dori 20 mg', false, {
    status: 'readable', ...dorimosPracticePrescription, strength: 20,
  }),
  'box-label-covered': sample('box-label-covered', 'Yorlig‘i yopilgan quti', false, {
    status: 'unreadable',
  }),
  'box-side-only': sample('box-side-only', 'Qutining yon tomoni', false, {
    status: 'unreadable',
  }),
} satisfies Record<DorimosSampleId, ReturnType<typeof sample>>;
