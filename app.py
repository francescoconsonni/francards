import json
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()  # lê o arquivo .env na raiz do projeto, se existir (só localmente)

app = Flask(__name__, static_folder="public", static_url_path="")

# A Google aposenta modelos do Gemini com frequência. Tentamos o mais atual
# primeiro e, se ele não existir mais (404), caímos para o próximo da lista.
GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"]
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """Você é um médico especialista em criar flashcards de altíssima qualidade para \
estudo com repetição espaçada (Anki), a partir de resoluções de questões.

Sua tarefa: ler a RESOLUÇÃO abaixo e extrair dela flashcards que testem raciocínio \
clínico específico — nunca conceitos genéricos.

REGRAS OBRIGATÓRIAS (siga todas, sem exceção):
1. Cada flashcard testa UM ÚNICO fato, decisão ou raciocínio (princípio atômico).
2. PROIBIDO perguntas genéricas como "Explique sobre...", "O que é...", "Fale sobre...".
   Toda pergunta deve ser específica o bastante para ter apenas UMA resposta correta.
3. Priorize extrair o RACIOCÍNIO da resolução: por que a conduta X foi escolhida e não Y,
   por que um exame/fármaco é contraindicado, qual é a conduta de primeira linha e em que
   ordem, quais achados fecham o diagnóstico, valores de referência citados.
4. Respostas devem ser CURTAS e PRECISAS — idealmente uma frase ou poucas palavras, nunca
   um parágrafo.
5. Não crie flashcards sobre informação trivial, óbvia ou que não estava na resolução.
6. Não repita a mesma informação em cards diferentes.
7. Gere entre 3 e 10 flashcards, de acordo com a densidade real de informação relevante.
8. Se a resolução não tiver conteúdo suficiente para nenhum flashcard de qualidade,
   retorne uma lista vazia.
9. Aproveite as dicas, mnemônicos e pontos chave ressaltados pela resolução.

EXEMPLOS DO ESTILO ESPERADO (tema diferente do texto abaixo, apenas para calibrar o padrão):
[
  {{"pergunta": "Qual o tratamento de escolha para dissecção aguda de aorta tipo A?", "resposta": "Cirurgia de emergência imediata"}},
  {{"pergunta": "Por que antiagregantes são contraindicados na dissecção de aorta?", "resposta": "Aumentam o risco de ruptura catastrófica"}},
  {{"pergunta": "Qual medicamento deve ser administrado antes do vasodilatador na dissecção de aorta?", "resposta": "Betabloqueador (ex.: metoprolol)"}}
]

FORMATO DE SAÍDA — responda APENAS com um JSON válido, sem markdown, sem texto antes ou
depois, exatamente neste formato:
[
  {{"pergunta": "...", "resposta": "..."}}
]

RESOLUÇÃO DA QUESTÃO:
\"\"\"
{resolucao}
\"\"\"
"""


EXISTING_BLOCK_TEMPLATE = """
ATENÇÃO: já foram geradas as fichas abaixo a partir desta mesma resolução.
NÃO repita a mesma pergunta (nem reformulada) para nenhuma delas. Gere apenas
fichas NOVAS, cobrindo aspectos da resolução que essas ainda não cobrem. Se a
resolução já foi esgotada e não sobrar nada de novo e relevante, retorne uma
lista vazia.

FICHAS JÁ EXISTENTES:
{existentes_json}
"""


