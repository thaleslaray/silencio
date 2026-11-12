// Service worker: conta popups bloqueados e atualiza o ícone da extensão.
'use strict';

var VERDE = '#1E8E3E';
// Só as regras do Piano (1), do Offerwall (2) e do paywall do O Globo (10) contam como popup; 3 e 4 não.
var REGRAS_POPUP = [1, 2, 10, 14];

var ICONE_VERDE = {
  16: 'icons/verde-16.png',
  32: 'icons/verde-32.png',
  48: 'icons/verde-48.png',
  128: 'icons/verde-128.png'
};
var ICONE_CINZA = {
  16: 'icons/cinza-16.png',
  32: 'icons/cinza-32.png',
  48: 'icons/cinza-48.png',
  128: 'icons/cinza-128.png'
};

function chaveAba(tabId) {
  return 'aba:' + tabId;
}

// Fila para serializar gravações e não perder contagens concorrentes
var fila = Promise.resolve();
function enfileirar(fn) {
  fila = fila.then(fn).catch(function () {});
  return fila;
}

// Lê a contagem da aba (session) e o total acumulado (local)
async function lerContagens(tabId) {
  var contagem = 0;
  var total = 0;
  try {
    var s = await chrome.storage.session.get(chaveAba(tabId));
    contagem = Number(s[chaveAba(tabId)]) || 0;
  } catch (e) {}
  try {
    var l = await chrome.storage.local.get('total');
    total = Number(l.total) || 0;
  } catch (e) {}
  return { contagem: contagem, total: total };
}

// Soma n na aba e no total, depois atualiza o ícone
async function registrarVarios(tabId, n) {
  try {
    n = Math.max(1, Math.floor(Number(n)) || 1);
    var c = await lerContagens(tabId);
    var objSessao = {};
    objSessao[chaveAba(tabId)] = c.contagem + n;
    await chrome.storage.session.set(objSessao);
    await chrome.storage.local.set({ total: c.total + n });
    await atualizarIcone(tabId);
  } catch (e) {}
}

// Soma 1 na aba e no total
async function registrar(tabId) {
  return registrarVarios(tabId, 1);
}

// Cinza sem número = nada bloqueado; verde com número = popups bloqueados na aba
async function atualizarIcone(tabId) {
  try {
    var c = await lerContagens(tabId);
    var contagem = c.contagem;
    var total = c.total;

    if (contagem > 0) {
      await chrome.action.setBadgeText({ tabId: tabId, text: String(contagem) });
      await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: VERDE });
      try {
        // pode não existir em versões antigas do Chrome
        await chrome.action.setBadgeTextColor({ tabId: tabId, color: '#FFFFFF' });
      } catch (e) {}
      await chrome.action.setIcon({ tabId: tabId, path: ICONE_VERDE });
      await chrome.action.setTitle({
        tabId: tabId,
        title: 'Silêncio — ' + contagem + ' anúncio(s) e popup(s) removido(s) nesta aba · ' + total + ' no total'
      });
    } else {
      await chrome.action.setBadgeText({ tabId: tabId, text: '' });
      await chrome.action.setIcon({ tabId: tabId, path: ICONE_CINZA });
      await chrome.action.setTitle({
        tabId: tabId,
        title: 'Silêncio — nenhum popup nesta aba · ' + total + ' no total'
      });
    }
  } catch (e) {
    // aba pode ter sido fechada; ignorar
  }
}

// Libera chrome.storage.session para os content scripts (cache do resumo da IA)
try {
  if (chrome.storage && chrome.storage.session && chrome.storage.session.setAccessLevel) {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(function () {});
  }
} catch (e) {}

// Garante que o total exista
async function iniciarTotal() {
  try {
    var l = await chrome.storage.local.get('total');
    if (typeof l.total !== 'number') {
      await chrome.storage.local.set({ total: 0 });
    }
  } catch (e) {}
}

