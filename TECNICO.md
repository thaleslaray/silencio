# Silêncio — detalhes técnicos

Este arquivo explica como a extensão funciona por dentro. Se você só quer instalar e usar, leia o [README](README.md).

Extensão do Chrome (Manifest V3) que abre as matérias do **UOL**, da **Folha de S.Paulo**, do **grupo Globo** (globo.com, g1, ge, O Globo, gshow etc.) e do **New York Times** em um modo leitura, estilo Leitor do Safari: só o texto, sem scripts, anúncios, popups nem paywall, com um resumo em português feito pela IA embutida do Chrome.

## Sites cobertos

| Site | Hosts | Como marca as matérias |
| --- | --- | --- |
| UOL | `*.uol.com.br` | `.htm`, `.ghtm`, `.html` |
| Folha de S.Paulo | `*.folha.uol.com.br` | `.shtml` |
| Globo | `*.globo.com` (g1, ge, oglobo, gshow, revistas…) | `.ghtml` |
| New York Times | `*.nytimes.com` | `.html` e blogs ao vivo em `/live/…` |

**Não há padrão de URL por site.** Uma regra só, para todos: endereço que termina em `.htm`, `.ghtm`, `.html`, `.shtml` ou `.ghtml` (ou `/live/` no NYT) é tratado como possível matéria. Quem decide se é matéria mesmo é o **conteúdo** da página (`temMateria` em `sites.js`): se não houver corpo de texto, a página volta sozinha para a versão original, com scripts. Homes e páginas de seção não terminam assim e ficam de fora.

A configuração de cada site (seletores de título, chapéu, autor, data, corpo e imagens; contagem de anúncios) fica em `sites.js`. Para cobrir outro site, basta acrescentar um objeto a `SITES` e o domínio em `manifest.json` e `rules.json`.

## O que faz

A extensão trabalha em três camadas:

1. **Modo leitura nas matérias** (`rules.json` + `sites.js` + `content.js` + `leitura.js` + `leitura.css`). Nas páginas com cara de matéria (ver "Sites cobertos"), uma regra de rede acrescenta o cabeçalho `Content-Security-Policy: script-src 'none'`, e o Chrome recusa todo script da página, inline e externo (os scripts da extensão continuam rodando). Em seguida o `leitura.js` troca a página por uma versão limpa, só com título, autor, data, imagens e texto, usando o `leitura.css`. Para ver a página original, acrescente `?original=1` na URL ou clique em **Ver original** (na barra de cima ou no fim da matéria). A barra também tem os botões **A−** e **A+** para o tamanho do texto, que fica salvo. Páginas com nome de arquivo mas sem corpo de matéria (galeria, vídeo, seção) voltam sozinhas para a versão original.
2. **Bloqueio de domínios de anúncio e rastreio** (`rules.json`) em todo o UOL (Folha inclusa), na Globo e no NYT: Google Ads e Analytics, Criteo, Taboola, Outbrain, Permutive, Chartbeat, `ads-library.globo.com`, Pendo, entre outros. Os domínios `glbimg.com` (imagens e CSS da Globo) não são bloqueados. Nas páginas que não são matéria, nada muda além desse bloqueio e do CSS que esconde espaços de anúncio.
3. **Paywall e DOM**, como antes. A rede bloqueia o script do Piano Composer (`cdn.tinypass.com/api/tinypass.min.js`), o Offerwall do Google (`offerwall.js`), o script de paywall do O Globo (`static.infoglobo.com.br/paywall/`), o da Folha (`paywall.folha.uol.com.br/wall.js`), as chamadas ao `experience.tinypass.com` e o iframe de checkout (`buy.tinypass.com/checkout/template/`). Caso algum elemento escape (`div.tp-modal`, `div.tp-backdrop`, `div.barreiraJornada` do O Globo, `.newsletter-g1-modal__overlay` do g1), o `content.js` + `content.css` o escondem e removem do DOM e desfazem a trava de rolagem do `body`. Um observador de mutações monitora a página por 60 segundos e, depois, uma verificação a cada 2 segundos roda por mais 2 minutos.

Dois detalhes de robustez: (a) os portais registram **Service Workers** (`sw.js`) que entregam a página sem passar pela regra de rede, e aí o cabeçalho de segurança não entraria; a regra de rede não consegue barrar o registro (o Chrome busca o script do worker por fora), então `sem-sw.js` roda na própria página (world `MAIN`, `document_start`), nega `navigator.serviceWorker.register` e remove os workers já registrados naquela origem; o service worker da extensão também apaga os da origem ao abrir uma aba do site. (b) Se mesmo assim algum script rodar depois da troca da página, a leitura insere o mesmo cabeçalho por `<meta>`, remove o que for injetado no `body` e esconde por CSS tudo que não for dela.

O texto da matéria já vem completo no HTML do servidor (no NYT, só o trecho liberado a quem não assina); a extensão só tira o que está em volta.

## Resumo com a IA do Chrome

No modo leitura, à esquerda do texto (acima dele, em telas estreitas), aparece um quadro **Resumo** com 3 a 5 tópicos da matéria, sempre em português do Brasil, gerados pela IA embutida do Chrome (Gemini Nano, API `LanguageModel`).

