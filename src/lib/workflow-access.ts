import type { Area, PrismaClient, User } from '@prisma/client';
import { HttpError } from './http-error';
import { canAccessStudent } from './access';
export type Db = Pick<PrismaClient, 'professionalCredential' | 'professionalStudentLink'>;
export async function professional(db: Db, user: User, area: Area) {
  if (
    user.role !== 'PROFESSIONAL' ||
    !(await db.professionalCredential.findFirst({
      where: { professionalId: user.id, area, status: 'VERIFIED' },
    }))
  )
    throw new HttpError(403, 'Habilitação profissional verificada necessária nesta área.');
}
export async function studentAccess(db: Db, user: User, studentId: string, area: Area) {
  if (user.id === studentId && user.role === 'STUDENT') return;
  await professional(db, user, area);
  if (!(await canAccessStudent(db, user.id, studentId, area)))
    throw new HttpError(403, 'Sem vínculo e consentimento ativo nesta área.');
}
export async function authorship(db: Db, user: User, area: Area) {
  if (user.role === 'STUDENT') return;
  await professional(db, user, area);
}

export async function assignmentTargets(db: Db, user: User, studentIds: string[], area: Area) {
  if (user.role === 'STUDENT') {
    if (studentIds.some((id) => id !== user.id))
      throw new HttpError(403, 'Atribuição pessoal inválida.');
    return;
  }
  await professional(db, user, area);
  const scope = area === 'TRAINING' ? 'TRAINING_HISTORY' : 'NUTRITION_HISTORY';
  const links = await db.professionalStudentLink.findMany({
    where: {
      professionalId: user.id,
      studentId: { in: studentIds },
      area,
      status: 'ACTIVE',
      consents: { some: { scope, revokedAt: null } },
    },
    select: { studentId: true },
  });
  const allowed = new Set(links.map((l) => l.studentId));
  if (studentIds.some((id) => !allowed.has(id)))
    throw new HttpError(403, 'Sem vínculo e consentimento ativo nesta área.');
}
