# Pesquisa e expansão do catálogo — 15/10/2026

## Integrado no Pulso Fit

Fonte oficial: https://wger.de/api/v2/exerciseinfo/ (todas as páginas).

O retorno capturado contém 932 exercícios-base e 3.514 traduções em 22 idiomas. O aplicativo preserva também dois registros portugueses do snapshot anterior ausentes na API atual, resultando em **934 exercícios**, sem apagar referências existentes.

- 934 nomes em português: 68 da fonte e 866 adaptados à terminologia brasileira. Os nomes originais continuam pesquisáveis.
- 913 registros com instruções disponíveis em português; os demais permanecem sem instruções. As traduções automáticas são identificadas e permitem consultar o texto original, sem alegação de revisão técnica profissional.
- Músculos principais/secundários, equipamentos, categoria, aliases, UUID original e revisão, quando fornecidos.
- Referências a 383 imagens e 78 vídeos, com licença e atribuição individuais. São links externos; os arquivos não foram copiados nem incorporados automaticamente.
- Autoria, licença, fonte, idioma e créditos de traduções e mídias ficam em `provenance`.

Cada entrada utiliza Creative Commons compatível (CC0, CC-BY ou CC-BY-SA, conforme o registro). Dados ShareAlike continuam sujeitos à licença original, separada da licença da aplicação. Campos ausentes não receberam valores técnicos inventados.

SHA-256 da captura integral `wger-full.json`:
`957f3c4ef023aff216bf4ab075bd8f36ef4a22bc7f4b62fd54549a8d7712c88f`.

## Outras bases verificadas

| Fonte                                                           | Conteúdo verificado                                                                                                     | Licença/limitação                                                            | Situação                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 876 exercícios; 3.738 passos de instruções; 1.746 referências de imagens; nível, força, mecânica, equipamento, músculos | `LICENSE.md`: Unlicense; campos ausentes preservados                         | Capturada para pesquisa; não integrada |
| [wrkout](https://github.com/wrkout/exercises.json)              | Repositório público e oferta comercial mencionada no README                                                             | Números da oferta comercial não foram validados por download nem licenciados | Avaliada; não integrada                |

A revisão conferida de free-exercise-db é `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`. Há pelo menos 62 nomes ingleses exatamente iguais entre ela e o wger; por isso, somar os totais não representa exercícios únicos. Uma integração futura deve manter identidades, licenças e origem separadas, com revisão de duplicatas; não rotular dados de outra fonte como WGER.

## Reprodução e sincronização

O aplicativo utiliza o snapshot local versionado, sem dependência da API externa durante navegação. O normalizador lê a captura integral e os metadados oficiais:

```bash
python3 scripts/expand-wger-api-snapshot.py --directory /caminho/captura
python3 scripts/localize-wger-pt.py
npm run exercises:import
```

`--previous` pode apontar para o snapshot anterior; o padrão preserva o catálogo atual. O comando local faz a importação atômica fora do orçamento de consultas HTTP. A sincronização de grande volume em produção usa o operador incremental dedicado:

```bash
python3 scripts/sync-d1-exercises.py --account-id ACCOUNT --database-id DATABASE --dry-run
python3 scripts/sync-d1-exercises.py --account-id ACCOUNT --database-id DATABASE
```

Requer a credencial já configurada no ambiente. O script verifica o banco `pulso-fit`, processa somente catálogo público WGER, preserva IDs/status/favoritos e mantém checkpoint local para retomada. Não exporta nem altera contas, alimentos ou prescrições dos usuários. Cada lote é atômico; a operação completa pode ser retomada após falha. Revise o diff e as licenças ao trocar a captura.

A tradução aplicada está documentada em [PT-BR](../data/wger/pt-BR/README.md). Esta entrega adapta o catálogo internacional existente; não afirma que sua origem seja uma base brasileira.
