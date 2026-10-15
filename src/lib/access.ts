import type { Area, PrismaClient, Scope } from '@prisma/client';
export function scopeForArea(area: Area): Scope {
  return area === 'TRAINING' ? 'TRAINING_HISTORY' : 'NUTRITION_HISTORY';
}
export async function canAccessStudent(
  db: Pick<PrismaClient, 'professionalCredential' | 'professionalStudentLink'>,
  professionalId: string,
  studentId: string,
  area: Area,
) {
  const credential = await db.professionalCredential.findUnique({
    where: { professionalId_area: { professionalId, area } },
    include: { professional: { select: { disabledAt: true, role: true } } },
  });
  if (
    credential?.status !== 'VERIFIED' ||
    credential.professional.disabledAt ||
    credential.professional.role !== 'PROFESSIONAL'
  )
    return false;
  return !!(await db.professionalStudentLink.findFirst({
    where: {
      professionalId,
      studentId,
      area,
      status: 'ACTIVE',
      consents: { some: { scope: scopeForArea(area), revokedAt: null } },
    },
  }));
}
