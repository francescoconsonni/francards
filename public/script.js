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
    clearBtn: $("clearBtn"),
    pasteBtn: $("pasteBtn"),
    openEvidenceBtn: $("openEvidenceBtn"),
    generateBtn: $("generateBtn"),
    genStatus: $("genStatus"),
    resultsPanel: $("resultsPanel"),
    cardsGrid: $("cardsGrid"),
    drawerLabel: $("drawerLabel"),
    sendAllBtn: $("sendAllBtn"),
    downloadBtn: $("downloadBtn"),
    downloadApkgBtn: $("downloadApkgBtn"),
    selectAllBtn: $("selectAllBtn"),
    selectNoneBtn: $("selectNoneBtn"),
    selectCount: $("selectCount"),
    generateMoreBtn: $("generateMoreBtn"),
    temasPanel: $("temasPanel"),
    temasChips: $("temasChips"),
    temaInput: $("temaInput"),
    temaCustomBtn: $("temaCustomBtn"),
    ankiStatus: $("ankiStatus"),
    themeToggle: $("themeToggle"),
    configFab: $("configFab"),
    // painel de documento/aula
    docModeToggleBtn: $("docModeToggleBtn"),
    progressToggleBtn: $("progressToggleBtn"),
    progressPanel: $("progressPanel"),
    progressRefreshBtn: $("progressRefreshBtn"),
    progressStatus: $("progressStatus"),
    progressTable: $("progressTable"),
    documentPanel: $("documentPanel"),
    docTipoConteudo: $("docTipoConteudo"),
    docObjetivo: $("docObjetivo"),
    docProvaAlvo: $("docProvaAlvo"),
    docDropZone: $("docDropZone"),
    docFileInput: $("docFileInput"),
    docChapterWrap: $("docChapterWrap"),
    docChapterField: $("docChapterField"),
    docChapterLabel: $("docChapterLabel"),
    docChapterSelect: $("docChapterSelect"),
    docPageStartField: $("docPageStartField"),
    docPageStart: $("docPageStart"),
    docPageEndField: $("docPageEndField"),
    docPageEnd: $("docPageEnd"),
    docTextWrap: $("docTextWrap"),
    docExtractedText: $("docExtractedText"),
    docGenerateBtn: $("docGenerateBtn"),
    docStatus: $("docStatus"),
    docNotebookLmBtn: $("docNotebookLmBtn"),
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

  function clearSite() {
    // Um F5 de verdade: garante que absolutamente tudo volta ao estado
    // inicial (resolução, imagens, fichas, painéis abertos, badges) sem
    // risco de esquecer algum pedaço de estado espalhado pelo JS. As
    // configurações (chave de API, baralho, endereços) sobrevivem porque
    // ficam no localStorage, recarregadas normalmente por loadSettings().
    window.location.href = window.location.pathname;
  }

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
    setDocModeBadge(null); // resolução de questão é um contexto diferente do modo documento
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
    if (card.grande_area && GRANDE_AREA_SLUGS[card.grande_area]) {
      let tag = `hcfmusp::${GRANDE_AREA_SLUGS[card.grande_area]}`;
      if (card.subarea && SUBAREA_SLUGS[card.subarea]) {
        tag += `::${SUBAREA_SLUGS[card.subarea]}`;
      }
      tags.push(tag);
    }

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

  let docModeMeta = null;

  // Fallback síncrono (idêntico ao backend) — evita condição de corrida caso
  // a primeira ficha seja renderizada antes do fetch abaixo terminar.
  let GRANDE_AREAS = [
    "Clínica Médica",
    "Cirurgia",
    "Pediatria e Neonatologia",
    "Saúde Coletiva, MFC e Epidemiologia",
    "Obstetrícia",
    "Ginecologia e Mastologia",
  ];
  let GRANDE_AREA_SLUGS = {
    "Clínica Médica": "clinica-medica",
    "Cirurgia": "cirurgia",
    "Pediatria e Neonatologia": "pediatria",
    "Saúde Coletiva, MFC e Epidemiologia": "saude-coletiva",
    "Obstetrícia": "obstetricia",
    "Ginecologia e Mastologia": "ginecologia",
  };
  let GRANDE_AREA_PREVALENCIA = {
    "Clínica Médica": 21.1,
    "Cirurgia": 19.3,
    "Pediatria e Neonatologia": 18.5,
    "Saúde Coletiva, MFC e Epidemiologia": 18.1,
    "Obstetrícia": 12.4,
    "Ginecologia e Mastologia": 10.5,
  };

  // Subáreas — lista grande (47), sem fallback hardcoded; populada pelo fetch
  // abaixo. Enquanto não carregar, o seletor de subárea mostra só "sem
  // subárea" (degrada bem, não trava nada).
  let SUBAREAS = []; // [{nome, grande_area, slug, prevalencia}]
  let SUBAREA_SLUGS = {};
  let SUBAREA_PREVALENCIA = {};

  async function loadGrandeAreas() {
    try {
      const res = await fetch("/api/grande-areas");
      const data = await res.json();
      if (Array.isArray(data.areas) && data.areas.length) {
        GRANDE_AREAS = data.areas.map((a) => a.nome);
        GRANDE_AREA_SLUGS = Object.fromEntries(data.areas.map((a) => [a.nome, a.slug]));
        GRANDE_AREA_PREVALENCIA = Object.fromEntries(
          data.areas.map((a) => [a.nome, a.prevalencia_acesso_direto])
        );
      }
      if (Array.isArray(data.subareas) && data.subareas.length) {
        SUBAREAS = data.subareas;
        SUBAREA_SLUGS = Object.fromEntries(data.subareas.map((s) => [s.nome, s.slug]));
        SUBAREA_PREVALENCIA = Object.fromEntries(
          data.subareas.map((s) => [s.nome, s.prevalencia_acesso_direto])
        );
      }
    } catch (_) {
      // Sem problema — segue com o fallback acima (ou vazio, no caso de subárea).
    }
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
      body: JSON.stringify({
        resolucao,
        provider,
        api_key: apiKey,
        formato,
        imagens,
        ...(docModeMeta || {}),
        ...extra,
      }),
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

  function collectSelectedCards() {
    return Array.from(els.cardsGrid.querySelectorAll(".card"))
      .filter((el) => {
        const cb = el.querySelector(".card-select");
        return !cb || cb.checked;
      })
      .map((el) => cardFromEl(el));
  }

  function updateSelectCount() {
    const total = els.cardsGrid.querySelectorAll(".card").length;
    const selected = els.cardsGrid.querySelectorAll(".card-select:checked").length;
    if (els.selectCount) {
      els.selectCount.textContent = `${selected}/${total} selecionada(s)`;
    }
  }

  function setAllCardsSelected(selected) {
    els.cardsGrid.querySelectorAll(".card-select").forEach((cb) => {
      cb.checked = selected;
    });
    updateSelectCount();
  }

  function cardFromEl(el) {
    const grande_area = el.querySelector(".card-area-select")?.value || "";
    const subarea = el.querySelector(".card-subarea-select")?.value || "";
    if (el.dataset.tipo === "cloze") {
      return { tipo: "cloze", texto: el.querySelector(".c-field").value.trim(), grande_area, subarea };
    }
    return {
      tipo: "qa",
      pergunta: el.querySelector(".q-field").value.trim(),
      resposta: el.querySelector(".a-field").value.trim(),
      grande_area,
      subarea,
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
    updateSelectCount();
  }

  function appendCards(flashcards) {
    const startIndex = els.cardsGrid.children.length;
    els.resultsPanel.hidden = false;
    flashcards.forEach((card, i) => {
      els.cardsGrid.appendChild(buildCardEl(card, startIndex + i));
    });
    els.drawerLabel.textContent = `Fichas geradas — ${els.cardsGrid.children.length}`;
    updateSelectCount();
  }

  function buildCardEl(card, index) {
    const tipo = card.tipo === "cloze" ? "cloze" : "qa";

    const el = document.createElement("article");
    el.className = "card";
    el.dataset.tipo = tipo;

    const selectWrap = document.createElement("label");
    selectWrap.className = "card-select-wrap";
    const selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.className = "card-select";
    selectBox.checked = true;
    selectBox.addEventListener("change", updateSelectCount);
    selectWrap.appendChild(selectBox);

    const serial = document.createElement("div");
    serial.className = "card-serial";
    const leftGroup = document.createElement("div");
    leftGroup.className = "card-serial-left";
    const num = document.createElement("span");
    num.textContent = `Nº ${String(index + 1).padStart(2, "0")}`;
    leftGroup.append(selectWrap, num);

    const rightGroup = document.createElement("div");
    rightGroup.className = "card-serial-right";
    const typeTag = document.createElement("span");
    typeTag.className = "card-type";
    typeTag.textContent = tipo === "cloze" ? "cloze" : "P/R";
    const flag = document.createElement("span");
    flag.className = "card-flag";
    flag.textContent = "novo";
    rightGroup.append(typeTag, flag);

    serial.append(leftGroup, rightGroup);

    // Área clínica — a IA já vem com um palpite, mas fica editável porque
    // classificação automática erra às vezes; melhor você corrigir aqui do
    // que a tag errada ir pro Anki sem ninguém notar.
    const areaWrap = document.createElement("div");
    areaWrap.className = "card-area-wrap";
    const areaLabel = document.createElement("span");
    areaLabel.className = "card-area-label";
    areaLabel.textContent = "Área:";
    const areaSelect = document.createElement("select");
    areaSelect.className = "card-area-select";
    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "— sem classificação —";
    areaSelect.appendChild(blankOpt);
    GRANDE_AREAS.forEach((nome) => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      areaSelect.appendChild(opt);
    });
    areaSelect.value = GRANDE_AREAS.includes(card.grande_area) ? card.grande_area : "";

    // Subárea — as opções mudam conforme a grande área selecionada (só faz
    // sentido mostrar subáreas daquela área), então precisa ficar em ordem:
    // criar o select, DEPOIS a função que o popula, DEPOIS ligar o listener
    // da área que chama essa função.
    const subareaLabel = document.createElement("span");
    subareaLabel.className = "card-area-label";
    subareaLabel.textContent = "Subárea:";
    const subareaSelect = document.createElement("select");
    subareaSelect.className = "card-subarea-select";

    function refreshSubareaOptions(preferido) {
      const areaAtual = areaSelect.value;
      subareaSelect.innerHTML = "";
      const semSub = document.createElement("option");
      semSub.value = "";
      semSub.textContent = "— sem subárea —";
      subareaSelect.appendChild(semSub);
      SUBAREAS.filter((s) => !areaAtual || s.grande_area === areaAtual).forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.nome;
        opt.textContent = s.nome;
        subareaSelect.appendChild(opt);
      });
      const opcoesValidas = Array.from(subareaSelect.options).map((o) => o.value);
      subareaSelect.value = opcoesValidas.includes(preferido) ? preferido : "";
    }
    refreshSubareaOptions(card.subarea || "");
    areaSelect.addEventListener("change", () => refreshSubareaOptions(""));

    areaWrap.append(areaLabel, areaSelect, subareaLabel, subareaSelect);

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
      getCard = () => ({
        tipo: "cloze",
        texto: cField.value.trim(),
        grande_area: areaSelect.value,
        subarea: subareaSelect.value,
      });
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
      getCard = () => ({
        tipo: "qa",
        pergunta: qField.value.trim(),
        resposta: aField.value.trim(),
        grande_area: areaSelect.value,
        subarea: subareaSelect.value,
      });
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
      updateSelectCount();
    });

    const sendBtn = document.createElement("button");
    sendBtn.className = "btn-send";
    sendBtn.type = "button";
    sendBtn.textContent = "Enviar para o Anki";

    sendBtn._sendAction = (opts) => sendSingleCard(sendBtn, flag, getCard(), opts);
    sendBtn.addEventListener("click", () => sendBtn._sendAction());

    footer.append(delBtn, sendBtn);
    el.append(serial, areaWrap, ...bodyEls, footer);
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
    const cards = collectSelectedCards();
    if (cards.length === 0) {
      alert("Selecione ao menos uma ficha para baixar.");
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

  async function downloadCardsAsApkg() {
    const cards = collectSelectedCards();
    if (cards.length === 0) {
      alert("Selecione ao menos uma ficha para baixar.");
      return;
    }

    els.downloadApkgBtn.disabled = true;
    const original = els.downloadApkgBtn.textContent;
    els.downloadApkgBtn.textContent = "Gerando .apkg…";

    try {
      const res = await fetch("/api/export-apkg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards,
          deck_name: els.deckName.value.trim() || "Padrão",
          tags: els.tags.value.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `fichas-${stamp}.apkg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Não foi possível gerar o .apkg: " + (err.message || err));
    } finally {
      els.downloadApkgBtn.disabled = false;
      els.downloadApkgBtn.textContent = original;
    }
  }

  els.generateBtn.addEventListener("click", generateFlashcards);

  // Ctrl+Enter (ou Cmd+Enter no Mac) no campo de resolução dispara a geração.
  els.resolucao.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      generateFlashcards();
    }
  });
  els.generateMoreBtn.addEventListener("click", () => generateMoreFlashcards());
  els.sendAllBtn.addEventListener("click", sendAllCards);
  els.downloadBtn.addEventListener("click", downloadCardsAsText);
  els.downloadApkgBtn.addEventListener("click", downloadCardsAsApkg);
  els.selectAllBtn.addEventListener("click", () => setAllCardsSelected(true));
  els.selectNoneBtn.addEventListener("click", () => setAllCardsSelected(false));
  els.clearBtn.addEventListener("click", clearSite);
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
  // Painel de documento/aula — PDF processado no navegador (pdf.js),
  // nunca enviado ao servidor. Só o texto extraído vai pra API.
  // ------------------------------------------------------------------

  const PDFJS_VERSION = "5.7.284";
  let pdfjsLibPromise = null;
  function getPdfJs() {
    if (!pdfjsLibPromise) {
      pdfjsLibPromise = import(
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`
      ).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
        return lib;
      });
    }
    return pdfjsLibPromise;
  }

  let currentPdf = null; // documento pdf.js carregado no momento

  function setDocStatus(msg, state) {
    els.docStatus.textContent = msg || "";
    if (state) els.docStatus.dataset.state = state;
    else els.docStatus.removeAttribute("data-state");
  }

  function toggleProgressPanel(forceOpen) {
    const panel = els.progressPanel;
    const shouldOpen = forceOpen ?? !panel.classList.contains("doc-visible");
    panel.classList.toggle("doc-visible", shouldOpen);
    if (shouldOpen) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      loadProgressData();
    }
  }

  function setProgressStatus(msg, state) {
    els.progressStatus.textContent = msg || "";
    if (state) els.progressStatus.dataset.state = state;
    else els.progressStatus.removeAttribute("data-state");
  }

  async function loadProgressData() {
    setProgressStatus("Consultando o Anki…");
    els.progressRefreshBtn.disabled = true;

    // Garante que temos a lista oficial de áreas/subáreas (com prevalência) antes de renderizar.
    await loadGrandeAreas();

    let ankiOk = true;
    const queries = SUBAREAS.map(async (s) => {
      const tag = `hcfmusp::${GRANDE_AREA_SLUGS[s.grande_area] || "outra"}::${s.slug}`;
      try {
        const ids = await ankiRequest("findCards", { query: `tag:${tag}` });
        return { nome: s.nome, grande_area: s.grande_area, prevalencia: s.prevalencia_acesso_direto, count: Array.isArray(ids) ? ids.length : 0 };
      } catch (_) {
        ankiOk = false;
        return { nome: s.nome, grande_area: s.grande_area, prevalencia: s.prevalencia_acesso_direto, count: null };
      }
    });
    const rows = await Promise.all(queries);

    renderProgressTable(rows);

    if (!ankiOk) {
      setProgressStatus(
        "Não consegui falar com o AnkiConnect — mostrando só a prevalência. Confira o endereço em ⚙ Configuração.",
        "error"
      );
    } else {
      setProgressStatus("Atualizado.", "ok");
    }
    els.progressRefreshBtn.disabled = false;
  }

  function renderProgressTable(rows) {
    const maxCount = Math.max(1, ...rows.map((r) => r.count || 0));
    const sorted = [...rows].sort((a, b) => b.prevalencia - a.prevalencia);

    els.progressTable.innerHTML = "";
    sorted.forEach((r) => {
      const row = document.createElement("div");
      row.className = "progress-row";

      const label = document.createElement("div");
      label.className = "progress-row-label";
      const labelSub = document.createElement("span");
      labelSub.className = "progress-row-parent";
      labelSub.textContent = r.grande_area || "";
      const labelName = document.createElement("span");
      labelName.className = "progress-row-name";
      labelName.textContent = r.nome;
      label.append(labelSub, labelName);

      const prevLine = document.createElement("div");
      prevLine.className = "progress-bar-line";
      const prevBar = document.createElement("div");
      prevBar.className = "progress-bar progress-bar-prev";
      const prevFill = document.createElement("div");
      prevFill.className = "progress-bar-fill";
      prevFill.style.width = `${Math.min(100, r.prevalencia * 4)}%`;
      prevBar.appendChild(prevFill);
      const prevValue = document.createElement("span");
      prevValue.className = "progress-bar-value";
      prevValue.textContent = `${r.prevalencia.toFixed(1)}% da prova`;
      prevLine.append(prevBar, prevValue);

      const covLine = document.createElement("div");
      covLine.className = "progress-bar-line";
      const covBar = document.createElement("div");
      covBar.className = "progress-bar progress-bar-cov";
      const covFill = document.createElement("div");
      covFill.className = "progress-bar-fill";
      const covPct = r.count == null ? 0 : (100 * r.count) / maxCount;
      covFill.style.width = `${covPct}%`;
      covBar.appendChild(covFill);
      const covValue = document.createElement("span");
      covValue.className = "progress-bar-value";
      covValue.textContent = r.count == null ? "— sem dado" : `${r.count} ficha(s) no Anki`;
      covLine.append(covBar, covValue);

      row.append(label, prevLine, covLine);
      els.progressTable.appendChild(row);
    });
  }

  function toggleDocPanel(forceOpen) {
    const panel = els.documentPanel;
    const shouldOpen = forceOpen ?? !panel.classList.contains("doc-visible");
    panel.classList.toggle("doc-visible", shouldOpen);
    if (shouldOpen) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Achata o sumário (outline) do PDF, que pode ter capítulos aninhados em
  // sub-seções, numa lista única na ordem em que aparecem no documento.
  function flattenOutline(items) {
    const flat = [];
    (items || []).forEach((item) => {
      flat.push(item);
      if (item.items && item.items.length) flat.push(...flattenOutline(item.items));
    });
    return flat;
  }

  // Resolve cada item do sumário pro número de página real (o sumário só
  // guarda um "destino" interno do PDF, não a página diretamente).
  async function resolveOutlinePages(pdf, outlineItems) {
    const resolved = [];
    for (const item of outlineItems) {
      try {
        let dest = item.dest;
        if (typeof dest === "string") dest = await pdf.getDestination(dest);
        if (dest && dest[0] != null) {
          const pageIndex = await pdf.getPageIndex(dest[0]);
          resolved.push({ title: item.title.trim(), page: pageIndex + 1 });
        }
      } catch (_) {
        // destino que o pdf.js não conseguiu resolver — ignora esse item
      }
    }
    return resolved;
  }

  async function extractPageRangeText(pdf, startPage, endPage) {
    const parts = [];
    for (let i = startPage; i <= endPage; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strs = content.items.map((it) => it.str);
      parts.push(strs.join(" "));
    }
    return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
  }

  function showExtractedText(text) {
    els.docExtractedText.value = text;
    els.docTextWrap.hidden = false;
    els.docGenerateBtn.disabled = text.trim().length < 20;
  }

  async function reextractFromChapterSelect() {
    if (!currentPdf) return;
    const opt = els.docChapterSelect.selectedOptions[0];
    if (!opt) return;
    const start = Number(opt.dataset.start);
    const end = Number(opt.dataset.end);
    setDocStatus("Extraindo texto do capítulo…");
    try {
      const text = await extractPageRangeText(currentPdf, start, end);
      showExtractedText(text);
      setDocStatus(`Extraído: páginas ${start}–${end}.`, "ok");
    } catch (err) {
      setDocStatus("Falha ao extrair texto: " + (err.message || err), "error");
    }
  }

  async function reextractFromManualRange() {
    if (!currentPdf) return;
    const start = Math.max(1, Number(els.docPageStart.value) || 1);
    const end = Math.min(currentPdf.numPages, Number(els.docPageEnd.value) || currentPdf.numPages);
    if (start > end) return;
    setDocStatus("Extraindo texto…");
    try {
      const text = await extractPageRangeText(currentPdf, start, end);
      showExtractedText(text);
      setDocStatus(`Extraído: páginas ${start}–${end}.`, "ok");
    } catch (err) {
      setDocStatus("Falha ao extrair texto: " + (err.message || err), "error");
    }
  }

  async function handlePdfFile(file) {
    if (!file || file.type !== "application/pdf") {
      setDocStatus("Escolha um arquivo PDF.", "error");
      return;
    }

    els.docChapterWrap.hidden = true;
    els.docTextWrap.hidden = true;
    els.docGenerateBtn.disabled = true;
    setDocStatus("Carregando PDF…");

    try {
      const pdfjsLib = await getPdfJs();
      const buf = await file.arrayBuffer();
      currentPdf = await pdfjsLib.getDocument({ data: buf }).promise;

      const rawOutline = await currentPdf.getOutline();
      const flat = rawOutline ? flattenOutline(rawOutline) : [];
      const resolved = flat.length ? await resolveOutlinePages(currentPdf, flat) : [];

      els.docChapterWrap.hidden = false;

      if (resolved.length >= 2) {
        // PDF tem sumário utilizável — monta o seletor de capítulo
        els.docChapterField.hidden = false;
        els.docPageStartField.hidden = true;
        els.docPageEndField.hidden = true;
        els.docChapterLabel.textContent = `Capítulo (${resolved.length} encontrados no sumário do PDF)`;

        els.docChapterSelect.innerHTML = "";
        resolved.forEach((item, i) => {
          const end = i + 1 < resolved.length ? resolved[i + 1].page - 1 : currentPdf.numPages;
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.dataset.start = String(item.page);
          opt.dataset.end = String(Math.max(item.page, end));
          opt.textContent = `${item.title} (p. ${item.page}–${opt.dataset.end})`;
          els.docChapterSelect.appendChild(opt);
        });

        setDocStatus(`PDF carregado — ${currentPdf.numPages} páginas, sumário detectado.`, "ok");
        await reextractFromChapterSelect();
      } else {
        // Sem sumário utilizável — cai pro seletor manual de página
        els.docChapterField.hidden = true;
        els.docPageStartField.hidden = false;
        els.docPageEndField.hidden = false;
        els.docPageStart.value = "1";
        els.docPageEnd.value = String(currentPdf.numPages);
        els.docPageStart.max = String(currentPdf.numPages);
        els.docPageEnd.max = String(currentPdf.numPages);

        setDocStatus(
          `PDF carregado — ${currentPdf.numPages} páginas (sem sumário; selecione o intervalo manualmente).`,
          "ok"
        );
        await reextractFromManualRange();
      }
    } catch (err) {
      setDocStatus("Não foi possível ler o PDF: " + (err.message || err), "error");
    }
  }

  function imageFilesLikePdfFromDataTransfer(dt) {
    if (!dt) return null;
    const file = Array.from(dt.files || []).find((f) => f.type === "application/pdf");
    return file || null;
  }

  els.docDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.docDropZone.classList.add("dragover");
  });
  els.docDropZone.addEventListener("dragleave", () => els.docDropZone.classList.remove("dragover"));
  els.docDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.docDropZone.classList.remove("dragover");
    const file = imageFilesLikePdfFromDataTransfer(e.dataTransfer);
    if (file) handlePdfFile(file);
    else setDocStatus("Solte um arquivo PDF.", "error");
  });
  els.docDropZone.addEventListener("click", (e) => {
    if (e.target.closest("label.image-zone-link")) return;
    els.docFileInput.click();
  });
  els.docFileInput.addEventListener("change", () => {
    const file = els.docFileInput.files && els.docFileInput.files[0];
    if (file) handlePdfFile(file);
    els.docFileInput.value = "";
  });

  els.docChapterSelect.addEventListener("change", reextractFromChapterSelect);
  els.docPageStart.addEventListener("change", reextractFromManualRange);
  els.docPageEnd.addEventListener("change", reextractFromManualRange);

  els.docNotebookLmBtn.addEventListener("click", () => {
    window.open("https://notebooklm.google.com", "_blank", "noopener");
  });

  function setDocModeBadge(meta) {
    let badge = document.getElementById("docModeBadge");
    if (!meta) {
      docModeMeta = null;
      if (badge) badge.remove();
      return;
    }
    docModeMeta = meta;
    const tipoLabels = { aula: "Aula", livro: "Capítulo de livro", diretriz: "UpToDate/diretriz" };
    const objLabels = {
      aprofundamento: "Aprofundamento",
      revisao: "Revisão ampla",
      protocolo: "Protocolo/número",
      "caso-clinico": "Caso clínico",
    };
    const provaLabel = meta.prova_alvo === "hcfmusp-acesso-direto" ? " · HCFMUSP Acesso Direto" : "";
    const label = `📚 Modo documento: ${tipoLabels[meta.tipo_conteudo] || meta.tipo_conteudo} · ${
      objLabels[meta.objetivo] || meta.objetivo
    }${provaLabel}`;

    if (!badge) {
      badge = document.createElement("div");
      badge.id = "docModeBadge";
      badge.className = "doc-mode-badge";
      els.resolucao.insertAdjacentElement("beforebegin", badge);
    }
    badge.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = label;
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "×";
    clearBtn.title = "Sair do modo documento";
    clearBtn.addEventListener("click", () => setDocModeBadge(null));
    badge.append(text, clearBtn);
  }

  async function generateFromDocument() {
    const texto = els.docExtractedText.value.trim();
    if (texto.length < 20) {
      setDocStatus("Texto extraído muito curto para gerar fichas.", "error");
      return;
    }

    const meta = {
      modo: "documento",
      tipo_conteudo: els.docTipoConteudo.value,
      objetivo: els.docObjetivo.value,
      prova_alvo: els.docProvaAlvo.value,
    };

    insertTextInResolucao(texto, { replace: true });
    setDocModeBadge(meta);
    toggleDocPanel(false);

    els.resolucao.scrollIntoView({ behavior: "smooth", block: "center" });
    await generateFlashcards();
  }

  els.docGenerateBtn.addEventListener("click", generateFromDocument);

  if (els.docModeToggleBtn) {
    els.docModeToggleBtn.addEventListener("click", () => toggleDocPanel());
  }
  if (els.progressToggleBtn) {
    els.progressToggleBtn.addEventListener("click", () => toggleProgressPanel());
  }
  els.progressRefreshBtn.addEventListener("click", loadProgressData);

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

  // ------------------------------------------------------------------
  // Recepção de conteúdo vindo do Android Share Target (PWA instalado).
  // O servidor Flask injeta window.__sharedText quando o usuário
  // compartilha texto pelo menu "Enviar para" do Android.
  // ------------------------------------------------------------------
  function applySharedText() {
    const texto = (typeof window.__sharedText === "string" ? window.__sharedText : "").trim();
    if (!texto) return;
    insertTextInResolucao(texto, { replace: true });
    setGenStatus("Resolução importada via compartilhamento — revise e clique em Gerar flashcards.", "ok");
    els.resolucao.scrollIntoView({ behavior: "smooth", block: "center" });
    els.resolucao.focus();
    // Limpa para evitar reaplicação num possível reload do histórico.
    try { window.__sharedText = ""; } catch (_) {}
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
  applySharedText();
  checkAnkiConnection();
  loadGrandeAreas();
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
