"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Regras de extração (medcof + genérico). Veja README-extensao.md p/ calibrar.
// ─────────────────────────────────────────────────────────────────────────────
const RULES = {
  sites: [
    {
      name: "medcof",
      match: ["qbank-prime.medcof.com.br", "medcof.com.br"],
      sections: [
        ["[class*='onboard-question-statement']", "[class*='question-statement']", "[class*='enunciado']"],
        ["[class*='onboard-question-alternatives']", "[class*='answer-option']", "[class*='alternativ']"],
        ["[class*='onboard-question-comments']", "[class*='comentario']", "[class*='explanation']", "[class*='gabarito']"],
      ],
      noise: [
        "\\d+([.,]\\d+)?%\\s*escolheram(\\s+esta\\s+alternativa)?",
        "Essa quest[\\u00e3a]o j[\\u00e1a] foi respondida[^\\n]*vezes",
        "Links de artigo[^\\n]*",
        "O que achou desse coment[\\u00e1a]rio[^\\n]*",
        "Marca Texto",
      ],
    },
  ],
  generic: {
    sections: [
      ["[class*='enunciado']", "[class*='statement']", "[class*='question-text']", "[class*='pergunta']", "[id*='enunciado']", "[id*='question']"],
      ["[class*='alternativ']", "[class*='answer-option']", "[class*='option']", "[class*='choice']"],
      ["[class*='coment']", "[class*='explanation']", "[class*='gabarito']", "[class*='resolucao']", "[class*='rationale']", "[class*='feedback']", "[class*='justif']"],
    ],
    noise: [
      "\\d+([.,]\\d+)?%\\s*escolheram(\\s+esta\\s+alternativa)?",
      "Essa quest[\\u00e3a]o j[\\u00e1a] foi respondida[^\\n]*vezes",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Constantes & helpers
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL   = "https://francards.vercel.app";
const DEFAULT_ANKI  = "http://127.0.0.1:8765";
const STORAGE_KEY   = "francards_ext_settings_v2";

const $ = (id) => document.getElementById(id);

const els = {
  source:        $("source"),
  recapture:     $("recapture"),
  themeToggle:   $("themeToggle"),
  toggleConfig:  $("toggleConfig"),
  configPanel:   $("configPanel"),
  // config fields
  provider:      $("provider"),
  formato:       $("formato"),
  apiKey:        $("apiKey"),
  deckName:      $("deckName"),
  tags:          $("tags"),
  modelName:     $("modelName"),
  clozeModelName:$("clozeModelName"),
  frontField:    $("frontField"),
  backField:     $("backField"),
  clozeField:    $("clozeField"),
  ankiUrl:       $("ankiUrl"),
  ankiApiKey:    $("ankiApiKey"),
  francardsUrl:  $("francardsUrl"),
  // main
  captured:      $("captured"),
  generate:      $("generate"),
  status:        $("status"),
  // results
  resultsSection:$("resultsSection"),
  resultsLabel:  $("resultsLabel"),
  cardsContainer:$("cardsContainer"),
  sendAllBtn:    $("sendAllBtn"),
  downloadBtn:   $("downloadBtn"),
  openSiteBtn:   $("openSiteBtn"),
  // gerar mais / temas
  generateMoreBtn: $("generateMoreBtn"),
  temasPanel:      $("temasPanel"),
  temasChips:      $("temasChips"),
  temaInput:       $("temaInput"),
  temaCustomBtn:   $("temaCustomBtn"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Persistência de configurações
// ─────────────────────────────────────────────────────────────────────────────
const SETTING_IDS = [
  "provider", "formato", "apiKey", "deckName", "tags",
  "modelName", "clozeModelName", "frontField", "backField",
  "clozeField", "ankiUrl", "ankiApiKey", "francardsUrl",
];

function loadSettings() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const s = (data && data[STORAGE_KEY]) || {};
    for (const id of SETTING_IDS) {
      if (s[id] !== undefined && els[id]) els[id].value = s[id];
    }
  });
}

function saveSettings() {
  const s = {};
  for (const id of SETTING_IDS) if (els[id]) s[id] = els[id].value;
  chrome.storage.local.set({ [STORAGE_KEY]: s });
}

SETTING_IDS.forEach((id) => {
  if (els[id]) els[id].addEventListener("change", saveSettings);
});

// ─────────────────────────────────────────────────────────────────────────────
// Config panel toggle
// ─────────────────────────────────────────────────────────────────────────────
els.toggleConfig.addEventListener("click", () => {
  els.configPanel.hidden = !els.configPanel.hidden;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tema claro/escuro (mesma paleta e mecânica do site)
// ─────────────────────────────────────────────────────────────────────────────
const THEME_KEY = "francards_ext_theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (els.themeToggle) {
    els.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    els.themeToggle.title = theme === "dark" ? "Modo claro" : "Modo escuro";
  }
}

function initTheme() {
  chrome.storage.local.get(THEME_KEY, (data) => {
    const saved = data && data[THEME_KEY];
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
      return;
    }
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  });
}

if (els.themeToggle) {
  els.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    chrome.storage.local.set({ [THEME_KEY]: next });
  });
}

