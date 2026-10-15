# Arquitetura — Cloudflare D1

## Contexto

Repositório inicial vazio; o Desafio Pulso não foi alterado. A primeira implementação usava PostgreSQL. Em 15/10/2026, o usuário escolheu **Cloudflare D1 gratuito, tudo na Cloudflare**. Não há dependência de PostgreSQL/Hyperdrive em execução.

Next.js 15, React 19, TypeScript, Tailwind e Cloudflare Workers/OpenNext. Node local usa SQLite nativo; Worker recebe a binding D1 DB. O build Cloudflare substitui o driver Node por um módulo que exige a binding, evitando filesystem/SQLite Node no Worker.

## Contrato lógico e SQL físico

`prisma/schema.prisma` conserva o contrato lógico e os tipos Prisma dos domínios. Geração de tipos/metadados não abre conexão PostgreSQL. `data/schema/models.json` é gerado por `scripts/generate-d1-schema.ts`. Não aplicar migrations Prisma ao D1: SQL físico versionado fica em `prisma/d1-migrations`.

Listas, snapshots e proveniência usam JSON TEXT; bytes usam BLOB; datas ISO UTC; decimais são texto exato e calculados com Decimal.js. Booleanos, enums, unidades, faixas, ownership, chaves e índices são validados no SQLite. Exercícios/alimentos globais têm ID externo e fonte únicos; prescrições guardam snapshots.

`d1-store.ts` implementa o subconjunto tipado de consultas/mutações usado pelos módulos (filtros, relações, projeções, paginação, criação aninhada e alterações). Os tipos de domínio são gerados; não é um cliente Prisma genérico. Identificadores vêm do modelo validado; valores são parâmetros. Operadores não implementados falham explicitamente.

## Atomicidade e concorrência

D1 não fornece as transações interativas usadas pela implementação PostgreSQL. A solução não ignora transações:

1. Cada operação lê __StoreClock e mantém alterações pendentes em uma unidade de trabalho.
2. Leituras enxergam suas próprias alterações; projeções relacionais são agrupadas.
3. __CommitGuard valida a revisão e as mutações são enviadas em um único D1 batch atômico.
4. Triggers em todas as tabelas de domínio incrementam o relógio inclusive para alterações por outra conexão. RateLimit é independente.
5. Conflito repete a operação inteira, incluindo autenticação/permissões, até cinco tentativas; depois retorna 409.
6. Consultas sem escrita também verificam o relógio ao terminar. Cookies só mudam depois de confirmar o commit; falha não emite sessão órfã.

Savepoints internos são locais à unidade pendente e descartam alterações/efeitos rejeitados. Não usar arrays de Promises para transações. Essa estratégia usa relógio global conservador: alta concorrência de escrita pode provocar retries; não é promessa de throughput irrestrito.

INSERTs são agrupados e limitados por tamanho. Catálogos/atribuições são consultados em lote; relações evitam N+1. FoodSearch/ExerciseSearch usam FTS5, com triggers para manutenção e filtros de visibilidade aplicados depois do índice. APIs têm orçamento de 50 consultas por invocação; limites de tamanho retornam erro antes de confirmar qualquer gravação.

## Identidade, escopos e privacidade

User STUDENT/PROFESSIONAL/ADMIN; habilitações TRAINING/NUTRITION independentes. Convites têm hash, validade e consumo único. Consentimentos têm escopos mínimos; revogação/suspensão impede consultas novas, preservando o histórico do aluno.

PBKDF2 SHA-512/210 mil iterações, salt aleatório, sessão opaca de 256 bits com hash persistido e cookie HttpOnly/SameSite=Lax/Secure HTTPS. Origem APP_URL, JSON/tamanho e rate limit persistido. MFA TOTP RFC 6238, janela ±1, contador antirreplay e recuperação de uso único; segredo AES-GCM vinculado à senha/usuário. MFA obrigatório em operações administrativas.

Fotos PNG/JPEG até 150 KB/4 MP são sanitizadas, privadas e no-store. Exportação pessoal exclui senhas/tokens/segredos. Auditoria contém ator/ação/ID, sem prontuário. Encerramento revoga acessos, desativa conta e cria PENDING_RETENTION_REVIEW. Retenção/descarte definitivo e email de recuperação não são simulados.

## Domínios preservados

WorkoutProgram/Version/Day/PrescriptionExercise/Set: rascunhos com revisão, publicação/atribuição e revisões/cópias. Triggers impedem alterar, apagar ou acrescentar filhos de versões publicadas. WorkoutSession/Exercise/Set: UUID idempotente, uma sessão ativa por aluno, CAS de revisão, valores reais, última execução válida, descanso e feedback. Sessão finalizada e origens ficam imutáveis. Evolução usa até 1.000 sessões completas recentes, histórico até 100; exportação inclui os registros completos.

Food/Measure: rótulos/receitas privados, referência 100 g/100 ml e medidas próprias com fonte. Nutrientes ausentes permanecem desconhecidos; receitas conservam ingredientes/rendimento. NutritionPlan/Version/Meal/Item: publicação imutável, alternativas e atribuição nutricional. MealLog guarda consumo separado, uma refeição prescrita por data, diferenças e feedback com escopo correto.

PWA guarda somente shell público. Fila cifrada de séries em IndexedDB exige consentimento e vincula usuário/registro como dados adicionais AES-GCM; chave não exportável e limpeza no logout. Não protege um navegador comprometido nem permite navegação completa de saúde offline. Finalização gera ActivityOutbox única, sem consumidor/check-in automático.

## Importação e migrations

68 exercícios wger reais PT, licenças por conteúdo/tradução, sem mídia não revisada. USDA SR Legacy 2018-04: 7.793 alimentos, CC0, 100 g, nomes originais EN. Importações preservam IDs/status; fontes diferentes não são combinadas. Bootstrap remoto exporta apenas catálogos públicos e nunca usuários ou alimentos privados.

Local: migrations por arquivo em transação SQLite, checksums e exclusão mútua. Remoto: helper valida alvo/checksums e mantém checkpoint por instrução; um arquivo parcialmente aplicado deve ser retomado, não tratado como rollback integral. Exigir lançamento inicial/janela controlada e compatibilidade de código/schema. O parser REST D1 confunde CASE END do trigger legado; o helper serializa a mesma condição RAISE com WHERE, mantendo o checksum da fonte original e a mesma regra. Esse caminho foi exercitado no D1 remoto.

## Operação

D1 exclusivo do Pulso Fit; banco de outro projeto não foi modificado. Token Cloudflare fica no ambiente seguro do operador, não no Worker ou no código. Produção usa DB, ASSETS e APP_URL HTTPS. Sem upgrade automático de plano ou contratação de PostgreSQL. Quotas gratuitas, contenção de escrita, backups/restauração e políticas legais exigem acompanhamento operacional.
