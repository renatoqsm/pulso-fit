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

Banco exclusivo `pulso-fit` na Cloudflare, ID `2b735f22-afc1-432c-9b62-8ef9db70d46c`. As quatro migrations D1 foram aplicadas. Na preparação inicial, a consulta remota confirmou 7.793 alimentos, 68 exercícios e zero usuários. Em 15/10/2026, a sincronização incremental confirmou **934 exercícios públicos ativos e 7.793 alimentos**; dados de usuários não foram exportados nem alterados pela carga.

Alimentos oficiais USDA SR Legacy 2018-04, com URL/licença/versão/referência por 100 g e unidades preservadas. Cinco amostras distribuídas foram comparadas ao CSV oficial, incluindo no banco remoto. Os nomes mantêm o idioma original inglês. O arquivo é uma edição de 2018, não dados nutricionais atualizados em 2026. TACO/TBCA não foram importados.

Exercícios do snapshot oficial wger, com atribuições e licenças originais; catálogo ampliado descrito abaixo. O bootstrap remoto importou somente tabelas públicas, com checkpoint: 349 comandos concluídos, 39.939 escritas reportadas. Os índices de busca e triggers de revisão foram instalados depois da carga inicial.

## Verificações concluídas

- TypeScript, build Next.js e build OpenNext passaram.
- Migrations locais e remotas aplicadas; reaplicação local idempotente verificada.
- **42 testes passaram em Node e 42 em workerd local**, zero falhas ou testes ignorados. Incluem autorização, consentimento/revogação, concorrência, rollback, gravação externa, efeitos de autenticação após commit, ordenação por relação, FTS, imutabilidade, execução, nutrientes/receitas/medidas, MFA e compatibilidade de senha do operador Python.
- Chromium real em ambos os runtimes: cadastro, ficha/publicação, séries, offline com fila cifrada sem payload em claro, fechamento offline e recuperação em página nova, encerramento, evolução, plano e diário. Sem erros JavaScript ou overflow nos viewports verificados (390×844 e 1440×1000).
- Bundle Worker sem node:sqlite, aproximadamente 925 KiB gzip no dry-run minificado; binding D1 real confirmada na configuração.
- `npm audit --omit=dev`: zero vulnerabilidades reportadas na execução. Não equivale a auditoria independente.
- API D1 remota confirmou busca FTS e guarda de revisão; operação SQL múltipla com erro de unicidade reverteu as escritas do lote de prova, depois removido.

Os testes completos de escrita ocorreram somente nos bancos locais dedicados; não criamos pessoas ou prontuários fictícios em produção. Eles não estabelecem latência, CPU e quotas do Worker publicado.

## Publicação confirmada

Publicado em **https://pulso-fit.renatoqsousam.workers.dev**, versão `f959fa6e-4453-495e-9ee4-a9e031864a57`. A API Cloudflare aceitou upload, deployment e habilitação de workers.dev. Binding DB: D1 pulso-fit; ASSETS e APP_URL de produção confirmados. Startup informado de 25 ms não mede custo de login ou de outras operações.

O 401 foi diagnosticado como falha da integração do ambiente em uploads grandes, não falta de Edit. O pacote incluía source map de 7,6 MB e somava 11 MB. Um teste de 9 MB chegou à Cloudflare; 11 MB recebeu o mesmo 401 textual da integração, sem CF-Ray. O deploy sem source maps funcionou com a mesma credencial e o caminho normal de rede. A configuração Wrangler fixa minificação e omissão dos mapas nos próximos envios. Consulte DEPLOY-CLOUDFLARE.md para evidência e consequência na depuração.

A verificação HTTPS da aplicação ainda depende de aplicar a liberação do host na rede do ambiente. O rascunho já contém esse domínio, mas a política aplicada ainda permite os três hosts de API/fontes e presets. Publicação foi confirmada pela API; fluxo HTTP público e CPU de cadastro/login ainda não foram verificados neste ambiente.

## Pendências de lançamento

