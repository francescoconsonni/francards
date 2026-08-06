/*
 * extractor.js
 * -------------------------------------------------------------------------
 * Função que roda DENTRO da página (injetada via chrome.scripting.executeScript).
 * Precisa ser autossuficiente: não pode depender de nada fora dela, por isso
 * recebe as regras por argumento.
 *
 * Estratégia (captura automática + fallback manual), em ordem:
 *   1. Seleção do usuário — se ele marcou texto com o mouse, usa isso. Sempre
 *      confiável, funciona em QUALQUER site.
 *   2. Regras do site — se o site atual bate com uma regra específica (ex.: medcof),
 *      junta as seções definidas (enunciado -> alternativas -> comentário).
 *   3. Regra genérica — seletores comuns a muitos bancos de questões; roda em
 *      qualquer site quando não há regra específica ou ela não achou nada.
 *   4. Heurística — pega o maior bloco de texto da página.
 *
 * Formato do objeto `rules`:
 *   {
 *     sites: [ { name, match, sections, noise }, ... ],
 *     generic: { sections, noise }
 *   }
 * - match: string ou lista de strings; casa se location.hostname contiver alguma.
 * - sections: lista de "seções"; cada seção é uma lista de seletores CSS. Em
 *   cada seção usa-se o PRIMEIRO seletor que retornar texto; as seções são
 *   concatenadas na ordem.
 * - noise: lista de regex (string) removidas do texto final.
 * -------------------------------------------------------------------------
 */

function francardsExtract(rules) {
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

  const sectionText = (selectors) => {
    for (const sel of selectors || []) {
      let joined = "";
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (_) {
        continue; // seletor inválido — pula
      }
      nodes.forEach((el) => {
        const t = textOf(el);
        if (t) joined += (joined ? "\n\n" : "") + t;
      });
      if (joined.trim()) return joined.trim();
    }
    return "";
  };

  const fromRule = (rule) => {
    if (!rule) return "";
    let combined = (rule.sections || []).map(sectionText).filter(Boolean).join("\n\n");
    for (const rx of rule.noise || []) {
      try {
        combined = combined.replace(new RegExp(rx, "gi"), "");
      } catch (_) {
        /* regex inválida na config — ignora */
      }
    }
    return clean(combined);
  };

  rules = rules || {};

  // 1) Seleção manual do usuário --------------------------------------------
  const selection = (window.getSelection && window.getSelection().toString()) || "";
  if (selection.trim().length >= 15) {
    return { text: clean(selection), source: "seleção manual" };
  }

  // 2) Regra específica do site ---------------------------------------------
  const host = location.hostname;
  for (const site of rules.sites || []) {
    const m = site.match;
    const matched = Array.isArray(m) ? m.some((k) => host.includes(k)) : host.includes(m);
    if (matched) {
      const t = fromRule(site);
      if (t) return { text: t, source: `auto (${site.name || host})` };
      break; // o site casou mas não achou nada — cai para o genérico
    }
  }

  // 3) Regra genérica (qualquer site) ---------------------------------------
  const generic = fromRule(rules.generic);
  if (generic && generic.length >= 40) {
    return { text: generic, source: "auto (genérico)" };
  }

  // 4) Heurística: maior bloco de texto -------------------------------------
  const isNoise = (el) => /^(NAV|HEADER|FOOTER|ASIDE)$/.test(el.tagName);
  let best = document.querySelector("main, article, [role='main']");
  if (!best || textOf(best).length < 40) {
    const candidates = Array.from(document.querySelectorAll("div, section")).filter(
      (el) => !isNoise(el)
    );
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
