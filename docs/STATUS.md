# Estado da entrega — 15/10/2026

## Implementação

Aplicação Next.js/React/TypeScript com interface em português, Cloudflare Workers e persistência real D1/SQLite. PostgreSQL e Hyperdrive não são necessários. O schema Prisma serve como contrato de tipos; a camada D1 implementa explicitamente as operações usadas pelo aplicativo.

- Cadastro, sessões, perfis/foto privada, MFA TOTP, recuperação de uso único, permissões administrativas, suspensão, exportação e solicitação de exclusão.
- Habilitações independentes para treino e nutrição; revisão profissional, convites, consentimentos, isolamento por vínculo/área e revogação.
- Exercícios públicos e privados, favoritos, licenças e importação idempotente.
- Programas/fichas, séries avançadas, rascunhos, versões publicadas imutáveis e atribuições.
- Execução com séries reais, histórico, descanso, substituição, feedback, evolução e fila offline cifrada com consentimento, recuperada após fechar a página.
- Rótulos privados, receitas, medidas, planos, alternativas e diário de consumo real separado da prescrição. Cálculos decimais exatos e ausência de nutrientes preservada.
- PWA com shell público; dados autenticados não entram no cache público. Outbox de futura integração sem check-in automático Pulso; sem financeiro.

A unidade de persistência usa batch atômico, guarda de revisão, triggers que observam gravações externas, repetição das verificações em conflito e cookies somente após commit. Leituras também revalidam a revisão. Consultas relacionais são agrupadas; cada operação HTTP tem orçamento de 50 consultas. FTS5 indexa catálogos com atualização por trigger. Consulte ARQUITETURA.md para limites e diferenças do contrato de consultas.

## Banco remoto efetivamente preparado

Banco exclusivo `pulso-fit` na Cloudflare, ID `2b735f22-afc1-432c-9b62-8ef9db70d46c`. As quatro migrations D1 foram aplicadas. Consulta remota confirmou **7.793 alimentos, 68 exercícios e zero usuários**. Não foram enviados dados de saúde nem usuários de desenvolvimento.

Alimentos oficiais USDA SR Legacy 2018-04, com URL/licença/versão/referência por 100 g e unidades preservadas. Cinco amostras distribuídas foram comparadas ao CSV oficial, incluindo no banco remoto. Os nomes mantêm o idioma original inglês. O arquivo é uma edição de 2018, não dados nutricionais atualizados em 2026. TACO/TBCA não foram importados.

Exercícios do snapshot oficial wger em português, com atribuições e licenças originais. O bootstrap remoto importou somente tabelas públicas, com checkpoint: 349 comandos concluídos, 39.939 escritas reportadas. Os índices de busca e triggers de revisão foram instalados depois da carga inicial.

## Verificações concluídas

- TypeScript, build Next.js e build OpenNext passaram.
- Migrations locais e remotas aplicadas; reaplicação local idempotente verificada.
- **42 testes passaram em Node e 42 em workerd local**, zero falhas ou testes ignorados. Incluem autorização, consentimento/revogação, concorrência, rollback, gravação externa, efeitos de autenticação após commit, ordenação por relação, FTS, imutabilidade, execução, nutrientes/receitas/medidas, MFA e compatibilidade de senha do operador Python.
- Chromium real em ambos os runtimes: cadastro, ficha/publicação, séries, offline com fila cifrada sem payload em claro, fechamento offline e recuperação em página nova, encerramento, evolução, plano e diário. Sem erros JavaScript ou overflow nos viewports verificados (390×844 e 1440×1000).
- Bundle Worker sem node:sqlite, aproximadamente 925 KiB gzip no dry-run minificado; binding D1 real confirmada na configuração.
- `npm audit --omit=dev`: zero vulnerabilidades reportadas na execução. Não equivale a auditoria independente.
- API D1 remota confirmou busca FTS e guarda de revisão; operação SQL múltipla com erro de unicidade reverteu as escritas do lote de prova, depois removido.

Os testes completos de escrita ocorreram somente nos bancos locais dedicados; não criamos pessoas ou prontuários fictícios em produção. Eles não estabelecem latência, CPU e quotas do Worker publicado.

## Publicação bloqueada

O D1 está operacional. A publicação do Worker recebeu **HTTP 401** no PUT para `workers/scripts/pulso-fit`, com mensagem de falha de autenticação da integração `codex-secret-api.cloudflare.com`. Uma consulta D1 subsequente funcionou; portanto, acesso ao banco não resolve a autorização de publicação. É necessário revisar/reconectar a credencial segura com permissão Workers Scripts Edit na conta configurada. Não há deploy confirmado nem endereço público validado.

A origem pretendida é `https://pulso-fit.renatoqsousam.workers.dev`. Esse host foi incluído no rascunho da configuração de rede, mas a política aplicada ainda permite apenas os três hosts de API/fontes e presets. Salvar/publicar essa alteração na interface permitirá testar o endereço após o deploy. Publicar o ambiente é diferente de publicar a aplicação.

## Pendências de lançamento

1. Concluir autenticação de deploy e validar HTTPS, cookies, origem, login/cadastro e CPU no Worker real.
2. Criar administrador por terminal seguro usando o script D1 e ativar MFA; nenhum administrador foi inventado ou cadastrado em produção.
3. Configurar recuperação e confirmação por email, política legal de retenção/descarte, procedimento de habilitação profissional, backups/restauração e monitoramento. Exclusão permanece PENDING_RETENTION_REVIEW.
4. Validar aparelhos físicos/Safari, acessibilidade completa e carga. Os fluxos principais foram validados em Chromium; isso não cobre visualmente todos os formulários profissionais.
5. Tradução revisada da base alimentar e planejamento de novas versões/fontes. Importador CSV usa memória e lotes de 40, sem sincronização agendada; falhas posteriores podem deixar lotes anteriores confirmados, com reaplicação idempotente.

Evolução usa até as 1.000 sessões concluídas mais recentes, ordenadas cronologicamente; histórico paginado/limitado e exportação pessoal preservam a distinção. A fila offline guarda séries, não todos os prontuários ou planos. Não se afirma aceite integral de produção.

## Ambiente e reprodução

O setup salvo instala dependências, gera tipos/metadados, migra SQLite local e carrega catálogos reais. Não depende de Docker/PostgreSQL. O rascunho atualizado precisa ser salvo/publicado na interface para novas tarefas; a ferramenta não aplica essa alteração à máquina. Restauração em tarefa independente ainda não foi verificada. Consulte README e DEPLOY-CLOUDFLARE.md para os comandos exatos.