1. Aplicar a liberação de rede do host e validar HTTPS, cookies, origem, login/cadastro e CPU no Worker real.
2. Criar administrador por terminal seguro usando o script D1 e ativar MFA; nenhum administrador foi inventado ou cadastrado em produção.
3. Configurar recuperação e confirmação por email, política legal de retenção/descarte, procedimento de habilitação profissional, backups/restauração e monitoramento. Exclusão permanece PENDING_RETENTION_REVIEW.
4. Validar aparelhos físicos/Safari, acessibilidade completa e carga. Os fluxos principais foram validados em Chromium; isso não cobre visualmente todos os formulários profissionais.
5. Tradução revisada da base alimentar e planejamento de novas versões/fontes. Importador CSV usa memória e lotes de 40, sem sincronização agendada; falhas posteriores podem deixar lotes anteriores confirmados, com reaplicação idempotente.

Evolução usa até as 1.000 sessões concluídas mais recentes, ordenadas cronologicamente; histórico paginado/limitado e exportação pessoal preservam a distinção. A fila offline guarda séries, não todos os prontuários ou planos. Não se afirma aceite integral de produção.

## Ambiente e reprodução

O setup salvo instala dependências, gera tipos/metadados, migra SQLite local e carrega catálogos reais. Não depende de Docker/PostgreSQL. O rascunho atualizado precisa ser salvo/publicado na interface para novas tarefas; a ferramenta não aplica essa alteração à máquina. Restauração em tarefa independente ainda não foi verificada. Consulte README e DEPLOY-CLOUDFLARE.md para os comandos exatos.

## Ajuste de autenticação após publicação

A mensagem genérica no cadastro foi investigada: o D1 recebeu o limitador de tentativas, sem criar usuário ou sessão. Workerd local não impõe o limite nativo de iterações PBKDF2 observado como restrição do runtime de produção. Foi implementado fallback estrito para essa exceção, preservando PBKDF2 SHA-512/210.000 e MFA. Sete testes direcionados passaram (incluindo interoperabilidade do operador e simulação da restrição), TypeScript e novo build OpenNext passaram. Esse ajuste não comprova por si só a causa do erro reportado nem que o cadastro público passou: a exceção remota ainda não foi capturada e o host segue sem acesso na política aplicada deste ambiente. Avaliar CPU no plano real, sem reduzir custo da senha.

Atualização publicada em `https://pulso-fit.renatoqsousam.workers.dev`, versão `136012c2-500a-4079-b4b8-02c4d6dafb1c`. Deploy confirmado pela Cloudflare; validação pública do cadastro permanece pendente. Auditoria npm de dependências de produção: zero vulnerabilidades reportadas.

## Navegação e criadores de planos

Painel Meu dia com treino programado pelo dia da semana, retomada da sessão em andamento e identificação de conclusão na data local; fichas sem dia fixo aparecem como horário livre. Próxima refeição usa horários dos planos ativos e registros consumidos do diário, distinguindo refeições pendentes de registro. Sem plano, exibe orientação de criação, sem inventar prescrição. O menu compartilhado mantém módulos autorizados, atalhos de planos/treino atual/diário/evolução/conta e gaveta móvel. Perfil e vínculos permanecem disponíveis em uma seção recolhível.

Treinos usam abas de fichas, busca, exercícios expansíveis/reordenáveis, séries individuais recolhíveis e cópia da primeira série para as demais, com salvar/publicar acessíveis. Alimentação usa abas por refeição, atalhos de nomes sem horários/porções inventados, duplicação e pesquisa no próprio editor. Resultados de alimentos preservam um catálogo em memória para não perder referências já selecionadas. Alterações não salvas são identificadas, com alerta em recarga e ao seguir links para outras páginas.

Validação: TypeScript, build OpenNext e 44 testes passaram tanto em Node quanto em workerd local. Chromium móvel confirmou menu, construção/publicação/execução, fila offline e recuperação, expansão de exercícios, cópia das séries, duplicação de refeição, diário e painel preenchido com plano real de teste; sem erros JavaScript ou overflow nos viewports verificados. Capturas em test-results são locais e usam apenas fixtures do banco dedicado. Dispositivos físicos e Safari permanecem pendentes.

Atualização de navegação publicada na Cloudflare: versão `7d0f5068-c128-4c8f-8dce-30bfd168bcf5`. Os 44 testes e o navegador passaram no workerd local; o navegador também confirmou os estados ativos do menu e um editor com seis exercícios recolhidos. Publicação confirmada pela API/Wrangler; teste HTTP direto do domínio público continua condicionado à política de rede do ambiente.

