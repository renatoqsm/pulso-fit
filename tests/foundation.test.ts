import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { testDatabase } from './test-database';
import { basename } from 'node:path';
import { encryptMfa, totp } from '../src/lib/mfa';
import { hashPassword } from '../src/lib/crypto';
import exerciseSnapshot from '../data/wger/catalog.json';
const databaseUrl = process.env.TEST_DB_PATH;
const origin = process.env.TEST_APP_URL ?? 'http://localhost:3100';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'Use apenas servidor de testes local.',
);

test(
  'Fluxos integrados: identidade, treinos, nutrição e privacidade',
  { timeout: 120000 },
  async (t) => {
    assert.ok(
      databaseUrl,
      'Configure TEST_DB_PATH para um banco SQLite dedicado pulso_fit_test.sqlite.',
    );
    assert.equal(
      basename(databaseUrl),
      'pulso_fit_test.sqlite',
      'Os testes não podem usar o banco de desenvolvimento/produção.',
    );
    const fixture = await testDatabase(databaseUrl);
    const db = fixture.db;
    await db.rateLimit.deleteMany(); // Reset only the explicitly dedicated test database.
    const server = process.env.TEST_APP_URL
      ? undefined
      : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3100'], {
          env: {
            ...process.env,
            PULSO_DB_PATH: databaseUrl,
            APP_URL: origin,
            PULSO_QUERY_DIAGNOSTICS: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
    let output = '';
    server?.stdout.on('data', (b) => {
      output += b;
    });
    server?.stderr.on('data', (b) => {
      output += b;
    });
    t.after(async () => {
      server?.kill('SIGTERM');
      await db.$disconnect();
      await fixture.dispose();
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(origin);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      if (server && server.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, `Servidor não iniciou: ${output.slice(-1500)}`);
    const suffix = crypto.randomUUID();
    const password = 'Teste-pulso-seguro-12345';
    class Client {
      cookie = '';
      async request(path: string, body?: unknown, customOrigin = origin) {
        const res = await fetch(`${origin}/api/${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: customOrigin,
            Cookie: this.cookie,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const used = res.headers.get('X-Pulso-D1-Queries');
        if (used) assert.ok(Number(used) <= 50, 'Consulta excedeu limite D1 gratuito');
        const cookie = res.headers.get('set-cookie');
        if (cookie) this.cookie = cookie.split(';')[0];
        return { status: res.status, data: await res.json() };
      }
    }
    const student = new Client(),
      student2 = new Client(),
      pro = new Client(),
      outsider = new Client(),
      admin = new Client(),
      anon = new Client();
    await t.test('Páginas públicas, proteção de painel e validação', async () => {
      assert.equal((await fetch(`${origin}/cadastro`)).status, 200);
      const res = await fetch(`${origin}/painel`, { redirect: 'manual' });
      assert.equal(res.status, 307);
      assert.equal((await anon.request('me')).status, 401);
      assert.equal((await anon.request('auth/register', { email: 'bad' })).status, 400);
      assert.equal(
        (
          await anon.request('auth/register', {
            email: `admin-public-${suffix}@example.test`,
            password,
            name: 'Intruso',
            role: 'ADMIN',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await anon.request(
            'auth/login',
            { email: 'x@example.test', password },
            'https://evil.test',
          )
        ).status,
        403,
      );
    });
    await t.test('Cadastro persistido, login, perfil privado e email duplicado', async () => {
      for (const [client, role, label] of [
        [student, 'STUDENT', 'Aluno'],
        [student2, 'STUDENT', 'Aluno Dois'],
        [pro, 'PROFESSIONAL', 'Treinadora'],
        [outsider, 'PROFESSIONAL', 'Outro profissional'],
      ] as const) {
        assert.equal(
          (
            await client.request('auth/register', {
              email: `${label.replaceAll(' ', '')}-${suffix}@example.test`,
              password,
              name: label,
              role,
            })
          ).status,
          200,
        );
        assert.match(client.cookie, /pulso_session=/);
      }
      const me = await student.request('me');
      assert.equal(me.data.profile.name, 'Aluno');
      assert.equal(me.data.passwordHash, undefined);
      assert.equal(
        (await fetch(`${origin}/painel`, { headers: { Cookie: student.cookie } })).status,
        200,
      );
      assert.equal(
        (
          await student.request('profile', {
            name: 'Aluno Atualizado',
            bio: 'Rotina ativa',
            specialty: 'Força',
            contact: '',
          })
        ).status,
        200,
      );
      assert.equal((await student.request('me')).data.profile.name, 'Aluno Atualizado');
      assert.equal(
        (
          await anon.request('auth/register', {
            email: me.data.email,
            password,
            name: 'Duplicado',
            role: 'STUDENT',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await anon.request('auth/login', {
            email: me.data.email,
            password: 'Senha-incorreta-12345',
          })
        ).status,
        401,
      );
      assert.equal(
        (await anon.request('auth/login', { email: me.data.email, password })).status,
        200,
      );
    });
    const studentId = (await student.request('me')).data.id;
    let credentialId = '',
      inviteToken = '',
      linkId = '';
    await t.test(
      'Habilitação pendente não autoriza convites; somente administrador revisa',
      async () => {
        assert.equal(
          (
            await student.request('credentials', {
              area: 'TRAINING',
              registration: 'CREF 123',
              region: 'SP',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await pro.request('credentials', {
              area: 'TRAINING',
              registration: 'CREF 123',
              region: 'SP',
            })
          ).status,
          200,
        );
        assert.equal((await pro.request('invitations', { area: 'TRAINING' })).status, 403);
        const panel = await pro.request('dashboard');
        credentialId = panel.data.credentials[0].id;
        assert.equal(
          (
            await pro.request('admin/review', {
              id: credentialId,
              status: 'VERIFIED',
              confirmed: true,
            })
          ).status,
          403,
        );
        const adminEmail = `admin-${suffix}@example.test`;
        const adminRecord = await db.user.create({
          data: {
            email: adminEmail,
            passwordHash: await hashPassword(password),
            role: 'ADMIN',
            profile: { create: { name: 'Operador teste' } },
          },
        });
        const testSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        await db.user.update({
          where: { id: adminRecord.id },
          data: { mfaEnabled: true, ...(await encryptMfa(testSecret, password, adminRecord.id)) },
        });
        assert.equal(
          (
            await admin.request('auth/login', {
              email: adminEmail,
              password,
              code: await totp(testSecret, Math.floor(Date.now() / 30000)),
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.request('admin/review', {
              id: credentialId,
              status: 'VERIFIED',
              confirmed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.request('admin/review', {
              id: credentialId,
              status: 'VERIFIED',
              confirmed: true,
            })
          ).status,
          409,
        );
        assert.equal((await pro.request('invitations', { area: 'NUTRITION' })).status, 403);
        const invite = await pro.request('invitations', { area: 'TRAINING' });
        assert.equal(invite.status, 200);
        inviteToken = invite.data.token;
        assert.match(inviteToken, /^[a-f0-9]{64}$/);
        assert.equal(
          (await db.invitation.findFirst({ where: { professionalId: panel.data.user.id } }))
            ?.tokenHash === inviteToken,
          false,
        );
      },
    );
    await t.test(
      'Aceite exige consentimento específico; vínculo e auditoria persistem',
      async () => {
        assert.equal((await student.request(`invitations/${inviteToken}`)).data.area, 'TRAINING');
        assert.equal(
          (
            await student.request('links/accept', {
              token: inviteToken,
              scope: 'NUTRITION_HISTORY',
              consent: true,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await student.request('links/accept', {
              token: inviteToken,
              scope: 'TRAINING_HISTORY',
              consent: false,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await student.request('links/accept', {
              token: inviteToken,
              scope: 'TRAINING_HISTORY',
              consent: true,
            })
          ).status,
          200,
        );
        const panel = await student.request('dashboard');
        linkId = panel.data.links[0].id;
        assert.equal(panel.data.links[0].consents[0].scope, 'TRAINING_HISTORY');
        assert.equal(
          (
            await student2.request('links/accept', {
              token: inviteToken,
              scope: 'TRAINING_HISTORY',
              consent: true,
            })
          ).status,
          404,
        );
        assert.ok((await db.auditLog.count({ where: { resourceId: linkId } })) > 0);
      },
    );
    await t.test(
      'Isolamento: área errada, profissional sem vínculo e administrador sem acesso',
      async () => {
        assert.equal((await pro.request(`students/${studentId}?area=TRAINING`)).status, 200);
        assert.equal((await pro.request(`students/${studentId}?area=NUTRITION`)).status, 403);
        assert.equal((await outsider.request(`students/${studentId}?area=TRAINING`)).status, 403);
        assert.equal((await admin.request(`students/${studentId}?area=TRAINING`)).status, 403);
        assert.equal((await student2.request('links/revoke', { id: linkId })).status, 404);
      },
    );
    await t.test('Revogação remove acesso e preserva vínculo e auditoria', async () => {
      assert.equal((await student.request('links/revoke', { id: linkId })).status, 200);
      assert.equal((await pro.request(`students/${studentId}?area=TRAINING`)).status, 403);
      assert.equal(
        (await db.professionalStudentLink.findUnique({ where: { id: linkId } }))?.status,
        'ENDED',
      );
      assert.ok((await db.accessConsent.findFirst({ where: { linkId } }))?.revokedAt);
      assert.ok((await db.auditLog.count({ where: { resourceId: linkId } })) >= 2);
    });
    await t.test(
      'Convite expirado e consumo concorrente não criam vínculos duplicados',
      async () => {
        const expired = await pro.request('invitations', { area: 'TRAINING' });
        const { digest } = await import('../src/lib/crypto');
        await db.invitation.update({
          where: { tokenHash: await digest(expired.data.token) },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal(
          (
            await student2.request('links/accept', {
              token: expired.data.token,
              scope: 'TRAINING_HISTORY',
              consent: true,
            })
          ).status,
          404,
        );
        const invite = await pro.request('invitations', { area: 'TRAINING' });
        const results = await Promise.all([
          student.request('links/accept', {
            token: invite.data.token,
            scope: 'TRAINING_HISTORY',
            consent: true,
          }),
          student2.request('links/accept', {
            token: invite.data.token,
            scope: 'TRAINING_HISTORY',
            consent: true,
          }),
        ]);
        assert.equal(results.filter((r) => r.status === 200).length, 1);
        assert.ok(results.some((r) => r.status === 404 || r.status === 409));
      },
    );
    await t.test('Importação real é idempotente e mantém procedência/licenças', async () => {
      // Bulk upgrades use the operator path; HTTP revalidation keeps its free-D1 query budget.
      const { importExercises } = await import('../src/lib/exercise-import');
      const bulk = await importExercises(db);
      assert.equal(bulk.total, exerciseSnapshot.exercises.length);
      assert.equal(bulk.imported + bulk.updated + bulk.unchanged, bulk.total);

      assert.equal((await pro.request('admin/import-exercises', { confirmed: true })).status, 403);
      const first = await admin.request('admin/import-exercises', { confirmed: true });
      assert.equal(first.status, 200);
      assert.equal(first.data.result.total, exerciseSnapshot.exercises.length);
      const second = await admin.request('admin/import-exercises', { confirmed: true });
      assert.equal(second.status, 200);
      assert.equal(second.data.result.imported, 0);
      assert.equal(second.data.result.updated, 0);
      assert.equal(second.data.result.unchanged, exerciseSnapshot.exercises.length);
      assert.equal(
        await db.exercise.count({ where: { source: 'WGER' } }),
        exerciseSnapshot.exercises.length,
      );
    });
    let globalId = '';
    await t.test('Catálogo protegido, busca com acentos/aliases, filtros e paginação', async () => {
      assert.equal((await new Client().request('exercises')).status, 401);
      const list = await student.request('exercises');
      assert.equal(list.status, 200);
      assert.ok(list.data.total > 0);
      assert.ok(list.data.items.length <= 20);
      globalId = list.data.items[0].id;
      const item = (await student.request(`exercises/${globalId}`)).data;
      assert.ok(item.provenance.base.license);
      assert.ok(item.provenance.translations.length);
      assert.equal(item.ownerId, null);
      const needle = item.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const search = await student.request(`exercises?q=${encodeURIComponent(needle)}`);
      assert.ok(search.data.items.some((e: { id: string }) => e.id === globalId));
      if (item.aliases.length)
        assert.ok(
          (await student.request(`exercises?q=${encodeURIComponent(item.aliases[0])}`)).data.total >
            0,
        );
      const equipment = await db.exerciseEquipment.findFirst();
      assert.ok(equipment);
      const filtered = await student.request(`exercises?equipment=${equipment.equipmentId}`);
      assert.ok(
        filtered.data.items.every((e: { equipment: { equipmentId: string }[] }) =>
          e.equipment.some((v) => v.equipmentId === equipment.equipmentId),
        ),
      );
      const muscle = await db.exerciseMuscle.findFirst();
      assert.ok(muscle);
      const muscles = await student.request(`exercises?muscle=${muscle.muscleId}`);
      assert.ok(muscles.data.total > 0);
      assert.ok(
        muscles.data.items.every((e: { muscles: { muscleId: string }[] }) =>
          e.muscles.some((v) => v.muscleId === muscle.muscleId),
        ),
      );
      assert.equal((await student.request('exercises?page=-1')).status, 400);
    });
    await t.test(
      'Favoritos são pessoais/idempotentes; desativação global persiste na sincronização',
      async () => {
        assert.equal(
          (await student.request(`exercises/${globalId}/favorite`, { favorite: true })).status,
          200,
        );
        assert.equal(
          (await student.request(`exercises/${globalId}/favorite`, { favorite: true })).status,
          200,
        );
        assert.equal((await student.request('exercises?favorite=true')).data.total, 1);
        assert.equal((await pro.request('exercises?favorite=true')).data.total, 0);
        assert.equal(
          (await pro.request(`exercises/${globalId}/status`, { active: false })).status,
          403,
        );
        assert.equal(
          (await admin.request(`exercises/${globalId}/status`, { active: false })).status,
          200,
        );
        assert.equal((await student.request(`exercises/${globalId}`)).status, 404);
        assert.equal((await student.request('exercises?favorite=true')).data.total, 0);
        assert.equal(
          (await admin.request('admin/import-exercises', { confirmed: true })).status,
          200,
        );
        assert.equal((await db.exercise.findUnique({ where: { id: globalId } }))?.active, false);
        assert.equal(
          (await admin.request(`exercises/${globalId}/status`, { active: true })).status,
          200,
        );
        assert.equal((await student.request('exercises?favorite=true')).data.total, 1);
      },
    );
    await t.test('Exercícios personalizados têm validação, autoria e isolamento', async () => {
      const data = {
        name: `Exercício privado ${suffix}`,
        aliases: [`Alternativo ${suffix}`],
        description: 'Descrição do profissional de teste',
        instructions: 'Orientação de teste',
        category: 'STRENGTH',
        muscleIds: ['1'],
        secondaryMuscleIds: [],
        equipmentIds: ['3'],
      };
      assert.equal((await student.request('exercises/create', data)).status, 403);
      assert.equal((await outsider.request('exercises/create', data)).status, 403);
      assert.equal(
        (await pro.request('exercises/create', { ...data, source: 'WGER' })).status,
        400,
      );
      assert.equal(
        (await pro.request('exercises/create', { ...data, muscleIds: ['inexistente'] })).status,
        400,
      );
      await assert.rejects(
        db.exercise.create({
          data: {
            source: 'CUSTOM',
            name: 'Registro sem proprietário',
            searchText: 'registro',
            provenance: {},
          },
        }),
      );
      const created = await pro.request('exercises/create', data);
      assert.equal(created.status, 200);
      const id = created.data.id;
      assert.equal((await pro.request(`exercises/${id}`)).data.source, 'CUSTOM');
      assert.equal((await student.request(`exercises/${id}`)).status, 404);
      assert.equal((await outsider.request(`exercises/${id}`)).status, 404);
      assert.equal((await admin.request(`exercises/${id}`)).status, 404);
      assert.equal((await pro.request(`exercises/${globalId}/update`, data)).status, 403);
      assert.equal(
        (await pro.request(`exercises/${id}/update`, { ...data, name: `Revisado ${suffix}` }))
          .status,
        200,
      );
      assert.equal((await pro.request(`exercises/${id}`)).data.name, `Revisado ${suffix}`);
      assert.equal((await pro.request(`exercises/${id}/status`, { active: false })).status, 200);
      assert.equal((await pro.request(`exercises?q=${suffix}`)).data.total, 0);
      assert.equal((await pro.request(`exercises?q=${suffix}&includeInactive=true`)).data.total, 1);
      assert.equal(
        await db.exercise.count({ where: { source: 'WGER' } }),
        exerciseSnapshot.exercises.length,
      );
    });
    let trainingVersion = '',
      trainingSession = '',
      nutritionVersion = '',
      nutritionMeal = '',
      nutFood = '',
      mealLogId = '';
    const nutritionist = new Client();
    await t.test(
      'Prescrições reais: vínculo, publicação, autoria e imutabilidade no banco',
      async () => {
        if ((await pro.request(`students/${studentId}?area=TRAINING`)).status !== 200) {
          const invite = await pro.request('invitations', { area: 'TRAINING' });
          assert.equal(
            (
              await student.request('links/accept', {
                token: invite.data.token,
                scope: 'TRAINING_HISTORY',
                consent: true,
              })
            ).status,
            200,
          );
        }
        assert.equal(
          (await outsider.request('workouts/create', { name: 'Sem habilitação' })).status,
          403,
        );
        const created = await pro.request('workouts/create', {
          name: `Programa ${suffix}`,
          template: true,
        });
        assert.equal(created.status, 200);
        trainingVersion = created.data.versionId;
        const payload = {
          objective: 'Objetivo de teste',
          notes: 'Orientação de teste',
          days: [
            {
              name: 'Treino A',
              notes: 'Orientação',
              suggestedDays: [1, 3],
              exercises: [
                {
                  exerciseId: globalId,
                  notes: 'Observação',
                  groupKey: 'Grupo 1',
                  sets: [
                    {
                      repsMin: 10,
                      repsMax: 12,
                      targetKg: 25,
                      restSeconds: 45,
                      kind: 'WORKING',
                      rpe: 8,
                      rir: 2,
                      unilateral: false,
                    },
                  ],
                },
              ],
            },
          ],
        };
        assert.equal(
          (await pro.request(`workouts/${trainingVersion}/save`, { revision: 0, data: payload }))
            .status,
          200,
        );
        assert.equal(
          (await pro.request(`workouts/${trainingVersion}/save`, { revision: 0, data: payload }))
            .status,
          409,
        );
        assert.equal((await student.request(`workouts/version/${trainingVersion}`)).status, 404);
        assert.equal(
          (
            await pro.request(`workouts/${trainingVersion}/publish`, {
              revision: 1,
              studentIds: [studentId],
            })
          ).status,
          200,
        );
        assert.equal((await student.request(`workouts/version/${trainingVersion}`)).status, 200);
        assert.equal((await outsider.request(`workouts/version/${trainingVersion}`)).status, 404);
        assert.equal(
          (await pro.request(`workouts/${trainingVersion}/save`, { revision: 1, data: payload }))
            .status,
          409,
        );
        assert.equal(
          (await student.request(`workouts/${trainingVersion}/delete`, { confirmed: true })).status,
          404,
        );
        assert.equal(
          (await pro.request(`workouts/${trainingVersion}/delete`, { confirmed: false })).status,
          400,
        );
        const published = (await student.request(`workouts/version/${trainingVersion}`)).data;
        await assert.rejects(
          db.workoutPrescriptionSet.update({
            where: { id: published.days[0].exercises[0].sets[0].id },
            data: { targetKg: 99 },
          }),
        );
        await assert.rejects(
          db.workoutDay.create({
            data: { versionId: trainingVersion, name: 'Invasão', position: 99 },
          }),
        );
        const copy = await pro.request(`workouts/${trainingVersion}/duplicate`, {});
        assert.equal(copy.status, 200);
        assert.notEqual(copy.data.versionId, trainingVersion);
      },
    );
    await t.test('Sessão, séries e encerramento são persistidos sem duplicidades', async () => {
      const v = (await student.request(`workouts/version/${trainingVersion}`)).data;
      const day = v.days[0];
      const prescribedSet = day.exercises[0].sets[0];
      trainingSession = crypto.randomUUID();
      assert.equal(
        (await pro.request('sessions/start', { id: crypto.randomUUID(), dayId: day.id })).status,
        403,
      );
      const start = await student.request('sessions/start', { id: trainingSession, dayId: day.id });
      assert.equal(start.status, 200);
      assert.equal(start.data.id, trainingSession);
      assert.equal(
        (await student.request('sessions/start', { id: trainingSession, dayId: day.id })).data.id,
        trainingSession,
      );
      const record = {
        revision: 0,
        prescriptionSetId: prescribedSet.id,
        actualReps: 10,
        actualKg: 25,
        rpe: 8,
        rir: 2,
        completed: true,
      };
      assert.equal(
        (await student2.request(`sessions/${trainingSession}/sets`, record)).status,
        403,
      );
      assert.equal((await student.request(`sessions/${trainingSession}/sets`, record)).status, 200);
      assert.equal((await student.request(`sessions/${trainingSession}/sets`, record)).status, 409);
      const logged = (await student.request(`sessions/${trainingSession}`)).data;
      assert.equal(logged.exercises[0].sets.length, 1);
      assert.equal(logged.exercises[0].sets[0].actualKg, '25');
      const finish = {
        revision: 1,
        status: 'COMPLETED',
        effort: 8,
        difficulty: 6,
        feedback: 'Treino concluído no teste',
        discomfort: '',
        rating: 4,
      };
      assert.equal(
        (await student.request(`sessions/${trainingSession}/finish`, finish)).status,
        200,
      );
      assert.equal(
        (await student.request(`sessions/${trainingSession}/finish`, finish)).status,
        200,
      );
      assert.equal(
        (
          await student.request(`sessions/${trainingSession}/sets`, {
            ...record,
            revision: 2,
            actualKg: 99,
          })
        ).status,
        409,
      );
      await assert.rejects(
        db.workoutSessionSet.update({
          where: { id: logged.exercises[0].sets[0].id },
          data: { actualKg: 99 },
        }),
      );
      assert.equal(await db.activityOutbox.count({ where: { sessionId: trainingSession } }), 1);
      const progress = await student.request('progress');
      assert.equal(progress.status, 200);
      assert.equal(progress.data[0].exercises[0].volume, 250);
      assert.equal((await outsider.request(`progress?studentId=${studentId}`)).status, 403);
      assert.equal((await admin.request(`sessions/${trainingSession}`)).status, 403);
      assert.equal(
        (
          await pro.request(`sessions/${trainingSession}/reply`, {
            text: 'Orientação profissional de teste',
          })
        ).status,
        200,
      );
    });
    await t.test(
      'Revisões preservam sessões antigas e exibem a última execução válida',
      async () => {
        const revised = await pro.request(`workouts/${trainingVersion}/revise`, {});
        assert.equal(revised.status, 200);
        const v = (await pro.request(`workouts/version/${revised.data.versionId}`)).data;
        assert.equal(v.number, 2);
        assert.equal(
          (await pro.request(`workouts/${v.id}/publish`, { revision: 0, studentIds: [studentId] }))
            .status,
          200,
        );
        const started = await student.request('sessions/start', {
          id: crypto.randomUUID(),
          dayId: v.days[0].id,
        });
        assert.equal(started.status, 200);
        const current = await student.request(`sessions/${started.data.id}`);
        assert.equal(current.data.previous[0].sets[0].actualKg, '25');
        assert.ok(current.data.previous[0].session.endedAt);
        assert.equal(
          (
            await student.request(`sessions/${started.data.id}/finish`, {
              revision: 0,
              status: 'INTERRUPTED',
            })
          ).status,
          200,
        );
        assert.equal((await student.request(`sessions/${trainingSession}`)).data.version.number, 1);
        const own = await student.request('workouts/create', { name: 'Treino independente' });
        assert.equal(own.status, 200);
        assert.equal((await pro.request(`workouts/version/${own.data.versionId}`)).status, 404);
      },
    );
    await t.test('Nutrição exige habilitação e consentimento independentes', async () => {
      assert.equal((await pro.request('nutrition/create', { name: 'Plano indevido' })).status, 403);
      assert.equal(
        (
          await nutritionist.request('auth/register', {
            email: `nutri-${suffix}@example.test`,
            password,
            name: 'Nutricionista teste',
            role: 'PROFESSIONAL',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await nutritionist.request('credentials', {
            area: 'NUTRITION',
            registration: 'CRN Teste',
            region: 'SP',
          })
        ).status,
        200,
      );
      const credential = (await nutritionist.request('dashboard')).data.credentials[0];
      assert.equal(
        (
          await admin.request('admin/review', {
            id: credential.id,
            status: 'VERIFIED',
            confirmed: true,
          })
        ).status,
        200,
      );
      const invitation = await nutritionist.request('invitations', { area: 'NUTRITION' });
      assert.equal(
        (
          await student.request('links/accept', {
            token: invitation.data.token,
            scope: 'NUTRITION_HISTORY',
            consent: true,
          })
        ).status,
        200,
      );
      assert.equal((await nutritionist.request(`progress?studentId=${studentId}`)).status, 403);
      const food = await nutritionist.request('foods/create', {
        name: `Alimento de teste ${suffix}`,
        referenceUnit: 'g',
        nutrients: {
          energy_kcal: '110.1234',
          protein_g: '5.2',
          carbohydrate_g: '15.4',
          fat_g: '1.2',
          fiber_g: null,
        },
        provenance: 'Rótulo sintético exclusivo do banco de testes',
        measures: [
          {
            name: 'Porção de teste',
            quantity: '50',
            unit: 'g',
            provenance: 'Quantidade informada no teste',
          },
        ],
      });
      assert.equal(food.status, 200);
      nutFood = food.data.id;
      const measured = await nutritionist.request('foods/recipe', {
        name: 'Porção decimal de teste',
        yieldQuantity: '100',
        yieldUnit: 'g',
        ingredients: [
          {
            foodId: nutFood,
            quantity: '1.5',
            unit: 'g',
            measureId:
              food.data.measures?.[0]?.id ??
              (await nutritionist.request(`foods/${nutFood}`)).data.measures[0].id,
          },
        ],
        provenance: 'Medida específica de teste',
      });
      assert.equal(measured.status, 200);
      assert.equal(
        (await nutritionist.request(`foods/${measured.data.id}`)).data.nutrients.energy_kcal,
        '82.59255',
      );

      assert.equal((await student.request(`foods/${nutFood}`)).status, 404);
      assert.equal(
        (
          await pro.request('foods/create', {
            name: 'Alimento indevido',
            referenceUnit: 'g',
            nutrients: {},
            provenance: 'Teste',
          })
        ).status,
        403,
      );
      const recipe = await nutritionist.request('foods/recipe', {
        name: 'Receita de teste',
        yieldQuantity: '100',
        yieldUnit: 'g',
        ingredients: [{ foodId: nutFood, quantity: '50', unit: 'g' }],
        provenance: 'Ingredientes e rendimento de teste',
      });
      assert.equal(recipe.status, 200);
      assert.equal(
        (await nutritionist.request(`foods/${recipe.data.id}`)).data.nutrients.energy_kcal,
        '55.0617',
      );
      assert.equal(
        (
          await nutritionist.request('foods/recipe', {
            name: 'Conversão indevida',
            yieldQuantity: '100',
            yieldUnit: 'g',
            ingredients: [{ foodId: nutFood, quantity: '50', unit: 'ml' }],
            provenance: 'Teste',
          })
        ).status,
        400,
      );
    });
    await t.test(
      'Planos alimentares versionados calculam quantidades sem alterar registros antigos',
      async () => {
        const created = await nutritionist.request('nutrition/create', { name: 'Plano de teste' });
        assert.equal(created.status, 200);
        nutritionVersion = created.data.versionId;
        const plan = {
          objective: 'Objetivo definido pelo profissional de teste',
          notes: 'Orientação de teste',
          meals: [
            {
              name: 'Almoço',
              time: '12:00',
              notes: 'Orientação',
              items: [
                {
                  foodId: nutFood,
                  quantity: '50',
                  unit: 'g',
                  substitutions: [{ foodId: nutFood, quantity: '100', unit: 'g' }],
                },
              ],
            },
          ],
        };
        assert.equal(
          (
            await nutritionist.request(`nutrition/${nutritionVersion}/save`, {
              revision: 0,
              data: plan,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await nutritionist.request(`nutrition/${nutritionVersion}/publish`, {
              revision: 1,
              studentIds: [studentId],
            })
          ).status,
          200,
        );
        const v = (await student.request(`nutrition/version/${nutritionVersion}`)).data;
        nutritionMeal = v.meals[0].id;
        assert.equal(v.totals.energy_kcal, '55.0617');
        assert.equal(v.totals.fiber_g, null);
        assert.equal((await outsider.request(`nutrition/version/${nutritionVersion}`)).status, 404);
        await assert.rejects(
          db.nutritionMealItem.update({
            where: { id: v.meals[0].items[0].id },
            data: { quantity: 999 },
          }),
        );
        assert.equal(
          (
            await nutritionist.request(`nutrition/${nutritionVersion}/save`, {
              revision: 1,
              data: plan,
            })
          ).status,
          409,
        );
        assert.equal(
          (await nutritionist.request(`nutrition/${nutritionVersion}/revise`, {})).status,
          200,
        );
        assert.equal(
          (
            await nutritionist.request(`foods/${nutFood}/update`, {
              name: 'Rótulo revisado de teste',
              referenceUnit: 'g',
              nutrients: { energy_kcal: '999', protein_g: '50', carbohydrate_g: '20', fat_g: '10' },
              provenance: 'Revisão posterior de teste',
            })
          ).status,
          200,
        );
        assert.equal(
          (await student.request(`nutrition/version/${nutritionVersion}`)).data.totals.energy_kcal,
          '55.0617',
        );
      },
    );
    await t.test(
      'Diário preserva a prescrição, evita duplicidades e isola as áreas profissionais',
      async () => {
        mealLogId = crypto.randomUUID();
        const entry = {
          id: mealLogId,
          revision: 0,
          date: '2026-10-14',
          mealName: 'Almoço real de teste',
          prescribedMealId: nutritionMeal,
          consumed: true,
          notes: 'Quantidade consumida',
          items: [{ foodId: nutFood, quantity: '50', unit: 'g' }],
        };
        assert.equal((await student.request('meals/save', entry)).status, 200);
        assert.equal((await student.request('meals/save', entry)).status, 409);
        const daily = await student.request('meals?date=2026-10-14');
        assert.equal(daily.data.logs.length, 1);
        assert.equal(daily.data.totals.energy_kcal, '55.0617');
        assert.equal(daily.data.totals.fiber_g, null);
        assert.equal(
          (
            await student.request('meals/save', {
              ...entry,
              revision: 1,
              items: [{ foodId: nutFood, quantity: '100', unit: 'g' }],
            })
          ).status,
          200,
        );
        assert.equal(
          (await student.request('meals?date=2026-10-14')).data.totals.energy_kcal,
          '110.1234',
        );
        assert.equal(
          (await student.request(`nutrition/version/${nutritionVersion}`)).data.meals[0].items[0]
            .quantity,
          '50',
        );
        assert.equal(
          (await pro.request(`meals?date=2026-10-14&studentId=${studentId}`)).status,
          403,
        );
        assert.equal(
          (await nutritionist.request(`meals?date=2026-10-14&studentId=${studentId}`)).status,
          200,
        );
        assert.equal(
          (await pro.request(`meals/${mealLogId}/reply`, { text: 'Comentário indevido' })).status,
          403,
        );
        assert.equal(
          (
            await nutritionist.request(`meals/${mealLogId}/reply`, {
              text: 'Feedback nutricional de teste',
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await student.request('meals/save', {
              ...entry,
              id: crypto.randomUUID(),
              date: '2026-99-99',
            })
          ).status,
          400,
        );
        const panel = (await student.request('dashboard')).data;
        const link = panel.links.find(
          (l: { area: string; status: string }) => l.area === 'NUTRITION' && l.status === 'ACTIVE',
        );
        assert.equal((await student.request('links/revoke', { id: link.id })).status, 200);
        assert.equal(
          (await nutritionist.request(`meals?date=2026-10-14&studentId=${studentId}`)).status,
          403,
        );
        assert.equal((await student.request('meals?date=2026-10-14')).status, 200);
      },
    );
    await t.test(
      'Foto privada, exportação própria e alteração de senha protegem a conta',
      async () => {
        const photo = await student.request('account/photo', {
          mimeType: 'image/png',
          base64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGv0AAAAASUVORK5CYII=',
        });
        assert.equal(photo.status, 200);
        const owned = await fetch(`${origin}/api/media/${photo.data.photoId}`, {
          headers: { Cookie: student.cookie },
        });
        assert.equal(owned.status, 200);
        assert.equal(owned.headers.get('content-type'), 'image/png');
        assert.equal((await outsider.request(`media/${photo.data.photoId}`)).status, 404);
        assert.equal((await admin.request(`media/${photo.data.photoId}`)).status, 404);
        assert.equal(
          (
            await student.request('account/photo', {
              mimeType: 'image/png',
              base64: Buffer.from('<script>bad</script>').toString('base64'),
            })
          ).status,
          400,
        );
        const exported = await student.request('account/export');
        assert.equal(exported.status, 200);
        assert.equal(exported.data.user.id, studentId);
        assert.ok(exported.data.workoutSessions.length);
        assert.ok(exported.data.mealLogs.length);
        assert.equal(JSON.stringify(exported.data).includes('passwordHash'), false);
        assert.equal(JSON.stringify(exported.data).includes('tokenHash'), false);
        const old = new Client();
        old.cookie = student.cookie;
        assert.equal(
          (
            await student.request('account/password', {
              currentPassword: password,
              newPassword: 'Nova-senha-testada-12345',
            })
          ).status,
          200,
        );
        assert.equal((await old.request('me')).status, 401);
        assert.equal((await student.request('me')).status, 200);
      },
    );
    await t.test('PWA disponibiliza somente shell público e rotas autenticadas', async () => {
      assert.equal((await fetch(`${origin}/manifest.webmanifest`)).status, 200);
      assert.equal((await fetch(`${origin}/sw.js`)).status, 200);
      for (const path of ['treinos', 'alimentacao', 'evolucao', 'conta'])
        assert.equal(
          (await fetch(`${origin}/${path}`, { headers: { Cookie: student.cookie } })).status,
          200,
        );
      const bundle = await (await fetch(`${origin}/sw.js`)).text();
      assert.ok(bundle.includes("url.pathname.startsWith('/api/')"));
    });

    await t.test(
      'Evolução conserva as 1.000 sessões mais recentes em ordem cronológica',
      async () => {
        const viewer = (await student2.request('me')).data.id;
        const original = await db.workoutSession.findUniqueOrThrow({
          where: { id: trainingSession },
        });
        const records = Array.from({ length: 1001 }, (_, i) => ({
          id: crypto.randomUUID(),
          studentId: viewer,
          versionId: original.versionId,
          dayId: original.dayId,
          status: 'COMPLETED' as const,
          startedAt: new Date(Date.UTC(2020, 0, 1 + i)),
          endedAt: new Date(Date.UTC(2020, 0, 1 + i, 1)),
        }));
        // Dedicated test-only historical fixtures exercise the query boundary, not real activity.
        await db.workoutSession.createMany({ data: records });
        const progress = await student2.request('progress');
        assert.equal(progress.status, 200);
        assert.equal(progress.data.length, 1000);
        assert.equal(progress.data[0].id, records[1].id);
        assert.equal(progress.data.at(-1).id, records[1000].id);
        assert.equal(
          progress.data.some((s: { id: string }) => s.id === records[0].id),
          false,
        );
      },
    );

    await t.test(
      'MFA: configuração, login protegido, recuperação de uso único e rotação de senha',
      async () => {
        const me = await student2.request('me');
        const setup = await student2.request('account/mfa/setup', { currentPassword: password });
        assert.equal(setup.status, 200);
        const code = await totp(setup.data.secret, Math.floor(Date.now() / 30000));
        const confirmed = await student2.request('account/mfa/confirm', {
          currentPassword: password,
          code,
        });
        assert.equal(confirmed.status, 200);
        assert.equal(confirmed.data.recoveryCodes.length, 8);
        assert.equal(
          (await anon.request('auth/login', { email: me.data.email, password })).status,
          401,
        );
        assert.equal(
          (await anon.request('auth/login', { email: me.data.email, password, code })).status,
          401,
          'Código da confirmação não pode ser reutilizado no login',
        );
        const recovery = confirmed.data.recoveryCodes[0];
        assert.equal(
          (await anon.request('auth/login', { email: me.data.email, password, code: recovery }))
            .status,
          200,
        );
        assert.equal(
          (
            await new Client().request('auth/login', {
              email: me.data.email,
              password,
              code: recovery,
            })
          ).status,
          401,
        );
        const newPassword = 'Nova-senha-mfa-testada-12345';
        assert.equal(
          (
            await student2.request('account/password', {
              currentPassword: password,
              newPassword,
              code,
            })
          ).status,
          200,
        );
        assert.equal((await anon.request('me')).status, 401);
        assert.equal(
          (await student2.request('account/mfa/disable', { currentPassword: newPassword, code }))
            .status,
          200,
        );
        assert.equal(
          (await anon.request('auth/login', { email: me.data.email, password: newPassword }))
            .status,
          200,
        );
        const stored = await db.user.findUniqueOrThrow({ where: { id: me.data.id } });
        assert.equal(stored.mfaCipher, null);
        assert.deepEqual(stored.mfaRecoveryHashes, []);
      },
    );

    await t.test(
      'Administração exige MFA e permissões; suspensão e encerramento revogam acesso',
      async () => {
        const testAdmin = await db.user.create({
          data: {
            email: `limited-admin-${suffix}@example.test`,
            passwordHash: await hashPassword(password),
            role: 'ADMIN',
            profile: { create: { name: 'Administrador restrito de teste' } },
          },
        });
        const limited = new Client();
        assert.equal(
          (await limited.request('auth/login', { email: testAdmin.email, password })).status,
          200,
        );
        assert.equal(
          (await limited.request('admin/users')).status,
          403,
          'Admin sem MFA não administra',
        );
        const setup = await limited.request('account/mfa/setup', { currentPassword: password });
        assert.equal(
          (
            await limited.request('account/mfa/confirm', {
              currentPassword: password,
              code: await totp(setup.data.secret, Math.floor(Date.now() / 30000)),
            })
          ).status,
          200,
        );
        await db.user.update({
          where: { id: testAdmin.id },
          data: { adminPermissions: ['MANAGE_USERS'] },
        });
        assert.equal((await limited.request('admin/users')).status, 200);
        assert.equal(
          (await limited.request('admin/import-exercises', { confirmed: true })).status,
          403,
        );
        assert.equal(
          (
            await limited.request(`admin/users/${testAdmin.id}/status`, {
              active: false,
              confirmed: true,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await limited.request(`admin/users/${testAdmin.id}/permissions`, {
              permissions: [],
              confirmed: true,
            })
          ).status,
          400,
        );
        const victim = new Client();
        assert.equal(
          (
            await victim.request('auth/register', {
              name: 'Conta encerrável de teste',
              role: 'STUDENT',
              email: `closure-${suffix}@example.test`,
              password,
            })
          ).status,
          200,
        );
        const victimId = (await victim.request('me')).data.id;
        const stale = new Client();
        stale.cookie = victim.cookie;
        assert.equal(
          (
            await limited.request(`admin/users/${victimId}/status`, {
              active: false,
              confirmed: true,
            })
          ).status,
          200,
        );
        assert.equal((await stale.request('me')).status, 401);
        assert.equal(
          (
            await victim.request('auth/login', {
              email: `closure-${suffix}@example.test`,
              password,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await limited.request(`admin/users/${victimId}/status`, {
              active: true,
              confirmed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await victim.request('auth/login', {
              email: `closure-${suffix}@example.test`,
              password,
            })
          ).status,
          200,
        );
        assert.equal((await victim.request('account/close', { confirmed: true })).status, 200);
        assert.equal((await victim.request('me')).status, 401);
        assert.equal(
          (await db.deletionRequest.findFirstOrThrow({ where: { userId: victimId } })).status,
          'PENDING_RETENTION_REVIEW',
        );
        assert.ok((await db.user.findUniqueOrThrow({ where: { id: victimId } })).disabledAt);
      },
    );

    await t.test('Limite persistente bloqueia excesso de tentativas de autenticação', async () => {
      let limited = false;
      for (let i = 0; i < 35; i++) {
        const response = await anon.request('auth/login', { invalid: true });
        assert.ok(response.status === 400 || response.status === 429);
        if (response.status === 429) limited = true;
      }
      assert.equal(limited, true);
    });
    await t.test('Logout invalida token no servidor', async () => {
      const oldCookie = student.cookie;
      assert.equal((await student.request('auth/logout', {})).status, 200);
      student.cookie = oldCookie;
      assert.equal((await student.request('me')).status, 401);
    });
  },
);
