import type { Area, PrismaClient, User } from '@prisma/client';
import { HttpError } from './http-error';
export type Db = Pick<PrismaClient, 'professionalCredential' | 'professionalStudentLink'>;
export async function studentAccess(_db: Db, user: User, studentId: string, area: Area) {
  if (area === 'TRAINING' && user.role === 'STUDENT' && user.id === studentId) return;
  throw new HttpError(403, 'Você só pode acessar seus próprios treinos.');
}
export async function authorship(_db: Db, user: User, area: Area) {
  if (area === 'TRAINING' && user.role === 'STUDENT') return;
  throw new HttpError(403, 'Disponível apenas para treinos pessoais.');
}
export async function assignmentTargets(db: Db, user: User, studentIds: string[], area: Area) {
  await authorship(db, user, area);
  if (studentIds.some((id) => id !== user.id))
    throw new HttpError(403, 'Atribuição pessoal inválida.');
}