## Catálogo ampliado — 15/10/2026

Pesquisa na API oficial completa do wger: 932 registros atuais, mais dois registros portugueses anteriores preservados. O catálogo agora tem **934 exercícios**, 68 nomes em português e 866 em inglês, 913 com instruções e referências licenciadas a 383 imagens e 78 vídeos. As mídias permanecem na fonte, com links e créditos individuais. Campos sem dados não receberam classificações ou traduções inventadas. Pesquisa adicional da base free-exercise-db (876 registros) foi capturada, mas não integrada nem somada como exercícios únicos. Ver BASES-EXERCICIOS.md.

Sincronização do D1 remoto concluída: 866 inserções, 68 atualizações; segunda comparação confirmou 934 inalterados. Os 934 registros estão ativos e 913 têm instruções. Os 7.793 alimentos foram preservados e a verificação de chaves estrangeiras não apontou problemas. Operação restrita ao catálogo público WGER, suas taxonomias/relações e histórico de importação.

O criador de treinos usa busca no servidor e paginação, removendo o limite anterior de 200 exercícios carregados. Inclui carregamento, erro com nova tentativa e cache dos nomes já selecionados. A carga de grande volume usa os comandos de operador; a revalidação administrativa HTTP conserva o limite de 50 consultas. Corrigida também a ordenação de inserções agrupadas por dependências de chaves estrangeiras, com teste de regressão.

Validação desta atualização: **45 testes em Node e 45 em workerd local**, sem falhas ou ignorados; TypeScript e build OpenNext passaram. Chromium em Node e workerd confirmou a busca e adição de Zottman curl, fora dos primeiros 200 resultados, e os fluxos completos de planos/execução/nutrição/offline. Bundle Worker minificado de aproximadamente 1.173 MiB gzip, sem node:sqlite, abaixo do limite gratuito.

Publicação confirmada pela Cloudflare: versão `920b8b04-e74c-4f3a-b6ff-df5abd34e7a8` em `https://pulso-fit.renatoqsousam.workers.dev`. O teste HTTP direto do domínio público continua bloqueado pela política de rede aplicada ao ambiente; os fluxos foram validados no workerd local.

## Tradução do catálogo para português brasileiro

Os 934 nomes estão em português: 68 traduções originais mantidas e 866 nomes adaptados à nomenclatura brasileira. Os 913 registros com instruções disponíveis possuem texto em português; os 21 sem instruções não receberam conteúdo inventado. Descrições também foram traduzidas. A tradução automática dos textos recebeu glossário e correções linguísticas pontuais, sem revisão técnica profissional; a interface informa isso e oferece consulta ao texto original. Nomes de músculos aparecem em português, mantendo a taxonomia original no banco.

UUIDs, aliases ingleses, licenças, autoria, mídia, favoritos, status e fichas publicadas são preservados. Os nomes anteriores continuam pesquisáveis. O pacote de tradução versionado usa hashes do conteúdo de origem e interrompe quando faltam traduções para um snapshot novo; reaplicação da mesma revisão foi validada como idempotente. Não se apresenta esta adaptação como base de origem brasileira nem como tradução oficial da fonte.

D1 remoto sincronizado: 866 atualizados, 68 inalterados, nenhuma nova identidade. Segunda comparação reconheceu os 934 como inalterados. Testes de dados verificam cobertura, números preservados, aliases e atribuições. Os 46 testes passaram em Node e o Chromium confirmou os nomes portugueses, o texto original expansível, os músculos traduzidos e a busca pelo nome inglês.

Os 46 testes também passaram em workerd local; Chromium validou a interface traduzida e os fluxos completos em ambos os runtimes. O build OpenNext passou, sem node:sqlite, com pacote minificado de aproximadamente 1.32 MiB gzip. A conferência dos textos inclui preservação exata de números e URLs e ausência de redução acentuada do conteúdo. O teste HTTP externo ao domínio público retornou 403 com código 1010; a causa não foi atribuída à aplicação nem à política de rede. Os fluxos autenticados foram validados apenas localmente.

Tradução publicada na Cloudflare: versão `38dff28f-0269-4366-a379-5841960d4295` em `https://pulso-fit.renatoqsousam.workers.dev`. D1 confirmou os 934 nomes e as 913 instruções disponíveis em português, sem novas identidades; conferência final reconheceu 934 registros inalterados.

