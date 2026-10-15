# Pulso Fit

Plataforma de treinos e alimentação em português, hospedada com **Cloudflare Workers + D1 (SQLite)**. Inclui contas e habilitações por área, consentimento/vínculos, fichas e planos editáveis com histórico preservado, execução de séries, evolução, diário alimentar, comentários, MFA, privacidade e PWA.

Catálogos reais: 934 exercícios do wger em português e 7.793 alimentos USDA SR Legacy 2018-04. Os nomes dos exercícios usam terminologia brasileira; os textos traduzidos automaticamente têm original e créditos preservados. Nutrientes por 100 g, fonte/versão e licença preservadas. Os alimentos mantêm nomes originais em inglês; tradução PT permanece pendente. Não há históricos ou alimentos fictícios em desenvolvimento/produção; fixtures são exclusivas dos bancos de testes.

## Desenvolvimento

Node.js 24 recomendado (mínimo 22.13), npm e Python 3. **Não precisa de PostgreSQL, Hyperdrive ou Docker.**

```bash
cp .env.example .env # somente se ainda não existir
npm ci
npm run db:generate
npm run db:deploy
npm run exercises:import
python3 scripts/fetch-usda.py --directory /workspace/pulso-sources/usda-sr-legacy-2018-04
npm run foods:import-usda -- --directory /workspace/pulso-sources/usda-sr-legacy-2018-04 --version SR-Legacy-2018-04 --limit 10000 --reviewed-license
npm run dev
```

Node usa SQLite em `.local/pulso-fit.sqlite`; `PULSO_DB_PATH` seleciona outro arquivo. `APP_URL` deve corresponder à origem do servidor. Produção usa somente a binding D1 `DB`. Nunca execute reset para instalar.

Prisma mantém o contrato lógico e tipos/metadados; o aplicativo não instancia um cliente PostgreSQL. Listas/JSON são TEXT JSON e quantidades decimais são texto exato no SQLite. A persistência usa consultas preparadas e lotes atômicos D1 com revisão otimista, mantendo a autorização válida até confirmar a gravação. Veja [arquitetura](docs/ARQUITETURA.md).

SQL físico em `prisma/d1-migrations`. `npm run db:deploy` aplica localmente com checksums/transações. Não editar migration aplicada nem usar `prisma migrate dev/deploy`. Migrations/scripts PostgreSQL antigos são apenas legado; o banco anterior não foi apagado.

## Telas

- `/painel`: perfil, habilitações, vínculos, indicadores e administração.
- `/exercicios`: busca, favoritos, licenças e personalizados do treinador.
- `/treinos`: modelos, fichas, revisões, atribuição e início da sessão.
- `/sessoes/[id]`: séries, última execução, descanso, sincronização e feedback.
- `/evolucao`: frequência, cargas, repetições, volume e histórico reais.
- `/alimentacao`: alimentos/medidas, receitas, planos e consumo separado.
- `/conta`: foto privada, senha, autenticador, exportação e solicitação de exclusão.

Aluno independente utiliza seus protocolos/diário. Profissional precisa de habilitação verificada e vínculo consentido na área. Revogação encerra o acesso profissional; o aluno conserva o histórico. Administrador não recebe acesso automático a dados de saúde.

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

Cadastro público cria somente aluno/profissional. No terminal seguro do operador, defina `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (16–128 caracteres), sem valores no chat, argumentos ou Git.

Local:

```bash
npm run admin:create
```

D1 de produção, com autenticação Cloudflare configurada no terminal:

```bash
python3 scripts/create-d1-admin.py --account-id ID_DA_CONTA --database-id ID_DO_D1
```

O operador escolhe a senha em seu terminal; não use um placeholder de proxy como senha. A criação remota de usuário/perfil/auditoria é atômica e não promove contas públicas existentes. Ative MFA em `/conta` antes de administrar. Há permissões independentes para usuários, catálogos, credenciais e outros administradores. Verificação documental/conselho é manual.

## Fontes, hospedagem e limites

Licenças/atualização: [wger](data/wger/README.md), [USDA](data/usda/README.md) e [importação alimentar](docs/IMPORTACAO-ALIMENTOS.md). Busca indexada por palavras/prefixos, com normalização e aliases; não inventa nutrientes, instruções ou mídias.

Hospedagem: [Cloudflare/D1](docs/DEPLOY-CLOUDFLARE.md). Código preparado para a faixa gratuita, sem upgrade de plano; franquias/limites continuam aplicáveis. Consultas em lote, FTS e guarda de 50 consultas por requisição reduzem consumo. Escritas concorrentes podem receber 409 para nova tentativa; lotes grandes precisam ser reduzidos.

Fila de séries offline cifrada exige consentimento no dispositivo pessoal. Cache PWA contém somente shell público. Não há prontuário completo offline. Nutriente ausente não vira zero e g/ml não são convertidos sem equivalência específica.

Recuperação/confirmação por email, política legal definitiva de descarte, backups/monitoramento operacionais e validação física/Safari ainda dependem do operador. Encerramento desativa a conta e aguarda retenção; não apaga automaticamente registros profissionais. Não há financeiro ou integração completa Pulso; a outbox não equivale a check-in aprovado.

Evidências e estado de publicação: [STATUS.md](docs/STATUS.md).
