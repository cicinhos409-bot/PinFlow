/* Seletor de mídia: enviar um arquivo (direto para o armazenamento) ou escolher da biblioteca.
 * Expõe window.MediaPicker.open({ kind: "image" | "video" | "any", title }) -> Promise<media | null> */
(function () {
  "use strict";

  var MediaPicker = {};

  function limits() {
    return (App.status && App.status.limits) || {};
  }

  function acceptFor(kind) {
    var l = limits();
    var images = (l.image_types || ["image/jpeg", "image/png", "image/webp", "image/gif"]).join(",");
    var videos = (l.video_types || ["video/mp4", "video/quicktime"]).join(",");
    return kind === "image" ? images : kind === "video" ? videos : images + "," + videos;
  }

  function kindOf(file) {
    var l = limits();
    if ((l.image_types || []).indexOf(file.type) >= 0) return "image";
    if ((l.video_types || []).indexOf(file.type) >= 0) return "video";
    if (/^image\//.test(file.type)) return "image";
    if (/^video\//.test(file.type)) return "video";
    return null;
  }

  // Lê largura/altura (imagem) ou duração (vídeo) no próprio navegador.
  function probe(file, kind) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var done = function (info) {
        URL.revokeObjectURL(url);
        resolve(info || {});
      };
      if (kind === "image") {
        var img = new Image();
        img.onload = function () { done({ width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = function () { done(); };
        img.src = url;
      } else {
        var v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = function () { done({ width: v.videoWidth, height: v.videoHeight, duration_ms: Math.round(v.duration * 1000) }); };
        v.onerror = function () { done(); };
        v.src = url;
      }
      setTimeout(function () { done(); }, 8000);
    });
  }

  function safeName(name) {
    return String(name || "arquivo").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  }

  // Envia o arquivo e registra na biblioteca. onProgress(0-100).
  MediaPicker.upload = function (file, onProgress) {
    var kind = kindOf(file);
    var l = limits();
    if (!kind) return Promise.reject(new Error("Formato não aceito. Use JPG, PNG, WEBP, GIF, MP4 ou MOV."));
    var max = kind === "video" ? l.video_max_bytes : l.image_max_bytes;
    if (max && file.size > max) return Promise.reject(new Error((kind === "video" ? "Vídeo" : "Imagem") + " acima de " + Math.round(max / 1048576) + " MB."));

    var mode = App.status && App.status.storage;
    var uploadPromise;
    if (mode === "blob") {
      if (!window.VercelBlob) return Promise.reject(new Error("Componente de upload não carregou. Recarregue a página."));
      var pathname = "u/" + App.user.id + "/" + Date.now().toString(36) + "-" + safeName(file.name);
      uploadPromise = window.VercelBlob.upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        contentType: file.type,
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: function (p) { if (onProgress) onProgress(p.percentage); },
      }).then(function (blob) { return { url: blob.url }; });
    } else if (mode === "file") {
      uploadPromise = new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", "/api/media/upload-local?filename=" + encodeURIComponent(file.name));
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = function () {
          try {
            var data = JSON.parse(xhr.responseText);
            if (xhr.status === 200) resolve({ url: data.url });
            else reject(new Error((data.error && data.error.message) || "Falha no envio."));
          } catch (e) { reject(new Error("Falha no envio.")); }
        };
        xhr.onerror = function () { reject(new Error("Falha no envio. Confira sua internet.")); };
        xhr.send(file);
      });
    } else {
      return Promise.reject(new Error("O armazenamento de imagens e vídeos ainda não está configurado."));
    }

    return Promise.all([uploadPromise, probe(file, kind)]).then(function (res) {
      var info = res[1] || {};
      return UI.api("/api/media", { method: "POST", body: { url: res[0].url, content_type: file.type, filename: file.name, size: file.size, width: info.width, height: info.height, duration_ms: info.duration_ms } }).then(function (r) {
        UI.throwIfError(r, 201);
        return r.data.media;
      });
    });
  };

  MediaPicker.open = function (opts) {
    var o = opts || {};
    var kind = o.kind || "any";
    var chosen = null;

    var tabs = UI.el("div", { class: "tabs", role: "tablist" });
    var tabUpload = UI.el("button", { type: "button", role: "tab", "aria-selected": "true", text: "Enviar arquivo" });
    var tabLib = UI.el("button", { type: "button", role: "tab", "aria-selected": "false", text: "Biblioteca" });
    tabs.appendChild(tabUpload);
    tabs.appendChild(tabLib);

    var fileInput = UI.el("input", { type: "file", id: "mp-file", accept: acceptFor(kind), class: "visually-hidden" });
    var drop = UI.el("label", { class: "dropzone", for: "mp-file" }, [
      UI.el("strong", { text: kind === "video" ? "Escolha um vídeo" : kind === "image" ? "Escolha uma imagem" : "Escolha uma imagem ou um vídeo" }),
      UI.el("span", { text: kind === "video" ? "MP4 ou MOV, até " + Math.round((limits().video_max_bytes || 0) / 1048576) + " MB" : "JPG, PNG, WEBP ou GIF" + (kind === "any" ? " · MP4 ou MOV" : "") + ". Formato vertical 2:3 funciona melhor na Pinterest." }),
      fileInput,
    ]);
    var progress = UI.el("div", { class: "progress", hidden: true }, UI.el("i"));
    var uploadPane = UI.el("div", { role: "tabpanel" }, [drop, progress]);
    var libPane = UI.el("div", { role: "tabpanel", hidden: true, class: "media-grid-wrap" });

    function showTab(which) {
      var up = which === "upload";
      tabUpload.setAttribute("aria-selected", up ? "true" : "false");
      tabLib.setAttribute("aria-selected", up ? "false" : "true");
      uploadPane.hidden = !up;
      libPane.hidden = up;
      if (!up && !libPane.dataset.loaded) loadLibrary();
    }
    tabUpload.addEventListener("click", function () { showTab("upload"); });
    tabLib.addEventListener("click", function () { showTab("library"); });

    var helpersRef = null;

    function loadLibrary() {
      libPane.dataset.loaded = "1";
      libPane.innerHTML = "";
      libPane.appendChild(UI.el("p", { class: "hint", text: "Carregando..." }));
      UI.api("/api/media?limit=120" + (kind !== "any" ? "&kind=" + kind : "")).then(function (r) {
        libPane.innerHTML = "";
        if (r.status !== 200) return libPane.appendChild(UI.el("p", { class: "form-msg is-error", text: UI.errorMessage(r) }));
        if (!r.data.media.length) return libPane.appendChild(UI.empty("Biblioteca vazia.", "Os arquivos que você enviar ficam aqui para reutilizar em outros pins."));
        var grid = UI.el("div", { class: "media-grid" });
        r.data.media.forEach(function (m) {
          var b = UI.el("button", { type: "button", class: "media-cell", title: m.filename || "" }, [App.thumb(m, "lg"), UI.el("span", { class: "media-name", text: m.filename || m.kind })]);
          b.addEventListener("click", function () {
            chosen = m;
            helpersRef.close(m);
          });
          var del = UI.el("button", { type: "button", class: "media-del", "aria-label": "Apagar da biblioteca", html: "&times;" });
          del.addEventListener("click", function (e) {
            e.stopPropagation();
            UI.confirm({ title: "Apagar este arquivo?", message: "Ele sai da biblioteca e do armazenamento. Pins já publicados não são afetados.", confirmText: "Apagar", danger: true }).then(function (ok) {
              if (!ok) return reopen();
              UI.api("/api/media/" + m.id, { method: "DELETE" }).then(function (r2) {
                if (r2.status !== 200) UI.toast(UI.errorMessage(r2), "error");
                else UI.toast("Arquivo apagado.", "ok");
                reopen();
              });
            });
          });
          var cell = UI.el("div", { class: "media-cell-wrap" }, [b, del]);
          grid.appendChild(cell);
        });
        libPane.appendChild(grid);
      });
    }

    var resultPromise;
    function reopen() {
      // Reabre o seletor na aba da biblioteca depois de uma confirmação (que fecha o modal atual)
      MediaPicker.open(Object.assign({}, o, { startTab: "library" })).then(function (m) { finalResolve(m); });
    }
    var finalResolve;
    resultPromise = new Promise(function (resolve) { finalResolve = resolve; });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      drop.classList.add("is-busy");
      progress.hidden = false;
      progress.firstChild.style.width = "2%";
      MediaPicker.upload(file, function (pct) { progress.firstChild.style.width = Math.max(2, pct) + "%"; })
        .then(function (media) {
          UI.toast("Arquivo enviado.", "ok");
          chosen = media;
          helpersRef.close(media);
        })
        .catch(function (e) {
          drop.classList.remove("is-busy");
          progress.hidden = true;
          helpersRef.error(e.message || "Falha no envio.");
          fileInput.value = "";
        });
    });

    UI.dialog({
      title: o.title || (kind === "video" ? "Vídeo do pin" : kind === "image" ? "Imagem" : "Imagem ou vídeo"),
      content: UI.el("div", {}, [tabs, uploadPane, libPane]),
      hideActions: true,
      size: "large",
      onOpen: function (form, helpers) {
        helpersRef = helpers;
        if (o.startTab === "library") showTab("library");
      },
    }).then(function (v) {
      if (v && v.id) finalResolve(v);
      else if (!chosen) finalResolve(null);
    });

    return resultPromise;
  };

  window.MediaPicker = MediaPicker;
})();
