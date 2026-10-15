import { verifyMfa } from '@/lib/mfa';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '@/lib/db';
import { currentUser, createSession, destroySession } from '@/lib/auth';
import { digest, hashPassword, randomToken, verifyPassword } from '@/lib/crypto';
import { scopeForArea, canAccessStudent } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { HttpError } from '@/lib/http-error';
import { adminGet, adminPost } from '@/lib/admin-api';
import { requireAdmin } from '@/lib/admin-permissions';
import { accountGet, accountPost } from '@/lib/account-api';
import { workspace } from '@/lib/workspace';
import { workoutGet, workoutPost } from '@/lib/workout-api';
import { nutritionGet, nutritionPost } from '@/lib/nutrition-api';
import { exerciseGet, exercisePost } from '@/lib/exercise-api';
const areaSchema = z.enum(['TRAINING', 'NUTRITION']);
const identity = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
const register = identity.extend({
  name: z.string().trim().min(2).max(100),
  role: z.enum(['STUDENT', 'PROFESSIONAL']),
});
const ok = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await params).path.join('/');
    if (process.env.NODE_ENV === 'production' && !process.env.APP_URL)
      throw new HttpError(503, 'Origem da aplicação não configurada.');
    if (req.method === 'POST') {
      const origin = req.headers.get('origin');
      const expected = new URL(process.env.APP_URL ?? req.url).origin;
      if (origin !== expected) throw new HttpError(403, 'Origem da solicitação inválida.');
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new HttpError(415, 'Envie dados JSON.');
      const raw = await req.text();
      if (raw.length > (path.startsWith('auth/') ? 16_384 : 262_144))
        throw new HttpError(413, 'Solicitação muito grande.');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, 'JSON inválido.');
      }
      return await withDb(async (db) => {
        // Persistent atomic rate limit. Never store raw IPs, emails or credentials.
        const ip =
          process.env.NODE_ENV === 'production'
            ? (req.headers.get('cf-connecting-ip') ?? 'unknown')
            : 'local';
        const key = await digest(`${path}:${ip}`);
        const now = new Date();
        const expiration = new Date(now.getTime() + 15 * 60 * 1000);
        const limits = await db.$queryRaw<
          { count: number }[]
        >`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${key},1,${expiration}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN 1 ELSE "RateLimit"."count"+1 END,"expiresAt"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN ${expiration} ELSE "RateLimit"."expiresAt" END RETURNING "count"`;

        if (
          limits[0].count >
          (path.startsWith('auth/') ? 30 : path.startsWith('sessions/') ? 600 : 120)
        )
          throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
        if (path === 'auth/register') {
          const data = register.parse(body);
          const passwordHash = await hashPassword(data.password);
          const user = await db.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                email: data.email,
                passwordHash,
                role: data.role,
                profile: { create: { name: data.name } },
              },
            });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'ACCOUNT_CREATED', resourceId: user.id },
            });
            return user;
          });
          await createSession(db, user.id, user);
          return ok({ message: 'Conta criada.' });
        }
        if (path === 'auth/login') {
          const data = identity.extend({ code: z.string().max(64).optional() }).parse(body);
          const user = await db.user.findUnique({ where: { email: data.email } });
          // Equal-cost derivation for unknown accounts.
          const valid = user
            ? await verifyPassword(data.password, user.passwordHash)
            : (await hashPassword(data.password), false);
          if (
            !user ||
            user.disabledAt ||
            !valid ||
            !(await verifyMfa(db, user, data.password, data.code ?? ''))
          )
            throw new HttpError(401, 'Email, senha ou código incorretos.');
          await createSession(db, user.id, user);
          return ok({ message: 'Acesso autorizado.' });
        }
        if (path === 'auth/logout') {
          await destroySession(db);
          return ok({ message: 'Sessão encerrada.' });
        }
        const user = await currentUser(db);
        if (!user) throw new HttpError(401, 'Entre para continuar.');
        if (path.startsWith('admin/users/') || path.startsWith('admin/credentials/'))
          return adminPost(db, user, path, body);
        if (path.startsWith('account/')) return accountPost(db, user, path, body);
        if (path.startsWith('workouts/') || path.startsWith('sessions/'))
          return workoutPost(db, user, path, body);
        if (path.startsWith('foods/') || path.startsWith('nutrition/') || path.startsWith('meals/'))
          return nutritionPost(db, user, path, body);
        if (path.startsWith('exercises/') || path === 'admin/import-exercises')
          return exercisePost(db, user, path, body);
        if (path === 'profile') {
          const data = z
            .object({
              name: z.string().trim().min(2).max(100),
              bio: z.string().trim().max(1000),
              specialty: z.string().trim().max(150),
              contact: z.string().trim().max(150),
            })
            .parse(body);
          await db.$transaction(async (tx) => {
            await tx.profile.update({ where: { userId: user.id }, data });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'PROFILE_UPDATED', resourceId: user.id },
            });
          });
          return ok({ message: 'Perfil atualizado.' });
        }
        if (path === 'credentials') {
          if (user.role !== 'PROFESSIONAL')
            throw new HttpError(403, 'Recurso exclusivo de profissionais.');
          const data = z
            .object({
              area: areaSchema,
              registration: z.string().trim().min(3).max(80),
              region: z.string().trim().min(2).max(40),
            })
            .parse(body);
          // Already-reviewed records cannot be silently replaced.
          await db.$transaction(async (tx) => {
            const rejected = await tx.professionalCredential.findFirst({
              where: { professionalId: user.id, area: data.area, status: 'REJECTED' },
            });
            let credential;
            if (rejected) {
              const changed = await tx.professionalCredential.updateMany({
                where: { id: rejected.id, status: 'REJECTED' },
                data: { ...data, status: 'PENDING', reviewerId: null, reviewedAt: null },
              });
              if (!changed.count) throw new HttpError(409, 'Registro alterado; recarregue.');
              credential = rejected;
            } else
              credential = await tx.professionalCredential.create({
                data: { ...data, professionalId: user.id },
              });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'CREDENTIAL_SUBMITTED', resourceId: credential.id },
            });
          });
          return ok({ message: 'Registro enviado para verificação.' });
        }
        if (path === 'admin/review') {
          requireAdmin(user, 'VERIFY_CREDENTIALS');
          const data = z
            .object({
              id: z.string().min(1),
              status: z.enum(['VERIFIED', 'REJECTED']),
              confirmed: z.literal(true),
            })
            .parse(body);
          await db.$transaction(async (tx) => {
            const result = await tx.professionalCredential.updateMany({
              where: { id: data.id, status: 'PENDING' },
              data: { status: data.status, reviewerId: user.id, reviewedAt: new Date() },
            });
            if (!result.count) throw new HttpError(409, 'Registro já revisado ou indisponível.');
            await tx.auditLog.create({
              data: { actorId: user.id, action: `CREDENTIAL_${data.status}`, resourceId: data.id },
            });
          });
          return ok({ message: 'Verificação registrada.' });
        }
        if (path === 'invitations') {
          if (user.role !== 'PROFESSIONAL')
            throw new HttpError(403, 'Recurso exclusivo de profissionais.');
          const { area } = z.object({ area: areaSchema }).parse(body);
          const credential = await db.professionalCredential.findUnique({
            where: { professionalId_area: { professionalId: user.id, area } },
          });
          if (credential?.status !== 'VERIFIED')
            throw new HttpError(403, 'Esta habilitação ainda não foi verificada.');
          const token = randomToken();
          await db.$transaction(async (tx) => {
            const invite = await tx.invitation.create({
              data: {
                professionalId: user.id,
                area,
                tokenHash: await digest(token),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'INVITATION_CREATED', resourceId: invite.id },
            });
          });
          return ok({
            token,
            url: `${process.env.APP_URL ?? new URL(req.url).origin}/convite/${token}`,
            message: 'Convite válido por 7 dias, para um único aluno.',
          });
        }
        if (path === 'links/accept') {
          if (user.role !== 'STUDENT')
            throw new HttpError(403, 'Somente alunos podem aceitar convites.');
          const data = z
            .object({
              token: z.string().regex(/^[a-f0-9]{64}$/),
              scope: z.enum(['TRAINING_HISTORY', 'NUTRITION_HISTORY']),
              consent: z.literal(true),
            })
            .parse(body);
          await db.$transaction(async (tx) => {
            const invite = await tx.invitation.findUnique({
              where: { tokenHash: await digest(data.token) },
            });
            if (!invite || invite.consumedAt || invite.expiresAt <= new Date())
              throw new HttpError(404, 'Convite inválido, expirado ou utilizado.');
            if (data.scope !== scopeForArea(invite.area))
              throw new HttpError(400, 'Consentimento incompatível com a área.');
            const credential = await tx.professionalCredential.findUnique({
              where: {
                professionalId_area: { professionalId: invite.professionalId, area: invite.area },
              },
            });
            if (credential?.status !== 'VERIFIED')
              throw new HttpError(403, 'Habilitação indisponível.');
            const consumed = await tx.invitation.updateMany({
              where: { id: invite.id, consumedAt: null, expiresAt: { gt: new Date() } },
              data: { consumedAt: new Date() },
            });
            if (!consumed.count) throw new HttpError(409, 'Convite já utilizado.');
            const existing = await tx.professionalStudentLink.findUnique({
              where: {
                studentId_professionalId_area: {
                  studentId: user.id,
                  professionalId: invite.professionalId,
                  area: invite.area,
                },
              },
            });
            if (existing?.status === 'ACTIVE')
              throw new HttpError(409, 'Este vínculo já está ativo.');
            const link = await tx.professionalStudentLink.upsert({
              where: {
                studentId_professionalId_area: {
                  studentId: user.id,
                  professionalId: invite.professionalId,
                  area: invite.area,
                },
              },
              create: {
                studentId: user.id,
                professionalId: invite.professionalId,
                area: invite.area,
                invitationId: invite.id,
              },
              update: {
                status: 'ACTIVE',
                startedAt: new Date(),
                endedAt: null,
                invitationId: invite.id,
              },
            });
            await tx.accessConsent.create({ data: { linkId: link.id, scope: data.scope } });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'LINK_CONSENT_GRANTED', resourceId: link.id },
            });
          });
          return ok({ message: 'Vínculo ativado com seu consentimento.' });
        }
        if (path === 'links/revoke') {
          const { id } = z.object({ id: z.string().min(1) }).parse(body);
          await db.$transaction(async (tx) => {
            const link = await tx.professionalStudentLink.findUnique({ where: { id } });
            if (!link || (link.studentId !== user.id && link.professionalId !== user.id))
              throw new HttpError(404, 'Vínculo não encontrado.');
            await tx.professionalStudentLink.update({
              where: { id },
              data: { status: 'ENDED', endedAt: new Date() },
            });
            await tx.accessConsent.updateMany({
              where: { linkId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'LINK_REVOKED', resourceId: id },
            });
          });
          return ok({ message: 'Vínculo encerrado. Seu histórico é preservado.' });
        }
        throw new HttpError(404, 'Recurso não encontrado.');
      });
    }
    return await withDb(async (db) => {
      const user = await currentUser(db);
      if (!user) throw new HttpError(401, 'Entre para continuar.');
      if (path === 'admin/overview' || path === 'admin/users') return adminGet(db, user, path, req);
      if (path.startsWith('account/') || path.startsWith('media/'))
        return accountGet(db, user, path);
      if (path === 'workspace') return workspace(db, user);
      if (
        ['workouts', 'sessions', 'progress'].includes(path) ||
        path.startsWith('workouts/') ||
        path.startsWith('sessions/')
      )
        return workoutGet(db, user, path, req);
      if (
        ['foods', 'nutrition', 'meals'].includes(path) ||
        path.startsWith('nutrition/') ||
        path.startsWith('foods/')
      )
        return nutritionGet(db, user, path, req);
      if (path === 'exercises' || path.startsWith('exercises/'))
        return exerciseGet(db, user, path, req);
      if (path === 'me')
        return ok({
          id: user.id,
          email: user.email,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          profile: user.profile,
        });
      if (path === 'dashboard') {
        const credentials =
          user.role === 'PROFESSIONAL'
            ? await db.professionalCredential.findMany({
                where: { professionalId: user.id },
                select: { id: true, area: true, registration: true, region: true, status: true },
              })
            : [];
        const links = await db.professionalStudentLink.findMany({
          where:
            user.role === 'STUDENT'
              ? { studentId: user.id }
              : user.role === 'PROFESSIONAL'
                ? { professionalId: user.id }
                : { id: 'none' },
          include: {
            student: { select: { id: true, profile: { select: { name: true } } } },
            professional: { select: { id: true, profile: { select: { name: true } } } },
            consents: { where: { revokedAt: null }, select: { scope: true } },
          },
          orderBy: { startedAt: 'desc' },
        });
        const pending =
          user.role === 'ADMIN' &&
          user.mfaEnabled &&
          user.adminPermissions.includes('VERIFY_CREDENTIALS')
            ? await db.professionalCredential.findMany({
                where: { status: 'PENDING' },
                include: { professional: { select: { profile: { select: { name: true } } } } },
              })
            : [];
        return ok({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            adminPermissions: user.adminPermissions,
            profile: user.profile,
          },
          credentials,
          links,
          pending,
        });
      }
      if (path.startsWith('invitations/')) {
        const token = path.split('/')[1];
        if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, 'Convite inválido.');
        const invite = await db.invitation.findUnique({
          where: { tokenHash: await digest(token) },
          include: { professional: { select: { profile: { select: { name: true } } } } },
        });
        if (!invite || invite.consumedAt || invite.expiresAt <= new Date())
          throw new HttpError(404, 'Convite inválido, expirado ou utilizado.');
        return ok({
          area: invite.area,
          scope: scopeForArea(invite.area),
          professional: invite.professional.profile?.name,
          expiresAt: invite.expiresAt,
        });
      }
      if (path.startsWith('students/')) {
        const studentId = path.split('/')[1];
        const area = areaSchema.parse(req.nextUrl.searchParams.get('area'));
        if (user.role !== 'PROFESSIONAL' || !(await canAccessStudent(db, user.id, studentId, area)))
          throw new HttpError(403, 'Você não possui acesso autorizado nesta área.');
        const student = await db.user.findUnique({
          where: { id: studentId },
          select: { id: true, profile: { select: { name: true } } },
        });
        return ok({ student, area });
      }
      throw new HttpError(404, 'Recurso não encontrado.');
    });
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: 'Confira os campos informados.' }, { status: 400 });
    // Node and Workers load distinct Prisma runtime classes. Use its stable error name/code.
    const prismaCode =
      error instanceof Error && error.name === 'PrismaClientKnownRequestError' && 'code' in error
        ? String(error.code)
        : '';
    if (prismaCode === 'P2002')
      return NextResponse.json(
        { error: 'Não foi possível criar: email, habilitação ou vínculo já cadastrado.' },
        { status: 409 },
      );
    // Log only safe error classes/codes, never request data or exception messages.
    console.error(
      'Pulso request failed',
      error instanceof Error ? error.name : 'UnknownError',
      prismaCode,
    );
    return NextResponse.json(
      { error: 'Não foi possível concluir. Tente novamente.' },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
