// Configuração por site (UOL, Globo). Carregado antes de content.js e leitura.js.
// Os dois compartilham o escopo global do mundo isolado, então SITES fica visível neles.

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
    materia: /\/20\d{2}\/\d{2}\/\d{2}\/[^/]+\.g?html?$/,
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
    materia: /\.ghtml$/,  // na Globo, toda página .ghtml é matéria (notícia, post, coluna)
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

  return [uol, globo];
})();

// Devolve o site cujo host casa com o endereço atual, ou null
function detectarSite() {
  for (var i = 0; i < SITES.length; i++) {
    if (SITES[i].host.test(location.hostname)) return SITES[i];
  }
  return null;
}
