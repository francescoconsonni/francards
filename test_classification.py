"""Testes da classificação por grande área/subárea (6 áreas, 47 subáreas do
Acesso Direto HCFMUSP) e da tag hcfmusp::área::subárea no envio ao Anki e no
.apkg. Segue o mesmo padrão de test_app.py / test_new_features.py (IA
mockada, nenhuma chave é gasta).

Rodar:  cd francards && python -m pytest -q
"""
import json

import pytest

import app as appmod


@pytest.fixture
def client():
    appmod.app.config.update(TESTING=True)
    return appmod.app.test_client()


# ---------------------------------------------------------------------------
# normalize_grande_area / normalize_subarea
# ---------------------------------------------------------------------------


def test_normalize_grande_area_exact_match():
    assert appmod.normalize_grande_area("Cirurgia") == "Cirurgia"


def test_normalize_grande_area_accepts_close_variation():
    # "Cirurgia Geral" não é um dos 6 nomes exatos, mas contém "Cirurgia"
    assert appmod.normalize_grande_area("Cirurgia Geral") == "Cirurgia"


def test_normalize_grande_area_rejects_garbage():
    assert appmod.normalize_grande_area("Astrofísica") == ""


def test_normalize_grande_area_empty_input():
    assert appmod.normalize_grande_area("") == ""
    assert appmod.normalize_grande_area(None) == ""


def test_normalize_subarea_exact_match():
    assert appmod.normalize_subarea("Cardiologia") == "Cardiologia"


def test_normalize_subarea_case_insensitive():
    assert appmod.normalize_subarea("cardiologia") == "Cardiologia"


def test_normalize_subarea_rejects_out_of_scope_specialty():
    # Oftalmologia genuinamente não está nas 47 (abaixo do corte de 3
    # questões) — tem que devolver vazio, não forçar um encaixe.
    assert appmod.normalize_subarea("Oftalmologia") == ""


def test_normalize_subarea_empty_input():
    assert appmod.normalize_subarea("") == ""


# ---------------------------------------------------------------------------
# Integridade dos dados de referência (SUBAREAS / GRANDE_AREAS)
# ---------------------------------------------------------------------------


def test_47_subareas_no_duplicate_slugs():
    slugs = [info["slug"] for info in appmod.SUBAREA_INFO.values()]
    assert len(slugs) == len(set(slugs))


def test_every_subarea_has_a_valid_parent_grande_area():
    areas_validas = set(appmod.GRANDE_AREA_NAMES)
    for nome, info in appmod.SUBAREA_INFO.items():
        assert info["grande_area"] in areas_validas, f"{nome} aponta pra grande_area inválida"


def test_grande_areas_have_6_entries():
    assert len(appmod.GRANDE_AREA_NAMES) == 6


# ---------------------------------------------------------------------------
# /api/grande-areas
# ---------------------------------------------------------------------------


def test_grande_areas_route_returns_areas_and_subareas(client):
    r = client.get("/api/grande-areas")
    assert r.status_code == 200
    data = r.get_json()
    assert len(data["areas"]) == 6
    assert len(data["subareas"]) == 47
    # cada subárea devolvida tem os 4 campos esperados pelo front-end
    exemplo = data["subareas"][0]
    assert set(exemplo.keys()) == {"nome", "grande_area", "slug", "prevalencia_acesso_direto"}


# ---------------------------------------------------------------------------
# Injeção no prompt (GRANDE_AREA_BLOCK / SUBAREA_BLOCK)
# ---------------------------------------------------------------------------


def test_prompt_includes_grande_area_block():
    prompt = appmod.build_generate_prompt("r" * 40, formato="qa")
    assert "CLASSIFICAÇÃO POR GRANDE ÁREA" in prompt
    for nome in appmod.GRANDE_AREA_NAMES:
        assert nome in prompt


def test_prompt_includes_subarea_block():
    prompt = appmod.build_generate_prompt("r" * 40, formato="qa")
    assert "CLASSIFICAÇÃO POR SUBÁREA" in prompt
    assert "Cardiologia" in prompt  # uma das 47, só de amostra
    assert "errar por deixar em branco" in prompt


def test_grande_area_block_comes_before_examples_in_prompt():
    prompt = appmod.build_generate_prompt("r" * 40, formato="qa")
    assert prompt.find("CLASSIFICAÇÃO POR GRANDE ÁREA") < prompt.find("FORMATO PERGUNTA-E-RESPOSTA")


# ---------------------------------------------------------------------------
# normalize_flashcards inclui grande_area e subarea
# ---------------------------------------------------------------------------


