# Catálogo wger

Snapshot oficial ampliado em 15/10/2026: **934 exercícios**, sendo 932 da API completa e dois registros portugueses anteriores preservados. Há 68 nomes em português, 866 em inglês e 913 registros com instruções. O aplicativo indica os idiomas disponíveis.

Fonte: https://wger.de/api/v2/exerciseinfo/

A revisão é o SHA-256 da captura integral, registrado em `catalog.json`. O snapshot inclui aliases, músculos principais/secundários, equipamentos, categorias, instruções em texto e referências licenciadas a 383 imagens e 78 vídeos. HTML não é renderizado; arquivos de mídia não são copiados.

Licenças Creative Commons são verificadas por entrada, tradução e mídia. Preserve autoria, links, indicação de alterações e condições ShareAlike. Campos sem autor permanecem ausentes; não são inventadas classificações, níveis, instruções ou traduções. As licenças dos dados são independentes da licença do software.

O snapshot anterior continha 68 registros PT do commit oficial `da6405b6c066dd773f7acfff1b2cd774f1b4ecda`; seus UUIDs e referências foram preservados. Atualizações não apagam nem desativam registros ausentes, favoritos ou fichas existentes.

Consulte [pesquisa, licenças e reprodução](../../docs/BASES-EXERCICIOS.md). O comando `npm run exercises:import` sincroniza o banco local; o script `sync-d1-exercises.py` atende a atualização incremental do D1 remoto sem tocar nos dados de usuários.
