"""Gera um print da página para revisão de design. Uso: python make_screenshot.py"""
import base64
import io
import subprocess
import sys
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

PORT = 5091


def placeholder_png():
    img = Image.new("RGB", (140, 76), (208, 216, 200))
    d = ImageDraw.Draw(img)
    d.line([(10, 60), (35, 20), (55, 62), (80, 15), (110, 55), (132, 40)], fill=(43, 110, 99), width=3)
    d.text((8, 6), "ECG", fill=(20, 52, 48))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


CARDS_HTML = """
<article class="card" data-tipo="qa">
  <div class="card-serial"><span>Nº 01</span><span><span class="card-type">P/R</span><span class="card-flag">novo</span></span></div>
  <label>Pergunta</label>
  <textarea class="q-field" rows="2">Qual o vetor do ciclo urbano da febre amarela?</textarea>
  <hr class="card-divider">
  <label>Resposta</label>
  <textarea class="a-field" rows="1">Aedes aegypti</textarea>
  <div class="card-footer"><button class="btn-ghost">excluir</button><button class="btn-send">Enviar para o Anki</button></div>
</article>
<article class="card" data-tipo="qa">
  <div class="card-serial"><span>Nº 02</span><span><span class="card-type">P/R</span><span class="card-flag" data-sent="true">enviado</span></span></div>
  <label>Pergunta</label>
  <textarea class="q-field" rows="2">Achado que fecha a fase toxêmica grave?</textarea>
  <hr class="card-divider">
  <label>Resposta</label>
  <textarea class="a-field" rows="2">Necrose hepática com icterícia e hemorragias</textarea>
  <div class="card-footer"><button class="btn-ghost">excluir</button><button class="btn-send" data-sent="true">Enviado ✓</button></div>
</article>
<article class="card" data-tipo="cloze">
  <div class="card-serial"><span>Nº 03</span><span><span class="card-type">cloze</span><span class="card-flag">novo</span></span></div>
  <label>Texto (o que estiver entre {{c1::…}} fica escondido)</label>
  <textarea class="c-field" rows="3">A vacina da febre amarela é do tipo {{c1::vírus vivo atenuado}} (cepa 17D).</textarea>
  <div class="card-footer"><button class="btn-ghost">excluir</button><button class="btn-send">Enviar para o Anki</button></div>
</article>
"""


def main():
    server = subprocess.Popen(
        [sys.executable, "-c", f"import app; app.app.run(host='127.0.0.1', port={PORT}, debug=False)"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(2.5)
        thumb = placeholder_png()
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1180, "height": 1000}, device_scale_factor=2)
            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")
            page.wait_for_timeout(500)
            page.eval_on_selector("#resolucao", "el => el.value = 'Resolução: febre amarela é arbovirose por Flavivírus; ciclo urbano pelo Aedes aegypti (extinto desde 1942); forma grave com necrose hepática...'")
            page.evaluate(
                """({cards, thumb}) => {
                    document.getElementById('resultsPanel').hidden = false;
                    document.getElementById('cardsGrid').innerHTML = cards;
                    document.getElementById('drawerLabel').textContent = 'Fichas geradas — 3';
                    const tz = document.getElementById('imageZone');
                    tz.classList.add('has-images');
                    document.getElementById('imageThumbs').innerHTML =
                      '<div class="image-thumb"><img src="' + thumb + '"><button class="image-thumb-remove">×</button></div>';
                    const st = document.getElementById('ankiStatus');
                    st.dataset.state = 'ok'; st.textContent = 'AnkiConnect conectado';
                    document.querySelectorAll('.q-field,.a-field,.c-field').forEach(t => { t.style.height='auto'; t.style.height=t.scrollHeight+'px'; });
                }""",
                {"cards": CARDS_HTML, "thumb": thumb},
            )
            page.wait_for_timeout(300)
            page.screenshot(path="/root/francards_preview.png", full_page=True)
            browser.close()
        print("ok")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