- **Roda no seu computador.** O texto da matéria é processado localmente pelo modelo do Chrome; nada é enviado para fora. O resumo fica guardado só durante a sessão do navegador (`chrome.storage.session`), para não gerar de novo ao recarregar.
- **Rápido porque a sessão de IA é permanente.** Criar uma sessão do modelo dentro de uma página recém-aberta leva de 16 a 30 segundos no Chrome (medido no Chrome 156). Por isso a extensão mantém **uma sessão base viva num documento offscreen** (`ia.html` + `ia.js`), aquecida na instalação, ao abrir o Chrome e quando uma matéria começa a carregar; cada resumo só clona essa sessão. Os tópicos chegam em streaming, pelo service worker: o primeiro em menos de 1 segundo, o resumo inteiro em 2 a 4 segundos. Se o documento offscreen não tiver acesso à IA, o resumo roda na própria página (world `MAIN`), injetado pelo service worker.
- **Idioma declarado.** A API `LanguageModel` pede um idioma de saída e só aceita `de`, `en`, `es`, `fr` e `ja`. A extensão declara `es` (o mais próximo do português) em `availability()` e `create()` e pede português no prompt; testado no Chrome 156, a resposta sai em português com matéria em pt e em en.
- **Sempre em português.** O pedido reforça o idioma no começo e no fim do prompt; se a resposta vier em outro idioma, a extensão manda reescrever em português na mesma sessão ("Traduzindo…"). O rodapé do quadro mostra os tempos medidos.
- **Requisitos** (os do próprio Chrome para a IA embutida): Chrome 138 ou mais novo; macOS 13+, Windows 10+ ou Linux; pelo menos 22 GB livres no disco do perfil do Chrome; 16 GB de RAM, ou uma GPU com mais de 4 GB de memória de vídeo.
- **Baixa o modelo uma vez.** Se o modelo ainda não estiver no computador, o quadro mostra o botão **Baixar e resumir**. O download (alguns minutos) só começa quando você clica; depois disso o resumo é gerado sozinho em cada matéria.
- **Pode errar.** É um modelo pequeno: confira detalhes (nomes, números, datas) no texto. Só os primeiros 6.000 caracteres da matéria são considerados, e matérias muito curtas (menos de 400 caracteres) não são resumidas. Se a IA não estiver disponível, o quadro avisa o motivo.

## Contador no ícone

O ícone da extensão na barra do Chrome mostra o que foi removido:

- **Cinza**: nada foi removido nesta aba.
- **Verde com número**: quantos anúncios e popups foram removidos nesta aba. Nas matérias, conta os espaços de anúncio da página original mais o paywall, quando a matéria é exclusiva para assinantes (na Globo: `glb-ad` e contêineres do tag manager, mais o script de paywall). Fora das matérias, contam o paywall do Piano, o Offerwall do Google e o script de paywall da Globo; as requisições secundárias (`experience.tinypass.com`, iframe de checkout e domínios de anúncio) não entram na conta.
- **Passar o mouse** sobre o ícone mostra o total acumulado desde a instalação.

A contagem da aba volta a zero quando você navega para outra página. O contador de regras de rede só funciona com a extensão instalada sem compactação (modo desenvolvedor).

## Homes

- **UOL** (`www.uol.com.br`): recebe a trava `script-src 'none'`. Manchetes, links e fotos já vêm prontos do servidor, então a home abre inteira, só que sem anúncios, vídeos automáticos, banner de cookies e rastreio. Os espaços reservados aos anúncios (`.cardAd`, `.jupiter-ads` etc.) são escondidos por CSS. O que precisa de script (player ao vivo, carregar mais notícias ao rolar, busca) não funciona; `?original=1` abre a home normal.
- **Folha** (`www1.folha.uol.com.br`): **não** recebe a trava de scripts; só o bloqueio de domínios e o CSS que esconde `.c-advertising`, o paywall flutuante e as chamadas de assinatura.
- **Globo** (`www.globo.com`): **não** recebe a trava de scripts, porque a home é montada em boa parte por script (esqueletos `post--loading` e `banner-skeleton`) e ficaria vazia. Ali só valem o bloqueio de domínios de anúncio e rastreio e o CSS que esconde `glb-ad`, `[id^="banner_"]` e afins.

### New York Times

- **Matérias** (`/AAAA/MM/DD/<secao>/<slug>.html`) e **blogs ao vivo** (`/live/AAAA/MM/DD/<secao>/<slug>`) abrem em modo leitura, com a trava de scripts. Nos blogs ao vivo, cada post vira um trecho com título, autor e hora, separado por uma linha.
- Sem assinatura, o NYT só entrega o **início** das matérias. A leitura mostra o que veio e acrescenta no fim um aviso de que o restante só aparece na página original, com login. Nos blogs ao vivo, um aviso diz que as atualizações novas só aparecem na página original, porque chegam por script.
- Gráficos interativos e espaços de anúncio do corpo da matéria são ignorados.
- A **home** (`www.nytimes.com`) e as páginas de seção **não** recebem a trava de scripts (não foi possível confirmar que renderizam sem script). Ali valem só o bloqueio de domínios de anúncio e rastreio (Datadog, Geoedge, media.net etc.) e o CSS que esconde anúncios, o banner de cookies e a parede "Create a free account". `static01.nyt.com` (imagens e CSS) não é bloqueado.

## Aviso

Nas matérias, como nenhum script roda, **vídeos embutidos, comentários e login não funcionam** no modo leitura. Use **Ver original** (ou `?original=1`) para usar esses recursos. Com o script do Piano bloqueado, o login pelo Piano ID (UOL) ou pelo Globo ID também pode não funcionar fora do modo leitura; para isso, desative a extensão temporariamente em `chrome://extensions`.
