/** Fresh, independent working sets for newly added exercises. */
export function lowVolumeSets() {
  return Array.from({ length: 2 }, () => ({
    repsMin: 6,
    repsMax: 10,
    targetKg: null,
    restSeconds: 60,
    durationSeconds: null,
    kind: 'WORKING' as const,
    cadence: null,
    rpe: null,
    rir: null,
    unilateral: false,
    technique: null,
  }));
}
