# USDA FoodData Central — SR Legacy

Snapshot oficial SR Legacy, edição abril de 2018, com **7.793 alimentos**. Baixado e importado em desenvolvimento em 15/10/2026. Nomes mantidos em inglês conforme a fonte; não foram inventadas traduções, porções ou valores.

Fonte: https://fdc.nal.usda.gov/download-datasets/

Arquivo: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip

Licença conferida em https://fdc.nal.usda.gov/api-guide, seção Licensing: os dados estão em domínio público sob CC0 1.0; não exigem permissão para uso. A USDA solicita crédito. Crédito: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. SR Legacy, April 2018. fdc.nal.usda.gov.

A planilha oficial `Download & API Field Descriptions-2019-10-11-16-22.xlsx`, incluída no ZIP, define a quantidade de nutrientes por **100 g**, na unidade da tabela de nutrientes. Esta edição é final e não será atualizada pela USDA; não deve ser apresentada como levantamento nutricional de 2026.

`manifest.json` registra URL, versão, evidência de licença/referência e SHA-256 do ZIP/CSVs observados no download oficial via HTTPS. Esses hashes fixam a reprodução do snapshot; não representam assinatura ou checksum publicado separadamente pela USDA.

```bash
python3 scripts/fetch-usda.py --directory /workspace/pulso-sources/usda-sr-legacy-2018-04
npm run foods:import-usda -- --directory /workspace/pulso-sources/usda-sr-legacy-2018-04 --version SR-Legacy-2018-04 --limit 10000 --reviewed-license
```

O downloader mantém TLS, verifica os hashes fixados, recusa arquivos locais divergentes e extrai somente três CSVs conhecidos, sem sobrescrever outros arquivos. CSVs ficam fora do checkout. O importador conserva proveniência e unidades, evita duplicidade por ID externo e preserva status. Valores não suportados são relatados; ausência não vira zero. Reaplicação real: zero novos registros, 7.793 atualizados, total ainda 7.793 IDs únicos. Cinco amostras distribuídas pelo arquivo foram comparadas ao CSV para nome, energia, proteína, versão e referência.
