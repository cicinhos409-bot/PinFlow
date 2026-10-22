/* Novo pin: cria um pin por conta escolhida. */
(function () {
  "use strict";

  App.ready(function () {
    var form = document.getElementById("pin-form");
    PinForm.init(form, {
      mode: "new",
      onSubmit: function (payload) {
        return UI.api("/api/pins", { method: "POST", body: payload }).then(function (r) {
          UI.throwIfError(r, 201);
          var n = r.data.pins.length;
          UI.toast(n === 1 ? "Pin programado." : n + " pins programados.", "ok");
          if (payload.publish_now) { try { localStorage.removeItem("pf_worker_ping"); } catch (e) { /* ignora */ } }
          window.location.href = n === 1 ? App.url("pins", r.data.pins[0].id) : App.url("pins");
        });
      },
    });
  });
})();
