/*
 * extractor.js
 * -------------------------------------------------------------------------
 * Função que roda DENTRO da página (injetada via chrome.scripting.executeScript).
 * Precisa ser autossuficiente: não pode depender de nada fora dela, por isso
 * recebe as regras de site por argumento.
 *
 * Estratégia (a que você escolheu — "auto com fallback manual"):
 *   1. Se o usuário selecionou texto na página, usa a seleção (fallback manual,
 *      sempre confiável, funciona em qualquer site).
 *   2. Senão, usa as regras do site (ex.: medcof): junta, em ordem, as SEÇÕES
 *      definidas (enunciado -> alternativas -> comentário) e remove ruído.
 *   3. Senão, cai numa heurística: pega o maior bloco de texto da página.
 *
 * Formato de uma regra de site (veja SITE_RULES em popup.js):
 *   {
 *     sections: [ [seletores da seção 1], [seletores da seção 2], ... ],
 *     noise:    [ "regex string", ... ]   // opcional, removido do texto final
 *   }
 * Em cada seção, tenta os seletores na ordem e usa o PRIMEIRO que tiver texto.
 * -------------------------------------------------------------------------
 */

function francardsExtract(siteRules) {
  const MAX = 15000;

  const clean = (s) =>
    (s || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX);

  const textOf = (el) => (el && el.innerText ? el.innerText.trim() : "");

  // 1) Seleção manual do usuário --------------------------------------------
  const selection = (window.getSelection && window.getSelection().toString()) || "";
  if (selection.trim().length >= 15) {
    return { text: clean(selection), source: "seleção manual" };
  }

  // 2) Regras específicas do site -------------------------------------------
  const host = location.hostname;
  const ruleKey = Object.keys(siteRules || {}).find((k) => host.includes(k));
  if (ruleKey) {
    const rule = siteRules[ruleKey];

    const sectionText = (selectors) => {
      for (const sel of selectors || []) {
        let joined = "";
        document.querySelectorAll(sel).forEach((el) => {
          const t = textOf(el);
          if (t) joined += (joined ? "\n\n" : "") + t;
        });
        if (joined.trim()) return joined.trim();
      }
      return "";
    };

    let combined = (rule.sections || [])
      .map(sectionText)
      .filter(Boolean)
      .join("\n\n");

    for (const rx of rule.noise || []) {
      try {
        combined = combined.replace(new RegExp(rx, "gi"), "");
      } catch (_) {
        /* regex inválida na config — ignora e segue */
      }
    }

    combined = clean(combined);
    if (combined) {
      return { text: combined, source: `auto (${ruleKey})` };
    }
  }

  // 3) Heurística: maior bloco de texto -------------------------------------
  let best = document.querySelector("main, article, [role='main']");
  if (!best || textOf(best).length < 40) {
    const candidates = Array.from(document.querySelectorAll("div, section"));
    best = candidates.reduce(
      (a, b) => (textOf(b).length > textOf(a).length ? b : a),
      document.body
    );
  }
  const fallback = textOf(best);
  if (fallback) {
    return { text: clean(fallback), source: "página (heurística)" };
  }

  return { text: "", source: "nada encontrado" };
}
