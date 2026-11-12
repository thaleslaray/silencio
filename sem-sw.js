// Roda na própria página (world MAIN), em document_start, nos portais cobertos.
// Página entregue por Service Worker não recebe o cabeçalho que trava os scripts, e a regra de rede
// não consegue barrar o registro do worker. Então o registro é negado aqui, na origem, e os workers
// que já existirem nesta origem são removidos.
(function () {
  'use strict';
  try {
    var sw = navigator.serviceWorker;
    if (!sw) return;
    var negar = function () {
      return Promise.reject(new DOMException('Service Worker desativado pela extensão Silêncio', 'SecurityError'));
    };
    try {
      Object.defineProperty(ServiceWorkerContainer.prototype, 'register', { value: negar, writable: false, configurable: false });
    } catch (e) {
      try { sw.register = negar; } catch (e2) {}
    }
    sw.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { try { r.unregister(); } catch (e3) {} });
    }).catch(function () {});
  } catch (e) {}
})();
