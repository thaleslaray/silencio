// Documento offscreen da extensão: mantém UMA sessão de IA do Chrome (Gemini Nano) viva e aquecida.
// Cada matéria só clona essa sessão; nenhuma criação de sessão acontece no caminho crítico da leitura.
'use strict';

var SISTEMA = 'Você resume notícias em português do Brasil. Responda SOMENTE com tópicos curtos, uma frase cada, ' +
  'um por linha, começando com "- ". Use apenas informações do texto; não invente nem opine.';

var sessaoBase = null;
var criando = null;

function pareceCortugues(t) {
  var pt = (t.match(/\b(que|para|com|uma|não|dos|das|pelo|pela|mais|também|governo|eleição|eleições|segundo|sobre|entre)\b/gi) || []).length;
  var en = (t.match(/\b(the|and|with|that|for|from|voters|election|will|have|has|are|were)\b/gi) || []).length;
  return pt >= 2 && pt >= en;
}

function enviar(msg) {
  try { var p = chrome.runtime.sendMessage(msg); if (p && p.catch) p.catch(function () {}); } catch (e) {}
}

// Sessão base: criada uma vez (pode demorar na primeira vez) e reaproveitada
function obterSessaoBase() {
  if (sessaoBase) return Promise.resolve(sessaoBase);
  if (criando) return criando;
  criando = LanguageModel.create({ initialPrompts: [{ role: 'system', content: SISTEMA }] })
    .then(function (s) { sessaoBase = s; return s; })
    .finally(function () { criando = null; });
  return criando;
}

async function resumir(texto, n, tabId) {
  var t = { inicio: Date.now() };
  function postar(estado, txt) {
    enviar({ tipo: 'resumo-parcial', tabId: tabId, estado: estado || '', texto: txt || '' });
  }
  if (typeof LanguageModel === 'undefined') return { estado: 'unavailable-offscreen' };
  var disp;
  try { disp = await LanguageModel.availability(); } catch (e) { return { estado: 'unavailable' }; }
  t.disp_ms = Date.now() - t.inicio;
  if (disp !== 'available') return { estado: disp };

  var sessao = null;
  var timer = null;
  try {
    var limite = new Promise(function (_, rejeitar) {
      timer = setTimeout(function () { rejeitar(new Error('timeout')); }, 60000);
    });
    postar('Abrindo a sessão de IA…', '');
    var base = await Promise.race([obterSessaoBase(), limite]);
    // clone = contexto limpo sem pagar a criação de novo; se não existir, usa a base mesmo
    try { sessao = (typeof base.clone === 'function') ? await base.clone() : base; } catch (e) { sessao = base; }
    t.sessao_ms = Date.now() - t.inicio;

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
        if (!t.primeiro_ms) t.primeiro_ms = Date.now() - t.inicio;
        postar('', acc);
      }
      return acc;
    }

    postar('Resumindo…', '');
    var pergunta = 'Resuma esta notícia em português do Brasil:\n\n' + texto +
      '\n\nEscreva os ' + n + ' tópicos em português do Brasil, mesmo que o texto esteja em outro idioma.';
    var resposta = await Promise.race([ler(pergunta), limite]);
    if (!pareceCortugues(resposta)) {
      postar('Traduzindo…', '');
      var denovo = await Promise.race([ler('Reescreva os tópicos acima em português do Brasil, no mesmo formato ("- " no início de cada linha), sem comentários.'), limite]);
      if (denovo && denovo.trim()) resposta = denovo;
    }
    t.total_ms = Date.now() - t.inicio;
    return { estado: 'ok', texto: resposta, t: t };
  } catch (e) {
    // sessão base pode ter morrido (ex.: modelo descarregado); descarta pra recriar na próxima
    if (!(e && e.message === 'timeout')) { try { if (sessaoBase) sessaoBase.destroy(); } catch (e3) {} sessaoBase = null; }
    return { estado: (e && e.message === 'timeout') ? 'timeout' : 'erro', erro: String(e), t: t };
  } finally {
    if (timer) clearTimeout(timer);
    try { if (sessao && sessao !== sessaoBase) sessao.destroy(); } catch (e2) {}
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;
  if (msg.tipo === 'ia-resumir') {
    resumir(String(msg.texto || ''), Number(msg.n) || 5, msg.tabId)
      .then(sendResponse)
      .catch(function (e) { sendResponse({ estado: 'erro', erro: String(e) }); });
    return true;
  }
  if (msg.tipo === 'ia-aquecer') {
    if (typeof LanguageModel === 'undefined') { sendResponse({ ok: false }); return; }
    LanguageModel.availability().then(function (d) {
      if (d !== 'available') { sendResponse({ ok: false, disp: d }); return; }
      obterSessaoBase().then(function () { sendResponse({ ok: true }); }, function () { sendResponse({ ok: false }); });
    }).catch(function () { sendResponse({ ok: false }); });
    return true;
  }
});

// aquece assim que o documento nasce
try {
  if (typeof LanguageModel !== 'undefined') {
    LanguageModel.availability().then(function (d) { if (d === 'available') obterSessaoBase().catch(function () {}); }).catch(function () {});
  }
} catch (e) {}
