/* Kit de interface da plataforma: janelas de confirmação próprias (no lugar das do navegador),
 * diálogos com formulário, avisos (toasts) e utilidades de formatação.
 * Sem dependências. Expõe window.UI. */
(function () {
  "use strict";

  var UI = {};
  var activeModal = null;
  var lastFocus = null;

  /* ---------- Utilidades ---------- */

  UI.escape = function (s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // Cria elementos: UI.el("div", { class: "x", onclick: fn, html: "..." }, [filhos])
  UI.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : children !== undefined ? [children] : []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  };

  UI.busy = function (button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.hasAttribute("data-label")) button.setAttribute("data-label", button.textContent);
      button.textContent = label || "Aguarde...";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.getAttribute("data-label") || button.textContent;
      button.removeAttribute("data-label");
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  };

  UI.setMsg = function (el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "form-msg" + (text ? " is-" + (kind || "info") : "");
  };

  UI.fieldError = function (form, name, message) {
    var input = form && (form.querySelector('[name="' + name + '"]') || form.querySelector("#" + name));
    if (input) {
      var field = input.closest(".field");
      if (field) {
        field.classList.add("has-error");
        var hint = field.querySelector(".field-error");
        if (!hint) {
          hint = UI.el("p", { class: "field-error", role: "alert" });
          field.appendChild(hint);
        }
        hint.textContent = message;
      }
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return true;
    }
    return false;
  };

  UI.clearErrors = function (form) {
    if (!form) return;
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field-error").forEach(function (f) { f.remove(); });
    form.querySelectorAll("[aria-invalid]").forEach(function (f) { f.removeAttribute("aria-invalid"); });
  };

  /* ---------- Datas ---------- */

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  UI.tz = function () {
    return (window.App && window.App.user && window.App.user.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  };

  UI.formatDateTime = function (iso, opts) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", Object.assign({ timeZone: UI.tz(), day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, opts || {})).format(new Date(iso)).replace(".", "");
    } catch (e) {
      return new Date(iso).toLocaleString("pt-BR");
    }
  };

  UI.formatDate = function (iso) {
    return UI.formatDateTime(iso, { hour: undefined, minute: undefined, day: "2-digit", month: "2-digit", year: "numeric" });
  };

  UI.formatRelative = function (iso) {
    if (!iso) return "";
    var diff = (new Date(iso).getTime() - Date.now()) / 1000;
    var abs = Math.abs(diff);
    var rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
    if (abs < 60) return rtf.format(Math.round(diff), "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
    return UI.formatDate(iso);
  };

  // Partes de uma data em um fuso: { y, m, d, hh, mm }
  function partsIn(dateMs, tz) {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(dateMs));
    var g = {};
    parts.forEach(function (p) { g[p.type] = p.value; });
    return { y: +g.year, m: +g.month, d: +g.day, hh: +g.hour === 24 ? 0 : +g.hour, mm: +g.minute, ss: +g.second };
  }

  function tzOffsetMs(utcMs, tz) {
    var p = partsIn(utcMs, tz);
    var asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }

  // "2026-10-22T14:30" (no fuso tz) -> ISO em UTC
  UI.localToIso = function (local, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || "");
    if (!m) return null;
    var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var guess = wall;
    for (var i = 0; i < 2; i++) guess = wall - tzOffsetMs(guess, tz || UI.tz());
    return new Date(guess).toISOString();
  };

  // ISO -> "2026-10-22T14:30" no fuso tz (para <input type=datetime-local>)
  UI.isoToLocal = function (iso, tz) {
    if (!iso) return "";
    var p = partsIn(new Date(iso).getTime(), tz || UI.tz());
    return p.y + "-" + pad(p.m) + "-" + pad(p.d) + "T" + pad(p.hh) + ":" + pad(p.mm);
  };

  UI.bytes = function (n) {
    if (!n) return "";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  };

  /* ---------- Avisos (toast) ---------- */

  var toastWrap = null;
  UI.toast = function (message, kind, ms) {
    if (!toastWrap) {
      toastWrap = UI.el("div", { class: "toasts", "aria-live": "polite" });
      document.body.appendChild(toastWrap);
    }
    var t = UI.el("div", { class: "toast is-" + (kind || "info"), role: "status" }, [
      UI.el("span", { text: message }),
      UI.el("button", { class: "toast-close", type: "button", "aria-label": "Fechar", onclick: function () { remove(); } }, "×"),
    ]);
    toastWrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    var timer = setTimeout(remove, ms || (kind === "error" ? 8000 : 4500));
    function remove() {
      clearTimeout(timer);
      t.classList.remove("is-in");
      setTimeout(function () { t.remove(); }, 200);
    }
    return remove;
  };

  /* ---------- Janela modal ---------- */

  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openModal(opts) {
    if (activeModal) activeModal.close(null);
    lastFocus = document.activeElement;
    var o = opts || {};
    var resolved = false;
    var result = null;

    var backdrop = UI.el("div", { class: "modal-backdrop" });
    var box = UI.el("div", { class: "modal" + (o.size === "large" ? " modal-large" : ""), role: o.role || "dialog", "aria-modal": "true", "aria-labelledby": "modal-title", tabindex: "-1" });
    var head = UI.el("div", { class: "modal-head" }, [
      UI.el("h2", { id: "modal-title", class: "modal-title", text: o.title || "" }),
      o.noClose ? null : UI.el("button", { class: "icon-btn modal-close", type: "button", "aria-label": "Fechar", onclick: function () { close(null); } }, "×"),
    ]);
    var body = UI.el("div", { class: "modal-body" });
    if (typeof o.content === "string") body.innerHTML = o.content;
    else if (o.content) body.appendChild(o.content);
    var foot = UI.el("div", { class: "modal-foot" });
    box.appendChild(head);
    box.appendChild(body);
    if (o.actions && o.actions.length) {
      o.actions.forEach(function (a) { foot.appendChild(a); });
      box.appendChild(foot);
    }
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    document.body.classList.add("modal-open");

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      } else if (e.key === "Tab") {
        var list = focusables(box);
        if (!list.length) return;
        var first = list[0];
        var last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("mousedown", function (e) {
      if (e.target === backdrop && !o.noClose) close(null);
    });

    var promise = new Promise(function (resolve) {
      box._resolve = resolve;
    });

    function close(value) {
      if (resolved) return;
      resolved = true;
      result = value;
      document.removeEventListener("keydown", onKey);
      backdrop.classList.add("is-out");
      setTimeout(function () {
        backdrop.remove();
        if (!document.querySelector(".modal-backdrop")) document.body.classList.remove("modal-open");
      }, 160);
      activeModal = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      box._resolve(value);
    }

    requestAnimationFrame(function () {
      backdrop.classList.add("is-in");
      var target = o.focus ? box.querySelector(o.focus) : null;
      (target || focusables(body)[0] || focusables(foot)[0] || box).focus();
    });

    activeModal = { close: close, box: box, body: body, foot: foot, promise: promise };
    return activeModal;
  }

  UI.closeModal = function () {
    if (activeModal) activeModal.close(null);
  };

  /**
   * Confirmação própria (substitui o confirm() do navegador).
   * UI.confirm({ title, message, confirmText, cancelText, danger, checkbox: { label, checked }, typeToConfirm: "EXCLUIR" })
   * Resolve com false (cancelou) ou { ok: true, checkbox: bool }.
   */
  UI.confirm = function (opts) {
    var o = opts || {};
    var checkbox = null;
    var typed = null;
    var content = UI.el("div", {}, [
      o.message ? UI.el("p", { class: "modal-text", html: typeof o.message === "string" && o.html ? o.message : UI.escape(o.message).replace(/\n/g, "<br>") }) : null,
      o.details ? UI.el("p", { class: "modal-details", text: o.details }) : null,
    ]);
    if (o.checkbox) {
      checkbox = UI.el("input", { type: "checkbox", id: "modal-check", checked: o.checkbox.checked ? true : null });
      content.appendChild(UI.el("label", { class: "check modal-check" }, [checkbox, UI.el("span", { text: o.checkbox.label })]));
    }
    if (o.typeToConfirm) {
      typed = UI.el("input", { type: "text", id: "modal-typed", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
      content.appendChild(UI.el("div", { class: "field modal-field" }, [
        UI.el("label", { for: "modal-typed", html: "Digite <strong>" + UI.escape(o.typeToConfirm) + "</strong> para confirmar" }),
        typed,
      ]));
    }
    var okBtn = UI.el("button", { class: "btn " + (o.danger ? "btn-danger" : "btn-primary"), type: "button", text: o.confirmText || "Confirmar" });
    var cancelBtn = UI.el("button", { class: "btn btn-ghost", type: "button", text: o.cancelText || "Cancelar" });
    var modal = openModal({ title: o.title || "Tem certeza?", content: content, actions: [cancelBtn, okBtn], focus: typed ? "#modal-typed" : o.danger ? ".btn-ghost" : ".btn-primary" });
    if (typed) {
      okBtn.disabled = true;
      typed.addEventListener("input", function () {
        okBtn.disabled = typed.value.trim().toUpperCase() !== String(o.typeToConfirm).toUpperCase();
      });
      typed.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !okBtn.disabled) okBtn.click();
      });
    }
    cancelBtn.addEventListener("click", function () { modal.close(null); });
    okBtn.addEventListener("click", function () {
      modal.close({ ok: true, checkbox: checkbox ? checkbox.checked : false, typed: typed ? typed.value : "" });
    });
    return modal.promise.then(function (v) { return v || false; });
  };

  UI.alert = function (opts) {
    var o = typeof opts === "string" ? { message: opts } : opts || {};
    var okBtn = UI.el("button", { class: "btn btn-primary", type: "button", text: o.okText || "Entendi" });
    var modal = openModal({ title: o.title || "Aviso", content: UI.el("p", { class: "modal-text", text: o.message || "" }), actions: [okBtn] });
    okBtn.addEventListener("click", function () { modal.close(true); });
    return modal.promise;
  };

  /**
   * Diálogo com formulário.
   * UI.dialog({ title, content (node|html), submitText, cancelText, danger, size,
   *             onSubmit(form, helpers) -> Promise (lance um erro ou devolva false para manter aberto) })
   * Resolve com o valor devolvido por onSubmit, ou null se fechou.
   */
  UI.dialog = function (opts) {
    var o = opts || {};
    var form = UI.el("form", { class: "form modal-form", novalidate: true });
    if (typeof o.content === "string") form.innerHTML = o.content;
    else if (o.content) form.appendChild(o.content);
    var msg = UI.el("p", { class: "form-msg", role: "alert", "aria-live": "polite" });
    form.appendChild(msg);
    // Botão de envio invisível dentro do formulário: Enter nos campos envia; o botão visível fica no rodapé.
    form.appendChild(UI.el("button", { type: "submit", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true", text: "Enviar" }));
    var okBtn = UI.el("button", { class: "btn " + (o.danger ? "btn-danger" : "btn-primary"), type: "submit", text: o.submitText || "Salvar" });
    var cancelBtn = UI.el("button", { class: "btn btn-ghost", type: "button", text: o.cancelText || "Cancelar" });
    var modal = openModal({ title: o.title || "", content: form, actions: o.hideActions ? [] : [cancelBtn, okBtn], size: o.size, focus: o.focus });
    cancelBtn.addEventListener("click", function () { modal.close(null); });
    okBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    var helpers = {
      close: function (v) { modal.close(v === undefined ? null : v); },
      error: function (text, field) {
        if (!(field && UI.fieldError(form, field, text))) UI.setMsg(msg, text, "error");
      },
      msg: msg,
      form: form,
      body: modal.body,
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      UI.setMsg(msg, "", "info");
      if (!o.onSubmit) return modal.close(true);
      UI.busy(okBtn, true, o.busyText || "Salvando...");
      Promise.resolve()
        .then(function () { return o.onSubmit(form, helpers); })
        .then(function (result) {
          UI.busy(okBtn, false);
          if (result !== false && result !== undefined) modal.close(result);
          else if (result === undefined) modal.close(true);
        })
        .catch(function (err) {
          UI.busy(okBtn, false);
          helpers.error((err && err.message) || "Não foi possível concluir.", err && err.field);
        });
    });
    if (o.onOpen) o.onOpen(form, helpers);
    return modal.promise;
  };

  // Menu de ações (três pontos) ancorado num botão.
  UI.menu = function (anchor, items) {
    var existing = document.querySelector(".popmenu");
    if (existing) existing.remove();
    var menu = UI.el("div", { class: "popmenu", role: "menu" });
    items.forEach(function (it) {
      if (!it) return;
      if (it.separator) return menu.appendChild(UI.el("hr"));
      var b = UI.el("button", { type: "button", role: "menuitem", class: it.danger ? "is-danger" : "", text: it.label, disabled: it.disabled ? true : null });
      b.addEventListener("click", function () {
        cleanup();
        it.onClick();
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 6;
    var left = Math.min(r.right + window.scrollX - menu.offsetWidth, window.innerWidth + window.scrollX - menu.offsetWidth - 8);
    menu.style.top = top + "px";
    menu.style.left = Math.max(8, left) + "px";
    function cleanup() {
      menu.remove();
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    }
    function onDoc(e) {
      if (!menu.contains(e.target) && e.target !== anchor) cleanup();
    }
    function onKey(e) {
      if (e.key === "Escape") cleanup();
    }
    setTimeout(function () {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    var first = menu.querySelector("button:not([disabled])");
    if (first) first.focus();
  };

  // Estado vazio padrão
  UI.empty = function (title, text, action) {
    return UI.el("div", { class: "empty" }, [
      UI.el("p", {}, UI.el("strong", { text: title })),
      text ? UI.el("p", { text: text }) : null,
      action || null,
    ]);
  };

  // Chamadas à API (com cookies). Devolve { status, data } e nunca lança por rede.
  UI.api = function (path, options) {
    var opts = options || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch(path, init)
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) { return { status: res.status, data: data }; });
      })
      .catch(function () {
        return { status: 0, data: null };
      });
  };

  UI.errorMessage = function (result) {
    if (result && result.data && result.data.error && result.data.error.message) return result.data.error.message;
    if (result && result.status === 0) return "Sem conexão com o servidor. Confira sua internet e tente de novo.";
    return "Não foi possível concluir agora. Tente de novo em instantes.";
  };

  // Lança um erro com mensagem amigável a partir de uma resposta ruim (para usar em diálogos).
  UI.throwIfError = function (result, okStatus) {
    if (result.status === (okStatus || 200) || (result.status >= 200 && result.status < 300)) return result;
    var e = new Error(UI.errorMessage(result));
    e.field = result.data && result.data.error && result.data.error.field;
    e.code = result.data && result.data.error && result.data.error.code;
    e.status = result.status;
    throw e;
  };

  window.UI = UI;
})();