def build_prompt(resolucao: str, existentes=None) -> str:
    prompt = PROMPT_TEMPLATE.format(resolucao=resolucao.strip())
    if existentes:
        existentes_json = json.dumps(existentes, ensure_ascii=False, indent=2)
        prompt += EXISTING_BLOCK_TEMPLATE.format(existentes_json=existentes_json)
    return prompt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def extract_json_array(text: str):
    """Extrai um array JSON de um texto que pode vir com cercas de markdown,
    preâmbulo ou sufixo indesejado."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(json)?", "", cleaned.strip(), flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned.strip()).strip()

    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(0)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Respostas de IA às vezes trazem quebras de linha "cruas" dentro de
        # strings, o que o parser estrito do JSON rejeita. strict=False
        # aceita esses caracteres de controle sem quebrar o restante.
        return json.loads(cleaned, strict=False)


def normalize_flashcards(raw) -> list:
    """Aceita tanto uma lista quanto um dict com uma lista dentro, e devolve
    apenas os cards com pergunta e resposta não vazias."""
    if isinstance(raw, dict):
        candidate = None
        for value in raw.values():
            if isinstance(value, list):
                candidate = value
                break
        raw = candidate if candidate is not None else []

    if not isinstance(raw, list):
        raw = []

    cleaned = []
    for card in raw:
        if not isinstance(card, dict):
            continue
        pergunta = str(card.get("pergunta", "")).strip()
        resposta = str(card.get("resposta", "")).strip()
        if pergunta and resposta:
            cleaned.append({"pergunta": pergunta, "resposta": resposta})
    return cleaned


# ---------------------------------------------------------------------------
# Chamadas às APIs de IA
# ---------------------------------------------------------------------------


def call_gemini(resolucao: str, api_key: str, existentes=None) -> list:
    prompt = build_prompt(resolucao, existentes)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.25, "maxOutputTokens": 4096},
    }

    last_error = None
    for model in GEMINI_MODELS:
        url = GEMINI_URL.format(model=model, key=api_key)
        try:
            resp = requests.post(url, json=payload, timeout=60)
            if resp.status_code == 404:
                # Este modelo foi descontinuado/renomeado — tenta o próximo da lista.
                last_error = requests.exceptions.HTTPError(
                    f"Modelo '{model}' indisponível (404)", response=resp
                )
                continue
            resp.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            last_error = exc
            continue

        data = resp.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError(f"Resposta inesperada do Gemini: {data}") from exc

        return normalize_flashcards(extract_json_array(text))

    # Nenhum modelo da lista funcionou.
    raise last_error or ValueError("Nenhum modelo Gemini disponível respondeu.")


def call_deepseek(resolucao: str, api_key: str, existentes=None) -> list:
    prompt = build_prompt(resolucao, existentes)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "system",
                "content": "Você responde apenas com JSON válido, sem markdown e sem texto extra.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.25,
    }
    resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Resposta inesperada do DeepSeek: {data}") from exc

    return normalize_flashcards(extract_json_array(text))


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(force=True, silent=True) or {}

    resolucao = (data.get("resolucao") or "").strip()
    provider = (data.get("provider") or "gemini").strip().lower()
    api_key = (data.get("api_key") or "").strip()

    existentes_raw = data.get("existentes") or []
    existentes = normalize_flashcards(existentes_raw) if isinstance(existentes_raw, list) else []

    # Permite fixar uma chave no servidor via variável de ambiente, como fallback.
    if not api_key:
        env_var = "GEMINI_API_KEY" if provider == "gemini" else "DEEPSEEK_API_KEY"
        api_key = os.environ.get(env_var, "")

    if not resolucao or len(resolucao) < 20:
        return jsonify({"error": "Cole o texto completo da resolução antes de gerar."}), 400

    if not api_key:
        return jsonify({"error": "Informe sua chave de API antes de gerar."}), 400

    if provider not in ("gemini", "deepseek"):
        return jsonify({"error": "Provedor de IA inválido."}), 400

    try:
        if provider == "gemini":
            flashcards = call_gemini(resolucao, api_key, existentes)
        else:
            flashcards = call_deepseek(resolucao, api_key, existentes)
    except requests.exceptions.HTTPError as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        return jsonify({"error": f"A API de IA recusou a requisição: {detail}"}), 502
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Falha de conexão com a IA: {exc}"}), 502
    except (ValueError, json.JSONDecodeError) as exc:
        return jsonify({"error": f"Não foi possível interpretar a resposta da IA: {exc}"}), 502

    if not flashcards:
        if existentes:
            # Pedido de "gerar mais": lista vazia é uma resposta válida,
            # só significa que não sobrou nada de novo pra extrair.
            return jsonify({"flashcards": []})
        return (
            jsonify(
                {
                    "error": "A IA não retornou flashcards válidos para este texto. "
                    "Tente colar uma resolução mais detalhada."
                }
            ),
            502,
        )

    return jsonify({"flashcards": flashcards})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
