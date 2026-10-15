import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const databaseUrl = process.env.TEST_DB_PATH;
assert.equal(
  basename(databaseUrl ?? 'invalid'),
  'pulso_fit_test.sqlite',
  'Use o banco dedicado de testes.',
);
const origin = process.env.TEST_BROWSER_URL ?? 'http://localhost:3102';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'Navegador só pode criar fixtures em servidores locais.',
);
const server = process.env.TEST_BROWSER_URL
  ? undefined
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3102'], {
      env: { ...process.env, PULSO_DB_PATH: databaseUrl, APP_URL: origin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
let logs = '';
server?.stdout.on('data', (b) => (logs += b));
server?.stderr.on('data', (b) => (logs += b));
let browser, page;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, logs.slice(-1000));
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    chromiumSandbox: false,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  page = await context.newPage();
  page.on('response', async (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/'))
      console.error(
        'HTTP',
        r.status(),
        new URL(r.url()).pathname,
        (await r.json().catch(() => ({}))).error ?? '',
      );
  });
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const tag = crypto.randomUUID();
  await page.goto(origin + '/cadastro');
  await page.getByLabel('Seu nome', { exact: true }).fill('Aluno browser');
  await page.getByLabel('Email', { exact: true }).fill(`browser-${tag}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill('Browser-teste-seguro-123');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.waitForURL('**/painel');
  await page.getByRole('heading', { name: 'Sua rotina de hoje', exact: true }).waitFor();
  await page.goto(origin + '/exercicios');
  await page.getByLabel('Nome ou nome alternativo', { exact: true }).fill('Rosca Zottman');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('heading', { name: 'Rosca Zottman', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ver detalhes', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Instruções em português', exact: true }).waitFor();
  await page.getByText('Consultar conteúdo original', { exact: true }).click();
  await page.getByRole('heading', { name: 'Zottman curl', exact: true }).waitFor();
  assert.equal(await page.getByRole('option', { name: 'Bíceps braquial', exact: true }).count(), 1);
  await page.goto(origin + '/painel');
  await page.getByRole('heading', { name: 'Sua rotina de hoje', exact: true }).waitFor();

  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Planos de treino', exact: true })
    .click();
  await page.waitForURL('**/treinos#programas');
  await page.getByLabel('Nome do programa', { exact: true }).fill('Programa browser ' + tag);
  await page.getByRole('button', { name: 'Criar programa', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar ficha', exact: true }).click();
  await page.route(
    '**/api/exercises?picker=true*',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html>Serviço temporariamente indisponível</html>',
      }),
    { times: 1 },
  );
  await page.getByLabel('Buscar exercício', { exact: true }).fill('Zottman curl');
  await page.getByText(/O servidor não conseguiu responder agora/).waitFor();
  assert.equal(await page.getByText(/Unexpected token/).count(), 0);
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar Rosca Zottman', exact: true }).click();
  assert.equal(await page.locator('.compact-set').count(), 2);
  await page
    .locator('.exercise-row')
    .first()
    .screenshot({ path: 'test-results/mobile-low-volume-preset.png' });
  assert.deepEqual(
    await page
      .getByLabel('Repetições mín.', { exact: true })
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
    ['6', '6'],
  );
  assert.deepEqual(
    await page
      .getByLabel('Repetições máx.', { exact: true })
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
    ['10', '10'],
  );
  assert.deepEqual(
    await page
      .locator('.compact-set-header select')
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
    ['WORKING', 'WORKING'],
  );
  await page.getByRole('button', { name: 'Adicionar série', exact: true }).click();
  assert.equal(await page.getByLabel('Repetições mín.', { exact: true }).nth(2).inputValue(), '6');
  assert.equal(await page.getByLabel('Repetições máx.', { exact: true }).nth(2).inputValue(), '10');
  await page.getByRole('button', { name: 'Remover série 3', exact: true }).click();
  await page.getByLabel('Buscar exercício', { exact: true }).fill('');
  const repetitions = page.getByLabel('Repetições mín.', { exact: true }).filter({ visible: true });
  await repetitions.first().waitFor();
  for (let i = 0; i < (await repetitions.count()); i++) await repetitions.nth(i).fill('10');
  const weights = page.getByLabel('Carga alvo (kg)', { exact: true }).filter({ visible: true });
  for (let i = 0; i < (await weights.count()); i++) await weights.nth(i).fill('25');
  await page.getByRole('button', { name: 'Recolher todos', exact: true }).click();
  assert.equal(
    await page.getByLabel('Repetições mín.', { exact: true }).first().isVisible(),
    false,
  );
  await page.getByRole('button', { name: 'Expandir todos', exact: true }).click();
  await repetitions.first().fill('9');
  await page.getByRole('button', { name: 'Aplicar primeira série às demais', exact: true }).click();
  const allRepetitions = page.getByLabel('Repetições mín.', { exact: true });
  for (let i = 0; i < (await allRepetitions.count()); i++)
    assert.equal(await allRepetitions.nth(i).inputValue(), '9');
  await repetitions.first().fill('10');
  await page.getByRole('button', { name: 'Aplicar primeira série às demais', exact: true }).click();
  await page.screenshot({ path: 'test-results/mobile-workout-builder.png', fullPage: true });
  const weekday = await page.evaluate(() => new Date().getDay());
  await page
    .getByLabel(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][weekday], { exact: true })
    .check();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await page.getByText('Ficha salva e atualizada.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nome da ficha', { exact: true }).inputValue(), 'Treino 1');
  await page.getByRole('button', { name: 'Adicionar ficha', exact: true }).click();
  await page.getByLabel('Nome da ficha', { exact: true }).fill('Lower');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await page.getByText(/Alterações salvas. Continue montando/).waitFor();
  assert.equal(await page.getByLabel('Nome da ficha', { exact: true }).inputValue(), 'Lower');
  await page
    .getByRole('list', { name: 'Exercícios encontrados', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await page.getByText('Ficha salva e atualizada.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nome da ficha', { exact: true }).inputValue(), 'Lower');
  await page.getByRole('button', { name: 'Voltar aos planos', exact: true }).click();

  await page.goto(origin + '/painel');
  await page.getByRole('heading', { name: 'Treino 1', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('link', { name: /alimentar|vínculo|profissional/i }).count(),
    0,
  );
  const executionRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      executionRequests.push({ path: new URL(request.url()).pathname, method: request.method() });
  });
  const opening = Date.now();
  await page.getByRole('button', { name: 'Começar treino', exact: true }).click();
  await page.waitForURL('**/sessoes/**');
  const sessionUrl = page.url();
  await page.getByLabel('Repetições feitas', { exact: true }).first().waitFor();
  await page.waitForFunction(() => !document.querySelector('input[type=number]')?.disabled);
  console.log('Abertura da execução (navegador local):', Date.now() - opening, 'ms');
  assert.equal(
    executionRequests.filter((r) => r.method === 'GET' && /^\/api\/sessions\/[^/]+$/.test(r.path))
      .length,
    1,
  );
  assert.equal(
    executionRequests.filter((r) => r.path === '/api/me' || r.path === '/api/workspace').length,
    0,
  );
  assert.equal(await page.getByText('Substituir no registro', { exact: true }).count(), 0);
  assert.equal(await page.locator('.timer').count(), 0);
  await page.getByLabel('Repetições feitas', { exact: true }).first().fill('10');
  await page.getByLabel('Carga utilizada (kg)', { exact: true }).first().fill('25');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).first().click();
  await page.getByText('Dados sincronizados.', { exact: true }).waitFor();
  assert.equal(
    executionRequests.filter((r) => r.method === 'GET' && /^\/api\/sessions\/[^/]+$/.test(r.path))
      .length,
    1,
    'Salvar séries não deve recarregar todo o histórico',
  );
  await page
    .getByLabel('Guardar pendências offline neste dispositivo pessoal', { exact: true })
    .check();
  await context.setOffline(true);
  await page.getByLabel('Repetições feitas', { exact: true }).nth(1).fill('12');
  await page.getByLabel('Carga utilizada (kg)', { exact: true }).nth(1).fill('25');
  await page
    .getByRole('heading', { name: 'Série 2 • Série válida', exact: true })
    .locator('..')
    .getByRole('button', { name: 'Concluir série', exact: true })
    .click();
  await page.getByText(/pendências de sincronização/).waitFor();
  await page.waitForFunction(async () => {
    const expected = parseInt(document.querySelector('.queue-warning')?.textContent ?? '0', 10);
    return new Promise((resolve) => {
      const open = indexedDB.open('pulso-private-pending', 1);
      open.onsuccess = () => {
        const count = open.result.transaction('queue').objectStore('queue').count();
        count.onsuccess = () => {
          resolve(expected > 0 && count.result === expected);
          open.result.close();
        };
        count.onerror = () => {
          resolve(false);
          open.result.close();
        };
      };
      open.onerror = () => resolve(false);
    });
  });
  const encrypted = await page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('pulso-private-pending', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('queue').objectStore('queue').getAll();
          q.onsuccess = () => {
            resolve(
              q.result.map((v) => ({
                hasCipher: v.cipher instanceof ArrayBuffer,
                hasPlainBody: 'body' in v,
              })),
            );
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  assert.ok(encrypted.length);
  assert.ok(encrypted.every((v) => v.hasCipher && !v.hasPlainBody));
  // Destroy the page while offline: memory and online handlers cannot recover the writes.
  // A new page must read, decrypt and flush the IndexedDB queue.
  await page.close();
  await context.setOffline(false);
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(sessionUrl);
  await page.getByText('Dados sincronizados.', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.queue-warning'));
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('label')]
        .filter((l) => l.textContent.includes('Repetições feitas'))[1]
        ?.querySelector('input')?.value === '12',
  );
  assert.equal(
    await page.getByLabel('Repetições feitas', { exact: true }).nth(1).inputValue(),
    '12',
  );
  await page.getByLabel('Feedback', { exact: true }).fill('Feedback browser');
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page.getByRole('heading', { name: 'Feedback registrado', exact: true }).waitFor();
  await page.goto(origin + '/evolucao');
  await page.getByText('Volume ao longo do tempo', { exact: true }).waitFor();
  await page.getByRole('img', { name: 'Volume calculado das sessões registradas' }).waitFor();
  await page.goto(origin + '/alimentacao');
  await page.waitForURL('**/painel');
  await page.getByRole('button', { name: 'Treinar novamente', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/mobile-dashboard-with-plan.png', fullPage: true });
  const own = await context.request.get(origin + '/api/me');
  assert.ok((await own.json()).id);
  const captured = await context.request.get(
    origin + '/api/sessions/' + sessionUrl.split('/').pop(),
  );
  assert.equal((await captured.json()).status, 'COMPLETED');
  const scroll = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(scroll.scroll <= scroll.width + 2, `Overflow no mobile: ${JSON.stringify(scroll)}`);
  await mkdir('/workspace/pulso-fit/test-results', { recursive: true });
  await page.screenshot({
    path: '/workspace/pulso-fit/test-results/mobile-workout-dashboard.png',
    fullPage: true,
  });
  await page.goto(origin + '/treinos');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: 'Iniciar / recuperar sessão', exact: true })
    .first()
    .waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    'Overflow no desktop',
  );
  await page.screenshot({
    path: '/workspace/pulso-fit/test-results/desktop-workouts.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Visualizar plano', exact: true }).click();
  await page.getByRole('button', { name: 'Editar fichas', exact: true }).click();
  await page.getByRole('tab', { name: /Treino 1/ }).waitFor();
  const results = page.getByRole('list', { name: 'Exercícios encontrados', exact: true });
  await results.getByRole('button').first().waitFor();
  for (let i = 1; i <= 5; i++) await results.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: 'Expandir todos', exact: true }).click();
  await page.getByRole('button', { name: 'Recolher todos', exact: true }).click();
  assert.equal(await page.locator('.exercise-row').count(), 6);
  assert.equal(
    await page.locator('#app-navigation a[aria-current="page"]').textContent(),
    'Planos de treino',
  );
  await page.screenshot({ path: 'test-results/desktop-workout-builder.png', fullPage: true });
  await page.getByLabel('Nome da ficha', { exact: true }).fill('Ficha editada');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await page.getByText('Ficha salva e atualizada.', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Nome da ficha', { exact: true }).inputValue(),
    'Ficha editada',
  );
  await page.getByRole('button', { name: 'Voltar aos planos', exact: true }).click();
  const programs = await (await context.request.get(origin + '/api/workouts')).json();
  const editedProgram = programs.own.find((program) => program.name === 'Programa browser ' + tag);
  const current = programs.assigned.find(
    (assignment) => assignment.version.programId === editedProgram.id,
  ).version;
  assert.equal(current.days[0].name, 'Ficha editada');
  assert.equal(editedProgram.versions.find((v) => v.number === 1).days[0].name, 'Treino 1');
  assert.equal(await page.getByRole('button', { name: /Versão [0-9]/ }).count(), 0);
  await page
    .getByRole('button', { name: 'Editar fichas de Programa browser ' + tag, exact: true })
    .click();
  assert.equal(
    await page.getByLabel('Nome da ficha', { exact: true }).inputValue(),
    'Ficha editada',
  );
  await page.getByRole('button', { name: 'Voltar aos planos', exact: true }).click();
  await page.goto(origin + '/painel');
  await page.getByRole('button', { name: 'Começar treino', exact: true }).click();
  await page.waitForURL('**/sessoes/**');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('label')]
        .find((l) => l.textContent.includes('Carga utilizada (kg)'))
        ?.querySelector('input')?.value === '25',
  );
  assert.equal(
    await page.getByLabel('Repetições feitas', { exact: true }).first().inputValue(),
    '10',
  );
  assert.equal(
    await page.getByLabel('Repetições feitas', { exact: true }).nth(1).inputValue(),
    '12',
  );
  assert.equal(
    await page.getByLabel('Carga utilizada (kg)', { exact: true }).nth(1).inputValue(),
    '25',
  );
  await page.screenshot({
    path: 'test-results/desktop-execution-previous-loads.png',
    fullPage: true,
  });
  await page.getByLabel('Encerramento', { exact: true }).selectOption('INTERRUPTED');
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page.getByRole('heading', { name: 'Feedback registrado', exact: true }).waitFor();
  // A partial completed workout must not shift series 2 into series 1; zero kg remains valid.
  const partialId = crypto.randomUUID();
  const post = (path, data) =>
    context.request.post(origin + '/api/' + path, { data, headers: { Origin: origin } });
  assert.equal(
    (await post('sessions/start', { id: partialId, dayId: current.days[0].id })).status(),
    200,
  );
  assert.equal(
    (
      await post(`sessions/${partialId}/sets`, {
        revision: 0,
        prescriptionSetId: current.days[0].exercises[0].sets[1].id,
        actualReps: 9,
        actualKg: 0,
        completed: true,
      })
    ).status(),
    200,
  );
  assert.equal(
    (await post(`sessions/${partialId}/finish`, { revision: 1, status: 'COMPLETED' })).status(),
    200,
  );
  await page.goto(origin + '/painel');
  await page.getByRole('button', { name: 'Treinar novamente', exact: true }).click();
  await page.waitForURL('**/sessoes/**');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('label')]
        .filter((l) => l.textContent.includes('Repetições feitas'))[1]
        ?.querySelector('input')?.value === '9',
  );
  assert.equal(
    await page.getByLabel('Repetições feitas', { exact: true }).first().inputValue(),
    '',
  );
  assert.equal(
    await page.getByLabel('Carga utilizada (kg)', { exact: true }).first().inputValue(),
    '',
  );
  assert.equal(
    await page.getByLabel('Carga utilizada (kg)', { exact: true }).nth(1).inputValue(),
    '0',
  );
  await page.getByLabel('Encerramento', { exact: true }).selectOption('INTERRUPTED');
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page.getByRole('heading', { name: 'Feedback registrado', exact: true }).waitFor();
  await page.goto(origin + '/treinos#programas');
  const remove = page.getByRole('button', {
    name: 'Excluir plano Programa browser ' + tag,
    exact: true,
  });
  page.once('dialog', (dialog) => dialog.dismiss());
  await remove.click();
  assert.equal(await remove.count(), 1, 'Cancelar deve preservar o plano');
  page.once('dialog', (dialog) => dialog.accept());
  await remove.click();
  await remove.waitFor({ state: 'detached' });
  const afterRemoval = await (await context.request.get(origin + '/api/workouts')).json();
  assert.ok(!afterRemoval.own.some((program) => program.id === editedProgram.id));
  assert.ok(
    !afterRemoval.assigned.some((assignment) => assignment.version.programId === editedProgram.id),
  );
  assert.equal(
    (await context.request.get(origin + '/api/sessions/' + sessionUrl.split('/').pop())).status(),
    200,
  );
  assert.equal(
    (
      await context.request.post(origin + '/api/sessions/start', {
        data: { id: crypto.randomUUID(), dayId: current.days[0].id },
        headers: { Origin: origin },
      })
    ).status(),
    404,
  );
  assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
  console.log(
    'Browser: cadastro somente aluno, agenda do dia, edição, séries sem recarga, cargas/repetições anteriores após edição, fila criptografada offline, evolução e exclusão passaram; mobile e desktop sem overflow; sem erros JS.',
  );
  await context.close();
} catch (error) {
  console.error(error);
  console.error('Mensagens:', await page?.locator('.message').allTextContents());
  console.error('Servidor:', logs.slice(-1200));
  await mkdir('test-results', { recursive: true });
  await page?.screenshot({ path: 'test-results/browser-error.png', fullPage: true });
  throw error;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
