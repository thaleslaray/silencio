// Modo leitura — Silêncio (document_end)
// Troca a página da matéria por uma versão limpa, só com o texto.
// A configuração de cada site (UOL, Globo, NYT) vem de sites.js.
(function () {
  'use strict';

  var TAM_MIN = 15;
  var TAM_MAX = 30;
  var TAM_PADRAO = 20;

  // Remove o <style> que escondia a página original
  function revelar() {
    try {
      var s = document.getElementById('leitura-oculta');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    } catch (e) {}
  }

  // Funções reutilizáveis que cada site usa em extrair()
  var util = {
    sanitizar: sanitizar,
    copiar: copiar,
    temTexto: temTexto,
    textoDe: textoDe,
    melhorImagemSrcset: melhorImagemSrcset,
    urlSegura: urlSegura,
    lista: lista
  };

  var urlOriginal = '';
  var site = null;

  function iniciar() {
  // nunca monta duas vezes (o background pode injetar este script de novo por segurança)
  if (window.__semPorteiraLeitura || document.querySelector('.leitura-barra')) return;
  window.__semPorteiraLeitura = true;

  try {
    site = detectarSite();

    // a) só age em matéria de um site conhecido e fora do modo "original"
    if (!site || !site.materia.test(location.pathname) || location.search.indexOf('original=1') !== -1) {
      revelar();
      return;
    }

    // b) endereço da página original (sem leitura)
    urlOriginal = location.href.replace(/#.*$/, '') + (location.search ? '&' : '?') + 'original=1';

    // c) página com data na URL mas sem matéria (galeria, vídeo...)
    if (!site.temMateria(document)) {
      revelar();
      adicionarCss();
      var aviso = document.createElement('div');
      aviso.className = 'leitura-aviso';
      aviso.appendChild(document.createTextNode('Esta página precisa de scripts pra funcionar. '));
      var link = document.createElement('a');
      link.href = urlOriginal;
      link.textContent = 'Abrir a página original';
      aviso.appendChild(link);
      if (document.body) document.body.insertBefore(aviso, document.body.firstChild);
      return;
    }

    // d) extrai tudo ANTES de apagar qualquer coisa
    var m = site.meta;
    var chapeu = m.chapeu ? textoDe(document, m.chapeu) : '';
    var titulo = (m.titulo ? textoDe(document, m.titulo) : '') || textoDe(document, 'h1') || (document.title || '').trim();
    var subtitulo = m.subtitulo ? textoDe(document, m.subtitulo) : '';
    var autor = m.autor ? textoDe(document, m.autor) : '';
    var origem = m.origem ? textoDe(document, m.origem) : '';
    var elData = m.data ? document.querySelector(m.data) : null;
    var dataTexto = elData ? (elData.textContent || '').replace(/\s+/g, ' ').trim() : '';
    var dataIso = elData ? (elData.getAttribute('datetime') || '') : '';

    var removidos = site.contarRemovidos(document);
    var blocos = site.extrair(document, util);

    // e) reconstrói o documento
    montarPagina({
      chapeu: chapeu,
      titulo: titulo,
      subtitulo: subtitulo,
      autor: autor,
      origem: origem,
      dataTexto: dataTexto,
      dataIso: dataIso,
      blocos: blocos,
      removidos: removidos
    });

    // g) final
    try { window.scrollTo(0, 0); } catch (e) {}
    try {
      var p = chrome.runtime.sendMessage({ tipo: 'leitura', removidos: removidos });
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  } catch (e) {
    // h) nunca deixar o usuário numa página em branco
    try { location.replace(urlOriginal || (location.href + (location.search ? '&' : '?') + 'original=1')); } catch (e2) {}
  }
  }

  // Em pré-renderização (speculation rules da home), espera a página ser ativada; senão roda agora
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', iniciar, { once: true });
  } else {
    iniciar();
  }

  // Remove do body tudo que não for da leitura, e <script> novos do head, por 2 minutos
  function vigiarIntrusos() {
    function ehNosso(el) {
      return el.nodeType === 1 && /(^|\s)leitura-(barra|coluna|aviso)(\s|$)/.test(el.className || '');
    }
    function limparIntrusos() {
      try {
        var filhos = Array.prototype.slice.call(document.body.children);
        for (var i = 0; i < filhos.length; i++) if (!ehNosso(filhos[i])) filhos[i].remove();
        var scripts = document.head.querySelectorAll('script');
        for (var j = 0; j < scripts.length; j++) scripts[j].remove();
        if (document.body.className) document.body.removeAttribute('class');
        if (document.body.getAttribute('style')) document.body.removeAttribute('style');
      } catch (e) {}
    }
    try {
      var obs = new MutationObserver(limparIntrusos);
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 120000);
      limparIntrusos();
    } catch (e) {}
  }

  // ---------- funções auxiliares ----------

  function textoDe(doc, seletor) {
    var el = doc.querySelector(seletor);
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function temClasseAds(el) {
    var c = el.getAttribute && el.getAttribute('class');
    return !!c && c.indexOf('ads') !== -1;
  }

  // Injeta o CSS do modo leitura (arquivo da extensão)
  function adicionarCss() {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = chrome.runtime.getURL('leitura.css');
    // só mostra a página quando o CSS carregou (ou falhou, ou passou 1,5 s)
    l.addEventListener('load', revelar);
    l.addEventListener('error', revelar);
    setTimeout(revelar, 1500);
    (document.head || document.documentElement).appendChild(l);
    return l;
  }

  // Copia só texto e tags seguras; o resto vira o seu conteúdo
  function sanitizar(el) {
    var raiz = document.createElement('div');
    copiar(el, raiz);
    return raiz.innerHTML;
  }

  function copiar(origem, destino) {
    var nos = origem.childNodes;
    for (var i = 0; i < nos.length; i++) {
      var no = nos[i];
      if (no.nodeType === 3) {
        destino.appendChild(document.createTextNode(no.nodeValue));
        continue;
      }
      if (no.nodeType !== 1) continue;
      var tag = no.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'button') continue;
      if (temClasseAds(no)) continue;

      if (tag === 'br') {
        destino.appendChild(document.createElement('br'));
      } else if (tag === 'a') {
        var href = no.getAttribute('href');
        var abs = null;
        if (href) {
          try {
            var u = new URL(href, location.href);
            if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') abs = u.href;
          } catch (e) {}
        }
        if (abs) {
          var a = document.createElement('a');
          a.setAttribute('href', abs);
          a.setAttribute('rel', 'noopener');
          copiar(no, a);
          destino.appendChild(a);
        } else {
          copiar(no, destino);
        }
      } else if (/^(strong|b|em|i|u|s|sub|sup)$/.test(tag)) {
        var f = document.createElement(tag);
        copiar(no, f);
        destino.appendChild(f);
      } else {
        copiar(no, destino);
        // parágrafos aninhados (ex.: dentro de blockquote) não colam um no outro
        if ((tag === 'p' || tag === 'div') && no.nextSibling && destino.lastChild &&
            destino.lastChild.nodeName !== 'BR') {
          destino.appendChild(document.createElement('br'));
        }
      }
    }
  }

  function temTexto(el) {
    return (el.textContent || '').trim().length > 0;
  }

  // Maior candidato de um srcset: "URL 1000w, URL 984w" ou o padrão _LxA do UOL.
  // Sem nenhuma medida, devolve o primeiro candidato.
  function melhorImagemSrcset(srcset) {
    var cands = String(srcset || '').split(/,\s+/);
    var melhor = '';
    var maior = 0;
    var primeiro = '';
    for (var i = 0; i < cands.length; i++) {
      var partes = cands[i].trim().split(/\s+/);
      var url = partes[0];
      if (!url) continue;
      if (!primeiro) primeiro = url;
      var largura = 0;
      var d = /^(\d+)w$/.exec(partes[1] || '');
      if (d) {
        largura = Number(d[1]);
      } else {
        var mm = /_(\d+)x(\d+)/.exec(url);
        if (mm) largura = Number(mm[1]);
      }
      if (largura > maior) {
        maior = largura;
        melhor = url;
      }
    }
    return melhor || primeiro;
  }

  // Só aceita http(s); devolve a URL absoluta ou ''
  function urlSegura(url) {
    if (!url) return '';
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.href;
    } catch (e) {
      return '';
    }
  }

  // Monta {tipo:'ul'|'ol', itens:[html]} a partir de um <ul>/<ol>, ou null se vazio
  function lista(el) {
    var lis = [];
    var filhos = el.children;
    for (var n = 0; n < filhos.length; n++) {
      if (filhos[n].tagName.toLowerCase() === 'li' && temTexto(filhos[n])) {
        lis.push(sanitizar(filhos[n]));
      }
    }
    return lis.length ? { tipo: el.tagName.toLowerCase(), itens: lis } : null;
  }

  function criar(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  function lerTamanho() {
    try {
      var v = parseInt(localStorage.getItem('leitura-tamanho'), 10);
      if (isFinite(v)) return Math.min(TAM_MAX, Math.max(TAM_MIN, v));
    } catch (e) {}
    return TAM_PADRAO;
  }

  function aplicarTamanho(px) {
    document.documentElement.style.setProperty('--tamanho', px + 'px');
  }

  // Tema: 'claro' ou 'escuro' escolhido no botão; sem escolha, segue o sistema
  function lerTema() {
    try {
      var t = localStorage.getItem('leitura-tema');
      if (t === 'claro' || t === 'escuro') return t;
    } catch (e) {}
    return '';
  }

  function temaAtual() {
    var t = lerTema();
    if (t) return t;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
    } catch (e) {
      return 'claro';
    }
  }

  function aplicarTema(t, botao) {
    if (t) document.documentElement.setAttribute('data-tema', t);
    else document.documentElement.removeAttribute('data-tema');
    // o botão mostra pra onde ele leva
    if (botao) botao.textContent = temaAtual() === 'escuro' ? 'Modo claro' : 'Modo escuro';
  }

  function montarPagina(d) {
    // cabeça: só o meta charset sobrevive
    var filhosHead = Array.prototype.slice.call(document.head.children);
    for (var i = 0; i < filhosHead.length; i++) {
      var h = filhosHead[i];
      var ehCharset = h.tagName === 'META' && h.hasAttribute('charset');
      if (!ehCharset) h.parentNode.removeChild(h);
    }
    // Se o cabeçalho de rede não entrou (página de cache/prefetch), este meta trava scripts novos daqui em diante
    var csp = document.createElement('meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    csp.setAttribute('content', "script-src 'none'");
    document.head.appendChild(csp);

    var vp = document.createElement('meta');
    vp.name = 'viewport';
    vp.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(vp);
    document.head.appendChild(criar('title', '', d.titulo + ' — Leitura'));
    adicionarCss();

    // corpo vazio e sem class/style herdados
    document.body.replaceChildren();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('class');
    document.body.removeAttribute('style');

    var tamanho = lerTamanho();
    aplicarTamanho(tamanho);

    // barra de cima
    var barra = criar('div', 'leitura-barra');
    var marca = criar('div', 'leitura-marca', 'Modo leitura ');
    marca.appendChild(criar('span', '', '· Silêncio'));
    barra.appendChild(marca);

    // link pra home do portal (www.uol.com.br / www.globo.com)
    if (site && site.home) {
      var inicio = criar('a', 'leitura-inicio', 'Início');
      inicio.href = site.home;
      inicio.title = 'Ir para a página inicial';
      barra.appendChild(inicio);
    }

    barra.appendChild(criar('div', 'leitura-espaco'));

    var menor = criar('button', '', 'A−');
    menor.type = 'button';
    menor.setAttribute('data-acao', 'menor');
    menor.title = 'Diminuir texto';
    var maior = criar('button', '', 'A+');
    maior.type = 'button';
    maior.setAttribute('data-acao', 'maior');
    maior.title = 'Aumentar texto';
    barra.appendChild(menor);
    barra.appendChild(maior);

    var tema = criar('button', 'leitura-tema');
    tema.type = 'button';
    tema.title = 'Alternar claro e escuro';
    aplicarTema(lerTema(), tema);
    tema.addEventListener('click', function () {
      var novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
      try { localStorage.setItem('leitura-tema', novo); } catch (e) {}
      aplicarTema(novo, tema);
    });
    barra.appendChild(tema);

    var verOriginal = criar('a', '', 'Ver original');
    verOriginal.href = urlOriginal;
    barra.appendChild(verOriginal);

    // f) botões de tamanho (addEventListener: a página está sob CSP script-src 'none')
    function mudar(delta) {
      tamanho = Math.min(TAM_MAX, Math.max(TAM_MIN, tamanho + delta));
      aplicarTamanho(tamanho);
      try { localStorage.setItem('leitura-tamanho', String(tamanho)); } catch (e) {}
    }
    menor.addEventListener('click', function () { mudar(-2); });
    maior.addEventListener('click', function () { mudar(2); });

    // coluna de leitura
    var coluna = criar('main', 'leitura-coluna');
    if (d.chapeu) coluna.appendChild(criar('p', 'leitura-chapeu', d.chapeu));
    coluna.appendChild(criar('h1', 'leitura-titulo', d.titulo));
    if (d.subtitulo) coluna.appendChild(criar('p', 'leitura-subtitulo', d.subtitulo));

    var meta = criar('div', 'leitura-meta');
    if (d.autor) meta.appendChild(criar('span', 'leitura-autor', d.autor));
    if (d.origem) meta.appendChild(criar('span', '', d.origem));
    if (d.dataTexto) {
      var spanData = criar('span');
      var t = criar('time', '', d.dataTexto);
      if (d.dataIso) t.setAttribute('datetime', d.dataIso);
      spanData.appendChild(t);
      meta.appendChild(spanData);
    }
    if (meta.children.length) coluna.appendChild(meta);

    var corpo = criar('div', 'leitura-corpo');
    for (var b = 0; b < d.blocos.length; b++) {
      var bl = d.blocos[b];
      if (bl.tipo === 'figura') {
        var fig = document.createElement('figure');
        var img = document.createElement('img');
        img.src = bl.src;
        img.alt = bl.alt;
        img.loading = 'lazy';
        fig.appendChild(img);
        // a legenda costuma já trazer o crédito no texto; não repete
        var legenda = (bl.legenda && bl.credito && bl.legenda.indexOf(bl.credito) !== -1)
          ? bl.legenda
          : [bl.legenda, bl.credito].filter(Boolean).join(' — ');
        if (legenda) fig.appendChild(criar('figcaption', '', legenda));
        corpo.appendChild(fig);
      } else if (bl.tipo === 'ul' || bl.tipo === 'ol') {
        var lista = document.createElement(bl.tipo);
        for (var l = 0; l < bl.itens.length; l++) {
          var li = document.createElement('li');
          li.innerHTML = bl.itens[l]; // já sanitizado
          lista.appendChild(li);
        }
        corpo.appendChild(lista);
      } else if (bl.tipo === 'nota') {
        var nota = criar('p', 'leitura-nota');
        nota.appendChild(document.createTextNode(bl.texto + ' '));
        var lnota = criar('a', '', 'Ver original');
        lnota.href = urlOriginal;
        nota.appendChild(lnota);
        corpo.appendChild(nota);
      } else if (bl.tipo === 'meta') {
        var pmeta = criar('p', 'leitura-post-meta');
        pmeta.innerHTML = bl.html; // já sanitizado
        corpo.appendChild(pmeta);
      } else if (bl.tipo === 'sep') {
        corpo.appendChild(criar('hr', 'leitura-sep'));
      } else {
        var el = document.createElement(bl.tipo);
        el.innerHTML = bl.html; // já sanitizado
        corpo.appendChild(el);
      }
    }
    coluna.appendChild(corpo);

    var fim = criar('div', 'leitura-fim');
    var n = d.removidos;
    fim.appendChild(document.createTextNode(
      'Fim da matéria. A página original tinha ' + n + (n === 1 ? ' anúncio ou popup. ' : ' anúncios e popups. ')));
    var l2 = criar('a', '', 'Ver original');
    l2.href = urlOriginal;
    fim.appendChild(l2);
    coluna.appendChild(fim);

    // Vigia: scripts que já estavam rodando podem injetar barras, banners e <script> depois da troca; some com tudo
    vigiarIntrusos();

    document.body.appendChild(barra);
    document.body.appendChild(coluna);
  }
})();
