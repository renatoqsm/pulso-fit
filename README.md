# Pulso Fit

Aplicativo de treinos pessoais em português, hospedado com **Cloudflare Workers + D1 (SQLite)**. O aluno monta suas fichas, escolhe os dias da semana, inicia o treino pela tela Meu dia e registra cargas e repetições. Inclui evolução, MFA, privacidade e PWA.

Catálogo real de 934 exercícios wger em português, com original, licenças e créditos preservados. Os textos traduzidos automaticamente são identificados. Dieta e modo professor foram retirados do produto; contas anteriormente profissionais usam a experiência de aluno sem acesso aos dados de outras pessoas. Dados históricos permanecem protegidos e disponíveis na exportação própria.

## Desenvolvimento

Node.js 24 recomendado (mínimo 22.13), npm e Python 3. **Não precisa de PostgreSQL, Hyperdrive ou Docker.**

```bash
cp .env.example .env # somente se ainda não existir
npm ci
npm run db:generate
npm run db:deploy
npm run exercises:import
npm run dev
```

Node usa SQLite em `.local/pulso-fit.sqlite`; `PULSO_DB_PATH` seleciona outro arquivo. `APP_URL` deve corresponder à origem do servidor. Produção usa somente a binding D1 `DB`. Nunca execute reset para instalar.

Prisma mantém o contrato lógico e tipos/metadados; o aplicativo não instancia um cliente PostgreSQL. Listas/JSON são TEXT JSON e quantidades decimais são texto exato no SQLite. A persistência usa consultas preparadas e lotes atômicos D1 com revisão otimista, mantendo a autorização válida até confirmar a gravação. Veja [arquitetura](docs/ARQUITETURA.md).

SQL físico em `prisma/d1-migrations`. `npm run db:deploy` aplica localmente com checksums/transações. Não editar migration aplicada nem usar `prisma migrate dev/deploy`. Migrations/scripts PostgreSQL antigos são apenas legado; o banco anterior não foi apagado.

## Telas

- `/painel`: treino de hoje, sessão em andamento e perfil pessoal.
- `/exercicios`: busca, favoritos, licenças e exercícios personalizados do aluno.
- `/treinos`: planos próprios, fichas editáveis e agenda semanal. Padrão: duas séries de trabalho de 6–10 repetições.
- `/sessoes/[id]`: cargas/repetições anteriores, confirmação de séries, sincronização e feedback. Sem cronômetro de descanso ou substituição. Toque em **Concluir série** (ou **Salvar ajustes da série**) para gravar os valores.
- `/evolucao`: frequência, cargas, repetições, volume e histórico reais.
- `/conta`: foto visível somente ao próprio usuário, senha, autenticador, exportação e solicitação de exclusão.

Rotas antigas de alimentação/convites redirecionam para o painel. APIs de nutrição, habilitações, convites e acesso a alunos retornam 404; acessar sessões/evolução de outra conta é proibido, mesmo com vínculo legado. A administração operacional mantém MFA e permissões, sem acesso automático aos históricos pessoais.

## Testes

```bash
PULSO_DB_PATH=/workspace/pulso-fit/.local/pulso_fit_test.sqlite npm run db:deploy
npm run build
TEST_DB_PATH=/workspace/pulso-fit/.local/pulso_fit_test.sqlite npm test
TEST_DB_PATH=/workspace/pulso-fit/.local/pulso_fit_test.sqlite npm run test:browser
```

Os testes recusam arquivos com nome diferente de `pulso_fit_test.sqlite`. Node inicia servidor real 3100; navegador Chromium usa 3102 (`CHROMIUM_PATH`, padrão `/usr/bin/chromium`). Dados sintéticos não entram no banco de desenvolvimento/produção. Capturas em `test-results/`, ignorado no Git.

Depois de `cf:build`, o bundle exclui o driver SQLite Node. Refaça `npm run build` para testar novamente com `next start` nativo. Para testar o próprio Worker, use a sequência de [DEPLOY-CLOUDFLARE.md](docs/DEPLOY-CLOUDFLARE.md).

## Administração

Cadastro público cria somente aluno. No terminal seguro do operador, defina `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (16–128 caracteres), sem valores no chat, argumentos ou Git.

Local:

```bash
npm run admin:create
```

D1 de produção, com autenticação Cloudflare configurada no terminal:

```bash
python3 scripts/create-d1-admin.py --account-id ID_DA_CONTA --database-id ID_DO_D1
```

O operador escolhe a senha em seu terminal; não use um placeholder de proxy como senha. A criação remota de usuário/perfil/auditoria é atômica e não promove contas públicas existentes. Ative MFA em `/conta` antes de administrar. Há permissões independentes para usuários, catálogo e outros administradores. APIs de verificação profissional estão desativadas.

## Fontes, hospedagem e limites

Licenças/atualização: [wger](data/wger/README.md). Busca indexada por palavras/prefixos, com normalização e aliases. Documentação, tabelas e importadores alimentares antigos ficam apenas como legado para registros históricos, sem módulo ativo no aplicativo.

Hospedagem: [Cloudflare/D1](docs/DEPLOY-CLOUDFLARE.md). Código preparado para a faixa gratuita, sem upgrade de plano; franquias/limites continuam aplicáveis. Consultas em lote, FTS e guarda de 50 consultas por requisição reduzem consumo. Escritas concorrentes podem receber 409 para nova tentativa; lotes grandes precisam ser reduzidos.

Fila de séries offline cifrada exige consentimento no dispositivo pessoal. Cache PWA contém somente shell público. Não há prontuário completo offline.

Recuperação/confirmação por email, política legal definitiva de descarte, backups/monitoramento operacionais e validação física/Safari ainda dependem do operador. Encerramento desativa a conta e aguarda retenção; não apaga automaticamente os históricos. Não há financeiro ou integração completa Pulso; a outbox não equivale a check-in aprovado.

Evidências e estado de publicação: [STATUS.md](docs/STATUS.md).
