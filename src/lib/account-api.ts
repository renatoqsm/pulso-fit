import type { PrismaClient, User } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError } from './http-error';
import { createSession, destroySession } from './auth';
import { hashPassword, verifyPassword } from './crypto';
import { encryptMfa, decryptMfa, newMfaSecret, matchingCounter, verifyMfa } from './mfa';
import { randomToken, digest } from './crypto';
import { canAccessStudent } from './access';
function pngClean(data: Buffer) {
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new HttpError(400, 'PNG inválido.');
  if (data.subarray(12, 16).toString() !== 'IHDR') throw new HttpError(400, 'PNG inválido.');
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!width || !height || width * height > 4194304)
    throw new HttpError(400, 'Imagem grande demais.');
  const chunks = [data.subarray(0, 8)];
  let position = 8,
    ended = false;
  while (position + 12 <= data.length) {
    const size = data.readUInt32BE(position);
    if (position + 12 + size > data.length) throw new HttpError(400, 'PNG incompleto.');
    const type = data.subarray(position + 4, position + 8).toString();
    if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type))
      chunks.push(data.subarray(position, position + size + 12));
    if (type === 'acTL') throw new HttpError(400, 'Use uma foto estática.');
    position += size + 12;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended) throw new HttpError(400, 'PNG incompleto.');
  return Buffer.concat(chunks);
}
function jpegClean(data: Buffer) {
  if (
    data.length < 4 ||
    data.readUInt16BE(0) !== 0xffd8 ||
    data.readUInt16BE(data.length - 2) !== 0xffd9
  )
    throw new HttpError(400, 'JPEG inválido.');
  const chunks = [data.subarray(0, 2)];
  let p = 2,
    dimensions = false;
  while (p + 4 < data.length) {
    if (data[p] !== 0xff) throw new HttpError(400, 'JPEG inválido.');
    const marker = data[p + 1];
    if (marker === 0xda) {
      if (!dimensions) throw new HttpError(400, 'Dimensões ausentes.');
      chunks.push(data.subarray(p));
      return Buffer.concat(chunks);
    }
    const size = data.readUInt16BE(p + 2);
    if (size < 2 || p + 2 + size > data.length) throw new HttpError(400, 'JPEG incompleto.');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8) throw new HttpError(400, 'JPEG inválido.');
      const height = data.readUInt16BE(p + 5),
        width = data.readUInt16BE(p + 7);
      if (!height || !width || width * height > 4194304)
        throw new HttpError(400, 'Imagem grande demais.');
      dimensions = true;
    }
    if (!(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe)
      chunks.push(data.subarray(p, p + size + 2));
    p += size + 2;
  }
  throw new HttpError(400, 'JPEG incompleto.');
}
export async function accountGet(db: PrismaClient, user: User, path: string) {
  if (path === 'account/export') {
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    const records = {
      generatedAt: new Date(),
      user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
      profile,
      credentials: await db.professionalCredential.findMany({
        where: { professionalId: user.id },
        select: { area: true, registration: true, region: true, status: true, reviewedAt: true },
      }),
      links: await db.professionalStudentLink.findMany({
        where: { OR: [{ studentId: user.id }, { professionalId: user.id }] },
        include: { consents: true },
      }),
      programs: await db.workoutProgram.findMany({
        where: { authorId: user.id },
        include: {
          versions: { include: { days: { include: { exercises: { include: { sets: true } } } } } },
        },
      }),
      workoutSessions: await db.workoutSession.findMany({
        where: { studentId: user.id },
        include: { exercises: { include: { sets: true } }, feedbackReplies: true },
      }),
      assignedWorkouts: await db.workoutAssignment.findMany({
        where: { studentId: user.id },
        include: {
          version: {
            include: {
              program: true,
              days: { include: { exercises: { include: { sets: true } } } },
            },
          },
        },
      }),
      foods: await db.food.findMany({ where: { ownerId: user.id }, include: { measures: true } }),
      nutritionPlans: await db.nutritionPlan.findMany({
        where: { authorId: user.id },
        include: { versions: { include: { meals: { include: { items: true } } } } },
      }),
      assignedNutrition: await db.nutritionAssignment.findMany({
        where: { studentId: user.id },
        include: { version: { include: { plan: true, meals: { include: { items: true } } } } },
      }),
      mealLogs: await db.mealLog.findMany({
        where: { studentId: user.id },
        include: { items: true, replies: true },
      }),
    };
    await db.auditLog.create({
      data: { actorId: user.id, action: 'PERSONAL_DATA_EXPORTED', resourceId: user.id },
    });
    return NextResponse.json(records, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="pulso-fit-dados-pessoais.json"',
      },
    });
  }
  if (path.startsWith('media/')) {
    const asset = await db.mediaAsset.findUnique({ where: { id: path.split('/')[1] } });
    if (!asset) throw new HttpError(404, 'Arquivo não encontrado.');
    if (asset.ownerId !== user.id) {
      let allowed = false;
      for (const area of ['TRAINING', 'NUTRITION'] as const) {
        if (
          (await canAccessStudent(db, user.id, asset.ownerId, area)) ||
          (await canAccessStudent(db, asset.ownerId, user.id, area))
        ) {
          allowed = true;
          break;
        }
      }
      if (!allowed) throw new HttpError(404, 'Arquivo não encontrado.');
    }
    return new NextResponse(new Uint8Array(asset.data), {
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
export async function accountPost(db: PrismaClient, user: User, path: string, body: unknown) {
  if (path.startsWith('account/mfa/')) {
    const data = z
      .object({ currentPassword: z.string().min(12).max(128), code: z.string().max(64).optional() })
      .strict()
      .parse(body);
    if (!(await verifyPassword(data.currentPassword, user.passwordHash)))
      throw new HttpError(403, 'Senha ou código incorretos.');
    if (path === 'account/mfa/setup') {
      if (user.mfaEnabled) throw new HttpError(409, 'Autenticação em duas etapas já ativada.');
      const secret = newMfaSecret();
      const changed = await db.user.updateMany({
        where: { id: user.id, mfaEnabled: false, passwordHash: user.passwordHash },
        data: await encryptMfa(secret, data.currentPassword, user.id),
      });
      if (!changed.count) throw new HttpError(409, 'Conta alterada; recarregue.');
      return NextResponse.json(
        {
          message: 'Adicione a chave ao autenticador e confirme o código.',
          secret,
          uri: `otpauth://totp/${encodeURIComponent('Pulso Fit:' + user.email)}?secret=${secret}&issuer=Pulso%20Fit&algorithm=SHA1&digits=6&period=30`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (path === 'account/mfa/confirm') {
      if (user.mfaEnabled || !user.mfaCipher)
        throw new HttpError(409, 'Inicie uma nova configuração.');
      const counter = await matchingCounter(
        await decryptMfa(user, data.currentPassword),
        data.code ?? '',
      );
      if (counter === null) throw new HttpError(403, 'Código incorreto.');
      const recoveryCodes = Array.from({ length: 8 }, () => randomToken());
      const hashes = await Promise.all(recoveryCodes.map(digest));
      await db.$transaction(async (tx) => {
        const changed = await tx.user.updateMany({
          where: {
            id: user.id,
            mfaEnabled: false,
            mfaCipher: user.mfaCipher,
            passwordHash: user.passwordHash,
          },
          data: { mfaEnabled: true, mfaLastCounter: counter, mfaRecoveryHashes: hashes },
        });
        if (!changed.count) throw new HttpError(409, 'Configuração alterada; tente novamente.');
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'MFA_ENABLED', resourceId: user.id },
        });
      });
      await createSession(db, user.id, { ...user, mfaEnabled: true });
      return NextResponse.json(
        {
          message:
            'Autenticação em duas etapas ativada. Guarde os códigos de recuperação em local seguro.',
          recoveryCodes,
          mfaEnabled: true,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (path === 'account/mfa/disable') {
      if (
        !user.mfaEnabled ||
        !(await verifyMfa(db, user, data.currentPassword, data.code ?? '', false))
      )
        throw new HttpError(403, 'Senha ou código incorretos.');
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            mfaEnabled: false,
            mfaCipher: null,
            mfaIv: null,
            mfaSalt: null,
            mfaLastCounter: null,
            mfaRecoveryHashes: [],
          },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'MFA_DISABLED', resourceId: user.id },
        });
      });
      await createSession(db, user.id, { ...user, mfaEnabled: false, mfaCipher: null });
      return NextResponse.json({
        message: 'Autenticação em duas etapas desativada.',
        mfaEnabled: false,
      });
    }
    throw new HttpError(404, 'Recurso não encontrado.');
  }
  if (path === 'account/photo') {
    const { mimeType, base64 } = z
      .object({
        mimeType: z.enum(['image/png', 'image/jpeg']),
        base64: z
          .string()
          .regex(/^[A-Za-z0-9+/]+={0,2}$/)
          .max(210000),
      })
      .strict()
      .parse(body);
    const raw = Buffer.from(base64, 'base64');
    if (raw.toString('base64') !== base64 || raw.length > 153600)
      throw new HttpError(400, 'Envie uma foto PNG/JPEG de até 150 KB.');
    const data = mimeType === 'image/png' ? pngClean(raw) : jpegClean(raw);
    const asset = await db.$transaction(async (tx) => {
      const previous = await tx.profile.findUnique({ where: { userId: user.id } });
      const created = await tx.mediaAsset.create({
        data: { ownerId: user.id, mimeType, data: new Uint8Array(data) },
      });
      await tx.profile.update({ where: { userId: user.id }, data: { photoId: created.id } });
      if (previous?.photoId)
        await tx.mediaAsset.deleteMany({ where: { id: previous.photoId, ownerId: user.id } });
      return created;
    });
    return NextResponse.json({
      message: 'Foto salva com acesso privado e sem metadados adicionais.',
      photoId: asset.id,
    });
  }
  if (path === 'account/password') {
    const data = z
      .object({
        currentPassword: z.string().min(12).max(128),
        newPassword: z.string().min(12).max(128),
        code: z.string().max(64).optional(),
      })
      .strict()
      .parse(body);
    if (!(await verifyPassword(data.currentPassword, user.passwordHash)))
      throw new HttpError(403, 'Senha atual incorreta.');
    if (!(await verifyMfa(db, user, data.currentPassword, data.code ?? '', false)))
      throw new HttpError(403, 'Código incorreto.');
    const encrypted = user.mfaEnabled
      ? await encryptMfa(await decryptMfa(user, data.currentPassword), data.newPassword, user.id)
      : { mfaCipher: null, mfaIv: null, mfaSalt: null };
    const passwordHash = await hashPassword(data.newPassword);
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordHash: user.passwordHash,
          mfaEnabled: user.mfaEnabled,
          mfaCipher: user.mfaCipher,
        },
        data: { passwordHash, ...encrypted },
      });
      if (!changed.count)
        throw new HttpError(409, 'Conta alterada; recarregue antes de trocar a senha.');
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'PASSWORD_CHANGED', resourceId: user.id },
      });
    });
    await createSession(db, user.id, { ...user, passwordHash, ...encrypted });
    return NextResponse.json({ message: 'Senha atualizada; outras sessões encerradas.' });
  }
  if (path === 'account/close') {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(body);
    await db.$transaction(async (tx) => {
      const links = await tx.professionalStudentLink.findMany({
        where: { OR: [{ studentId: user.id }, { professionalId: user.id }], status: 'ACTIVE' },
      });
      await tx.accessConsent.updateMany({
        where: { linkId: { in: links.map((l) => l.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.professionalStudentLink.updateMany({
        where: { id: { in: links.map((l) => l.id) } },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      await tx.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.deletionRequest.create({ data: { userId: user.id } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'ACCOUNT_CLOSURE_REQUESTED', resourceId: user.id },
      });
    });
    await destroySession(db);
    return NextResponse.json({
      message:
        'Conta desativada e vínculos revogados. Exclusão de registros aguarda análise de retenção e obrigações legais.',
    });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
