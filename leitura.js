// Modo leitura — Silêncio (document_end)
// Troca a página da matéria por uma versão limpa, só com o texto.
// A configuração de cada site (UOL, Globo, NYT) vem de sites.js.
(function () {
  'use strict';

  var TAM_MIN = 15;
  var TAM_MAX = 30;
  var TAM_PADRAO = 20;
  // limites do resumo (declarados aqui em cima: iniciar() roda antes do fim do arquivo)
  var RESUMO_MAX_CHARS = 6000;
  var RESUMO_MIN_CHARS = 400;
  var RESUMO_TIMEOUT_MS = 60000;

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

    // c) tem cara de matéria pela URL, mas o conteúdo não é matéria (página de seção com nome de arquivo):
    //    volta sozinho pra versão original, com scripts, sem mostrar nada quebrado
    if (!site.temMateria(document)) {
      location.replace(urlOriginal);
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
      return el.nodeType === 1 && /(^|\s)leitura-(barra|layout|coluna|aviso)(\s|$)/.test(el.className || '');
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

    // layout: resumo da IA ao lado da coluna
    var layout = criar('div', 'leitura-layout');
    var resumo = criar('aside', 'leitura-resumo');
    var h2 = criar('h2', '', 'Resumo ');
    h2.appendChild(criar('small', '', 'IA do Chrome, no seu computador'));
    resumo.appendChild(h2);
    resumo.appendChild(criar('p', 'leitura-resumo-estado esperando', 'Resumindo…'));
    layout.appendChild(resumo);
    layout.appendChild(coluna);
    document.body.appendChild(barra);
    document.body.appendChild(layout);

    // nunca pode quebrar a montagem
    try {
      var pr = resumir(d, resumo);
      if (pr && typeof pr.catch === 'function') {
        pr.catch(function () {
          try { estadoResumo(resumo, 'Não consegui resumir esta matéria.'); } catch (e) {}
        });
      }
    } catch (e) {
      try { estadoResumo(resumo, 'Não consegui resumir esta matéria.'); } catch (e2) {}
    }
  }

  // ---------- resumo com a IA do Chrome (Gemini Nano, API LanguageModel) ----------

  // Troca tudo que está abaixo do <h2> do aside; devolve o <p> de estado
  function estadoResumo(resumo, texto, esperando) {
    while (resumo.children.length > 1) resumo.removeChild(resumo.lastChild);
    var p = criar('p', 'leitura-resumo-estado' + (esperando ? ' esperando' : ''), texto);
    resumo.appendChild(p);
    return p;
  }

  function htmlParaTexto(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Título, subtítulo e blocos de texto (sem meta, nota e figura), separados por linha em branco
  function textoParaResumo(d) {
    var partes = [];
    if (d.titulo) partes.push(d.titulo);
    if (d.subtitulo) partes.push(d.subtitulo);
    var blocos = d.blocos || [];
    for (var i = 0; i < blocos.length; i++) {
      var b = blocos[i];
      var t = '';
      if (b.tipo === 'p' || b.tipo === 'h2' || b.tipo === 'h3' || b.tipo === 'blockquote') {
        t = htmlParaTexto(b.html);
        if (t) partes.push(t);
      } else if ((b.tipo === 'ul' || b.tipo === 'ol') && b.itens) {
        for (var j = 0; j < b.itens.length; j++) {
          t = htmlParaTexto(b.itens[j]);
          if (t) partes.push(t);
        }
      }
    }
    return partes.join('\n\n');
  }

  function chaveResumo() {
    var u;
    try {
      u = new URL(location.href);
      u.hash = '';
      u.searchParams.delete('original');
      return 'resumo:' + u.href;
    } catch (e) {
      return 'resumo:' + location.href.replace(/#.*$/, '');
    }
  }

  async function lerCache(chave) {
    try {
      if (!chrome.storage || !chrome.storage.session) return null;
      var r = await chrome.storage.session.get(chave);
      var v = r && r[chave];
      if (v && Array.isArray(v.itens) && v.itens.length) return v;
    } catch (e) {}
    return null;
  }

  async function gravarCache(chave, valor) {
    try {
      if (!chrome.storage || !chrome.storage.session) return;
      var o = {};
      o[chave] = valor;
      await chrome.storage.session.set(o);
    } catch (e) {}
  }

  // parcial = ainda está chegando (streaming): mostra o que já saiu e um "Resumindo…" no lugar do rodapé
  function mostrarResumo(resumo, itens, cortou, parcial) {
    while (resumo.children.length > 1) resumo.removeChild(resumo.lastChild);
    var ul = document.createElement('ul');
    for (var i = 0; i < itens.length; i++) ul.appendChild(criar('li', '', itens[i]));
    resumo.appendChild(ul);
    if (parcial) {
      resumo.appendChild(criar('p', 'leitura-resumo-estado esperando', 'Resumindo…'));
      return;
    }
    resumo.appendChild(criar('p', 'leitura-resumo-rodape',
      'Resumo feito pela IA do Chrome, no seu computador. Pode errar detalhes.' +
      (cortou ? ' Só o começo da matéria foi considerado.' : '')));
  }

  function parseItens(resposta, n) {
    var linhas = String(resposta || '').split(/\r?\n/);
    var itens = [];
    for (var i = 0; i < linhas.length; i++) {
      var t = linhas[i].replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, '').trim();
      if (t) itens.push(t);
    }
    return itens.slice(0, n);
  }

  // Lê a resposta em streaming; chama aoParcial com o texto acumulado a cada pedaço
  async function lerStreaming(sessao, pergunta, aoParcial) {
    if (typeof sessao.promptStreaming !== 'function') return sessao.prompt(pergunta);
    var acumulado = '';
    var fluxo = sessao.promptStreaming(pergunta);
    var leitor = fluxo.getReader();
    while (true) {
      var r = await leitor.read();
      if (r.done) break;
      var pedaco = typeof r.value === 'string' ? r.value : '';
      // versões antigas mandam o texto inteiro a cada pedaço; novas mandam só o delta
      acumulado = pedaco.length >= acumulado.length && pedaco.indexOf(acumulado) === 0 ? pedaco : acumulado + pedaco;
      try { aoParcial(acumulado); } catch (e) {}
    }
    return acumulado;
  }

  // Heurística: tem palavras comuns do português e não está dominado por palavras comuns do inglês
  function pareceCortugues(t) {
    var pt = (t.match(/\b(que|para|com|uma|não|dos|das|pelo|pela|mais|também|governo|eleição|eleições|segundo|sobre|entre)\b/gi) || []).length;
    var en = (t.match(/\b(the|and|with|that|for|from|voters|election|will|have|has|are|were)\b/gi) || []).length;
    return pt >= 2 && pt >= en;
  }

  async function resumir(d, resumo) {
    var texto = textoParaResumo(d);
    var cortou = false;
    if (texto.length > RESUMO_MAX_CHARS) {
      texto = texto.slice(0, RESUMO_MAX_CHARS);
      cortou = true;
    }
    if (texto.length < RESUMO_MIN_CHARS) {
      estadoResumo(resumo, 'Texto curto demais pra resumir.');
      return;
    }

    var chave = chaveResumo();
    var guardado = await lerCache(chave);
    if (guardado) {
      mostrarResumo(resumo, guardado.itens, !!guardado.cortou);
      return;
    }

    if (typeof LanguageModel === 'undefined') {
      estadoResumo(resumo, 'A IA embutida do Chrome não está disponível neste navegador.');
      return;
    }

    var n = texto.length < 1500 ? 3 : 5;

    async function gerar(baixando) {
      var sessao = null;
      var timer = null;
      try {
        estadoResumo(resumo, baixando ? 'Baixando o modelo…' : 'Resumindo…', !baixando);
        var opcoes = {
          initialPrompts: [{
            role: 'system',
            content: 'Você resume notícias em português do Brasil. Responda SOMENTE com ' + n +
              ' tópicos curtos, uma frase cada, um por linha, começando com "- ". ' +
              'Use apenas informações do texto; não invente nem opine.'
          }]
        };
        if (baixando) {
          opcoes.monitor = function (m) {
            try {
              m.addEventListener('downloadprogress', function (e) {
                try {
                  if (e && typeof e.loaded === 'number' && isFinite(e.loaded)) {
                    var pct = Math.round((e.loaded <= 1 ? e.loaded * 100 : e.loaded));
                    estadoResumo(resumo, 'Baixando o modelo… ' + Math.min(100, pct) + '%');
                  }
                } catch (e2) {}
              });
            } catch (e3) {}
          };
        }
        sessao = await LanguageModel.create(opcoes);
        estadoResumo(resumo, 'Resumindo…', true);

        var limite = new Promise(function (_, rejeitar) {
          timer = setTimeout(function () { rejeitar(new Error('timeout')); }, RESUMO_TIMEOUT_MS);
        });

        // Pede em português no começo E no fim (modelo pequeno obedece melhor à última instrução)
        var pergunta = 'Resuma esta notícia em português do Brasil:\n\n' + texto +
          '\n\nEscreva os ' + n + ' tópicos em português do Brasil, mesmo que o texto esteja em outro idioma.';

        // Streaming: mostra os tópicos conforme saem, em vez de esperar tudo
        var resposta = await Promise.race([lerStreaming(sessao, pergunta, function (parcial) {
          var prontos = parseItens(parcial, n);
          if (prontos.length) mostrarResumo(resumo, prontos, cortou, true);
        }), limite]);

        var itens = parseItens(resposta, n);
        if (!itens.length) {
          estadoResumo(resumo, 'Não consegui resumir esta matéria.');
          return;
        }

        // Saiu em outro idioma? Manda reescrever em português na mesma sessão
        if (!pareceCortugues(itens.join(' '))) {
          estadoResumo(resumo, 'Traduzindo…', true);
          var denovo = await Promise.race([lerStreaming(sessao,
            'Reescreva os tópicos acima em português do Brasil, no mesmo formato ("- " no início de cada linha), sem comentários.',
            function (parcial) {
              var prontos2 = parseItens(parcial, n);
              if (prontos2.length) mostrarResumo(resumo, prontos2, cortou, true);
            }), limite]);
          var itens2 = parseItens(denovo, n);
          if (itens2.length) itens = itens2;
        }

        mostrarResumo(resumo, itens, cortou);
        gravarCache(chave, { itens: itens, cortou: cortou });
      } catch (e) {
        if (e && e.message === 'timeout') {
          estadoResumo(resumo, 'O resumo demorou demais. Tente recarregar a página.');
        } else {
          estadoResumo(resumo, 'Não consegui resumir esta matéria.');
        }
      } finally {
        if (timer) clearTimeout(timer);
        try { if (sessao) sessao.destroy(); } catch (e4) {}
      }
    }

    var disp = await LanguageModel.availability();
    if (disp === 'unavailable') {
      estadoResumo(resumo, 'A IA embutida do Chrome não está disponível neste computador.');
      return;
    }
    if (disp === 'downloadable' || disp === 'downloading') {
      estadoResumo(resumo, 'O modelo de IA do Chrome ainda não foi baixado (uma vez só, alguns minutos).');
      var botao = criar('button', '', 'Baixar e resumir');
      botao.type = 'button';
      botao.addEventListener('click', function () {
        botao.disabled = true;
        gerar(true);
      });
      resumo.appendChild(botao);
      return;
    }
    await gerar(false);
  }
})();
