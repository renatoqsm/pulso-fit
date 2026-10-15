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
  await page.goto(origin + '/treinos');
  await page.getByLabel('Nome do programa', { exact: true }).fill('Programa browser ' + tag);
  await page.getByRole('button', { name: 'Criar programa', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar ficha', exact: true }).click();
  await page.getByLabel('Adicionar exercício', { exact: true }).selectOption({ index: 1 });
  const repetitions = page.getByLabel('Repetições mín.', { exact: true });
  await repetitions.first().waitFor();
  for (let i = 0; i < (await repetitions.count()); i++) await repetitions.nth(i).fill('10');
  const weights = page.getByLabel('Carga alvo (kg)', { exact: true });
  for (let i = 0; i < (await weights.count()); i++) await weights.nth(i).fill('25');
  await page.getByRole('button', { name: 'Salvar e publicar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar / recuperar sessão', exact: true }).click();
  await page.waitForURL('**/sessoes/**');
  const sessionUrl = page.url();
  await page.getByLabel('Repetições feitas', { exact: true }).first().fill('10');
  await page.getByLabel('Carga utilizada (kg)', { exact: true }).first().fill('25');
  await page.getByRole('button', { name: 'Concluir série', exact: true }).first().click();
  await page.getByText('Dados sincronizados.', { exact: true }).waitFor();
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
  await page.getByRole('button', { name: 'Alimentos', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar alimento / rótulo', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Rótulo browser ' + tag);
  await page.getByLabel('Energia (kcal)', { exact: true }).fill('111');
  await page.getByLabel('Proteínas (g)', { exact: true }).fill('5.2');
  await page
    .getByLabel('Procedência (marca, rótulo, fonte e versão)', { exact: true })
    .fill('Rótulo sintético, apenas teste de navegador');
  const foodResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/foods/create') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Salvar alimento', exact: true }).click();
  const foodId = (await (await foodResponse).json()).id;
  await page.getByRole('button', { name: 'Planos', exact: true }).click();
  await page
    .getByLabel('Nome do plano / planejamento', { exact: true })
    .fill('Plano browser ' + tag);
  await page.getByRole('button', { name: 'Criar planejamento', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar refeição', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar alimento', exact: true }).first().click();
  await page.getByLabel('Alimento', { exact: true }).first().selectOption(foodId);
  await page.getByLabel('Quantidade', { exact: true }).first().fill('50');
  await page.getByRole('button', { name: 'Salvar e publicar', exact: true }).click();
  await page.getByRole('button', { name: 'Criar revisão', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Diário', exact: true }).click();
  await page
    .getByRole('button', { name: 'Marcar realizada / registrar consumo', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar consumo', exact: true }).click();
  await page.getByRole('heading', { name: 'Alimentação registrada', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Editar registro', exact: true }).waitFor();
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
    path: '/workspace/pulso-fit/test-results/mobile-nutrition.png',
    fullPage: true,
  });
  await page.goto(origin + '/treinos');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Iniciar / recuperar sessão', exact: true }).waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    'Overflow no desktop',
  );
  await page.screenshot({
    path: '/workspace/pulso-fit/test-results/desktop-workouts.png',
    fullPage: true,
  });
  assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
  console.log(
    'Browser: cadastro, prescrição, séries, fila criptografada offline, recuperação, evolução, plano e diário passaram; mobile sem overflow; sem erros JS.',
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
