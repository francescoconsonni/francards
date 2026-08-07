"""Testes das features recentes: /api/anki-proxy, /api/export-apkg e o modo
documento em /api/generate. Segue o mesmo padrão de test_app.py (IA mockada,
nenhuma chave é gasta).

Rodar:  cd francards && python -m pytest -q
"""
import json

import pytest
import responses

import app as appmod


@pytest.fixture
def client():
    appmod.app.config.update(TESTING=True)
    return appmod.app.test_client()


def sent_prompt(call) -> str:
    body = call.request.body
    body = body.decode() if isinstance(body, bytes) else body
    payload = json.loads(body)
    if "contents" in payload:  # Gemini
        return payload["contents"][0]["parts"][0]["text"]
    return payload["messages"][-1]["content"]  # DeepSeek


def gemini_reply(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


# ---------------------------------------------------------------------------
# /api/anki-proxy
# ---------------------------------------------------------------------------


def test_anki_proxy_rejects_missing_url(client):
    r = client.post("/api/anki-proxy", json={"action": "modelNames"})
    assert r.status_code == 400


def test_anki_proxy_rejects_missing_action(client):
    r = client.post("/api/anki-proxy", json={"anki_url": "http://127.0.0.1:8765"})
    assert r.status_code == 400


@responses.activate
def test_anki_proxy_forwards_action_and_key(client):
    responses.add(
        responses.POST,
        "http://127.0.0.1:8765/",
        json={"result": ["Basic", "Cloze"], "error": None},
        status=200,
    )
    r = client.post(
        "/api/anki-proxy",
        json={
            "anki_url": "http://127.0.0.1:8765",
            "anki_api_key": "minha-chave",
            "action": "modelNames",
            "params": {},
        },
    )
    assert r.status_code == 200
    assert r.get_json() == {"result": ["Basic", "Cloze"]}

    sent = json.loads(responses.calls[0].request.body)
    assert sent["action"] == "modelNames"
    assert sent["key"] == "minha-chave"


@responses.activate
def test_anki_proxy_passes_through_ankiconnect_business_error(client):
    """Erro 'de negócio' do AnkiConnect (ex: nota duplicada) deve voltar
    como HTTP 200 com {"error": ...} — não como falha de transporte."""
    responses.add(
        responses.POST,
        "http://127.0.0.1:8765/",
        json={"result": None, "error": "cannot create note because it is a duplicate"},
        status=200,
    )
    r = client.post(
        "/api/anki-proxy",
        json={"anki_url": "http://127.0.0.1:8765", "action": "addNote", "params": {}},
    )
    assert r.status_code == 200
    assert "duplicate" in r.get_json()["error"]


def test_anki_proxy_connection_failure_is_502(client):
    # Porta claramente sem nada escutando — sem precisar mockar rede.
    r = client.post(
        "/api/anki-proxy",
        json={"anki_url": "http://127.0.0.1:1", "action": "modelNames", "params": {}},
    )
    assert r.status_code == 502
    assert "error" in r.get_json()


# ---------------------------------------------------------------------------
# /api/export-apkg
# ---------------------------------------------------------------------------


def test_export_apkg_rejects_empty_cards(client):
    r = client.post("/api/export-apkg", json={"cards": []})
    assert r.status_code == 400


def test_export_apkg_rejects_all_invalid_cards(client):
    r = client.post(
        "/api/export-apkg",
        json={"cards": [{"tipo": "qa", "pergunta": "", "resposta": ""}]},
    )
    assert r.status_code == 400


def test_export_apkg_returns_binary_file(client):
    r = client.post(
        "/api/export-apkg",
        json={
            "cards": [
                {"tipo": "qa", "pergunta": "Pergunta?", "resposta": "Resposta"},
                {"tipo": "cloze", "texto": "Isso é {{c1::cloze}}."},
            ],
            "deck_name": "Baralho de Teste",
            "tags": "tag1 tag2",
        },
    )
    assert r.status_code == 200
    assert r.mimetype == "application/octet-stream"
    assert "attachment" in r.headers.get("Content-Disposition", "")
    assert ".apkg" in r.headers.get("Content-Disposition", "")
    assert len(r.data) > 0


def test_export_apkg_skips_cloze_without_gap(client):
    """Uma ficha cloze sem {{c1::...}} não é uma ficha cloze válida — deve
    ser descartada silenciosamente, não travar a exportação inteira."""
    r = client.post(
        "/api/export-apkg",
        json={
            "cards": [
                {"tipo": "cloze", "texto": "Sem nenhuma lacuna aqui."},
                {"tipo": "qa", "pergunta": "P?", "resposta": "R"},
            ]
        },
    )
    # A ficha válida sobra, então a exportação segue adiante normalmente.
    assert r.status_code == 200


def test_export_apkg_same_deck_name_gives_same_deck_id():
    """Nomes de baralho iguais devem gerar o mesmo deck_id, para que
    reexportar mescle no mesmo baralho no Anki em vez de criar um novo."""
    assert appmod._deck_id_for_name("Meu Baralho") == appmod._deck_id_for_name("Meu Baralho")
    assert appmod._deck_id_for_name("Baralho A") != appmod._deck_id_for_name("Baralho B")


# ---------------------------------------------------------------------------
# Modo documento em /api/generate
# ---------------------------------------------------------------------------


def test_build_prompt_default_mode_uses_question_header():
    prompt = appmod.build_generate_prompt("r" * 40, formato="qa")
    assert "a partir de resoluções de questões" in prompt
    assert "RESOLUÇÃO DA QUESTÃO:" in prompt


def test_build_prompt_document_mode_uses_study_header():
    prompt = appmod.build_generate_prompt(
        "r" * 40,
        formato="qa",
        modo="documento",
        tipo_conteudo="aula",
        objetivo="aprofundamento",
        prova_alvo="hcfmusp-acesso-direto",
    )
    assert "a partir de material de estudo" in prompt
    assert "MATERIAL DE ESTUDO:" in prompt
    assert "TIPO DE MATERIAL: aula" in prompt
    assert "aprofundamento e raciocínio" in prompt
    assert "HCFMUSP" in prompt and "rotura prematura" in prompt


def test_build_prompt_document_mode_without_prova_alvo_omits_hcfmusp_block():
    prompt = appmod.build_generate_prompt(
        "r" * 40, modo="documento", tipo_conteudo="livro", objetivo="revisao"
    )
    assert "HCFMUSP" not in prompt


@responses.activate
def test_generate_route_document_mode_end_to_end(client):
    body = json.dumps({"flashcards": [{"pergunta": "P?", "resposta": "R"}], "sugestoes_tema": []})
    responses.add(responses.POST, appmod.GEMINI_URL.split("{model}")[0] + "*", json=gemini_reply(body), status=200)

    r = client.post(
        "/api/generate",
        json={
            "resolucao": "trecho de aula " * 5,
            "provider": "gemini",
            "api_key": "k",
            "modo": "documento",
            "tipo_conteudo": "diretriz",
            "objetivo": "protocolo",
            "prova_alvo": "hcfmusp-acesso-direto",
        },
    )
    assert r.status_code == 200
    prompt = sent_prompt(responses.calls[0])
    assert "UpToDate ou diretriz clínica" in prompt
    assert "fixação de protocolo e números" in prompt


def test_generate_route_ignores_invalid_modo(client, monkeypatch):
    """modo desconhecido não deve quebrar a rota — cai pro padrão 'questao'."""
    captured = {}

    def fake_build(resolucao, **kwargs):
        captured.update(kwargs)
        return "prompt qualquer"

    monkeypatch.setattr(appmod, "build_generate_prompt", fake_build)
    monkeypatch.setattr(appmod, "call_llm_text", lambda *a, **k: json.dumps({"flashcards": [], "sugestoes_tema": []}))

    client.post(
        "/api/generate",
        json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k", "modo": "modo-que-nao-existe"},
    )
    assert captured["modo"] == "questao"
