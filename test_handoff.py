"""Testa o handoff da extensão -> site: abrir a página com #fc=<texto>
deve preencher o campo de resolução e limpar o hash. Usa Chromium headless.

Rodar:  cd francards && python test_handoff.py
"""
import subprocess
import sys
import time
from urllib.parse import quote

from playwright.sync_api import sync_playwright

PORT = 5057
SAMPLE = "Questão sobre dor torácica.\nAlternativa correta: C.\nPor quê: raciocínio clínico — açúcar/coração."


def main():
    server = subprocess.Popen(
        [sys.executable, "-c", f"import app; app.app.run(host='127.0.0.1', port={PORT}, debug=False)"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(2.5)
        url = f"http://127.0.0.1:{PORT}/#fc={quote(SAMPLE)}"
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            # Só nos importam exceções reais de JavaScript (pageerror). Erros de
            # rede (fontes do Google, sonda do AnkiConnect) são esperados no
            # sandbox offline e não contam.
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(400)

            value = page.eval_on_selector("#resolucao", "el => el.value")
            hash_after = page.evaluate("() => window.location.hash")
            status = page.eval_on_selector("#genStatus", "el => el.textContent")
            formato_opts = page.eval_on_selector_all(
                "#formato option", "els => els.map(o => o.value)"
            )
            browser.close()

        ok = True
        if value.strip() != SAMPLE.strip():
            print("FAIL: resolucao não foi preenchida corretamente.")
            print("  esperado:", repr(SAMPLE))
            print("  obtido:  ", repr(value))
            ok = False
        else:
            print("PASS: campo de resolução preenchido a partir do #fc=.")
        if hash_after != "":
            print(f"FAIL: hash não foi limpo (='{hash_after}').")
            ok = False
        else:
            print("PASS: hash da URL foi limpo após importar.")
        if "importada da extensão" not in status:
            print(f"WARN: status inesperado: {status!r}")
        else:
            print("PASS: mensagem de status exibida.")

        if formato_opts == ["qa", "cloze", "ambos"]:
            print("PASS: seletor de formato (qa/cloze/ambos) presente.")
        else:
            print(f"FAIL: opções de formato inesperadas: {formato_opts}")
            ok = False

        if errors:
            print("FAIL: erros de JavaScript no carregamento:")
            for e in errors:
                print("  -", e)
            ok = False
        else:
            print("PASS: página carregou sem erros de JavaScript.")

        sys.exit(0 if ok else 1)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
