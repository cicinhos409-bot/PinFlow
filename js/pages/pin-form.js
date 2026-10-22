/* Formulário de pin (novo e edição). Expõe window.PinForm. */
(function () {
  "use strict";

  var PinForm = {};

  function counter(input, max) {
    var c = input.parentNode.querySelector(".counter");
    if (!c) {
      c = UI.el("span", { class: "counter" });
      input.parentNode.querySelector("label").appendChild(c);
    }
    function update() {
      c.textContent = input.value.length + "/" + max;
      c.classList.toggle("is-over", input.value.length > max);
    }
    input.addEventListener("input", update);
    update();
  }

  // Mostra a mídia escolhida num quadro com botão de trocar.
  function renderMediaBox(box, media, label, onPick, onClear) {
    box.innerHTML = "";
    if (!media) {
      var b = UI.el("button", { type: "button", class: "media-pick" }, [UI.el("strong", { text: label }), UI.el("span", { text: "Enviar ou escolher da biblioteca" })]);
      b.addEventListener("click", onPick);
      box.appendChild(b);
      return;
    }
    box.appendChild(App.thumb(media, "lg"));
    box.appendChild(UI.el("div", { class: "media-meta" }, [
      UI.el("strong", { text: media.filename || media.kind }),
      UI.el("span", { text: [media.kind === "video" ? "Vídeo" : "Imagem", media.width && media.height ? media.width + "×" + media.height : "", UI.bytes(media.size)].filter(Boolean).join(" · ") }),
      UI.el("div", { class: "card-actions" }, [
        UI.el("button", { type: "button", class: "btn btn-small btn-ghost", text: "Trocar", onclick: onPick }),
        onClear ? UI.el("button", { type: "button", class: "btn btn-small btn-ghost", text: "Remover", onclick: onClear }) : null,
      ]),
    ]));
  }

  /**
   * PinForm.init(form, { mode: "new" | "edit", pin, onSubmit(payload) })
   */
  PinForm.init = function (form, opts) {
    var o = opts || {};
    var limits = (App.status && App.status.limits) || {};
    var state = { media: (o.pin && o.pin.media) || null, cover: (o.pin && o.pin.cover) || null, accounts: [], boards: {} };
    var mediaBox = form.querySelector("#media-box");
    var coverBox = form.querySelector("#cover-box");
    var coverField = form.querySelector("#cover-field");
    var targetsWrap = form.querySelector("#targets");
    var msg = form.querySelector("#form-msg");

    counter(form.title, limits.title_max || 100);
    counter(form.description, limits.description_max || 800);
    counter(form.alt_text, limits.alt_text_max || 500);

    /* ---------- Mídia ---------- */

    function pickMedia() {
      MediaPicker.open({ kind: o.mode === "edit" && state.media ? state.media.kind : "any" }).then(function (m) {
        if (!m) return;
        state.media = m;
        if (m.kind !== "video") state.cover = null;
        refreshMedia();
      });
    }
    function pickCover() {
      MediaPicker.open({ kind: "image", title: "Imagem de capa do vídeo" }).then(function (m) {
        if (!m) return;
        state.cover = m;
        refreshMedia();
      });
    }
    function refreshMedia() {
      renderMediaBox(mediaBox, state.media, "Imagem ou vídeo do pin", pickMedia);
      var isVideo = state.media && state.media.kind === "video";
      coverField.hidden = !isVideo;
      if (isVideo) renderMediaBox(coverBox, state.cover, "Imagem de capa (obrigatória para vídeo)", pickCover, state.cover ? function () { state.cover = null; refreshMedia(); } : null);
    }
    refreshMedia();

    /* ---------- Destinos (contas + pastas) ---------- */

    function boardSelect(account, selected) {
      var sel = UI.el("select", { name: "board-" + account.id, "aria-label": "Pasta em @" + account.username });
      sel.appendChild(UI.el("option", { value: "", text: "Carregando pastas..." }));
      sel.disabled = true;
      UI.api("/api/accounts/" + account.id).then(function (r) {
        sel.innerHTML = "";
        if (r.status !== 200) return sel.appendChild(UI.el("option", { value: "", text: "Erro ao carregar" }));
        state.boards[account.id] = r.data.boards;
        if (!r.data.boards.length) return sel.appendChild(UI.el("option", { value: "", text: "Sem pastas: crie uma na conta" }));
        sel.appendChild(UI.el("option", { value: "", text: "Escolha a pasta" }));
        r.data.boards.forEach(function (b) {
          sel.appendChild(UI.el("option", { value: b.id, text: b.name + (b.privacy === "SECRET" ? " (secreta)" : "") }));
        });
        sel.disabled = false;
        if (selected) sel.value = selected;
      });
      return sel;
    }

    function renderTargets(accounts) {
      targetsWrap.innerHTML = "";
      var active = accounts.filter(function (a) { return a.status === "active"; });
      if (!active.length) {
        targetsWrap.appendChild(UI.empty("Nenhuma conta ativa.", "Conecte uma conta do Pinterest para programar pins.", UI.el("a", { class: "btn btn-primary", href: App.url("contas"), text: "Conectar conta" })));
        return;
      }
      var preAccount = App.query("conta") || (o.pin && o.pin.account && o.pin.account.id);
      var preBoard = App.query("pasta") || (o.pin && o.pin.board && o.pin.board.id);
      active.forEach(function (a) {
        var check = UI.el("input", { type: "checkbox", name: "account", value: a.id, id: "acc-" + a.id });
        var sel = boardSelect(a, preAccount === a.id ? preBoard : null);
        var row = UI.el("div", { class: "target-row" }, [
          UI.el("label", { class: "check", for: "acc-" + a.id }, [check, UI.el("span", { html: "<strong>@" + UI.escape(a.username) + "</strong>" + (a.label ? " <small>" + UI.escape(a.label) + "</small>" : "") })]),
          sel,
        ]);
        if (o.mode === "edit") {
          // Na edição só há uma conta: fica marcada e trancada
          check.checked = preAccount === a.id;
          if (!check.checked) row.hidden = true;
          check.disabled = true;
        } else if (preAccount ? preAccount === a.id : active.length === 1) {
          check.checked = true;
        }
        targetsWrap.appendChild(row);
      });
    }

    UI.api("/api/accounts").then(function (r) {
      if (r.status !== 200) return targetsWrap.appendChild(UI.el("p", { class: "form-msg is-error", text: UI.errorMessage(r) }));
      state.accounts = r.data.accounts;
      renderTargets(r.data.accounts);
    });

    /* ---------- Data ---------- */

    var whenInput = form.querySelector("#scheduled_at");
    var tzNote = form.querySelector("#tz-note");
    if (tzNote) tzNote.textContent = "Fuso horário: " + UI.tz().replace("_", " ");
    function syncWhen() {
      var now = form.querySelector('input[name="when"]:checked').value === "now";
      whenInput.disabled = now;
      whenInput.required = !now;
    }
    form.querySelectorAll('input[name="when"]').forEach(function (r) { r.addEventListener("change", syncWhen); });
    if (o.pin && o.pin.scheduled_at && o.mode === "edit") {
      form.querySelector('input[name="when"][value="later"]').checked = true;
      whenInput.value = UI.isoToLocal(o.pin.scheduled_at);
    } else {
      whenInput.value = UI.isoToLocal(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    }
    syncWhen();

    /* ---------- Envio ---------- */

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      UI.setMsg(msg, "", "info");
      if (!App.guard()) return;

      if (!state.media) return UI.setMsg(msg, "Escolha uma imagem ou um vídeo.", "error");
      if (state.media.kind === "video" && !state.cover) return UI.setMsg(msg, "Pins de vídeo precisam de uma imagem de capa.", "error");

      var targets = [];
      var missingBoard = null;
      form.querySelectorAll('input[name="account"]:checked').forEach(function (c) {
        var sel = form.querySelector('select[name="board-' + c.value + '"]');
        if (!sel || !sel.value) missingBoard = c.value;
        targets.push({ account: c.value, board: sel ? sel.value : "" });
      });
      if (!targets.length) return UI.setMsg(msg, "Escolha pelo menos uma conta.", "error");
      if (missingBoard) {
        var sel = form.querySelector('select[name="board-' + missingBoard + '"]');
        sel.focus();
        return UI.setMsg(msg, "Escolha a pasta para cada conta marcada.", "error");
      }

      var payload = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        link: form.link.value.trim(),
        alt_text: form.alt_text.value.trim(),
        media_id: state.media.id,
        cover_media_id: state.cover ? state.cover.id : null,
      };
      if (form.querySelector('input[name="when"]:checked').value === "now") payload.publish_now = true;
      else {
        var iso = UI.localToIso(whenInput.value);
        if (!iso) return UI.fieldError(form, "scheduled_at", "Escolha a data e a hora.");
        payload.scheduled_at = iso;
      }
      if (o.mode === "edit") {
        payload.board = targets[0].board;
      } else {
        payload.targets = targets;
      }

      var btn = form.querySelector("button[type=submit]");
      UI.busy(btn, true, "Salvando...");
      Promise.resolve(o.onSubmit(payload)).then(function () { UI.busy(btn, false); }).catch(function (err) {
        UI.busy(btn, false);
        if (!(err.field && UI.fieldError(form, err.field, err.message))) UI.setMsg(msg, err.message || "Não foi possível salvar.", "error");
      });
    });

    return state;
  };

  window.PinForm = PinForm;
})();
