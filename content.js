(function () {
  'use strict';

  // Em matérias (padrão de URL do site, vindo de sites.js), esconde a página original até o leitura.js trocá-la
  try {
    var site = detectarSite();
    if (site && site.materia.test(location.pathname) &&
        location.search.indexOf('original=1') === -1) {
      var oculta = document.createElement('style');
      oculta.id = 'leitura-oculta';
      oculta.textContent = 'html{background:#FBF8F2}body{opacity:0 !important}';
      document.documentElement.appendChild(oculta);
    }
  } catch (e) {}

  var observer = null;
  var intervalo = null;
  var agendado = false;
  var jaAvisou = false;

  // Remove o modal do Piano (UOL), a barreira do O Globo e o modal de newsletter do g1; destrava a rolagem
  function limpar() {
    try {
      var removidos = 0;
      document.querySelectorAll('.tp-modal, .tp-backdrop, .barreiraJornada, .newsletter-g1-modal__overlay').forEach(function (el) {
        if (el.classList && (el.classList.contains('tp-modal') ||
            el.classList.contains('barreiraJornada') ||
            el.classList.contains('newsletter-g1-modal__overlay'))) removidos++;
        el.remove();
      });

      // Avisa o background uma única vez por página
      if (removidos > 0 && !jaAvisou) {
        jaAvisou = true;
        try {
          var p = chrome.runtime.sendMessage({ tipo: 'popup-removido' });
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
      }

      [document.body, document.documentElement].forEach(function (el) {
        if (!el) return;
        el.classList.remove('tp-modal-open');
      });

      var body = document.body;
      if (body) {
        if (body.style.overflow === 'hidden') body.style.removeProperty('overflow');
        if (body.style.position === 'fixed') body.style.removeProperty('position');
      }
    } catch (e) {
      // nunca propagar erro para a página
    }
  }

  // Debounce com requestAnimationFrame
  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () {
      agendado = false;
      limpar();
    });
  }

  // Verifica se um nó tem classe começando por "tp-"
  function temClasseTp(no) {
    try {
      if (!no || no.nodeType !== 1 || !no.classList) return false;
      for (var i = 0; i < no.classList.length; i++) {
        if (no.classList[i].indexOf('tp-') === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  // Decide se a mutação merece uma limpeza
  function mutacaoRelevante(m) {
    try {
      if (m.type === 'attributes') {
        return m.target === document.body || m.target === document.documentElement || temClasseTp(m.target);
      }
      var nos = m.addedNodes;
      for (var i = 0; i < nos.length; i++) {
        if (temClasseTp(nos[i])) return true;
      }
    } catch (e) {}
    return false;
  }

  function iniciarObserver() {
    try {
      observer = new MutationObserver(function (mutacoes) {
        try {
          for (var i = 0; i < mutacoes.length; i++) {
            if (mutacaoRelevante(mutacoes[i])) {
              agendar();
              return;
            }
          }
        } catch (e) {}
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    } catch (e) {}
  }

  function pararObserver() {
    try {
      if (observer) observer.disconnect();
    } catch (e) {}
    observer = null;
  }

  function pararTudo() {
    pararObserver();
    if (intervalo) {
      clearInterval(intervalo);
      intervalo = null;
    }
  }

  try {
    // Limpeza inicial
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', limpar);
    } else {
      limpar();
    }

    iniciarObserver();

    // Após 60 s, troca o observer por um intervalo de 2 s por mais 2 minutos
    setTimeout(function () {
      try {
        pararObserver();
        intervalo = setInterval(limpar, 2000);
        setTimeout(pararTudo, 120000);
      } catch (e) {}
    }, 60000);
  } catch (e) {
    // silencioso
  }
})();
