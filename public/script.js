(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    provider: $("provider"),
    apiKey: $("apiKey"),
    deckName: $("deckName"),
    tags: $("tags"),
    modelName: $("modelName"),
    frontField: $("frontField"),
    backField: $("backField"),
    ankiUrl: $("ankiUrl"),
    ankiApiKey: $("ankiApiKey"),
    resolucao: $("resolucao"),
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
  };

  const STORAGE_KEY = "flashcard_anki_settings_v1";

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.provider) els.provider.value = saved.provider;
      if (saved.apiKey) els.apiKey.value = saved.apiKey;
      if (saved.deckName) els.deckName.value = saved.deckName;
      if (saved.tags) els.tags.value = saved.tags;
      if (saved.modelName) els.modelName.value = saved.modelName;
      if (saved.frontField) els.frontField.value = saved.frontField;
      if (saved.backField) els.backField.value = saved.backField;
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
      modelName: els.modelName.value,
      frontField: els.frontField.value,
      backField: els.backField.value,
      ankiUrl: els.ankiUrl.value,
      ankiApiKey: els.ankiApiKey.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  [
    "provider", "apiKey", "deckName", "tags",
    "modelName", "frontField", "backField", "ankiUrl", "ankiApiKey",
  ].forEach((id) => els[id].addEventListener("change", saveSettings));

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
      els.ankiStatus.textContent = "AnkiConnect conectado";
    } catch (_) {
      els.ankiStatus.dataset.state = "error";
      els.ankiStatus.textContent = "AnkiConnect não encontrado — abra o Anki";
    }
  }

  async function ensureDeck(deckName) {
    await ankiRequest("createDeck", { deck: deckName });
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

  async function sendCardToAnki(card) {
    const deckName = els.deckName.value.trim() || "Padrão";
    const tags = els.tags.value.trim().split(/\s+/).filter(Boolean);

    await ensureDeck(deckName);

    const note = {
      deckName,
      modelName: els.modelName.value.trim() || "Basic",
      fields: {
        [els.frontField.value.trim() || "Front"]: card.pergunta,
        [els.backField.value.trim() || "Back"]: card.resposta,
      },
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

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolucao, provider, api_key: apiKey, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return { flashcards: data.flashcards || [], sugestoesTema: data.sugestoes_tema || [] };
  }

  async function generateFlashcards() {
    const resolucao = els.resolucao.value.trim();
    if (resolucao.length < 20) {
      setGenStatus("Cole o texto completo da resolução antes de gerar.", "error");
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
    return Array.from(els.cardsGrid.querySelectorAll(".card")).map((el) => ({
      pergunta: el.querySelector(".q-field").value.trim(),
      resposta: el.querySelector(".a-field").value.trim(),
    }));
  }

  async function generateMoreFlashcards(tema = null, { button = els.generateMoreBtn, originalLabel = "Gerar mais fichas" } = {}) {
    const resolucao = els.resolucao.value.trim();
    if (resolucao.length < 20) {
      setGenStatus("Cole o texto completo da resolução antes de gerar.", "error");
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
      const { flashcards: novas, sugestoesTema } =
