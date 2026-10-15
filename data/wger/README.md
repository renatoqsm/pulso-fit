# Catálogo wger — snapshot em português

Fonte oficial: https://github.com/wger-project/wger
Commit: `da6405b6c066dd773f7acfff1b2cd774f1b4ecda`
Coletado em 14/10/2026. 68 exercícios com traduções em português, mais nomes alternativos em inglês quando licenciados. São dados de catálogo de produção (`exercise-base-data.json` e `translations.json`), não fixtures `test-*`.

## Licenças e atribuição
O README oficial distingue código AGPL-3.0-or-later e dados Creative Commons por entrada. Este projeto não incorpora código do servidor wger. O snapshot seleciona somente entradas com licenças CC0, CC-BY 4, CC-BY-SA 3 ou CC-BY-SA 4 conhecidas na fixture `core/fixtures/licenses.json`; autores, URLs, licença, identificação do registro-base e de cada tradução utilizada ficam em `provenance`. Nesta versão os registros PT são CC0 ou CC-BY-SA 3/4.

As licenças permitem uso comercial, com suas condições. Preserve atribuição, links de licença e indicação de alterações. Registros/adaptações CC-BY-SA devem continuar distribuídos sob licença compatível com a fonte, sem imposição de restrições adicionais a esses dados. O snapshot não recebe licença proprietária da aplicação. Ver os links de licença em cada registro; a licença do software e as licenças dos dados são separadas. Uma atualização requer reavaliar as licenças presentes.

Alguns campos de autoria estão vazios no snapshot oficial. São preservados como ausentes e a interface indica essa limitação; a fonte e as licenças continuam atribuídas, sem inventar criadores.

Alterações: seleção de idioma, nomes alternativos e normalização do formato. Instruções mantidas a partir de `description_source`; HTML não é renderizado. Não foram criadas novas instruções, mídias, classificações técnicas ou níveis. Imagens/vídeos não foram importados; exigem avaliação individual de licença antes de uso. Grupos musculares mantêm nomes científicos da fonte; rótulos de equipamentos são traduzidos somente na interface.

## Reprodução/atualização
Faça um checkout do repositório oficial fora do projeto, obtenha o commit desejado e execute:

```bash
python3 scripts/refresh-wger-snapshot.py --source /caminho/wger --revision COMMIT_COMPLETO
npm run exercises:import
```

Use o SHA acima para reproduzir esta versão. Revise diff, licenças e atribuições antes de atualizar para outro commit. O banco possui chave única `(source, externalId)` usando o UUID original, checksum de conteúdo e histórico de importação. Atualizações preservam IDs, favoritos e status administrativo; registros ausentes no snapshot não são apagados nem desativados automaticamente.

A API `https://wger.de/api/v2/exerciseinfo/` usa paginação e traduções aninhadas, conforme serializer oficial. Sua sincronização online não foi implementada/validada nesta etapa: o acesso a wger.de ficou bloqueado no ambiente. O snapshot torna o catálogo utilizável sem chamadas externas em runtime.