## Séries Low volume e seleção direta de exercícios

Novos exercícios entram com cinco séries: um aquecimento de 10–15 repetições, dois reconhecimentos de 2–5 e dois trabalhos de 6–8. Carga permanece vazia; o descanso anterior de 60 segundos continua editável. Ao adicionar uma série avulsa, o padrão é trabalho com 6–8 repetições. Fichas já salvas não são reescritas.

Reconhecimento é persistido como série preparatória (`WARMUP`) com a identificação `Reconhecimento` no campo de técnica existente. Editor e execução mostram o nome correto, sem alteração de schema. A cópia de ajustes entre séries preserva seus tipos e identificações.

A configuração básica usa linhas compactas com tipo, repetições mínimas/máximas, carga e descanso visíveis; parâmetros avançados ficam recolhidos. O seletor de exercícios foi substituído por uma única barra de busca e resultados clicáveis imediatamente abaixo, mantendo paginação, carregamento, erros e pesquisa no catálogo completo.

TypeScript, build OpenNext e 46 testes em Node passaram. Chromium confirmou o padrão exato das cinco séries, adição/remoção de série avulsa, seleção direta, publicação e identificação de reconhecimento na execução, além dos fluxos de treino/offline/alimentação e ausência de overflow móvel e desktop.

Os 46 testes e o fluxo Chromium também passaram no workerd local. A captura móvel confirmou os campos compactos com as faixas Low volume originais.

Atualização publicada na Cloudflare: versão `9e53cde0-ac64-4b7b-99f5-fb3a088c4756` em `https://pulso-fit.renatoqsousam.workers.dev`. Publicação confirmada pelo Wrangler; pacote de aproximadamente 1.32 MiB gzip. Não houve migração ou carga de dados em produção nesta atualização.

## Edição direta das fichas existentes

A biblioteca de programas agora oferece **Editar fichas**, e as fichas próprias disponíveis para execução oferecem **Editar minhas fichas**. Na visualização de uma versão publicada, o botão antes chamado Criar revisão também passou a ser Editar fichas. Os controles respeitam a autoria e a habilitação já existentes; prescrições de terceiros não ganham permissão de edição.

Ao editar, um rascunho existente é retomado. Se não houver rascunho, a revisão editável é criada pelo fluxo já existente, mantendo a versão publicada e os registros de execução anteriores. O editor explica como salvar ou publicar as alterações para os próximos treinos. Não há mudança de schema ou de autorização da API.

Chromium em Node confirmou edição, persistência do nome da ficha, retomada pelo botão da biblioteca e pelo botão da versão publicada, manutenção de apenas duas versões e preservação do nome original na versão anterior. O restante do fluxo completo de treinos, nutrição e offline também passou, sem erros JavaScript ou overflow nos viewports verificados.

Build OpenNext/TypeScript passou, e o fluxo de navegador também foi validado no workerd local. Os cenários de retomada e preservação da versão anterior passaram em ambos os runtimes. Nenhuma alteração da API ou migração de banco foi necessária.

Publicação confirmada pela Cloudflare: versão `2c351b83-0b0b-4504-a3ff-cdcac5e74983` em `https://pulso-fit.renatoqsousam.workers.dev`.

## Ficha atual única e exclusão de plano

Conforme a preferência posterior do usuário, a interface de treinos não apresenta mais números, listas de versões ou prescrições anteriores. O botão único **Salvar ficha** salva as alterações e atualiza a prescrição corrente para os próximos treinos. A biblioteca mostra um plano atual, com editar, visualizar e excluir; rascunhos de edição existentes são retomados automaticamente. Os registros imutáveis usados por sessões anteriores são mantidos internamente para não reescrever o histórico, sem exigir gestão de versões pelo usuário.

**Excluir plano** pede confirmação e retira o plano e suas fichas da biblioteca e das atribuições disponíveis. Bloqueia novas sessões nesse plano, enquanto sessões já registradas ou iniciadas continuam acessíveis ao respectivo usuário. A remoção é registrada separadamente na tabela WorkoutProgramRemoval (migration 0005), respeitando autoria, auditoria, atomicidade e guarda de revisão. Nenhuma prescrição histórica ou log de saúde é apagado pela remoção.

