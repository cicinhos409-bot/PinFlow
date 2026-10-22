/* Detalhe do pin: situação, erro, ações, edição e histórico. */
(function () {
  "use strict";

  App.ready(function () {
    var pinId = App.item();
    var head = document.getElementById("pin-head");
    var form = document.getElementById("pin-form");
    var eventsWrap = document.getElementById("pin-events");
    var editCard = document.getElementById("edit-card");
    var pin = null;

    if (App.preview) {
      head.appendChild(UI.empty("Modo de visualização", "Conecte o banco de dados para ver pins de verdade."));
      editCard.hidden = true;
      return;
    }

    function renderHead(p) {
      head.innerHTML = "";
      var preview = UI.el("div", { class: "pin-preview" });
      if (p.media) {
        if (p.media.kind === "video") preview.appendChild(UI.el("video", { src: p.media.url, controls: true, playsinline: true, poster: p.cover ? p.cover.url : null }));
        else preview.appendChild(UI.el("img", { src: p.media.url, alt: p.alt_text || "" }));
      } else preview.appendChild(UI.el("div", { class: "thumb thumb-lg thumb-empty" }));

      var info = UI.el("div", { class: "pin-info" }, [
        UI.el("div", { class: "pin-status-line" }, [App.pinBadge(p.status), UI.el("span", { text: p.status === "published" ? "em " + UI.formatDateTime(p.published_at) : p.status === "scheduled" ? "para " + UI.formatDateTime(p.scheduled_at) + " (" + UI.formatRelative(p.scheduled_at) + ")" : "" })]),
        UI.el("h1", { text: p.title || "(sem título)" }),
        UI.el("p", { class: "section-intro", text: (p.account ? "@" + p.account.username : "conta removida") + (p.board ? " · " + p.board.name : " · sem pasta") }),
        p.error_message ? UI.el("div", { class: "pin-error-box" }, [UI.el("strong", { text: p.status === "failed" ? "Não foi possível publicar" : "Aviso" }), UI.el("p", { text: p.error_message }), p.attempts ? UI.el("small", { text: "Tentativas: " + p.attempts }) : null]) : null,
        p.pinterest_url ? UI.el("a", { class: "btn btn-small btn-ghost", href: p.pinterest_url, target: "_blank", rel: "noopener", text: "Ver na Pinterest" }) : null,
      ]);

      var actions = UI.el("div", { class: "card-actions" });
      if (p.status === "scheduled") {
        actions.appendChild(UI.el("button", { class: "btn btn-primary", type: "button", text: "Publicar agora", onclick: function () { act("publish-now", "Pin enviado para publicação agora."); } }));
        actions.appendChild(UI.el("button", { class: "btn btn-ghost", type: "button", text: "Cancelar pin", onclick: cancel }));
      }
      if (p.status === "failed" || p.status === "canceled") {
        actions.appendChild(UI.el("button", { class: "btn btn-primary", type: "button", text: "Tentar de novo", onclick: function () { act("retry", "Pin de volta na fila."); } }));
      }
      if (p.status === "publishing") actions.appendChild(UI.el("span", { class: "hint", text: "Publicando agora na Pinterest..." }));
      actions.appendChild(UI.el("button", { class: "btn btn-ghost", type: "button", text: "Duplicar", onclick: duplicate }));
      actions.appendChild(UI.el("button", { class: "btn btn-danger-ghost", type: "button", text: "Apagar", onclick: remove }));
      info.appendChild(actions);
      head.appendChild(preview);
      head.appendChild(info);
    }

    function renderEvents(events) {
      eventsWrap.innerHTML = "";
      if (!events.length) return eventsWrap.appendChild(UI.el("p", { class: "hint", text: "Sem eventos ainda." }));
      var ul = UI.el("ul", { class: "activity-list" });
      events.forEach(function (e) {
        ul.appendChild(UI.el("li", { class: "activity-item" + (/failed/.test(e.kind) ? " is-bad" : "") }, [
          UI.el("span", { class: "activity-dot", "aria-hidden": "true" }),
          UI.el("div", {}, [UI.el("p", { text: e.message }), UI.el("small", { text: UI.formatDateTime(e.created_at, { year: "numeric" }) })]),
        ]));
      });
      eventsWrap.appendChild(ul);
    }

    function act(action, okMsg) {
      UI.api("/api/pins/" + pin.id + "/" + action, { method: "POST", body: {} }).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        UI.toast(okMsg, "ok");
        load();
        if (action === "publish-now") setTimeout(App.runQueue, 500);
      });
    }

    function cancel() {
      UI.confirm({ title: "Cancelar este pin?", message: "Ele não será publicado. Você pode colocar de volta na fila depois.", confirmText: "Cancelar pin", cancelText: "Manter" }).then(function (ok) {
        if (ok) act("cancel", "Pin cancelado.");
      });
    }

    function duplicate() {
      var local = UI.isoToLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      UI.dialog({
        title: "Duplicar pin",
        content: '<p class="modal-text">Uma cópia será programada para a mesma conta e pasta.</p><div class="field"><label for="when">Data e hora</label><input id="when" name="when" type="datetime-local" value="' + local + '" required></div>',
        submitText: "Duplicar",
        onSubmit: function (f) {
          var iso = UI.localToIso(f.when.value);
          if (!iso) { var e = new Error("Escolha a data e a hora."); e.field = "when"; throw e; }
          return UI.api("/api/pins/" + pin.id + "/duplicate", { method: "POST", body: { scheduled_at: iso } }).then(function (r) {
            UI.throwIfError(r, 201);
            UI.toast("Pin duplicado.", "ok");
            window.location.href = App.url("pins", r.data.pin.id);
            return true;
          });
        },
      });
    }

    function remove() {
      var published = pin.status === "published" && pin.pinterest_pin_id;
      UI.confirm({
        title: "Apagar este pin?",
        message: published ? "O pin sai da plataforma. Marque abaixo se quiser apagar também na Pinterest." : "O pin será apagado da plataforma.",
        confirmText: "Apagar",
        danger: true,
        checkbox: published ? { label: "Apagar também na Pinterest (não dá para desfazer)", checked: false } : null,
      }).then(function (res) {
        if (!res) return;
        UI.api("/api/pins/" + pin.id + (res.checkbox ? "?pinterest=1" : ""), { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast(r.data.removed_on_pinterest ? "Pin apagado aqui e na Pinterest." : "Pin apagado.", "ok");
          window.location.href = App.url("pins");
        });
      });
    }

    var formReady = false;
    function setupForm(p) {
      form.title.value = p.title;
      form.description.value = p.description;
      form.link.value = p.link;
      form.alt_text.value = p.alt_text;
      var locked = !p.editable; // publicado: mídia e data não mudam
      document.getElementById("media-section").hidden = locked;
      document.getElementById("when-section").hidden = locked;
      document.getElementById("edit-note").textContent = locked ? "Este pin já está na Pinterest: título, descrição, link, texto alternativo e pasta são atualizados lá também." : "";
      if (p.status === "publishing") {
        editCard.hidden = true;
        return;
      }
      editCard.hidden = false;
      if (formReady) return;
      formReady = true;
      PinForm.init(form, {
        mode: "edit",
        pin: p,
        onSubmit: function (payload) {
          if (!pin.editable) {
            delete payload.media_id;
            delete payload.cover_media_id;
            delete payload.scheduled_at;
            delete payload.publish_now;
          }
          return UI.api("/api/pins/" + pin.id, { method: "PATCH", body: payload }).then(function (r) {
            UI.throwIfError(r);
            UI.toast("Pin salvo.", "ok");
            load();
          });
        },
      });
    }

    function load() {
      UI.api("/api/pins/" + encodeURIComponent(pinId)).then(function (r) {
        if (r.status === 404) {
          head.appendChild(UI.empty("Pin não encontrado.", "Ele pode ter sido apagado.", UI.el("a", { class: "btn btn-primary", href: App.url("pins"), text: "Ver pins" })));
          editCard.hidden = true;
          return;
        }
        if (r.status !== 200) return App.errorToast(r);
        pin = r.data.pin;
        renderHead(pin);
        renderEvents(r.data.events);
        setupForm(pin);
      });
    }

    load();
    document.addEventListener("pinflow:queue", load);
  });
})();