// Regras de rede que casaram (só funciona em extensão sem compactação)
try {
  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
      try {
        if (info && info.request && info.request.tabId > 0 &&
            REGRAS_POPUP.indexOf(info.rule.ruleId) !== -1) {
          enfileirar(function () { return registrar(info.request.tabId); });
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Aviso do content script: um modal foi removido do DOM
try {
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    try {
      if (msg && msg.tipo === 'popup-removido' && sender && sender.tab && sender.tab.id > 0) {
        enfileirar(function () { return registrar(sender.tab.id); });
      } else if (msg && msg.tipo === 'leitura' && sender && sender.tab && sender.tab.id > 0) {
        var n = Math.max(1, Number(msg.removidos) || 1);
        enfileirar(function () { return registrarVarios(sender.tab.id, n); });
      }
    } catch (e) {}
  });
} catch (e) {}

// URLs de matéria (mesmos critérios de sites.js e das regras 5 e 9)
var URLS_MATERIA = [
  // uma regra só, por extensão de arquivo (igual à regra 5 do rules.json); a leitura decide pelo conteúdo
  /^https:\/\/([a-z0-9-]+\.)*(uol\.com\.br|globo\.com|nytimes\.com)\/([^?#]*\.[gs]?html?|live\/[^?#]+)([?#]|$)/
];

function ehMateria(url) {
  if (!url || /[?&]original=1/.test(url)) return false;
  for (var i = 0; i < URLS_MATERIA.length; i++) if (URLS_MATERIA[i].test(url)) return true;
  return false;
}

// Rede de segurança: quando uma matéria termina de carregar (inclusive vinda de pré-renderização),
// injeta o modo leitura de novo; leitura.js não faz nada se a página já estiver montada.
function garantirLeitura(tabId, url) {
  try {
    if (!chrome.scripting || !ehMateria(url)) return;
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['sites.js', 'leitura.js']
    }).catch(function () {});
  } catch (e) {}
}

// Hosts dos portais cobertos
var HOSTS_SITES = /(^|\.)(uol\.com\.br|globo\.com|nytimes\.com)$/;

// Páginas entregues por Service Worker não recebem o cabeçalho CSP da regra de rede.
// Então, sempre que uma aba desses sites carrega, apaga o Service Worker (e o cache dele) daquela origem:
// a próxima navegação vem da rede e a trava de scripts funciona.
var origensLimpas = {};
function limparServiceWorker(url) {
  try {
    if (!chrome.browsingData || !url) return;
    var u = new URL(url);
    if (!HOSTS_SITES.test(u.hostname)) return;
    var origem = u.origin;
    var agora = Date.now();
    if (origensLimpas[origem] && agora - origensLimpas[origem] < 60000) return; // no máximo 1x por minuto por origem
    origensLimpas[origem] = agora;
    chrome.browsingData.remove({ origins: [origem] }, { serviceWorkers: true, cacheStorage: true }).catch(function () {});
  } catch (e) {}
}

// Navegação nova na aba: zera a contagem (só quando há info.url)
try {
  chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
    try {
      if (info && info.status === 'complete') {
        limparServiceWorker(tab && tab.url);
        garantirLeitura(tabId, tab && tab.url);
      }
      if (info && info.status === 'loading' && info.url) {
        limparServiceWorker(info.url);
        if (ehMateria(info.url)) aquecerIA();
        enfileirar(async function () {
          try {
            await chrome.storage.session.remove(chaveAba(tabId));
          } catch (e) {}
          await atualizarIcone(tabId);
        });
      }
    } catch (e) {}
  });
} catch (e) {}

// Aba fechada: limpa o estado
try {
  chrome.tabs.onRemoved.addListener(function (tabId) {
    try {
      chrome.storage.session.remove(chaveAba(tabId)).catch(function () {});
    } catch (e) {}
  });
} catch (e) {}

try {
  chrome.runtime.onInstalled.addListener(function () {
    iniciarTotal().catch(function () {});
    aquecerIA();
    try {
      var origens = ['https://www.globo.com', 'https://g1.globo.com', 'https://ge.globo.com', 'https://oglobo.globo.com',
        'https://gshow.globo.com', 'https://revistaquem.globo.com', 'https://revistamonet.globo.com', 'https://valor.globo.com',
        'https://extra.globo.com', 'https://www.uol.com.br', 'https://noticias.uol.com.br', 'https://www1.folha.uol.com.br', 'https://www.bol.uol.com.br', 'https://www.nytimes.com'];
      if (chrome.browsingData) chrome.browsingData.remove({ origins: origens }, { serviceWorkers: true, cacheStorage: true }).catch(function () {});
    } catch (e) {}
  });
  chrome.runtime.onStartup.addListener(function () {
    iniciarTotal().catch(function () {});
    aquecerIA();
  });
} catch (e) {}

