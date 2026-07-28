"""Testes do backend Francards com a IA mockada (nenhuma chave é gasta).

Rodar:  cd francards && python -m pytest -q
"""
import json
import re

import pytest
import responses

import app as appmod

GEMINI_RE = re.compile(r"https://generativelanguage\.googleapis\.com/.*")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"


@pytest.fixture
def client():
    appmod.app.config.update(TESTING=True)
    return appmod.app.test_client()


def sent_prompt(call) -> str:
    """Texto do prompt efetivamente enviado à IA numa chamada capturada."""
    body = call.request.body
    body = body.decode() if isinstance(body, bytes) else body
    payload = json.loads(body)
    if "contents" in payload:  # Gemini
        return payload["contents"][0]["parts"][0]["text"]
    return payload["messages"][-1]["content"]  # DeepSeek


def gemini_reply(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def deepseek_reply(text: str) -> dict:
    return {"choices": [{"message": {"content": text}}]}


# ---------------------------------------------------------------------------
# Unit: parsing
# ---------------------------------------------------------------------------


def test_extract_json_object_with_fences():
    raw = '```json\n{"flashcards": [{"pergunta": "P?", "resposta": "R"}], "sugestoes_tema": ["t1"]}\n```'
    parsed = appmod.parse_generation(appmod.extract_json(raw))
    assert parsed["flashcards"] == [{"tipo": "qa", "pergunta": "P?", "resposta": "R"}]
    assert parsed["sugestoes_tema"] == ["t1"]


def test_parse_generation_accepts_legacy_bare_array():
    raw = '[{"pergunta": "P?", "resposta": "R"}]'
    parsed = appmod.parse_generation(appmod.extract_json(raw))
    assert parsed["flashcards"] == [{"tipo": "qa", "pergunta": "P?", "resposta": "R"}]
    assert parsed["sugestoes_tema"] == []


def test_parse_generation_drops_empty_cards():
    raw = {"flashcards": [{"pergunta": "", "resposta": "R"}, {"pergunta": "P", "resposta": "R"}]}
    parsed = appmod.parse_generation(raw)
    assert parsed["flashcards"] == [{"tipo": "qa", "pergunta": "P", "resposta": "R"}]


def test_cloze_prompt_keeps_double_braces():
    prompt = appmod.build_generate_prompt("x" * 40, formato="cloze")
    # a sintaxe do Anki precisa sobreviver: {{c1::...}} com chaves DUPLAS
    assert "{{c1::" in prompt
    assert "cloze" in prompt.lower()


def test_normalize_accepts_cloze_and_infers_type():
    raw = [
        {"tipo": "cloze", "texto": "A febre amarela é causada por um {{c1::Flavivírus}}."},
        {"texto": "Sem tipo mas com {{c1::lacuna}}."},        # infere cloze
        {"pergunta": "P?", "resposta": "R"},                     # infere qa
        {"tipo": "cloze", "texto": ""},                          # descartado
    ]
    out = appmod.normalize_flashcards(raw)
    assert out[0] == {"tipo": "cloze", "texto": "A febre amarela é causada por um {{c1::Flavivírus}}."}
    assert out[1]["tipo"] == "cloze"
    assert out[2] == {"tipo": "qa", "pergunta": "P?", "resposta": "R"}
    assert len(out) == 3


@responses.activate
def test_generate_cloze_format(client):
    body = json.dumps(
        {"flashcards": [{"tipo": "cloze", "texto": "O vetor urbano é o {{c1::Aedes aegypti}}."}],
         "sugestoes_tema": []}
    )
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)
    r = client.post(
        "/api/generate",
        json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k", "formato": "cloze"},
    )
    assert r.status_code == 200
    card = r.get_json()["flashcards"][0]
    assert card["tipo"] == "cloze"
    assert "{{c1::" in card["texto"]
    # e o prompt enviado pediu cloze
    assert "{{c1::" in sent_prompt(responses.calls[0])


def test_build_prompt_injects_tema_and_existentes():
    prompt = appmod.build_generate_prompt(
        "x" * 40, tema="farmacocinética", existentes=[{"pergunta": "Pergunta antiga?"}]
    )
    assert "farmacocinética" in prompt
    assert "Pergunta antiga?" in prompt
    assert "JÁ EXISTEM" in prompt
    # o escape de chaves duplas foi desfeito
    assert "{{" not in prompt and "}}" not in prompt


# ---------------------------------------------------------------------------
# /api/generate
# ---------------------------------------------------------------------------


