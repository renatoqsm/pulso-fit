import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { D1Store } from '../src/lib/d1-store';
import { localD1 } from '../src/lib/local-d1';
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'pulso-d1-unit-'));
  const path = join(dir, 'unit.sqlite');
  const native = new DatabaseSync(path);
  native.exec('PRAGMA foreign_keys=ON;');
  for (const name of (await readdir('prisma/d1-migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    native.exec(await readFile('prisma/d1-migrations/' + name, 'utf8'));
  native.close();
  const binding = await localD1(path);
  return {
    db: new D1Store(binding).asClient(),
    other: new D1Store(binding).asClient(),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}
const userData = () => ({
  email: crypto.randomUUID() + '@example.test',
  role: 'STUDENT' as const,
  passwordHash: 'unit-fixture-only',
  profile: { create: { name: 'Pessoa de teste' } },
});
test('D1: criação aninhada, seleções relacionais e leitura das próprias alterações', async () => {
  const f = await fixture();
  try {
    const user = await f.db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: userData(), include: { profile: true } });
      assert.equal(u.profile?.name, 'Pessoa de teste');
      await tx.profile.update({ where: { userId: u.id }, data: { bio: 'Alteração pendente' } });
      const selected = await tx.user.findUniqueOrThrow({
        where: { id: u.id },
        select: { id: true, profile: { select: { name: true, bio: true } } },
      });
      assert.deepEqual(selected.profile, { name: 'Pessoa de teste', bio: 'Alteração pendente' });
      assert.equal(await tx.user.count({ where: { id: u.id } }), 1);
      return u;
    });
    assert.equal(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id }, include: { profile: true } }))
        .profile?.bio,
      'Alteração pendente',
    );
  } finally {
    await f.dispose();
  }
});
test('D1: falha em uma gravação desfaz o lote inteiro', async () => {
  const f = await fixture();
  try {
    const data = userData();
    await assert.rejects(
      f.db.$transaction(async (tx) => {
        const u = await tx.user.create({ data });
        await tx.food.create({
          data: {
            ownerId: u.id,
            source: 'CUSTOM',
            name: 'Fixture inválida',
            searchText: 'fixture',
            referenceUnit: 'litros',
            nutrients: {},
            provenance: { source: 'unit' },
          },
        });
      }),
    );
    assert.equal(await f.db.user.count({ where: { email: data.email } }), 0);
    assert.equal(await f.db.profile.count(), 0);
    assert.equal(await f.db.food.count(), 0);
  } finally {
    await f.dispose();
  }
});
test('D1: transação interna rejeitada não contamina a externa', async () => {
  const f = await fixture();
  try {
    const u = await f.db.user.create({ data: userData() });
    await f.db.$transaction(async (tx) => {
      await assert.rejects(
        (tx as typeof f.db).$transaction(async (inner) => {
          await inner.profile.update({
            where: { userId: u.id },
            data: { bio: 'Não deve persistir' },
          });
          throw new Error('Falha proposital da operação interna');
        }),
      );
      await tx.profile.update({ where: { userId: u.id }, data: { specialty: 'Alteração válida' } });
    });
    const p = await f.db.profile.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(p.bio, '');
    assert.equal(p.specialty, 'Alteração válida');
  } finally {
    await f.dispose();
  }
});
test('D1: consumo concorrente é único', async () => {
  const f = await fixture();
  try {
    const u = await f.db.user.create({ data: { ...userData(), role: 'PROFESSIONAL' } });
    const invitation = await f.db.invitation.create({
      data: {
        professionalId: u.id,
        area: 'TRAINING',
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const results = await Promise.all(
      [f.db, f.other].map((db) =>
        db.invitation.updateMany({
          where: { id: invitation.id, consumedAt: null },
          data: { consumedAt: new Date() },
        }),
      ),
    );
    assert.equal(
      results.reduce((sum, r) => sum + r.count, 0),
      1,
    );
  } finally {
    await f.dispose();
  }
});
test('D1: revogação concorrente invalida a decisão antes de gravar', async () => {
  const f = await fixture();
  try {
    const u = await f.db.user.create({ data: userData() });
    let release!: () => void, seen!: () => void;
    const wait = new Promise<void>((r) => (release = r)),
      read = new Promise<void>((r) => (seen = r));
    let attempts = 0;
    const pending = f.db.$transaction(async (tx) => {
      const actor = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      if (actor.disabledAt) throw new Error('Conta suspensa');
      attempts++;
      if (attempts === 1) {
        seen();
        await wait;
      }
      await tx.profile.update({
        where: { userId: u.id },
        data: { bio: 'Não autorizada após suspensão' },
      });
    });
    await read;
    await f.other.$executeRaw`UPDATE "User" SET "disabledAt"=${new Date()} WHERE "id"=${u.id}`;
    release();
    await assert.rejects(pending, /Conta suspensa/);
    assert.equal((await f.db.profile.findUniqueOrThrow({ where: { userId: u.id } })).bio, '');
  } finally {
    await f.dispose();
  }
});

test('D1: histórico pode ser ordenado por data na relação de origem', async () => {
  const f = await fixture();
  try {
    const first = await f.db.user.create({
      data: { ...userData(), createdAt: new Date('2020-01-01T00:00:00Z') },
    });
    const second = await f.db.user.create({
      data: { ...userData(), createdAt: new Date('2025-01-01T00:00:00Z') },
    });
    const profiles = await f.db.profile.findMany({
      where: { userId: { in: [first.id, second.id] } },
      orderBy: { user: { createdAt: 'desc' } },
      select: { userId: true },
    });
    assert.deepEqual(
      profiles.map((p) => p.userId),
      [second.id, first.id],
    );
  } finally {
    await f.dispose();
  }
});

test('D1: busca indexada é atualizada e respeita o proprietário', async () => {
  const f = await fixture();
  try {
    const owner = await f.db.user.create({ data: userData() });
    const stranger = await f.db.user.create({ data: userData() });
    const food = await f.db.food.create({
      data: {
        ownerId: owner.id,
        source: 'CUSTOM',
        name: 'Arroz integral de teste',
        searchText: 'arroz integral de teste',
        referenceUnit: 'g',
        nutrients: { protein_g: '1' },
        provenance: { source: 'unit' },
      },
    });
    assert.equal(
      (await f.db.food.findMany({ where: { ownerId: owner.id, searchText: { contains: 'arr' } } }))
        .length,
      1,
    );
    assert.equal(
      (
        await f.db.food.findMany({
          where: { ownerId: stranger.id, searchText: { contains: 'arr' } },
        })
      ).length,
      0,
    );
    await f.db.food.update({
      where: { id: food.id },
      data: { name: 'Aveia de teste', searchText: 'aveia de teste' },
    });
    assert.equal(
      (await f.db.food.findMany({ where: { ownerId: owner.id, searchText: { contains: 'arr' } } }))
        .length,
      0,
    );
    assert.equal(
      (await f.db.food.findMany({ where: { ownerId: owner.id, searchText: { contains: 'ave' } } }))
        .length,
      1,
    );
  } finally {
    await f.dispose();
  }
});

test('D1: efeitos de autenticação só ocorrem após confirmar a gravação', async () => {
  const f = await fixture();
  try {
    let effects = 0;
    const store = f.db as unknown as D1Store;
    await assert.rejects(
      f.db.$transaction(async (tx) => {
        const actual = tx as unknown as D1Store;
        await tx.user.create({ data: userData() });
        await actual.onCommit(() => {
          effects++;
        });
        await tx.food.create({
          data: {
            source: 'CUSTOM',
            ownerId: 'nonexistent',
            name: 'Fixture inválida',
            searchText: 'unit',
            referenceUnit: 'g',
            nutrients: {},
            provenance: { source: 'unit' },
          },
        });
      }),
    );
    assert.equal(effects, 0);
    await f.db.$transaction(async (tx) => {
      await tx.user.create({ data: userData() });
      await (tx as unknown as D1Store).onCommit(() => {
        effects++;
      });
      assert.equal(effects, 0);
    });
    assert.equal(effects, 1);
  } finally {
    await f.dispose();
  }
});

test('D1: pais novos precedem relações já agrupadas para pais existentes', async () => {
  const f = await fixture();
  try {
    const { profile, ...existingData } = userData();
    const existing = await f.db.user.create({ data: existingData });
    const created = await f.db.$transaction(async (tx) => {
      await tx.profile.create({ data: { userId: existing.id, name: 'Perfil antigo' } });
      return tx.user.create({ data: userData() });
    });
    assert.equal(
      (await f.db.profile.findUniqueOrThrow({ where: { userId: existing.id } })).name,
      'Perfil antigo',
    );
    assert.equal(
      (await f.db.profile.findUniqueOrThrow({ where: { userId: created.id } })).name,
      'Pessoa de teste',
    );
  } finally {
    await f.dispose();
  }
});
