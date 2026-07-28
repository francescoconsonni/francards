"""Testa a função de extração da extensão (extractor.js) num navegador real,
incluindo a página REAL do medcof (medcof-exemplo.html) para validar os
seletores calibrados. Rodar:  cd francards && python test_extractor.py
"""
import functools
import http.server
import os
import shutil
import sys
import threading

from playwright.sync_api import sync_playwright

PORT = 5081
HERE = os.path.dirname(__file__)
EXTRACTOR = os.path.join(HERE, "extensao", "extractor.js")

# Espelha as regras REAIS de popup.js, com o match do medcof remapeado para o
# host de teste (127.0.0.1). Se mudar RULES em popup.js, atualize aqui.
RULES = {
    "sites": [
        {
            "name": "medcof",
            "match": ["127.0.0.1"],
            "sections": [
                ["[class*='onboard-question-statement']", "[class*='question-statement']", "[class*='enunciado']"],
                ["[class*='onboard-question-alternatives']", "[class*='answer-option']", "[class*='alternativ']"],
                ["[class*='onboard-question-comments']", "[class*='comentario']", "[class*='explanation']", "[class*='gabarito']"],
            ],
            "noise": [
                r"\d+([.,]\d+)?%\s*escolheram(\s+esta\s+alternativa)?",
                r"Essa quest[ãa]o j[áa] foi respondida[^\n]*vezes",
                r"Links de artigo[^\n]*",
                r"O que achou desse coment[áa]rio[^\n]*",
                r"Marca Texto",
            ],
        }
    ],
    "generic": {
        "sections": [
            ["[class*='enunciado']", "[class*='statement']", "[class*='question-text']", "[class*='pergunta']"],
            ["[class*='alternativ']", "[class*='answer-option']", "[class*='option']", "[class*='choice']"],
            ["[class*='coment']", "[class*='explanation']", "[class*='gabarito']", "[class*='resolucao']", "[class*='feedback']"],
        ],
        "noise": [r"\d+([.,]\d+)?%\s*escolheram(\s+esta\s+alternativa)?"],
    },
}

# Regras "sem site" (só genérico) para testar o fallback genérico num host que
# NÃO casa com nenhuma regra específica.
GENERIC_ONLY = {"sites": [], "generic": RULES["generic"]}

PAGES = {
    # Outro banco de questões qualquer: sem regra específica, mas com nomes de
    # classe comuns -> deve cair no GENÉRICO.
    "generico.html": """<!doctype html><meta charset=utf-8><body>
      <nav>menu que deve ser ignorado</nav>
      <div class="question-enunciado">Paciente com cefaleia holocraniana e rigidez de nuca.</div>
      <div class="lista-alternativas">A) Meningite bacteriana B) Enxaqueca</div>
      <div class="comentario-questao">Correta: meningite. A rigidez de nuca sugere irritacao meningea.</div>
    </body>""",
    # Sem classes reconheciveis -> deve cair na HEURISTICA (<main>).
    "heuristica.html": """<!doctype html><meta charset=utf-8><body>
      <nav>menu</nav>
      <main>Bloco principal com o enunciado completo da questao e bastante texto relevante para o estudo.</main>
      <aside>rodape irrelevante</aside>
    </body>""",
    "selection.html": """<!doctype html><meta charset=utf-8><body>
      <p id="p">Texto selecionavel importante da questao que deve virar o flashcard.</p>
    </body>""",
}


def start_server(tmp):
    for name, html in PAGES.items():
        with open(os.path.join(tmp, name), "w", encoding="utf-8") as f:
            f.write(html)
    shutil.copy(os.path.join(HERE, "medcof-exemplo.html"), os.path.join(tmp, "medcof.html"))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tmp)
    httpd = http.server.HTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run(page, name):
    page.goto(f"http://127.0.0.1:{PORT}/{name}", wait_until="load")
    page.add_script_tag(path=EXTRACTOR)


def main():
    tmp = "/tmp/francards_pages"
    os.makedirs(tmp, exist_ok=True)
    httpd = start_server(tmp)
    failures = 0
    try:
        with sync_playwright() as p:
            page = p.chromium.launch().new_page()

            # 1) PÁGINA REAL DO MEDCOF com os seletores calibrados
            run(page, "medcof.html")
            r = page.evaluate("(rules) => francardsExtract(rules)", RULES)
            txt = r["text"]
            checks = {
                "enunciado presente": "febre amarela" in txt.lower(),
                "alternativas presentes": "aedes aegypti" in txt.lower(),
                "comentário presente": "flaviv" in txt.lower(),
                "fonte = auto (medcof)": r["source"] == "auto (medcof)",
                "ruído '% escolheram' removido": "escolheram" not in txt.lower(),
                "ruído 'respondida X vezes' removido": "foi respondida" not in txt.lower(),
            }
            print(f"[medcof] {len(txt)} chars, source={r['source']!r}")
            for label, ok in checks.items():
                print(("PASS" if ok else "FAIL") + ": " + label)
                failures += 0 if ok else 1
            print("  --- trecho capturado ---")
            print("  " + txt[:240].replace("\n", "\n  "))

            # 2) OUTRO site (sem regra específica) -> genérico
            run(page, "generico.html")
            r = page.evaluate("(rules) => francardsExtract(rules)", GENERIC_ONLY)
            g = r["text"].lower()
            ok = ("cefaleia" in g and "meningite" in g and r["source"] == "auto (genérico)")
            print(("PASS" if ok else "FAIL") + f": captura genérica em outro site (source={r['source']!r})")
            failures += 0 if ok else 1

            # 3) heurística (sem classes reconhecíveis)
            run(page, "heuristica.html")
            r = page.evaluate("(rules) => francardsExtract(rules)", GENERIC_ONLY)
            ok = "Bloco principal" in r["text"] and r["source"].startswith("página")
            print(("PASS" if ok else "FAIL") + ": fallback heurístico (<main>)")
            failures += 0 if ok else 1

            # 4) seleção manual vence tudo
            run(page, "selection.html")
            page.evaluate(
                "() => { const el=document.getElementById('p'); const r=document.createRange();"
                " r.selectNodeContents(el); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }"
            )
            r = page.evaluate("(rules) => francardsExtract(rules)", RULES)
            ok = "selecionavel" in r["text"] and r["source"] == "seleção manual"
            print(("PASS" if ok else "FAIL") + ": seleção manual tem prioridade")
            failures += 0 if ok else 1

            page.context.browser.close()
    finally:
        httpd.shutdown()

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
