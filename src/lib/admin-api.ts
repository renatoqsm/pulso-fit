import type { PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './admin-permissions';
import { HttpError } from './http-error';
const permissions = z.enum([
  'VERIFY_CREDENTIALS',
  'MANAGE_USERS',
  'MANAGE_CATALOG',
  'MANAGE_ADMIN_PERMISSIONS',
]);
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function adminGet(db: PrismaClient, user: User, path: string, req: NextRequest) {
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Acesso administrativo necessário.');
  if (path === 'admin/overview')
    return json({
      actorId: user.id,
      permissions: user.mfaEnabled ? user.adminPermissions : [],
      mfaEnabled: user.mfaEnabled,
      users: await db.user.count(),
      activeUsers: await db.user.count({ where: { disabledAt: null } }),
      professionals: await db.user.count({ where: { role: 'PROFESSIONAL' } }),
      pendingCredentials: await db.professionalCredential.count({ where: { status: 'PENDING' } }),
      pendingIntegrationEvents: await db.activityOutbox.count({ where: { state: 'PENDING' } }),
      deletionRequests:
        user.mfaEnabled && user.adminPermissions.includes('MANAGE_USERS')
          ? await db.deletionRequest.findMany({
              include: {
                user: { select: { id: true, email: true, profile: { select: { name: true } } } },
              },
              orderBy: { createdAt: 'desc' },
              take: 50,
            })
          : [],
    });
  if (path === 'admin/foods') {
    requireAdmin(user, 'MANAGE_CATALOG');
    const params = z
      .object({
        q: z.string().max(100).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      ownerId: null,
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' as const } } : {}),
    };
    return json({
      items: await db.food.findMany({
        where,
        select: {
          id: true,
          name: true,
          source: true,
          sourceVersion: true,
          referenceUnit: true,
          active: true,
          provenance: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 30,
        skip: (params.page - 1) * 30,
      }),
      total: await db.food.count({ where }),
    });
  }
  if (path === 'admin/users') {
    requireAdmin(user, 'MANAGE_USERS');
    const params = z
      .object({
        q: z.string().max(100).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = params.q
      ? {
          OR: [
            { email: { contains: params.q, mode: 'insensitive' as const } },
            { profile: { name: { contains: params.q, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    return json({
      items: await db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          disabledAt: true,
          createdAt: true,
          adminPermissions: true,
          profile: { select: { name: true } },
          credentials: user.adminPermissions.includes('VERIFY_CREDENTIALS')
            ? { select: { id: true, area: true, status: true, registration: true, region: true } }
            : false,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        skip: (params.page - 1) * 30,
      }),
      total: await db.user.count({ where }),
    });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
export async function adminPost(db: PrismaClient, user: User, path: string, body: unknown) {
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Acesso administrativo necessário.');
  const parts = path.split('/');
  if (parts[1] === 'foods' && parts[3] === 'status') {
    requireAdmin(user, 'MANAGE_CATALOG');
    const food = await db.food.findFirst({ where: { id: parts[2], ownerId: null } });
    if (!food) throw new HttpError(404, 'Alimento global não encontrado.');
    const { active } = z.object({ active: z.boolean() }).strict().parse(body);
    await db.$transaction(async (tx) => {
      await tx.food.update({ where: { id: food.id }, data: { active } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'GLOBAL_FOOD_STATUS_CHANGED', resourceId: food.id },
      });
    });
    return json({ message: 'Status global atualizado; históricos preservados.' });
  }
  if (parts[1] === 'users') {
    const target = await db.user.findUnique({ where: { id: parts[2] } });
    if (!target) throw new HttpError(404, 'Conta não encontrada.');
    if (target.id === user.id)
      throw new HttpError(400, 'Não altere sua própria administração por este fluxo.');
    if (parts[3] === 'permissions') {
      requireAdmin(user, 'MANAGE_ADMIN_PERMISSIONS');
      if (target.role !== 'ADMIN')
        throw new HttpError(
          400,
          'Permissões são atribuídas somente a administradores criados pelo operador.',
        );
      const data = z
        .object({ permissions: z.array(permissions).max(4), confirmed: z.literal(true) })
        .strict()
        .parse(body);
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { adminPermissions: [...new Set(data.permissions)] },
        });
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'ADMIN_PERMISSIONS_UPDATED', resourceId: target.id },
        });
      });
      return json({ message: 'Permissões atualizadas; sessões desse administrador encerradas.' });
    }
    if (parts[3] === 'status') {
      requireAdmin(user, 'MANAGE_USERS');
      if (target.role === 'ADMIN') requireAdmin(user, 'MANAGE_ADMIN_PERMISSIONS');
      const { active, confirmed } = z
        .object({ active: z.boolean(), confirmed: z.literal(true) })
        .strict()
        .parse(body);
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { disabledAt: active ? null : new Date() },
        });
        if (!active) {
          const links = await tx.professionalStudentLink.findMany({
            where: {
              OR: [{ studentId: target.id }, { professionalId: target.id }],
              status: 'ACTIVE',
            },
          });
          await tx.accessConsent.updateMany({
            where: { linkId: { in: links.map((l) => l.id) }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.professionalStudentLink.updateMany({
            where: { id: { in: links.map((l) => l.id) } },
            data: { status: 'ENDED', endedAt: new Date() },
          });
          await tx.session.deleteMany({ where: { userId: target.id } });
        }
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: active ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_SUSPENDED',
            resourceId: target.id,
          },
        });
      });
      return json({
        message: active
          ? 'Conta reativada; vínculos antigos continuam encerrados.'
          : 'Conta suspensa; sessões encerradas e consentimentos revogados.',
      });
    }
  }
  if (parts[1] === 'credentials' && parts[3] === 'status') {
    requireAdmin(user, 'VERIFY_CREDENTIALS');
    const { status, expectedStatus, confirmed } = z
      .object({
        status: z.enum(['VERIFIED', 'REJECTED']),
        expectedStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(body);
    const credential = await db.professionalCredential.findUnique({ where: { id: parts[2] } });
    if (!credential) throw new HttpError(404, 'Registro não encontrado.');
    await db.$transaction(async (tx) => {
      const changed = await tx.professionalCredential.updateMany({
        where: { id: credential.id, status: expectedStatus },
        data: { status, reviewerId: user.id, reviewedAt: new Date() },
      });
      if (!changed.count)
        throw new HttpError(409, 'Registro alterado. Recarregue antes de revisar.');
      if (status === 'REJECTED') {
        const links = await tx.professionalStudentLink.findMany({
          where: {
            professionalId: credential.professionalId,
            area: credential.area,
            status: 'ACTIVE',
          },
        });
        await tx.accessConsent.updateMany({
          where: { linkId: { in: links.map((l) => l.id) }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.professionalStudentLink.updateMany({
          where: { id: { in: links.map((l) => l.id) } },
          data: { status: 'ENDED', endedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'CREDENTIAL_STATUS_CHANGED', resourceId: credential.id },
      });
    });
    return json({
      message: 'Habilitação atualizada; eventual revogação ficou limitada à área correspondente.',
    });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
