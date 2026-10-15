# Importação de alimentos

## Estado atual

Importados 7.793 alimentos oficiais USDA SR Legacy 2018-04 em desenvolvimento em 15/10/2026. A licença CC0/domínio público foi conferida no API Guide oficial; a referência por 100 g consta da planilha incluída no ZIP. Download, hashes e comandos reproduzíveis estão em [data/usda/README.md](../data/usda/README.md). Nomes originais em inglês; não há tradução inventada nem alegação de atualização dos dados de 2018. TACO/TBCA continuam fora do catálogo sem revisão própria das condições de redistribuição comercial.

Usuários independentes e nutricionistas verificados podem cadastrar dados de rótulos reais, medidas próprias e receitas. São privados, identificados como dados informados/estimados, com procedência obrigatória; não passam a integrar o catálogo global.

## Importador USDA

Obtenha o CSV **oficial** em https://fdc.nal.usda.gov/download-datasets/ e confira os termos oficiais/versionamento. Extraia `food.csv`, `nutrient.csv` e `food_nutrient.csv` no mesmo diretório. Revise os direitos de redistribuição e confirme que os dados selecionados têm referência por 100 g. O script seleciona SR Legacy/Foundation; não inclui alimentos branded nem mistura fontes para completar nutrientes.

Em ambiente do operador com conexão segura ao banco correto:

```bash
npm run foods:import-usda -- --directory /caminho/dataset-oficial --version VERSAO_OFICIAL --limit 500 --reviewed-license
```

O último parâmetro confirma a revisão do operador, não é uma verificação jurídica automática. Limite de 1 a 10.000 alimentos por execução; padrão 500. A seleção usa a ordem do arquivo. O script lê CSV em memória: extraia um arquivo compatível com a RAM do ambiente. Não há checkpoint de streaming, tradução automática nem sincronização agendada.

Upsert por USDA_FDC/ID FDC, em lotes de até 40 alimentos com commit atômico por lote e controle de concorrência. Fonte, URL, versão, idioma original, referência, unidades e precisão estimada ficam na proveniência. Valores negativos/não finitos ou nutrientes conflitantes são rejeitados na análise antes das gravações. Uma falha operacional posterior pode deixar lotes anteriores confirmados; reaplique o comando idempotente para concluir. Idempotência preserva IDs e desativações; registros ausentes não são apagados. O comando reporta importados/atualizados e nutrientes com unidades não suportadas. Reimportar pode atualizar dados globais, mas snapshots de planos/refeições anteriores permanecem inalterados.

## Unidades e ausência

Valores são Decimal, conservados como strings JSON. A referência é 100 g; alimentos próprios também podem declarar 100 ml. Medidas caseiras exigem equivalência própria e fonte. Não existe conversão de massa para volume sem equivalência conhecida.

Nutriente sem registro não vira zero. Os principais nutrientes têm identificadores claros, como protein_g e sodium_mg; demais nutrientes conservam ID da definição e unidade (`nutrient_ID_mg`, `nutrient_ID_ug`, `nutrient_ID_iu`). Energia kJ não é misturada silenciosamente com kcal. Receitas escalam ingredientes pelo rendimento final informado e conservam a origem de cada snapshot.

Após uma importação oficial, verifique amostra contra a documentação original, cobertura e unidades antes de abrir o catálogo ao público. O painel administrativo permite pesquisar e ativar/desativar somente alimentos globais, exigindo MFA e MANAGE_CATALOG; não expõe alimentos privados.
