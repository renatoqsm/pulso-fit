# Cloudflare Workers e D1

O aplicativo usa a binding DB do D1. Não exige PostgreSQL, Hyperdrive nem uma URL de banco de produção. A autenticação usa sessão opaca em cookie HttpOnly, Secure em HTTPS e SameSite=Lax.

## Recursos configurados

- Conta: `1f2952b80beb2fcde6ae3b4baebb5c55`.
- D1 exclusivo: `pulso-fit`, ID `2b735f22-afc1-432c-9b62-8ef9db70d46c`.
- Worker pretendido: `pulso-fit`.
- Origem configurada: `https://pulso-fit.renatoqsousam.workers.dev`.

`wrangler.jsonc` contém a binding e APP_URL. Esses identificadores são públicos; o token nunca deve entrar no Git. Não altere bancos de outros projetos. APP_URL deve coincidir com a origem HTTPS publicada para a validação de origem.

## Preparação e migrações

Use Node 24, `npm ci` e `npm run db:generate`. `npm run db:deploy` migra apenas o SQLite local; não aplica o banco remoto. O schema Prisma mantém os tipos do domínio, sem conexão PostgreSQL em execução.

As quatro migrations remotas já foram aplicadas. Para reaplicação idempotente ou migrations futuras, com o token fornecido pelo mecanismo seguro:

```bash
python3 scripts/migrate-d1-remote.py --account-id 1f2952b80beb2fcde6ae3b4baebb5c55 --database-id 2b735f22-afc1-432c-9b62-8ef9db70d46c
```

O executor verifica o nome do banco e checksums, divide SQL com parser SQLite e registra progresso por comando em `.local/`. Uma migration remota inteira não é uma transação: execute em janela controlada e preserve o checkpoint para retomada. O helper serializa o trigger legado de comparação de revisão com WHERE equivalente, devido à limitação do separador SQL REST com CASE/END; mantém o checksum da fonte. Não edite migrations já aplicadas.

## Catálogos e administração

O D1 remoto contém 7.793 alimentos USDA SR Legacy 2018-04 e 68 exercícios wger. Nenhum usuário ou dado clínico de desenvolvimento foi enviado. O bootstrap público foi concluído antes da instalação dos índices FTS e triggers de revisão, evitando custo extra durante a carga inicial.

Para um banco novo, prepare os catálogos locais conforme README e execute `npx tsx scripts/export-d1-catalog.ts --bootstrap`; o importador `scripts/import-d1-catalog.py --bootstrap --file .local/catalog.sql.json` exige os mesmos argumentos de conta e banco. Ele aceita somente tabelas públicas, mantém checkpoint e orçamento de escrita; não é um procedimento de importação de prontuários nem deve substituir backups. Consulte `--help` antes de uma nova carga.

Não há administrador criado. O operador deve fornecer ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD em terminal seguro e executar `python3 scripts/create-d1-admin.py` com os argumentos de conta e banco. Não envie senha pelo chat nem use o placeholder do proxy como senha. O script cria usuário, perfil e auditoria atomicamente, recusa email existente e não promove cadastros públicos. Ative MFA antes de administrar.

## Build e publicação

```bash
export XDG_CONFIG_HOME=/workspace/.config
export WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1
npm run cf:build
npx wrangler deploy --minify --env ""
```

O build Cloudflare substitui o módulo SQLite nativo pelo módulo que exige a binding. O pacote minificado validado mede aproximadamente 925 KiB gzip. Logs de requisição estão desabilitados. Verifique quotas D1 e CPU Workers do plano vigente: o limite interno de 50 consultas por operação não garante gratuidade para qualquer carga. PBKDF2 SHA-512 usa 210 mil iterações; não reduza o custo de senha para acomodar CPU.

## Testes locais

O ambiente test usa exclusivamente workerd local e identificador de banco fictício. Nunca publique esse ambiente nem aplique suas migrations com --remote.

```bash
npx wrangler d1 migrations apply DB --local --env test --persist-to .wrangler-test/state
npx wrangler dev --env test --persist-to .wrangler-test/state --port 3101 --ip 127.0.0.1
```

Em outro terminal, após preparar o banco dedicado conforme README:

```bash
TEST_D1_BINDING=local-worker TEST_APP_URL=http://localhost:3101 TEST_DB_PATH=/workspace/pulso-fit/.local/pulso_fit_test.sqlite npm test
TEST_BROWSER_URL=http://localhost:3101 TEST_DB_PATH=/workspace/pulso-fit/.local/pulso_fit_test.sqlite npm run test:browser
```

As 42 verificações e o fluxo de navegador passaram em Node e workerd. Depois de cf:build, faça um novo build Node antes de testes que iniciem next start com SQLite nativo.

## Situação da publicação

Em 15/10/2026, o D1 remoto foi criado, migrado, carregado e consultado com sucesso. O envio do Worker recebeu HTTP 401 no PUT de publicação: “authentication failed for integration codex-secret-api.cloudflare.com”. A disponibilidade do token e o acesso ao D1 não comprovam autorização para publicar Workers. Corrija/reconecte a credencial segura com autorização Workers Scripts Edit na conta indicada e repita o deploy. Não há publicação confirmada nem URL validada.

O host do aplicativo foi adicionado ao rascunho de rede, mas ainda não está na política aplicada. Salve/publique essa configuração na interface do ambiente para permitir a verificação HTTPS depois do deploy. Publicar o ambiente não publica o aplicativo.

Após publicar, valide página inicial, cookies, origem inválida, autorização, persistência e custo de CPU de cadastro/login. Testes locais não comprovam essas propriedades em produção. Antes do lançamento, conclua recuperação/verificação por email, retenção legal, backups/restauração e monitoramento. A PWA mantém apenas shell público; a fila de séries é cifrada e opt-in.