initTheme();

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────
function setStatus(msg, state) {
  els.status.textContent = msg || "";
  if (state) els.status.dataset.state = state;
  else els.status.removeAttribute("data-state");
}

// ─────────────────────────────────────────────────────────────────────────────
// Captura: injeta francardsExtract() na aba ativa
// ─────────────────────────────────────────────────────────────────────────────
async function capture() {
  setStatus("Lendo a página…");
  els.source.textContent = "capturando…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) {
      els.source.textContent = "página não suportada";
      setStatus("Abra uma questão numa aba normal e clique em ↻.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: francardsExtract,
      args: [RULES],
    });

    const out = (results && results[0] && results[0].result) || { text: "", source: "" };
    els.captured.value = out.text || "";
    els.source.textContent = out.source || "vazio";

    if (!out.text) {
      setStatus("Nada capturado. Selecione o texto da questão e clique em ↻.", "error");
    } else if ((out.source || "").startsWith("página")) {
      setStatus("Captura genérica — confira/edite o texto antes de gerar. Ctrl+Enter para gerar.", "ok");
    } else {
      setStatus("Revise o texto e clique em Gerar flashcards. Ctrl+Enter para gerar.", "ok");
    }
  } catch (err) {
    els.source.textContent = "erro";
    setStatus("Não consegui ler a página: " + (err && err.message ? err.message : err), "error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AnkiConnect — via proxy no servidor Francards
//
// O AnkiConnect rejeita com 403 requisições vindas de chrome-extension://
// porque essa origem não está na whitelist dele. Solução: roteamos tudo pelo
// servidor Francards (/api/anki-proxy), que chama o AnkiConnect
// servidor-a-servidor, sem restrição de CORS.
// ─────────────────────────────────────────────────────────────────────────────
let ankiTargetCache = {};

function getFrancardsBase() {
  let base = (els.francardsUrl.value.trim() || DEFAULT_URL).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  return base;
}

async function ankiRequest(action, params = {}) {
  const base         = getFrancardsBase();
  const anki_url     = (els.ankiUrl.value.trim() || DEFAULT_ANKI).replace(/\/+$/, "");
  const anki_api_key = els.ankiApiKey.value.trim();

  // Detecta configuração inválida cedo, antes de sequer tentar a requisição.
  // Quando o proxy roda na Vercel (não no localhost), ele não consegue alcançar
  // 127.0.0.1 do usuário — isso resulta em 405 ou falha de conexão.
  const proxyIsRemote = !/localhost|127\.0\.0\.1/i.test(base);
  const ankiIsLocal   = /localhost|127\.0\.0\.1/i.test(anki_url);
  if (proxyIsRemote && ankiIsLocal) {
    throw new Error(
      "Configuração inválida: o Endereço do Francards aponta para a nuvem " +
      "(Vercel), mas o Endereço do AnkiConnect é local (127.0.0.1). " +
      "Troque o AnkiConnect para seu link do Tailscale " +
      "(ex: https://jarvis-lenovo.tail5a31ce.ts.net) — abra ⚙ Configurações → Avançado."
    );
  }

  const res = await fetch(`${base}/api/anki-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anki_url, anki_api_key, action, params }),
  });

  // O proxy repassa o status HTTP do AnkiConnect; se não for 2xx, lança erro.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Proxy respondeu ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.result;
}


async function resolveAnkiTarget(kind) {
  if (ankiTargetCache[kind]) return ankiTargetCache[kind];
  const models = await ankiRequest("modelNames");
  const configured = kind === "cloze"
    ? els.clozeModelName.value.trim()
    : els.modelName.value.trim();

  let model = configured && models.includes(configured) ? configured : null;

  if (!model && kind === "cloze") {
    model = models.find((m) => /cloze|omiss/i.test(m)) || null;
    if (!model) throw new Error("Não encontrei modelo Cloze no Anki.");
  }
  if (!model && kind !== "cloze") {
    model = models.find((m) => /basic|b[aá]sico|padr[aã]o/i.test(m))
         || models.find((m) => !/cloze|omiss/i.test(m))
         || models[0];
    if (!model) throw new Error("Nenhum modelo de nota encontrado no Anki.");
  }

  const fieldNames = await ankiRequest("modelFieldNames", { modelName: model });
  const target = { model, fieldNames };
  ankiTargetCache[kind] = target;
  return target;
}

async function sendCardToAnki(card) {
  const deckName = els.deckName.value.trim() || "Padrão";
  const tags = els.tags.value.trim().split(/\s+/).filter(Boolean);

  await ankiRequest("createDeck", { deck: deckName });

  let modelName, fields;
  if (card.tipo === "cloze") {
    const t = await resolveAnkiTarget("cloze");
    const cfg = els.clozeField.value.trim();
    const field = cfg && t.fieldNames.includes(cfg) ? cfg : t.fieldNames[0];
    modelName = t.model;
    fields = { [field]: card.texto };
  } else {
    const t = await resolveAnkiTarget("basic");
    const cfgF = els.frontField.value.trim();
    const cfgB = els.backField.value.trim();
    const front = cfgF && t.fieldNames.includes(cfgF) ? cfgF : t.fieldNames[0];
    const back  = cfgB && t.fieldNames.includes(cfgB) ? cfgB : t.fieldNames[1] || t.fieldNames[0];
    modelName = t.model;
    fields = { [front]: card.pergunta, [back]: card.resposta };
  }

  return ankiRequest("addNote", {
    note: {
      deckName, modelName, fields, tags,
      options: { allowDuplicate: false, duplicateScope: "deck" },
    },
  });
}

// Dispara a sincronização com o AnkiWeb depois do envio — mesmo comportamento
// do site principal (triggerAnkiSync em script.js). Sem isso, a ficha fica só
// localmente até você sincronizar manualmente no Anki.
async function triggerAnkiSync() {
  const previous = els.status.textContent;
  const previousState = els.status.dataset.state;
  setStatus("sincronizando com o AnkiWeb…");
  try {
    await ankiRequest("sync");
    setStatus("sincronizado com o AnkiWeb ✓", "ok");
  } catch (_) {
    // Sync é "best effort" — se falhar (ex: sem conta AnkiWeb configurada),
    // não interrompe o fluxo, só volta ao status anterior.
    setStatus(previous, previousState);
    return;
  }
  setTimeout(() => {
    setStatus(previous, previousState);
  }, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de flashcards (inline)
// ─────────────────────────────────────────────────────────────────────────────
async function callGenerateApi(extra = {}) {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setStatus("Informe a chave de API em ⚙ Configurações.", "error");
    els.configPanel.hidden = false;
    throw new Error("__silent__"); // já mostramos o status certo, não precisa de outro alerta
  }

  const base = getFrancardsBase();
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resolucao: els.captured.value.trim(),
      provider: els.provider.value,
      api_key: apiKey,
      formato: els.formato.value,
      ...extra,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return { flashcards: data.flashcards || [], sugestoesTema: data.sugestoes_tema || [] };
}

async function generateInline() {
  const text = els.captured.value.trim();
  if (!text) {
    setStatus("Não há texto para enviar.", "error");
    return;
  }

  els.generate.disabled = true;
  els.generate.textContent = "Gerando…";
  setStatus("Consultando a IA…");
  els.resultsSection.hidden = true;
  els.temasPanel.hidden = true;

  try {
    const { flashcards, sugestoesTema } = await callGenerateApi();

    if (flashcards.length === 0) {
      setStatus("A IA não encontrou flashcards para extrair deste texto.", "error");
      return;
    }

    renderCards(flashcards);
    renderTemaChips(sugestoesTema);
    setStatus(`${flashcards.length} ficha(s) gerada(s). Revise e envie ao Anki.`, "ok");
  } catch (err) {
    if (err.message !== "__silent__") setStatus(err.message || "Falha ao gerar flashcards.", "error");
  } finally {
    els.generate.disabled = false;
    els.generate.textContent = "Gerar flashcards";
  }
}

async function generateMoreFlashcards(tema = null, { button = els.generateMoreBtn, originalLabel = "+ Gerar mais fichas desta resolução" } = {}) {
  const text = els.captured.value.trim();
  if (!text) {
    setStatus("Não há texto para enviar.", "error");
    return;
  }

  const existentes = collectCards();

  button.disabled = true;
  button.textContent = tema ? "Gerando…" : "Gerando mais…";
  setStatus(tema ? `Consultando a IA sobre "${tema}"…` : "Consultando a IA por fichas adicionais…");

  try {
    const extra = { existentes };
    if (tema) extra.tema = tema;
    const { flashcards: novas, sugestoesTema } = await callGenerateApi(extra);

    if (novas.length === 0) {
      setStatus("A IA não encontrou nada de novo para extrair desta resolução.", "ok");
    } else {
      appendCards(novas);
      setStatus(`${novas.length} ficha(s) nova(s) adicionada(s).`, "ok");
    }
    renderTemaChips(sugestoesTema);
  } catch (err) {
    if (err.message !== "__silent__") setStatus(err.message || "Falha ao gerar mais flashcards.", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

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
    setStatus("Digite um tema antes de gerar.", "error");
    return;
  }
  generateMoreFlashcards(tema, { button: els.temaCustomBtn, originalLabel: "Gerar ↵" });
  els.temaInput.value = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização das fichas
// ─────────────────────────────────────────────────────────────────────────────
function autoGrow(textarea) {
  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", resize);
  setTimeout(resize, 0);
}

function buildCardEl(card, index) {
  const tipo = card.tipo === "cloze" ? "cloze" : "qa";

  const el = document.createElement("article");
  el.className = "card";
  el.dataset.tipo = tipo;

  // Header
  const header = document.createElement("div");
  header.className = "card-header";

  const num = document.createElement("span");
  num.className = "card-num";
  num.textContent = `Nº ${String(index + 1).padStart(2, "0")}`;

  const typeTag = document.createElement("span");
  typeTag.className = "card-type";
  typeTag.textContent = tipo === "cloze" ? "cloze" : "P/R";

  const flag = document.createElement("span");
  flag.className = "card-flag";
  flag.textContent = "novo";

  header.append(num, typeTag, flag);

  // Body
  let bodyEls, getCard;
  if (tipo === "cloze") {
    const lbl = document.createElement("label");
    lbl.textContent = "Texto (o que estiver entre {{c1::…}} fica escondido)";
    const ta = document.createElement("textarea");
    ta.className = "c-field";
    ta.rows = 3;
    ta.value = card.texto || "";
    autoGrow(ta);
    bodyEls = [lbl, ta];
    getCard = () => ({ tipo: "cloze", texto: ta.value.trim() });
  } else {
    const qLbl = document.createElement("label");
    qLbl.textContent = "Pergunta";
    const qTa = document.createElement("textarea");
    qTa.className = "q-field";
    qTa.rows = 2;
    qTa.value = card.pergunta || "";
    autoGrow(qTa);

    const divider = document.createElement("hr");
    divider.className = "card-divider";

    const aLbl = document.createElement("label");
    aLbl.textContent = "Resposta";
    const aTa = document.createElement("textarea");
    aTa.className = "a-field";
    aTa.rows = 2;
    aTa.value = card.resposta || "";
    autoGrow(aTa);

    bodyEls = [qLbl, qTa, divider, aLbl, aTa];
    getCard = () => ({ tipo: "qa", pergunta: qTa.value.trim(), resposta: aTa.value.trim() });
  }

  // Footer
  const footer = document.createElement("div");
  footer.className = "card-footer";

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del";
  delBtn.type = "button";
  delBtn.textContent = "excluir";
  delBtn.addEventListener("click", () => {
    el.remove();
    updateResultsLabel();
  });

  const sendBtn = document.createElement("button");
  sendBtn.className = "btn-send-card";
  sendBtn.type = "button";
  sendBtn.textContent = "→ Anki";

  sendBtn._sendAction = async ({ sync = true } = {}) => {
    const c = getCard();
    if (c.tipo === "cloze" && !c.texto) { alert("Texto não pode ficar vazio."); return; }
    if (c.tipo === "cloze" && !/\{\{c\d+::/.test(c.texto)) {
      alert("A ficha cloze precisa de ao menos uma lacuna {{c1::…}}."); return;
    }
    if (c.tipo === "qa" && (!c.pergunta || !c.resposta)) {
      alert("Pergunta e resposta não podem ficar vazias."); return;
    }
    sendBtn.disabled = true;
    const orig = sendBtn.textContent;
    sendBtn.textContent = "Enviando…";
    try {
      await sendCardToAnki(c);
      sendBtn.textContent = "Enviado ✓";
      sendBtn.dataset.sent = "true";
      flag.textContent = "enviado";
      flag.dataset.sent = "true";
      if (sync) triggerAnkiSync();
    } catch (err) {
      sendBtn.textContent = orig;
      const msg = String(err.message || err);
      if (/duplicate/i.test(msg)) alert("Já existe no baralho (duplicado).");
      else alert("Erro ao enviar: " + msg);
    } finally {
      sendBtn.disabled = false;
    }
  };
  sendBtn.addEventListener("click", sendBtn._sendAction);

  footer.append(delBtn, sendBtn);
  el.append(header, ...bodyEls, footer);
  return el;
}

function renderCards(flashcards) {
  els.cardsContainer.innerHTML = "";
  flashcards.forEach((card, i) => {
    els.cardsContainer.appendChild(buildCardEl(card, i));
  });
  updateResultsLabel();
  els.resultsSection.hidden = false;
}

function appendCards(flashcards) {
  const startIndex = els.cardsContainer.children.length;
  flashcards.forEach((card, i) => {
    els.cardsContainer.appendChild(buildCardEl(card, startIndex + i));
  });
  updateResultsLabel();
  els.resultsSection.hidden = false;
}

function updateResultsLabel() {
  const count = els.cardsContainer.children.length;
  els.resultsLabel.textContent = `Fichas geradas — ${count}`;
}

function collectCards() {
  return Array.from(els.cardsContainer.querySelectorAll(".card")).map((el) => {
    if (el.dataset.tipo === "cloze") {
      return { tipo: "cloze", texto: el.querySelector(".c-field").value.trim() };
    }
    return {
      tipo: "qa",
      pergunta: el.querySelector(".q-field").value.trim(),
      resposta:  el.querySelector(".a-field").value.trim(),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar todas ao Anki
// ─────────────────────────────────────────────────────────────────────────────
async function sendAll() {
  const cardEls = Array.from(els.cardsContainer.querySelectorAll(".card"));
  const pending = cardEls.filter((el) => {
    const btn = el.querySelector(".btn-send-card");
    return btn && btn.dataset.sent !== "true";
  });
  if (pending.length === 0) { alert("Todas as fichas já foram enviadas."); return; }

  els.sendAllBtn.disabled = true;
  els.sendAllBtn.textContent = `Enviando 0/${pending.length}…`;
  let done = 0;
  for (const el of pending) {
    const btn = el.querySelector(".btn-send-card");
    if (btn && btn._sendAction) await btn._sendAction({ sync: false });
    done++;
    els.sendAllBtn.textContent = `Enviando ${done}/${pending.length}…`;
  }
  await triggerAnkiSync();
  els.sendAllBtn.textContent = "Enviar todas ao Anki";
  els.sendAllBtn.disabled = false;
  setStatus("Todas as fichas foram enviadas ao Anki!", "ok");
}

// ─────────────────────────────────────────────────────────────────────────────
// Download .txt
// ─────────────────────────────────────────────────────────────────────────────
function downloadTxt() {
  const cards = collectCards();
  if (cards.length === 0) { alert("Não há fichas para baixar."); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const clean = (s) => (s || "").replace(/\t/g, " ").replace(/\n/g, " ");
  const qa    = cards.filter((c) => c.tipo !== "cloze");
  const cloze = cards.filter((c) => c.tipo === "cloze");

  const download = (content, filename) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  if (qa.length)    download(qa.map((c) => `${clean(c.pergunta)}\t${clean(c.resposta)}`).join("\n"), `fichas-${stamp}.txt`);
  if (cloze.length) {
    const header = `#notetype:Cloze\n#deck:${els.deckName.value.trim() || "Padrão"}\n`;
    download(header + cloze.map((c) => clean(c.texto)).join("\n"), `fichas-cloze-${stamp}.txt`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Abrir no site
// ─────────────────────────────────────────────────────────────────────────────
function openOnSite() {
  const text = els.captured.value.trim();
  const base = getFrancardsBase();
  chrome.tabs.create({ url: `${base}/#fc=${encodeURIComponent(text)}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────────────────────
els.generate.addEventListener("click", generateInline);

// Ctrl+Enter no textarea também dispara a geração
els.captured.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    generateInline();
  }
});

els.recapture.addEventListener("click", capture);
els.sendAllBtn.addEventListener("click", sendAll);
els.downloadBtn.addEventListener("click", downloadTxt);
els.openSiteBtn.addEventListener("click", openOnSite);

els.generateMoreBtn.addEventListener("click", () => generateMoreFlashcards());
els.temaCustomBtn.addEventListener("click", handleTemaCustomSubmit);
els.temaInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleTemaCustomSubmit();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
loadSettings();
capture();