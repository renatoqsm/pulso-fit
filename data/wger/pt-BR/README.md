# Tradução PT-BR — revisão 1

Os 866 nomes anteriormente marcados como inglês foram adaptados à terminologia usada no Brasil (`names.json`). Os 68 nomes portugueses anteriores permanecem intactos. Nomes próprios e termos de uso corrente, como kettlebell, TRX, leg press e nomes de métodos, são preservados quando apropriado.

`content.json` contém 798 textos distintos de descrição/instruções, identificados pelo SHA-256 exato do texto de origem. Descrição e instruções podem reutilizar o mesmo texto. Tradução automática local com Argos/OPUS inglês-português 1.0, CTranslate2 4.8.3 em CPU e SentencePiece 0.2.2, seguida de substituições de terminologia e correções linguísticas pontuais. A tradução não recebeu revisão técnica de um profissional de educação física. O aplicativo informa essa condição e permite consultar o original.

Modelo usado, sem redistribuir os pesos no aplicativo:
https://github.com/uav4geo/LibreTranslate-Models/blob/3d5ca0a2c3c302287339b2944329f767ac1673f4/en_pt.argosmodel

SHA-256 do pacote: `88ef6663dea47575fd956399253ff7e8f9000c5e1c1d1240b4c56e13584adf28`.

O snapshot localizado preserva UUIDs, taxonomias, aliases, mídias, fontes, licenças e autoria. O nome anterior entra nos aliases para busca em ambos os idiomas. Os textos anteriores ficam em `provenance.localization.original`; não são apresentados como tradução oficial do wger. Alterações são identificadas na procedência, sem atribuir à fonte o texto adaptado. A tradução/adaptação de cada registro está sujeita à mesma licença CC0/CC-BY/CC-BY-SA indicada no registro original, incluindo atribuição e ShareAlike quando aplicável.

Para reaplicar ao snapshot integral em inglês/português:

```bash
python3 scripts/localize-wger-pt.py
npm run exercises:import
```

O comando é idempotente para esta revisão e interrompe em caso de tradução ausente ou texto de origem diferente; não reutiliza traduções de instruções alteradas. Após atualizar a API com `expand-wger-api-snapshot.py`, reaplique este passo e providencie traduções para registros novos antes de publicar. Arquivos vazios da fonte permanecem vazios: os 21 exercícios sem instruções não receberam conteúdo inventado.

Validações: identidade única, cobertura dos 934 nomes em português, créditos mantidos, original pesquisável e números preservados em todos os textos traduzidos. Isso não comprova equivalência técnica integral de uma tradução automática nem corrige imprecisões que já existam na fonte.
