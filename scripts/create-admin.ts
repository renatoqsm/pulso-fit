import 'dotenv/config';
import { getDb } from '../src/lib/db';
import { hashPassword } from '../src/lib/crypto';
import { z } from 'zod';
const data = z
  .object({
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(16).max(128),
    ADMIN_NAME: z.string().min(2),
  })
  .parse(process.env);
const db = await getDb();
try {
  await db.user.create({
    data: {
      email: data.ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash: await hashPassword(data.ADMIN_PASSWORD),
      role: 'ADMIN',
      adminPermissions: [
        'VERIFY_CREDENTIALS',
        'MANAGE_USERS',
        'MANAGE_CATALOG',
        'MANAGE_ADMIN_PERMISSIONS',
      ],
      profile: { create: { name: data.ADMIN_NAME } },
    },
  });
  console.log('Administrador criado.');
} finally {
  await db.$disconnect();
}
