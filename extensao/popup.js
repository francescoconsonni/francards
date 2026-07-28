"use strict";

// -------------------------------------------------------------------------
// Regras de extração por site. AJUSTE AQUI depois de olhar o HTML real de uma
// questão respondida no medcof (veja README-extensao.md, seção "Calibrar").
// Cada lista é tentada na ordem; usa a primeira que devolver texto.
// -------------------------------------------------------------------------
const SITE_RULES = {
  "qbank-prime.medcof.com.br": {
    // Seções na ordem em que entram no texto final: enunciado -> alternativas
    // (com o porquê de cada uma) -> comentário completo. Calibrado sobre o HTML
    // real de uma questão respondida (classes do app React do medcof).
    sections: [
      ["[class*='onboard-question-statement']", "[class*='question-statement']", "[class*='enunciado']"],
      ["[class*='onboard-question-alternatives']", "[class*='answer-option']", "[class*='alternativ']"],
      ["[class*='onboard-question-comments']", "[class*='comentario']", "[class*='explanation']", "[class*='gabarito']"],
    ],
    // Ruído da interface removido do texto final (contagens, votos, rótulos de UI).
    noise: [
      "\\d+([.,]\\d+)?%\\s*escolheram(\\s+esta\\s+alternativa)?",
      "Essa quest[\\u00e3a]o j[\\u00e1a] foi respondida[^\\n]*vezes",
      "Links de artigo[^\\n]*",
      "O que achou desse coment[\\u00e1a]rio[^\\n]*",
      "Marca Texto",
    ],
  },
};

const DEFAULT_URL = "https://francards.vercel.app";
const URL_KEY = "francards_url";

const $ = (id) => document.getElementById(id);
const els = {
  captured: $("captured"),
  source: $("source"),
  create: $("create"),
  recapture: $("recapture"),
  status: $("status"),
  url: $("url"),
};

function setStatus(msg, state) {
  els.status.textContent = msg || "";
  if (state) els.status.dataset.state = state;
  else els.status.removeAttribute("data-state");
}

function loadUrl() {
  chrome.storage.local.get(URL_KEY, (data) => {
    els.url.value = (data && data[URL_KEY]) || DEFAULT_URL;
  });
}

els.url.addEventListener("change", () => {
  const value = els.url.value.trim();
  chrome.storage.local.set({ [URL_KEY]: value || DEFAULT_URL });
});

// -------------------------------------------------------------------------
// Captura: injeta francardsExtract() na aba ativa e recebe o resultado.
// -------------------------------------------------------------------------
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
      func: francardsExtract, // vem de extractor.js (mesmo escopo do popup)
      args: [SITE_RULES],
    });

    const out = (results && results[0] && results[0].result) || { text: "", source: "" };
    els.captured.value = out.text || "";
    els.source.textContent = out.source || "vazio";

    if (!out.text) {
      setStatus("Nada capturado. Selecione o texto da questão e clique em ↻.", "error");
    } else if ((out.source || "").startsWith("página")) {
      setStatus("Captura genérica — confira/edite o texto antes de criar.", "ok");
    } else {
      setStatus("Revise o texto e clique em Criar flashcard.", "ok");
    }
  } catch (err) {
    els.source.textContent = "erro";
    setStatus("Não consegui ler a página: " + (err && err.message ? err.message : err), "error");
  }
}

// -------------------------------------------------------------------------
// Handoff: abre o Francards com o texto no fragmento (#fc=...).
// -------------------------------------------------------------------------
function createFlashcard() {
  const text = els.captured.value.trim();
  if (!text) {
    setStatus("Não há texto para enviar.", "error");
    return;
  }
  let base = (els.url.value.trim() || DEFAULT_URL).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;

  const target = `${base}/#fc=${encodeURIComponent(text)}`;
  chrome.tabs.create({ url: target });
  window.close();
}

els.create.addEventListener("click", createFlashcard);
els.recapture.addEventListener("click", capture);

loadUrl();
capture();