A edição mantém como destino os alunos ainda autorizados da prescrição atual, em vez de exigir selecionar novamente todas as atribuições. Não há ampliação das permissões existentes.

Validação local em Node: 46 testes passaram, incluindo negação de exclusão por outro usuário e exigência de confirmação. Chromium confirmou salvar e usar a ficha atualizada, ausência de controles de versões, cancelamento e confirmação da exclusão, desaparecimento do plano da lista, bloqueio de nova sessão e preservação do acesso à sessão antiga. Migrations locais aplicadas, TypeScript/build OpenNext passaram.

Os 46 testes e o Chromium também passaram no workerd local. A migration 0005 foi aplicada no D1 remoto; a verificação de chaves estrangeiras não apontou violações e a nova tabela estava vazia, sem exclusão de planos de usuários durante a entrega.

Publicação confirmada pela Cloudflare: versão `d34cfdc7-32be-4011-9c78-b38ea7d2a85b` em `https://pulso-fit.renatoqsousam.workers.dev`.

## Continuidade da edição, busca leve e padrão 2 × 6–10

O salvamento agora usa uma única operação atômica `workouts/:id/update`. Mantém o editor, a aba selecionada e a posição de rolagem, inclusive após atualizar uma ficha já disponível para execução. Abrir a edição não cria uma cópia pendente. O servidor conserva snapshots usados por sessões anteriores e verifica revisão/último registro para rejeitar sobrescrita por abas desatualizadas.

Fichas ainda vazias podem ser salvas como progresso; não bloqueiam o salvamento das demais. Enquanto houver ficha vazia, o progresso continua editável e a prescrição anterior permanece disponível para execução. Quando todas estiverem preenchidas, o mesmo Salvar ficha atualiza a prescrição corrente. A confirmação aparece depois de carregar o estado salvo e os controles ficam bloqueados durante a gravação para impedir que uma resposta atrasada descarte novas edições.

Novos exercícios e séries avulsas usam trabalho de 6–10 repetições; cada exercício novo recebe apenas duas séries, sem aquecimento ou reconhecimento. A pedido do único autor ativo identificado no banco remoto, as prescrições atuais foram ajustadas atomicamente: 36 registros de exercícios entre a prescrição corrente e o progresso de edição, mantendo exatamente duas séries de trabalho 6–10. Cargas/descansos de trabalho foram preservados, quando existentes. Prescrições históricas, sessões e logs não foram modificados. O SQL foi validado primeiro em SQLite isolado, com guarda de revisão e backup privado ignorado pelo Git. Segunda conferência reconheceu todos os registros como já configurados.

O erro mostrado na captura comprova uma resposta HTML onde a interface esperava JSON; não determina sozinho a causa do retorno HTML no domínio público. A busca do editor passou a usar uma projeção leve de id/nome, sem instruções, mídias ou relações desnecessárias. A projeção também ocorre no SQL, sem preencher o cache de registros completos com dados parciais. Normalização de busca foi separada do importador para não inicializar o catálogo inteiro em todas as requisições. Respostas HTML/incompletas agora geram mensagem em português e permitem nova tentativa, sem expor erro de parser ou paginação antiga.

Validação em Node: 47 testes passaram, incluindo regressão de projeções escalares e preservação dos dados completos usados em alterações. Chromium validou resposta HTML 503 simulada e recuperação por nova tentativa, o padrão de duas séries, salvar/continuar, criar Lower vazia/salvar/preencher/salvar permanecendo na mesma aba, atualização da ficha já publicada, histórico, execução/offline e exclusão de plano. A resposta 503 registrada no log desse teste foi injetada deliberadamente.

Os 47 testes e o fluxo Chromium também passaram no workerd local, incluindo a falha HTML 503 deliberada e sua recuperação. O build OpenNext/TypeScript passou. A segunda execução do operador em modo de conferência confirmou `changed_exercises: 0`, sem nova gravação. Nenhuma migration de schema foi necessária nesta atualização.

Publicação confirmada pela Cloudflare: versão `7c86a37c-740b-4112-a0c3-da5efffe243e` em `https://pulso-fit.renatoqsousam.workers.dev`. Pacote minificado de aproximadamente 1.32 MiB gzip, sem node:sqlite.
