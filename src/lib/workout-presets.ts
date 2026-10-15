/** Recognition sets are preparatory sets; the existing technique field preserves their label. */
export function lowVolumeSets() {
  const working = () => ({
    repsMin: 6,
    repsMax: 8,
    targetKg: null,
    restSeconds: 60,
    durationSeconds: null,
    kind: 'WORKING' as 'WARMUP' | 'WORKING',
    cadence: null,
    rpe: null,
    rir: null,
    unilateral: false,
    technique: null as string | null,
  });
  return [
    { ...working(), kind: 'WARMUP' as const, repsMin: 10, repsMax: 15 },
    ...Array.from({ length: 2 }, () => ({
      ...working(),
      kind: 'WARMUP' as const,
      repsMin: 2,
      repsMax: 5,
      technique: 'Reconhecimento',
    })),
    working(),
    working(),
  ];
}
