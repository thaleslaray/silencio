// Configuração por site (UOL, Globo, NYT). Carregado antes de content.js e leitura.js.
// Os dois compartilham o escopo global do mundo isolado, então SITES fica visível neles.

// Qualquer página com cara de arquivo de matéria (.htm, .ghtm, .html, .shtml, .ghtml) ou /live/ do NYT.
// Não descreve URL por site: quem decide se é matéria mesmo é temMateria(), olhando o conteúdo.
var MATERIA_GENERICA = /(\.[gs]?html?$)|(^\/live\/.+)/;

var SITES = (function () {
  // Os blocos do corpo são montados com o util que o leitura.js passa pra extrair()
  function ehAds(el) {
    var c = el.getAttribute && el.getAttribute('class');
    return !!c && c.indexOf('ads') !== -1;
  }

  // ---------- UOL ----------
  var uol = {
    nome: 'UOL',
    home: 'https://www.uol.com.br/',  // link 'Início' da barra do modo leitura
    host: /(^|\.)uol\.com\.br$/,
    materia: MATERIA_GENERICA,
    temMateria: function (doc) {
      return !!doc.querySelector('article .jupiter-paragraph-fragment p');
    },
    meta: {
      chapeu: '.solar-kicker',
      titulo: 'h1.title',
      subtitulo: '',
      autor: '.solar-author-name',
      origem: '.solar-author-origin',
      data: 'time.date'
    },
    // Espaços de anúncio + 1 se a página tinha a tag de paywall
    contarRemovidos: function (doc) {
      var n = doc.querySelectorAll('.jupiter-ads').length;
      var scripts = doc.querySelectorAll('script:not([src])');
      for (var i = 0; i < scripts.length; i++) {
        if (/\b82370\b/.test(scripts[i].textContent || '')) {
          n += 1;
          break;
        }
      }
      return n;
    },
    // Blocos de texto e figuras, em ordem de documento
    extrair: function (doc, util) {
      var blocos = [];
      var itens = doc.querySelectorAll('article .jupiter-paragraph-fragment, article figure.solar-photo-content');
      for (var i = 0; i < itens.length; i++) {
        var item = itens[i];
        if (item.closest('aside')) continue;

        if (item.tagName.toLowerCase() === 'figure') {
          if (item.closest('.jupiter-paragraph-fragment')) continue;
          var img = item.querySelector('img');
          var srcset = [];
          var fontes = item.querySelectorAll('source[srcset]');
          for (var s = 0; s < fontes.length; s++) srcset.push(fontes[s].getAttribute('srcset') || '');
          var src = util.melhorImagemSrcset(srcset.join(', ')) || (img ? (img.getAttribute('src') || '') : '');
          src = util.urlSegura(src);
          if (!src) continue;
          var cap = item.querySelector('figcaption');
          blocos.push({
            tipo: 'figura',
            src: src,
            alt: img ? (img.getAttribute('alt') || '') : '',
            legenda: cap ? (cap.textContent || '').replace(/\s+/g, ' ').trim() : '',
            credito: (item.getAttribute('credit') || '').trim()
          });
          continue;
        }

        var filhos = item.children;
        for (var k = 0; k < filhos.length; k++) {
          var f = filhos[k];
          var tag = f.tagName.toLowerCase();
          if (ehAds(f)) continue;
          if (tag === 'p' || tag === 'h2' || tag === 'h3' || tag === 'blockquote') {
            if (util.temTexto(f)) blocos.push({ tipo: tag, html: util.sanitizar(f) });
          } else if (tag === 'ul' || tag === 'ol') {
            var lista = util.lista(f);
            if (lista) blocos.push(lista);
          }
        }
      }
      return blocos;
    }
  };

  // ---------- Globo (globo.com, g1, ge, oglobo, gshow…) ----------
  var globo = {
    nome: 'Globo',
    home: 'https://www.globo.com/',  // link 'Início' da barra do modo leitura
    host: /(^|\.)globo\.com$/,
    materia: MATERIA_GENERICA,
    temMateria: function (doc) {
      return !!doc.querySelector('article .content-text__container');
    },
    meta: {
      chapeu: '.header-title-content',
      titulo: 'h1.content-head__title',
      subtitulo: 'h2.content-head__subtitle',
      autor: '.content-publication-data__from',
      origem: '',
      data: 'time[datetime]'
    },
    // Anúncios distintos (glb-ad + contêineres do tag manager) + 1 se havia script de paywall
    contarRemovidos: function (doc) {
      var vistos = new Set();
      doc.querySelectorAll('glb-ad, .tag-manager-publicidade-container').forEach(function (el) {
        vistos.add(el);
      });
      var n = vistos.size;
      if (doc.querySelector('script[src*="/paywall/"]')) n += 1;
      return n;
    },
    // Percorre os blocos .mc-column do artigo na ordem do documento
    extrair: function (doc, util) {
      var blocos = [];

      // Monta um bloco de figura a partir de um <figure> da Globo (amp-img com srcset ou img com src)
      function figuraDe(fig) {
        if (!fig) return null;
        var amp = fig.querySelector('amp-img[srcset]') || fig.querySelector('img[srcset]');
        var im = fig.querySelector('img[src]') || fig.querySelector('amp-img[src]');
        var src = amp ? util.melhorImagemSrcset(amp.getAttribute('srcset') || '') : '';
        if (!src && im) src = im.getAttribute('src') || '';
        src = util.urlSegura(src);
        if (!src) return null;
        var ref = amp || im;
        var cap = fig.querySelector('figcaption');
        var legenda = cap ? (cap.textContent || '').replace(/\s+/g, ' ').trim().replace(/^\d+ de \d+\s*/, '') : '';
        return { tipo: 'figura', src: src, alt: ref ? (ref.getAttribute('alt') || '') : '', legenda: legenda, credito: '' };
      }

      // Foto de capa: no O Globo fica fora do <article>, em section.content--header
      var capa = figuraDe(doc.querySelector('.content--header figure.content-featured-figure, figure.content-featured-figure'));
      if (capa) blocos.push(capa);

      var colunas = doc.querySelectorAll('article .mc-column');
      for (var i = 0; i < colunas.length; i++) {
        var col = colunas[i];
        var cl = col.classList;
        // coluna aninhada em outra: o pai já cuida
        if (col.parentElement && col.parentElement.closest('.mc-column')) continue;
        // relacionados e vídeo/podcast (precisam de script)
        if (cl.contains('mc-side-item__container')) continue;
        if (cl.contains('content-media') || col.querySelector('.cxm-block-video')) continue;

        if (!cl.contains('content-media__container')) {
          // texto, intertítulo, lista ou citação; uma coluna pode misturar vários (ex.: lista + h2 dentro de content-text)
          var partes = col.querySelectorAll('p.content-text__container, h2, h3, ul, ol, blockquote');
          for (var q = 0; q < partes.length; q++) {
            var el = partes[q];
            var tag = el.tagName.toLowerCase();
            // itens já cobertos por uma lista ou citação ancestral
            var pai = el.parentElement && el.parentElement.closest('ul, ol, blockquote');
            if (pai && col.contains(pai)) continue;
            if (tag === 'ul' || tag === 'ol') {
              var lista = util.lista(el);
              if (lista) blocos.push(lista);
            } else if (util.temTexto(el)) {
              blocos.push({ tipo: tag === 'p' ? 'p' : tag, html: util.sanitizar(el) });
            }
          }
        } else if (cl.contains('content-media__container')) {
          var figura = figuraDe(col.querySelector('figure.content-media-figure') || col.querySelector('figure'));
          if (figura) blocos.push(figura);
        }
      }
      return blocos;
    }
  };

  // ---------- New York Times ----------
  var SEL_PAYWALL_NYT = '[data-testid^="Optimistic-"], [data-testid*="Gateway"]:not([data-testid="vi-gateway-container"]), #gateway-content';

  var nyt = {
    nome: 'NYT',
    home: 'https://www.nytimes.com/',  // link 'Início' da barra do modo leitura
    host: /(^|\.)nytimes\.com$/,
    // matéria: /AAAA/MM/DD/<secao>/<slug>.html; blog ao vivo: /live/AAAA/MM/DD/<secao>/<slug>
    materia: MATERIA_GENERICA,
    temMateria: function (doc) {
      return !!doc.querySelector('section[name="articleBody"] p, [data-testid="live-blog-post"], [data-testid="reporter-update"]');
    },
    meta: {
      chapeu: '',
      titulo: 'h1[data-testid="headline"]',
      subtitulo: 'p#article-summary, header[data-testid="FeedLede"] p',
      autor: 'article#story [data-testid="byline"], article#story [class*="byline"]',  // só em matéria; no blog ao vivo cada post tem o seu
      origem: '',
      data: 'time[datetime], time[dateTime]'
    },
    // Anúncios distintos (StandardAd + dfp-ad) + 1 se o NYT cortou a matéria (paywall/gateway)
    contarRemovidos: function (doc) {
      var vistos = new Set();
      doc.querySelectorAll('[data-testid="StandardAd"], [id^="dfp-ad"]').forEach(function (el) {
        vistos.add(el);
      });
      var n = vistos.size;
      if (doc.querySelector(SEL_PAYWALL_NYT)) n += 1;
      return n;
    },
    extrair: function (doc, util) {
      var blocos = [];

      // Monta um bloco de figura a partir de um <figure> do NYT (img com srcset "URL 600w, URL 1024w, …")
      function figuraDe(fig, seletorLegenda) {
        if (!fig) return null;
        var img = fig.querySelector('img[srcset]') || fig.querySelector('img[src]') || fig.querySelector('img');
        if (!img) return null;
        var src = util.melhorImagemSrcset(img.getAttribute('srcset') || '') || img.getAttribute('src') || '';
        src = util.urlSegura(src);
        if (!src) return null;
        var cap = fig.querySelector(seletorLegenda) || fig.querySelector('figcaption');
        return {
          tipo: 'figura',
          src: src,
          alt: img.getAttribute('alt') || '',
          legenda: cap ? (cap.textContent || '').replace(/\s+/g, ' ').trim() : '',
          credito: ''
        };
      }

      // ---- Blog ao vivo ----
      if (doc.querySelector('[data-testid="live-blog-content"]')) {
        var posts = doc.querySelectorAll('[data-testid="live-blog-post"], [data-testid="reporter-update"]');
        var primeiro = true;
        for (var i = 0; i < posts.length; i++) {
          var post = posts[i];
          // post aninhado em outro: o pai já cuida
          if (post.parentElement && post.parentElement.closest('[data-testid="live-blog-post"], [data-testid="reporter-update"]')) continue;

          var corpoPost = [];
          var titulo = post.querySelector('h3');
          if (titulo && util.temTexto(titulo)) corpoPost.push({ tipo: 'h2', html: util.sanitizar(titulo) });

          // byline do NYT mistura avatar, hora, nome e cargo num bloco só; pega nome e cargo separados
          var byl = post.querySelector('[data-testid="live-blog-byline"]');
          var nomeEl = byl ? (byl.querySelector('a.last-byline') || byl.querySelector('p')) : null;
          var cargoEl = byl ? byl.querySelector('[data-testid="lb-byline-tagline"]') : null;
          var nomeTxt = nomeEl ? (nomeEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
          var cargoTxt = cargoEl ? (cargoEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
          if (!nomeTxt && byl) nomeTxt = (byl.textContent || '').replace(/\s+/g, ' ').trim();
          var bylTxt = nomeTxt + (cargoTxt && cargoTxt !== nomeTxt ? ', ' + cargoTxt : '');
          var hora = post.querySelector('time[datetime], time[dateTime]');
          var horaTxt = hora ? (hora.textContent || '').replace(/\s+/g, ' ').trim() : '';
          var metaTxt = [bylTxt, horaTxt].filter(Boolean).join(' · ');
          if (metaTxt) {
            var tmp = doc.createElement('span');
            tmp.textContent = metaTxt;
            corpoPost.push({ tipo: 'meta', html: util.sanitizar(tmp) });
          }

          var partes = post.querySelectorAll('p.live-blog-post-content, figure');
          for (var q = 0; q < partes.length; q++) {
            var el = partes[q];
            if (el.tagName.toLowerCase() === 'figure') {
              if (el.parentElement && el.parentElement.closest('figure')) continue;
              var fig = figuraDe(el, 'figcaption[data-testid="photoviewer-children-caption"]');
              if (fig) corpoPost.push(fig);
            } else {
              if (el.closest('figure')) continue;
              if (util.temTexto(el)) corpoPost.push({ tipo: 'p', html: util.sanitizar(el) });
            }
          }

          if (!corpoPost.length) continue;
          if (!primeiro) blocos.push({ tipo: 'sep' });
          primeiro = false;
          for (var c = 0; c < corpoPost.length; c++) blocos.push(corpoPost[c]);
        }
        blocos.push({
          tipo: 'nota',
          texto: 'Este blog atualiza ao vivo por scripts. Aqui estão os posts carregados até agora; a página original mostra as atualizações novas.'
        });
        return blocos;
      }

      // ---- Matéria ----
      var figAbertura = doc.querySelector('article#story header figure');
      if (!figAbertura) {
        // sem header: primeira figura do artigo que não esteja dentro do corpo
        var todas = doc.querySelectorAll('article#story figure');
        for (var z = 0; z < todas.length; z++) {
          if (!todas[z].closest('section[name="articleBody"]')) { figAbertura = todas[z]; break; }
        }
      }
      var abertura = figuraDe(figAbertura, 'figcaption[data-testid="photoviewer-children-ImageCaption"]');
      if (abertura) blocos.push(abertura);

      var corpo = doc.querySelector('section[name="articleBody"]');
      if (corpo) {
        var colunas = corpo.children;
        for (var k = 0; k < colunas.length; k++) {
          var col = colunas[k];
          var tid = col.getAttribute('data-testid') || '';
          if (tid.indexOf('companionColumn-') !== 0) continue;  // Dropzone (anúncio), InteractiveBlock, Optimistic/Gateway: ignora
          var itens = col.querySelectorAll('p, h2, h3, ul, ol, blockquote, figure');
          for (var j = 0; j < itens.length; j++) {
            var it = itens[j];
            var tag = it.tagName.toLowerCase();
            // itens já cobertos por uma lista, citação ou figura ancestral
            var pai = it.parentElement && it.parentElement.closest('ul, ol, blockquote, figure');
            if (pai && col.contains(pai)) continue;
            if (tag === 'figure') {
              var f = figuraDe(it, 'figcaption[data-testid="photoviewer-children-ImageCaption"]');
              if (f) blocos.push(f);
            } else if (tag === 'ul' || tag === 'ol') {
              var lista = util.lista(it);
              if (lista) blocos.push(lista);
            } else if (util.temTexto(it)) {
              blocos.push({ tipo: tag, html: util.sanitizar(it) });
            }
          }
        }
      }

      // O NYT só entrega o início da matéria sem assinatura
      if (doc.querySelector(SEL_PAYWALL_NYT)) {
        blocos.push({
          tipo: 'nota',
          texto: 'O New York Times só entrega o início desta matéria sem assinatura. O restante aparece na página original, com login.'
        });
      }
      return blocos;
    }
  };

  // ---------- Folha de S.Paulo (www1.folha.uol.com.br) ----------
  // Fica ANTES do UOL na lista: o host da Folha também casa a regex do UOL.
  var folha = {
    nome: 'Folha',
    home: 'https://www1.folha.uol.com.br/',
    host: /(^|\.)folha\.uol\.com\.br$/,
    materia: MATERIA_GENERICA,
    temMateria: function (doc) {
      return !!doc.querySelector('.c-news__body p');
    },
    meta: {
      chapeu: '.c-content-head .c-kicker',
      titulo: 'h1.c-content-head__title',
      subtitulo: '',            // os subtítulos são uma lista; viram o primeiro bloco em extrair()
      autor: '.c-signature__author',
      origem: '',
      data: 'time.c-headline__dateline, time[itemprop="datePublished"]'
    },
    contarRemovidos: function (doc) {
      var n = doc.querySelectorAll('.c-advertising').length;
      if (doc.querySelector('script[src*="paywall.folha.uol.com.br"]')) n += 1;
      return n;
    },
    extrair: function (doc, util) {
      var blocos = [];

      // subtítulos (linha fina em lista) como primeiro bloco
      var sub = doc.querySelector('.c-content-head__subtitle--list');
      if (sub) {
        var l = util.lista(sub);
        if (l) blocos.push(l);
      }

      // imagens da Folha carregam preguiçosamente: a URL está em data-srcset / data-src
      function figuraDe(fig) {
        if (!fig) return null;
        var img = fig.querySelector('img');
        if (!img) return null;
        var src = util.melhorImagemSrcset(img.getAttribute('data-srcset') || img.getAttribute('srcset') || '');
        if (!src) src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        src = util.urlSegura(src);
        if (!src) return null;
        var cap = fig.querySelector('figcaption');
        return {
          tipo: 'figura',
          src: src,
          alt: img.getAttribute('alt') || '',
          legenda: cap ? (cap.textContent || '').replace(/\s+/g, ' ').trim() : '',
          credito: ''
        };
      }

      var corpo = doc.querySelector('.c-news__body');
      if (!corpo) return blocos;
      var filhos = corpo.children;
      for (var i = 0; i < filhos.length; i++) {
        var el = filhos[i];
        var tag = el.tagName.toLowerCase();
        var cls = el.className || '';
        if (/c-advertising|player_dynad|widget-twitter|widget-spotify|widget-infographic|js-gallery-widget|rs_skip/.test(cls)) continue;
        if (tag === 'p' || tag === 'h2' || tag === 'h3' || tag === 'blockquote') {
          if (util.temTexto(el)) blocos.push({ tipo: tag, html: util.sanitizar(el) });
        } else if (tag === 'ul' || tag === 'ol') {
          var lst = util.lista(el);
          if (lst) blocos.push(lst);
        } else if (tag === 'figure') {
          var f1 = figuraDe(el);
          if (f1) blocos.push(f1);
        } else if (tag === 'div') {
          // contêineres de imagem (div.widget-image > figure) e wrappers sem classe
          var fig = el.querySelector('figure');
          if (fig && !/gallery/.test(cls) && !el.querySelector('.js-gallery-widget')) {
            var f2 = figuraDe(fig);
            if (f2) blocos.push(f2);
          }
        }
      }
      return blocos;
    }
  };

  return [folha, uol, globo, nyt];
})();

// Devolve o site cujo host casa com o endereço atual, ou null
function detectarSite() {
  for (var i = 0; i < SITES.length; i++) {
    if (SITES[i].host.test(location.hostname)) return SITES[i];
  }
  return null;
}