// ---------- Resumo pela IA do Chrome ----------
// Roda na própria página (world MAIN), injetado por aqui: no contexto isolado do content script
// a primeira sessão de IA demora de 16 a 30 s; na página, milissegundos. A injeção da extensão
// ignora o CSP script-src 'none' da página. Esta função é serializada: não pode usar nada de fora.
function resumirNaPagina(texto, n) {
  return (async function () {
    function pareceCortugues(t) {
      var pt = (t.match(/\b(que|para|com|uma|não|dos|das|pelo|pela|mais|também|governo|eleição|eleições|segundo|sobre|entre)\b/gi) || []).length;
      var en = (t.match(/\b(the|and|with|that|for|from|voters|election|will|have|has|are|were)\b/gi) || []).length;
      return pt >= 2 && pt >= en;
    }
    function postar(estado, txt) {
      try { window.postMessage({ silencio: 'resumo-parcial', estado: estado || '', texto: txt || '' }, '*'); } catch (e) {}
    }
    if (typeof LanguageModel === 'undefined') return { estado: 'unavailable' };
    var disp;
    postar('Verificando a IA…', '');
    // idioma de saída declarado (ver ia.js): o Chrome só aceita [de, en, es, fr, ja]
    var OPCOES_IA = { expectedOutputs: [{ type: 'text', languages: ['es'] }] };
    try { disp = await LanguageModel.availability(OPCOES_IA); } catch (e) { return { estado: 'unavailable' }; }
    if (disp !== 'available') return { estado: disp };

    var sessao = null;
    var timer = null;
    try {
      var limite = new Promise(function (_, rejeitar) {
        timer = setTimeout(function () { rejeitar(new Error('timeout')); }, 60000);
      });
      postar('Abrindo a sessão de IA…', '');
      sessao = await LanguageModel.create({
        expectedOutputs: OPCOES_IA.expectedOutputs,
        initialPrompts: [{
          role: 'system',
          content: 'Você resume notícias em português do Brasil. Responda SOMENTE com tópicos curtos, uma frase cada, ' +
            'um por linha, começando com "- ". Use apenas informações do texto; não invente nem opine.'
        }]
      });
      async function ler(pergunta) {
        if (typeof sessao.promptStreaming !== 'function') {
          var r0 = await sessao.prompt(pergunta);
          postar('', r0);
          return r0;
        }
        var acc = '';
        var leitor = sessao.promptStreaming(pergunta).getReader();
        while (true) {
          var r = await leitor.read();
          if (r.done) break;
          var v = typeof r.value === 'string' ? r.value : '';
          acc = (v.length >= acc.length && v.indexOf(acc) === 0) ? v : acc + v;
          postar('', acc);
        }
        return acc;
      }
      var pergunta = 'Resuma esta notícia em português do Brasil:\n\n' + texto +
        '\n\nEscreva os ' + n + ' tópicos em português do Brasil, mesmo que o texto esteja em outro idioma.';
      postar('Resumindo…', '');
      var resposta = await Promise.race([ler(pergunta), limite]);
      if (!pareceCortugues(resposta)) {
        postar('Traduzindo…', '');
        var denovo = await Promise.race([ler('Reescreva os tópicos acima em português do Brasil, no mesmo formato ("- " no início de cada linha), sem comentários.'), limite]);
        if (denovo && denovo.trim()) resposta = denovo;
      }
      return { estado: 'ok', texto: resposta };
    } catch (e) {
      return { estado: (e && e.message === 'timeout') ? 'timeout' : 'erro', erro: String(e) };
    } finally {
      if (timer) clearTimeout(timer);
      try { if (sessao) sessao.destroy(); } catch (e2) {}
    }
  })();
}

// Documento offscreen com a sessão de IA permanente (ia.html)
var criandoOffscreen = null;
async function garantirOffscreen() {
  if (!chrome.offscreen) return false;
  try {
    if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return true;
  } catch (e) {}
  if (!criandoOffscreen) {
    criandoOffscreen = chrome.offscreen.createDocument({
      url: 'ia.html',
      reasons: ['WORKERS'],
      justification: 'Resumo de matérias com a IA embutida do Chrome, numa sessão permanente'
    }).then(function () { return true; }, function (e) { return /exist|already/i.test(String(e)); })
      .finally(function () { criandoOffscreen = null; });
  }
  return criandoOffscreen;
}

// Aquece a IA (cria o offscreen e a sessão base) fora do caminho crítico
function aquecerIA() {
  garantirOffscreen().then(function (ok) {
    if (!ok) return;
    try { var p = chrome.runtime.sendMessage({ tipo: 'ia-aquecer' }); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }).catch(function () {});
}

// Caminho de reserva: roda na própria página (main world)
function resumirNoMainWorld(tabId, texto, n) {
  return chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: resumirNaPagina,
    args: [String(texto || ''), Number(n) || 5]
  }).then(function (res) {
    return res && res[0] && res[0].result ? res[0].result : { estado: 'erro' };
  });
}

try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    // tópicos parciais vindos do offscreen: repassa para a aba
    if (msg.tipo === 'resumo-parcial' && msg.tabId > 0 && !(sender && sender.tab)) {
      try { var p = chrome.tabs.sendMessage(msg.tabId, msg); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      return;
    }
    if (msg.tipo !== 'resumir' || !sender || !sender.tab || !(sender.tab.id > 0)) return;
    var tabId = sender.tab.id;
    (async function () {
      try {
        if (await garantirOffscreen()) {
          var r = await chrome.runtime.sendMessage({ tipo: 'ia-resumir', texto: String(msg.texto || ''), n: Number(msg.n) || 5, tabId: tabId });
          if (r && r.estado && r.estado !== 'unavailable-offscreen' && r.estado !== 'erro') return r;
        }
      } catch (e) {}
      return resumirNoMainWorld(tabId, msg.texto, msg.n);
    })().then(sendResponse, function (e) { sendResponse({ estado: 'erro', erro: String(e) }); });
    return true; // resposta assíncrona
  });
} catch (e) {}

// (antigo caminho direto, mantido só como referência do fallback)
try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.tipo !== '__nunca__' || !sender || !sender.tab || !(sender.tab.id > 0)) return;
    try {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        func: resumirNaPagina,
        args: [String(msg.texto || ''), Number(msg.n) || 5]
      }).then(function (res) {
        sendResponse(res && res[0] && res[0].result ? res[0].result : { estado: 'erro' });
      }).catch(function (e) {
        sendResponse({ estado: 'erro', erro: String(e) });
      });
    } catch (e) {
      sendResponse({ estado: 'erro', erro: String(e) });
    }
    return true; // resposta assíncrona
  });
} catch (e) {}
