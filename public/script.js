(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    provider: $("provider"),
    apiKey: $("apiKey"),
    deckName: $("deckName"),
    tags: $("tags"),
    formato: $("formato"),
    modelName: $("modelName"),
    frontField: $("frontField"),
    backField: $("backField"),
    clozeModelName: $("clozeModelName"),
    clozeField: $("clozeField"),
    ankiUrl: $("ankiUrl"),
    ankiApiKey: $("ankiApiKey"),
    resolucao: $("resolucao"),
    imageZone: $("imageZone"),
    imageInput: $("imageInput"),
    imageThumbs: $("imageThumbs"),
    attachImages: $("attachImages"),
    questaoInput: $("questaoInput"),
    resolveBtn: $("resolveBtn"),
    resolveStatus: $("resolveStatus"),
    resolveResultWrap: $("resolveResultWrap"),
    resolveResult: $("resolveResult"),
    useResolutionBtn: $("useResolutionBtn"),
    pasteBtn: $("pasteBtn"),
    openEvidenceBtn: $("openEvidenceBtn"),
    generateBtn: $("generateBtn"),
    genStatus: $("genStatus"),
    resultsPanel: $("resultsPanel"),
    cardsGrid: $("cardsGrid"),
    drawerLabel: $("drawerLabel"),
    sendAllBtn: $("sendAllBtn"),
    downloadBtn: $("downloadBtn"),
    generateMoreBtn: $("generateMoreBtn"),
    temasPanel: $("temasPanel"),
    temasChips: $("temasChips"),
    temaInput: $("temaInput"),
    temaCustomBtn: $("temaCustomBtn"),
    ankiStatus: $("ankiStatus"),
    themeToggle: $("themeToggle"),
    configFab: $("configFab"),
  };

  const STORAGE_KEY = "flashcard_anki_settings_v1";

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.provider) els.provider.value = saved.provider;
      if (saved.apiKey) els.apiKey.value = saved.apiKey;
      if (saved.deckName) els.deckName.value = saved.deckName;
      if (saved.tags) els.tags.value = saved.tags;
      if (saved.formato) els.formato.value = saved.formato;
      if (saved.modelName) els.modelName.value = saved.modelName;
      if (saved.frontField) els.frontField.value = saved.frontField;
      if (saved.backField) els.backField.value = saved.backField;
      if (saved.clozeModelName) els.clozeModelName.value = saved.clozeModelName;
      if (saved.clozeField) els.clozeField.value = saved.clozeField;
      if (saved.ankiUrl) els.ankiUrl.value = saved.ankiUrl;
      if (saved.ankiApiKey) els.ankiApiKey.value = saved.ankiApiKey;
    } catch (_) {
      /* ignora configuração corrompida */
    }
  }

  function saveSettings() {
    const settings = {
      provider: els.provider.value,
      apiKey: els.apiKey.value,
      deckName: els.deckName.value,
      tags: els.tags.value,
      formato: els.formato.value,
      modelName: els.modelName.value,
      frontField: els.frontField.value,
      backField: els.backField.value,
      clozeModelName: els.clozeModelName.value,
      clozeField: els.clozeField.value,
      ankiUrl: els.ankiUrl.value,
      ankiApiKey: els.ankiApiKey.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  [
    "provider", "apiKey", "deckName", "tags", "formato",
    "modelName", "frontField", "backField", "clozeModelName", "clozeField",
    "ankiUrl", "ankiApiKey",
  ].forEach((id) => els[id].addEventListener("change", saveSettings));

const THEME_KEY = "francards_theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);

  if (els.themeToggle) {
    els.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    els.themeToggle.title =
      theme === "dark" ? "Modo claro" : "Modo escuro";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyTheme(prefersDark ? "dark" : "light");
}

  // Ao mexer nos campos de modelo/campos/endereço do Anki, esquece o modelo
  // detectado para redescobrir na próxima vez.
  ["modelName", "frontField", "backField", "clozeModelName", "clozeField", "ankiUrl"].forEach(
    (id) => els[id].addEventListener("change", () => { ankiTargetCache = {}; })
  );

  // ------------------------------------------------------------------
  // Limpeza de conteúdo colado (tabelas/listas do OpenEvidence etc.)
  // ------------------------------------------------------------------

  function htmlToStructuredText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("table").forEach((table) => {
      const lines = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td")).map((cell) =>
          cell.textContent.trim().replace(/\s+/g, " ")
        );
        if (cells.length) lines.push(cells.join(" | "));
      });
      table.replaceWith(doc.createTextNode("\n" + lines.join("\n") + "\n"));
    });

    doc.querySelectorAll("li").forEach((li) => {
      li.prepend(doc.createTextNode("- "));
      li.append(doc.createTextNode("\n"));
    });

    doc.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
    doc.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, tr").forEach((el) => {
      el.append(doc.createTextNode("\n"));
    });

    let text = doc.body ? doc.body.textContent || "" : "";

    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/[ \t]*\n[ \t]*/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
  }

  function insertTextInResolucao(text, { replace = false } = {}) {
    const textarea = els.resolucao;
    if (replace || !textarea.value.trim()) {
      textarea.value = text;
    } else {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    }
    textarea.dispatchEvent(new Event("input"));
    textarea.focus();
  }

  els.resolucao.addEventListener("paste", (e) => {
    // Se colaram uma imagem, captura como figura (não como texto).
    const imgFiles = imageFilesFromDataTransfer(e.clipboardData);
    if (imgFiles.length) {
      e.preventDefault();
      imgFiles.forEach(addImageFile);
      return;
    }
    const html = e.clipboardData && e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const cleaned = htmlToStructuredText(html);
    insertTextInResolucao(cleaned);
  });

  async function pasteFromClipboard() {
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            const html = await blob.text();
            insertTextInResolucao(htmlToStructuredText(html));
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      insertTextInResolucao(text);
    } catch (err) {
      alert(
        "Não foi possível colar automaticamente (o navegador pode ter bloqueado o acesso à área de transferência). Use Ctrl+V / colar manual no campo de texto."
      );
    }
  }

  // ------------------------------------------------------------------
  // Imagens (ECG, radiografia, foto clínica)
  // ------------------------------------------------------------------

  let attachedImages = []; // { id, mime, base64, dataUrl, filename? }
  let imageSeq = 0;

  function imageFilesFromDataTransfer(dt) {
    if (!dt) return [];
    const out = [];
    if (dt.files && dt.files.length) {
      for (const f of dt.files) if (f.type.startsWith("image/")) out.push(f);
    }
    if (!out.length && dt.items) {
      for (const it of dt.items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) out.push(f);
        }
      }
    }
    return out;
  }

  function addImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return;
      const base64 = dataUrl.slice(comma + 1);
      attachedImages.push({
        id: ++imageSeq,
        mime: file.type,
        base64,
        dataUrl,
      });
      renderThumbs();
    };
    reader.readAsDataURL(file);
  }

  function removeImage(id) {
    attachedImages = attachedImages.filter((img) => img.id !== id);
    renderThumbs();
  }

  function renderThumbs() {
    els.imageThumbs.innerHTML = "";
    els.imageZone.classList.toggle("has-images", attachedImages.length > 0);
    attachedImages.forEach((img) => {
      const wrap = document.createElement("div");
      wrap.className = "image-thumb";
      const image = document.createElement("img");
      image.src = img.dataUrl;
      image.alt = "imagem da questão";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "image-thumb-remove";
      rm.textContent = "×";
      rm.title = "remover imagem";
      rm.addEventListener("click", () => removeImage(img.id));
      wrap.append(image, rm);
      els.imageThumbs.appendChild(wrap);
    });
  }

  function imagesForApi() {
    return attachedImages.map((img) => ({ mime: img.mime, data: img.base64 }));
  }

  // --- anexo no Anki (storeMediaFile + <img>) ---
  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function extFromMime(mime) {
    if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    return "png";
  }

  async function ensureMediaStored() {
    for (const img of attachedImages) {
      if (img.filename) continue;
      const filename = `francards-${hashString(img.base64)}.${extFromMime(img.mime)}`;
      await ankiRequest("storeMediaFile", { filename, data: img.base64 });
      img.filename = filename;
    }
    return attachedImages.map((img) => img.filename).filter(Boolean);
  }

  async function imagesHtmlForAnki() {
    if (!els.attachImages.checked || attachedImages.length === 0) return "";
    const names = await ensureMediaStored();
    return names.map((n) => `<br><img src="${n}">`).join("");
  }

  // Drag & drop e input de arquivo
  els.imageZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.imageZone.classList.add("dragover");
  });
  els.imageZone.addEventListener("dragleave", () => els.imageZone.classList.remove("dragover"));
  els.imageZone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.imageZone.classList.remove("dragover");
    imageFilesFromDataTransfer(e.dataTransfer).forEach(addImageFile);
  });
  els.imageZone.addEventListener("paste", (e) => {
    const imgs = imageFilesFromDataTransfer(e.clipboardData);
    if (imgs.length) {
      e.preventDefault();
      imgs.forEach(addImageFile);
    }
  });
  // Clique direto na zona (fora do label) também abre o file picker
  els.imageZone.addEventListener("click", (e) => {
    if (e.target.closest("label.image-zone-link")) return;
    els.imageInput.click();
  });
  els.imageInput.addEventListener("change", () => {
    Array.from(els.imageInput.files || []).forEach(addImageFile);
    els.imageInput.value = "";
  });

  // ------------------------------------------------------------------
  // Resolver questão com a IA
  // ------------------------------------------------------------------

  function setResolveStatus(message, state) {
    els.resolveStatus.textContent = message || "";
    if (state) els.resolveStatus.dataset.state = state;
    else els.resolveStatus.removeAttribute("data-state");
  }

  async function resolveQuestion() {
    const questao = els.questaoInput.value.trim();
    if (questao.length < 10) {
      setResolveStatus("Cole o enunciado da questão antes de pedir a resolução.", "error");
      return;
    }

    els.resolveBtn.disabled = true;
    const originalLabel = els.resolveBtn.textContent;
    els.resolveBtn.textContent = "Resolvendo…";
    setResolveStatus("Consultando a IA…");

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questao,
          provider: els.provider.value,
          api_key: els.apiKey.value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

      els.resolveResult.value = data.resolucao || "";
      els.resolveResult.dispatchEvent(new Event("input"));
      els.resolveResultWrap.hidden = false;
      setResolveStatus("Resolução gerada — revise abaixo antes de usar.", "ok");
    } catch (err) {
      setResolveStatus(err.message || "Falha ao resolver a questão.", "error");
    } finally {
      els.resolveBtn.disabled = false;
      els.resolveBtn.textContent = originalLabel;
    }
  }

  function useGeneratedResolution() {
    const texto = els.resolveResult.value.trim();
    if (!texto) return;
    insertTextInResolucao(texto, { replace: true });
    setResolveStatus("Resolução usada no campo abaixo.", "ok");
  }

  // ------------------------------------------------------------------
  // AnkiConnect
  // ------------------------------------------------------------------

  async function ankiRequest(action, params = {}) {
    const body = { action, version: 6, params };
    const key = els.ankiApiKey.value.trim();
    if (key) body.key = key;

    const res = await fetch(els.ankiUrl.value.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AnkiConnect respondeu ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async function checkAnkiConnection() {
    try {
      await ankiRequest("version");
      els.ankiStatus.dataset.state = "ok";
  els.ankiStatus.style.cursor="default";
  els.ankiStatus.title="";
      els.ankiStatus.textContent = "AnkiConnect conectado";
    } catch (_) {
      els.ankiStatus.dataset.state = "error";
  els.ankiStatus.style.cursor="pointer";
  els.ankiStatus.title="Clique para tentar novamente";
      els.ankiStatus.textContent = "AnkiConnect não encontrado";
    }
  }

  async function ensureDeck(deckName) {
    await ankiRequest("createDeck", { deck: deckName });
  }

  // Descobre, no Anki do usuário, qual modelo de nota usar e seus campos —
  // funciona mesmo se o Anki estiver em português ("Básico", "Omissão de
  // palavras") ou com modelos renomeados. Resultado fica em cache.
  let ankiTargetCache = {};

  async function resolveAnkiTarget(kind) {
    if (ankiTargetCache[kind]) return ankiTargetCache[kind];

    const models = await ankiRequest("modelNames"); // lista de nomes de modelos
    const configured =
      kind === "cloze" ? els.clozeModelName.value.trim() : els.modelName.value.trim();

    let model = configured && models.includes(configured) ? configured : null;

    if (!model && kind === "cloze") {
      // modelo de cloze: nome contém "cloze" ou "omiss" (Omissão de palavras)
      model = models.find((m) => /cloze|omiss/i.test(m)) || null;
      if (!model) {
        throw new Error(
          "Não encontrei um modelo de nota Cloze no seu Anki (ex.: 'Cloze' ou " +
            "'Omissão de palavras'). Verifique em Ferramentas → Gerenciar tipos de nota."
        );
      }
    }
    if (!model && kind !== "cloze") {
      // modelo básico: prefere um "Basic/Básico", senão qualquer um que NÃO seja cloze
      model =
        models.find((m) => /basic|b[aá]sico|padr[aã]o/i.test(m)) ||
        models.find((m) => !/cloze|omiss/i.test(m)) ||
        models[0];
      if (!model) throw new Error("Nenhum modelo de nota encontrado no seu Anki.");
    }

    const fieldNames = await ankiRequest("modelFieldNames", { modelName: model });
    const target = { model, fieldNames };
    ankiTargetCache[kind] = target;
    return target;
  }

  async function triggerAnkiSync() {
    const previousText = els.ankiStatus.textContent;
    const previousState = els.ankiStatus.dataset.state;
    els.ankiStatus.textContent = "sincronizando com o AnkiWeb…";
    try {
      await ankiRequest("sync");
      els.ankiStatus.textContent = "sincronizado com o AnkiWeb ✓";
    } catch (_) {
      els.ankiStatus.textContent = previousText;
      els.ankiStatus.dataset.state = previousState;
      return;
    }
    setTimeout(() => {
      els.ankiStatus.textContent = previousText;
      els.ankiStatus.dataset.state = previousState;
    }, 4000);
  }

  async function sendCardToAnki(card, imgHtml = "") {
    const deckName = els.deckName.value.trim() || "Padrão";
    const tags = els.tags.value.trim().split(/\s+/).filter(Boolean);

    await ensureDeck(deckName);

    let modelName;
    let fields;
    if (card.tipo === "cloze") {
      const t = await resolveAnkiTarget("cloze");
      const cfg = els.clozeField.value.trim();
      const field = cfg && t.fieldNames.includes(cfg) ? cfg : t.fieldNames[0];
      modelName = t.model;
      fields = { [field]: card.texto + imgHtml };
    } else {
      const t = await resolveAnkiTarget("basic");
      const cfgF = els.frontField.value.trim();
      const cfgB = els.backField.value.trim();
      const front = cfgF && t.fieldNames.includes(cfgF) ? cfgF : t.fieldNames[0];
      const back = cfgB && t.fieldNames.includes(cfgB) ? cfgB : t.fieldNames[1] || t.fieldNames[0];
      modelName = t.model;
      fields = {
        [front]: card.pergunta + imgHtml,
        [back]: card.resposta + imgHtml,   // imagem aparece no verso também
      };
    }

    const note = {
      deckName,
      modelName,
      fields,
      tags,
      options: {
        allowDuplicate: false,
        duplicateScope: "deck",
      },
    };

    return ankiRequest("addNote", { note });
  }

  // ------------------------------------------------------------------
  // Geração de flashcards
  // ------------------------------------------------------------------

  function setGenerating(isGenerating) {
    els.generateBtn.disabled = isGenerating;
    els.generateBtn.textContent = isGenerating ? "Gerando…" : "Gerar flashcards";
  }

  function setGenStatus(message, state) {
    els.genStatus.textContent = message || "";
    if (state) els.genStatus.dataset.state = state;
    else els.genStatus.removeAttribute("data-state");
  }

  async function callGenerateApi(extra = {}) {
    const resolucao = els.resolucao.value.trim();
    const provider = els.provider.value;
    const apiKey = els.apiKey.value.trim();

    const formato = els.formato.value;
    const imagens = imagesForApi();

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolucao, provider, api_key: apiKey, formato, imagens, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return { flashcards: data.flashcards || [], sugestoesTema: data.sugestoes_tema || [] };
  }

  async function generateFlashcards() {
    const resolucao = els.resolucao.value.trim();
    if (resolucao.length < 20 && attachedImages.length === 0) {
      setGenStatus("Cole a resolução ou anexe uma imagem antes de gerar.", "error");
      return;
    }

    setGenerating(true);
    setGenStatus("Consultando a IA…");

    try {
      const { flashcards, sugestoesTema } = await callGenerateApi();
      renderCards(flashcards);
      renderTemaChips(sugestoesTema);
      setGenStatus(`${flashcards.length} ficha(s) gerada(s).`, "ok");
    } catch (err) {
      setGenStatus(err.message || "Falha ao gerar flashcards.", "error");
    } finally {
      setGenerating(false);
    }
  }

  function collectCurrentCards() {
    return Array.from(els.cardsGrid.querySelectorAll(".card")).map((el) => cardFromEl(el));
  }

  function cardFromEl(el) {
    if (el.dataset.tipo === "cloze") {
      return { tipo: "cloze", texto: el.querySelector(".c-field").value.trim() };
    }
    return {
      tipo: "qa",
      pergunta: el.querySelector(".q-field").value.trim(),
      resposta: el.querySelector(".a-field").value.trim(),
    };
  }

  async function generateMoreFlashcards(tema = null, { button = els.generateMoreBtn, originalLabel = "Gerar mais fichas" } = {}) {
    const resolucao = els.resolucao.value.trim();
    if (resolucao.length < 20 && attachedImages.length === 0) {
      setGenStatus("Cole a resolução ou anexe uma imagem antes de gerar.", "error");
      return;
    }

    const existentes = collectCurrentCards();

    button.disabled = true;
    button.textContent = "Gerando…";
    setGenStatus(
      tema ? `Consultando a IA sobre "${tema}"…` : "Consultando a IA por fichas adicionais…"
    );

    try {
      const extra = { existentes };
      if (tema) extra.tema = tema;
      const { flashcards: novas, sugestoesTema } = await callGenerateApi(extra);

      if (novas.length === 0) {
        setGenStatus("A IA não encontrou nada de novo para extrair desta resolução.", "ok");
      } else {
        appendCards(novas);
        setGenStatus(`${novas.length} ficha(s) nova(s) adicionada(s).`, "ok");
      }
      renderTemaChips(sugestoesTema);
    } catch (err) {
      setGenStatus(err.message || "Falha ao gerar mais flashcards.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  // ------------------------------------------------------------------
  // Sugestões de tema (chips) e tema livre
  // ------------------------------------------------------------------

  function renderTemaChips(temas) {
    els.temasChips.innerHTML = "";
    els.temasPanel.hidden = !temas || temas.length === 0;

    (temas || []).forEach((tema) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = tema;
      chip.addEventListener("click", () => {
        const original = chip.textContent;
        generateMoreFlashcards(tema, { button: chip, originalLabel: original });
      });
      els.temasChips.appendChild(chip);
    });
  }

  function handleTemaCustomSubmit() {
    const tema = els.temaInput.value.trim();
    if (!tema) {
      setGenStatus("Digite um tema antes de gerar.", "error");
      return;
    }
    generateMoreFlashcards(tema, {
      button: els.temaCustomBtn,
      originalLabel: "Gerar sobre esse tema",
    });
  }

  // ------------------------------------------------------------------
  // Renderização das fichas
  // ------------------------------------------------------------------

  function renderCards(flashcards) {
    els.cardsGrid.innerHTML = "";
    els.resultsPanel.hidden = flashcards.length === 0;
    els.drawerLabel.textContent = `Fichas geradas — ${flashcards.length}`;

    flashcards.forEach((card, i) => {
      els.cardsGrid.appendChild(buildCardEl(card, i));
    });
  }

  function appendCards(flashcards) {
    const startIndex = els.cardsGrid.children.length;
    els.resultsPanel.hidden = false;
    flashcards.forEach((card, i) => {
      els.cardsGrid.appendChild(buildCardEl(card, startIndex + i));
    });
    els.drawerLabel.textContent = `Fichas geradas — ${els.cardsGrid.children.length}`;
  }

  function buildCardEl(card, index) {
    const tipo = card.tipo === "cloze" ? "cloze" : "qa";

    const el = document.createElement("article");
    el.className = "card";
    el.dataset.tipo = tipo;

    const serial = document.createElement("div");
    serial.className = "card-serial";
    const num = document.createElement("span");
    num.textContent = `Nº ${String(index + 1).padStart(2, "0")}`;
    const typeTag = document.createElement("span");
    typeTag.className = "card-type";
    typeTag.textContent = tipo === "cloze" ? "cloze" : "P/R";
    const flag = document.createElement("span");
    flag.className = "card-flag";
    flag.textContent = "novo";
    serial.append(num, typeTag, flag);

    const divider = document.createElement("hr");
    divider.className = "card-divider";

    let bodyEls;
    let getCard;

    if (tipo === "cloze") {
      const cLabel = document.createElement("label");
      cLabel.textContent = "Texto (o que estiver entre {{c1::…}} fica escondido)";
      const cField = document.createElement("textarea");
      cField.className = "c-field";
      cField.rows = 3;
      cField.value = card.texto || "";
      autoGrow(cField);
      bodyEls = [cLabel, cField];
      getCard = () => ({ tipo: "cloze", texto: cField.value.trim() });
    } else {
      const qLabel = document.createElement("label");
      qLabel.textContent = "Pergunta";
      const qField = document.createElement("textarea");
      qField.className = "q-field";
      qField.rows = 2;
      qField.value = card.pergunta || "";
      autoGrow(qField);

      const aLabel = document.createElement("label");
      aLabel.textContent = "Resposta";
      const aField = document.createElement("textarea");
      aField.className = "a-field";
      aField.rows = 2;
      aField.value = card.resposta || "";
      autoGrow(aField);

      bodyEls = [qLabel, qField, divider, aLabel, aField];
      getCard = () => ({ tipo: "qa", pergunta: qField.value.trim(), resposta: aField.value.trim() });
    }

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const delBtn = document.createElement("button");
    delBtn.className = "btn-ghost";
    delBtn.type = "button";
    delBtn.textContent = "excluir";
    delBtn.addEventListener("click", () => {
      el.remove();
      els.drawerLabel.textContent = `Fichas geradas — ${els.cardsGrid.children.length}`;
    });

    const sendBtn = document.createElement("button");
    sendBtn.className = "btn-send";
    sendBtn.type = "button";
    sendBtn.textContent = "Enviar para o Anki";

    sendBtn._sendAction = (opts) => sendSingleCard(sendBtn, flag, getCard(), opts);
    sendBtn.addEventListener("click", () => sendBtn._sendAction());

    footer.append(delBtn, sendBtn);
    el.append(serial, ...bodyEls, footer);
    return el;
  }

  function autoGrow(textarea) {
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener("input", resize);
    setTimeout(resize, 0);
  }

  async function sendSingleCard(button, flagEl, card, { sync = true } = {}) {
    if (card.tipo === "cloze") {
      if (!card.texto) {
        alert("O texto da ficha cloze não pode ficar vazio.");
        return;
      }
      if (!/\{\{c\d+::/.test(card.texto)) {
        alert("A ficha cloze precisa de ao menos uma lacuna no formato {{c1::...}}.");
        return;
      }
    } else if (!card.pergunta || !card.resposta) {
      alert("Pergunta e resposta não podem ficar vazias.");
      return;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Enviando…";

    try {
      const imgHtml = await imagesHtmlForAnki();
      await sendCardToAnki(card, imgHtml);
      button.textContent = "Enviado ✓";
      button.dataset.sent = "true";
      flagEl.textContent = "enviado";
      flagEl.dataset.sent = "true";
      if (sync) triggerAnkiSync();
    } catch (err) {
      button.textContent = original;
      const msg = String(err.message || err);
      if (/duplicate/i.test(msg)) {
        alert("Este cartão já existe no baralho (duplicado) — não foi enviado novamente.");
      } else if (/empty/i.test(msg)) {
        alert(
          "O Anki recusou a ficha como 'vazia'. Em fichas cloze isso quase sempre é o " +
            "modelo/campo errado ou falta de lacuna. Confira: (1) a ficha tem {{c1::...}}; " +
            "(2) existe um tipo de nota Cloze no seu Anki (em português: 'Omissão de palavras')."
        );
      } else {
        alert(`Não foi possível enviar para o Anki: ${msg}`);
      }
    } finally {
      button.disabled = false;
    }
  }

  async function sendAllCards() {
    const cardEls = Array.from(els.cardsGrid.querySelectorAll(".card"));
    const pending = cardEls.filter((el) => {
      const btn = el.querySelector(".btn-send");
      return btn.dataset.sent !== "true";
    });

    if (pending.length === 0) {
      alert("Todas as fichas já foram enviadas.");
      return;
    }

    els.sendAllBtn.disabled = true;
    els.sendAllBtn.textContent = `Enviando 0/${pending.length}…`;

    let done = 0;
    for (const el of pending) {
      const btn = el.querySelector(".btn-send");
      await btn._sendAction({ sync: false });
      done += 1;
      els.sendAllBtn.textContent = `Enviando ${done}/${pending.length}…`;
    }

    await triggerAnkiSync();

    els.sendAllBtn.textContent = "Enviar todas para o Anki";
    els.sendAllBtn.disabled = false;
  }

  function downloadBlob(content, filename) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCardsAsText() {
    const cards = collectCurrentCards();
    if (cards.length === 0) {
      alert("Não há fichas geradas para baixar.");
      return;
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const clean = (s) => (s || "").replace(/\t/g, " ").replace(/\n/g, " ");

    // Pergunta/Resposta e Cloze têm formatos de importação diferentes no Anki,
    // então saem em arquivos separados quando os dois tipos existirem.
    const qa = cards.filter((c) => c.tipo !== "cloze");
    const cloze = cards.filter((c) => c.tipo === "cloze");

    if (qa.length) {
      const lines = qa.map((c) => `${clean(c.pergunta)}\t${clean(c.resposta)}`);
      downloadBlob(lines.join("\n"), `fichas-${stamp}.txt`);
    }
    if (cloze.length) {
      // Cabeçalho diz ao Anki para importar como Cloze (campo único "Text").
      const header = "#notetype:Cloze\n#deck:" + (els.deckName.value.trim() || "Padrão") + "\n";
      const lines = cloze.map((c) => clean(c.texto));
      downloadBlob(header + lines.join("\n"), `fichas-cloze-${stamp}.txt`);
    }
  }

  els.generateBtn.addEventListener("click", generateFlashcards);
  els.generateMoreBtn.addEventListener("click", () => generateMoreFlashcards());
  els.sendAllBtn.addEventListener("click", sendAllCards);
  els.downloadBtn.addEventListener("click", downloadCardsAsText);
  els.pasteBtn.addEventListener("click", pasteFromClipboard);
  els.temaCustomBtn.addEventListener("click", handleTemaCustomSubmit);
  els.temaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTemaCustomSubmit();
    }
  });
  els.openEvidenceBtn.addEventListener("click", () => {
    window.open("https://www.openevidence.com", "_blank", "noopener");
  });
  els.resolveBtn.addEventListener("click", resolveQuestion);
  els.useResolutionBtn.addEventListener("click", useGeneratedResolution);

  // ------------------------------------------------------------------
  // Painel de configuração — oculto por padrão, toggle via Ctrl+U / FAB
  // ------------------------------------------------------------------
  function toggleConfig() {
    const panel = document.getElementById("configPanel");
    const visible = panel.classList.toggle("config-visible");
    if (visible) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      toggleConfig();
    }
  });

  if (els.configFab) {
    els.configFab.addEventListener("click", toggleConfig);
  }

  // ------------------------------------------------------------------
  // Recepção de conteúdo vindo da extensão do Chrome (handoff via #fc=...)
  // A extensão abre esta página com o texto da questão no fragmento da URL
  // (hash), que nunca é enviado ao servidor. Aqui a gente lê, preenche o
  // campo de resolução e limpa a URL.
  // ------------------------------------------------------------------

  function applyHandoffFromHash() {
    const hash = window.location.hash || "";
    const match = hash.match(/[#&]fc=([^&]+)/);
    if (!match) return;

    let texto = "";
    try {
      texto = decodeURIComponent(match[1]);
    } catch (_) {
      return; // fragmento malformado — ignora
    }
    texto = texto.trim();
    if (!texto) return;

    insertTextInResolucao(texto, { replace: true });
    // Remove o hash para não reaplicar em recarregamentos nem deixar o texto na URL.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setGenStatus("Questão importada da extensão — revise e clique em Gerar flashcards.", "ok");
    els.resolucao.scrollIntoView({ behavior: "smooth", block: "center" });
    els.resolucao.focus();
  }

initTheme();

els.themeToggle.addEventListener("click", () => {
  const current =
    document.documentElement.getAttribute("data-theme") || "light";

  applyTheme(current === "dark" ? "light" : "dark");
});

  
els.ankiStatus.addEventListener("click", () => {
  if (els.ankiStatus.dataset.state !== "error") return;
  checkAnkiConnection();
});

loadSettings();
  applyHandoffFromHash();
  checkAnkiConnection();
  autoGrow(els.resolveResult);
  els.resolucao.focus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA é um extra — se falhar, o site continua funcionando normalmente */
      });
    });
  }
})();
