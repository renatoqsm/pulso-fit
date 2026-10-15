import type { Area, Scope } from '@prisma/client';
export function scopeForArea(area: Area): Scope {
  return area === 'TRAINING' ? 'TRAINING_HISTORY' : 'NUTRITION_HISTORY';
}
