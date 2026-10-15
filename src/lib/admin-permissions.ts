import type { User } from '@prisma/client';
import { HttpError } from './http-error';
export function requireAdmin(user: User, permission: string) {
  if (!user.mfaEnabled)
    throw new HttpError(403, 'Ative a autenticação em duas etapas em Conta para administrar.');
  if (user.role !== 'ADMIN' || !user.adminPermissions.includes(permission))
    throw new HttpError(403, 'Permissão administrativa necessária.');
}
