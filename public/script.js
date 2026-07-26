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
    generateBtn: $("generateBtn"),
    genStatus: $("genStatus"),
    resultsPanel: $("resultsPanel"),
    cardsGrid: $("cardsGrid"),
    drawerLabel: $("drawerLabel"),
    sendAllBtn: $("sendAllBtn"),
    downloadBtn: $("downloadBtn"),
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

  function setGenerating(isGenerating) {
    els.generateBtn.disabled = isGenerating;
    els.generateBtn.textContent = isGenerating ? "Gerando…" : "Gerar flashcards";
  }

  function setGenStatus(message, state) {
    els.genStatus.textContent = message || "";
    if (state) els.genStatus.dataset.state = state;
    else els.genStatus.removeAttribute("data-state");
  }

  async function generateFlashcards() {
    const resolucao = els.resolucao.value.trim();
    const provider = els.provider.value;
    const apiKey = els.apiKey.value.trim();

    if (resolucao.length < 20) {
      setGenStatus("Cole o texto completo da resolução antes de gerar.", "error");
      return;
    }

    setGenerating(true);
    setGenStatus("Consultando a IA…");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolucao, provider, api_key: apiKey }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status}`);
      }

      renderCards(data.flashcards);
      setGenStatus(`${data.flashcards.length} ficha(s) gerada(s).`, "ok");
    } catch (err) {
      setGenStatus(err.message || "Falha ao gerar flashcards.", "error");
    } finally {
      setGenerating(false);
    }
  }

  function renderCards(flashcards) {
    els.cardsGrid.innerHTML = "";
    els.resultsPanel.hidden = flashcards.length === 0;
    els.drawerLabel.textContent = `Fichas geradas — ${flashcards.length}`;

    flashcards.forEach((card, i) => {
      els.cardsGrid.appendChild(buildCardEl(card, i));
    });
  }

  function buildCardEl(card, index) {
    const el = document.createElement("article");
    el.className = "card";

    const serial = document.createElement("div");
    serial.className = "card-serial";
    const num = document.createElement("span");
    num.textContent = `Nº ${String(index + 1).padStart(2, "0")}`;
    const flag = document.createElement("span");
    flag.className = "card-flag";
    flag.textContent = "novo";
    serial.append(num, flag);

    const qLabel = document.createElement("label");
    qLabel.textContent = "Pergunta";
    const qField = document.createElement("textarea");
    qField.className = "q-field";
    qField.rows = 2;
    qField.value = card.pergunta;
    autoGrow(qField);

    const divider = document.createElement("hr");
    divider.className = "card-divider";

    const aLabel = document.createElement("label");
    aLabel.textContent = "Resposta";
    const aField = document.createElement("textarea");
    aField.className = "a-field";
    aField.rows = 2;
    aField.value = card.resposta;
    autoGrow(aField);

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

    sendBtn._sendAction = (opts) =>
      sendSingleCard(sendBtn, flag, { pergunta: qField.value.trim(), resposta: aField.value.trim() }, opts);

    sendBtn.addEventListener("click", () => sendBtn._sendAction());

    footer.append(delBtn, sendBtn);
    el.append(serial, qLabel, qField, divider, aLabel, aField, footer);
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
    if (!card.pergunta || !card.resposta) {
      alert("Pergunta e resposta não podem ficar vazias.");
      return;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Enviando…";

    try {
      await sendCardToAnki(card);
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

  function downloadCardsAsText() {
    const cardEls = Array.from(els.cardsGrid.querySelectorAll(".card"));
    if (cardEls.length === 0) {
      alert("Não há fichas geradas para baixar.");
      return;
    }

    const lines = cardEls.map((el) => {
      const pergunta = el.querySelector(".q-field").value.trim().replace(/\t/g, " ");
      const resposta = el.querySelector(".a-field").value.trim().replace(/\t/g, " ");
      return `${pergunta}\t${resposta}`;
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `fichas-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  els.generateBtn.addEventListener("click", generateFlashcards);
  els.sendAllBtn.addEventListener("click", sendAllCards);
  els.downloadBtn.addEventListener("click", downloadCardsAsText);

  loadSettings();
  checkAnkiConnection();
})();