@responses.activate
def test_generate_initial_returns_cards_and_temas(client):
    body = json.dumps(
        {"flashcards": [{"pergunta": "P1?", "resposta": "R1"}], "sugestoes_tema": ["tema A"]}
    )
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)

    r = client.post("/api/generate", json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k"})
    assert r.status_code == 200
    data = r.get_json()
    assert data["flashcards"] == [{"tipo": "qa", "pergunta": "P1?", "resposta": "R1"}]
    assert data["sugestoes_tema"] == ["tema A"]


@responses.activate
def test_generate_forwards_tema_and_existentes_to_prompt(client):
    body = json.dumps({"flashcards": [{"pergunta": "Nova?", "resposta": "R"}], "sugestoes_tema": []})
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)

    r = client.post(
        "/api/generate",
        json={
            "resolucao": "r" * 40,
            "provider": "gemini",
            "api_key": "k",
            "tema": "diagnóstico diferencial",
            "existentes": [{"pergunta": "Já existo?", "resposta": "R"}],
        },
    )
    assert r.status_code == 200
    prompt = sent_prompt(responses.calls[0])
    assert "diagnóstico diferencial" in prompt
    assert "Já existo?" in prompt


@responses.activate
def test_generate_empty_on_initial_is_502(client):
    body = json.dumps({"flashcards": [], "sugestoes_tema": []})
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)
    r = client.post("/api/generate", json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k"})
    assert r.status_code == 502


@responses.activate
def test_generate_empty_on_more_is_ok(client):
    """Com 'existentes' presentes (botão 'gerar mais'), lista vazia é válida."""
    body = json.dumps({"flashcards": [], "sugestoes_tema": []})
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)
    r = client.post(
        "/api/generate",
        json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k",
              "existentes": [{"pergunta": "x", "resposta": "y"}]},
    )
    assert r.status_code == 200
    assert r.get_json()["flashcards"] == []


def test_generate_rejects_short_text(client):
    r = client.post("/api/generate", json={"resolucao": "curto", "provider": "gemini", "api_key": "k"})
    assert r.status_code == 400


def test_generate_rejects_missing_key(client, monkeypatch):
    # remove a chave-fallback do ambiente (o .env local pode tê-la definido)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post("/api/generate", json={"resolucao": "r" * 40, "provider": "gemini", "api_key": ""})
    assert r.status_code == 400


@responses.activate
def test_generate_gemini_404_falls_back_to_next_model(client):
    body = json.dumps({"flashcards": [{"pergunta": "P?", "resposta": "R"}], "sugestoes_tema": []})
    # primeiro modelo devolve 404, segundo responde 200
    responses.add(responses.POST, GEMINI_RE, status=404)
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply(body), status=200)
    r = client.post("/api/generate", json={"resolucao": "r" * 40, "provider": "gemini", "api_key": "k"})
    assert r.status_code == 200
    assert len(responses.calls) == 2


@responses.activate
def test_generate_deepseek_path(client):
    body = json.dumps({"flashcards": [{"pergunta": "P?", "resposta": "R"}], "sugestoes_tema": []})
    responses.add(responses.POST, DEEPSEEK_URL, json=deepseek_reply(body), status=200)
    r = client.post("/api/generate", json={"resolucao": "r" * 40, "provider": "deepseek", "api_key": "k"})
    assert r.status_code == 200
    assert r.get_json()["flashcards"] == [{"tipo": "qa", "pergunta": "P?", "resposta": "R"}]


# ---------------------------------------------------------------------------
# /api/resolve
# ---------------------------------------------------------------------------


@responses.activate
def test_resolve_returns_text(client):
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply("Alternativa C. Porque ..."), status=200)
    r = client.post("/api/resolve", json={"questao": "Enunciado da questão com alternativas.", "provider": "gemini", "api_key": "k"})
    assert r.status_code == 200
    assert r.get_json()["resolucao"].startswith("Alternativa C")


def test_resolve_rejects_short_question(client):
    r = client.post("/api/resolve", json={"questao": "curto", "provider": "gemini", "api_key": "k"})
    assert r.status_code == 400


@responses.activate
def test_resolve_forwards_question_to_prompt(client):
    responses.add(responses.POST, GEMINI_RE, json=gemini_reply("resposta"), status=200)
    client.post("/api/resolve", json={"questao": "Paciente com dor torácica típica.", "provider": "gemini", "api_key": "k"})
    assert "Paciente com dor torácica típica." in sent_prompt(responses.calls[0])