def test_normalize_flashcards_includes_area_and_subarea():
    cards = appmod.normalize_flashcards(
        [
            {
                "tipo": "qa",
                "pergunta": "P?",
                "resposta": "R",
                "grande_area": "Cirurgia",
                "subarea": "Cirurgia do Trauma",
            }
        ]
    )
    assert cards[0]["grande_area"] == "Cirurgia"
    assert cards[0]["subarea"] == "Cirurgia do Trauma"


def test_normalize_flashcards_drops_bad_subarea_keeps_area():
    cards = appmod.normalize_flashcards(
        [{"tipo": "qa", "pergunta": "P?", "resposta": "R", "grande_area": "Cirurgia", "subarea": "lixo"}]
    )
    assert cards[0]["grande_area"] == "Cirurgia"
    assert cards[0]["subarea"] == ""


# ---------------------------------------------------------------------------
# hcfmusp_tag_for_card — a função que corrige o bug do .apkg sem tag
# ---------------------------------------------------------------------------


def test_hcfmusp_tag_with_area_and_subarea():
    card = {"grande_area": "Cirurgia", "subarea": "Cirurgia do Trauma"}
    assert appmod.hcfmusp_tag_for_card(card) == "hcfmusp::cirurgia::cirurgia-do-trauma"


def test_hcfmusp_tag_with_area_only():
    card = {"grande_area": "Cirurgia", "subarea": ""}
    assert appmod.hcfmusp_tag_for_card(card) == "hcfmusp::cirurgia"


def test_hcfmusp_tag_with_no_area_returns_none():
    card = {"grande_area": "", "subarea": ""}
    assert appmod.hcfmusp_tag_for_card(card) is None


def test_hcfmusp_tag_ignores_subarea_from_different_area():
    # subárea válida, mas não bate com a grande área informada — não deveria
    # acontecer na prática (vêm sempre pareadas do normalize_flashcards),
    # mas a função não deve quebrar se acontecer.
    card = {"grande_area": "Pediatria e Neonatologia", "subarea": "Cardiologia"}
    tag = appmod.hcfmusp_tag_for_card(card)
    assert tag == "hcfmusp::pediatria::cardiologia"  # aceita, só monta a tag


# ---------------------------------------------------------------------------
# /api/export-apkg agora inclui a tag hcfmusp (bug corrigido)
# ---------------------------------------------------------------------------


def test_export_apkg_includes_hcfmusp_tag(client, monkeypatch):
    captured_notes = []

    class FakeNote:
        def __init__(self, model=None, fields=None, tags=None):
            self.tags = tags or []

    class FakeDeck:
        def __init__(self, deck_id, name):
            self.notes = []

        def add_note(self, note):
            captured_notes.append(note)
            self.notes.append(note)

    class FakePackage:
        def __init__(self, deck):
            self.deck = deck

        def write_to_file(self, path):
            with open(path, "wb") as f:
                f.write(b"fake")

    monkeypatch.setattr(appmod.genanki, "Note", FakeNote)
    monkeypatch.setattr(appmod.genanki, "Deck", FakeDeck)
    monkeypatch.setattr(appmod.genanki, "Package", FakePackage)

    r = client.post(
        "/api/export-apkg",
        json={
            "cards": [
                {
                    "tipo": "qa",
                    "pergunta": "P?",
                    "resposta": "R",
                    "grande_area": "Obstetrícia",
                    "subarea": "",
                }
            ],
            "deck_name": "Teste",
            "tags": "minhatag",
        },
    )
    assert r.status_code == 200
    assert len(captured_notes) == 1
    tags = captured_notes[0].tags
    assert "minhatag" in tags
    assert "hcfmusp::obstetricia" in tags


def test_export_apkg_without_area_has_no_hcfmusp_tag(client, monkeypatch):
    captured_notes = []

    class FakeNote:
        def __init__(self, model=None, fields=None, tags=None):
            self.tags = tags or []

    class FakeDeck:
        def __init__(self, deck_id, name):
            self.notes = []

        def add_note(self, note):
            captured_notes.append(note)

    class FakePackage:
        def __init__(self, deck):
            pass

        def write_to_file(self, path):
            with open(path, "wb") as f:
                f.write(b"fake")

    monkeypatch.setattr(appmod.genanki, "Note", FakeNote)
    monkeypatch.setattr(appmod.genanki, "Deck", FakeDeck)
    monkeypatch.setattr(appmod.genanki, "Package", FakePackage)

    r = client.post(
        "/api/export-apkg",
        json={"cards": [{"tipo": "qa", "pergunta": "P?", "resposta": "R"}], "deck_name": "Teste"},
    )
    assert r.status_code == 200
    assert not any(t.startswith("hcfmusp::") for t in captured_notes[0].tags)
