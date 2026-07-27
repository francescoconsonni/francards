import json
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="")

GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
]

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """
Você é um médico especialista em criar flashcards de altíssima qualidade para
estudo com repetição espaçada (Anki), a partir de resoluções de questões.

Sua tarefa: ler a RESOLUÇÃO abaixo e extrair dela flashcards que testem
raciocínio clínico específico — nunca conceitos genéricos.

REGRAS OBRIGATÓRIAS:

1. Cada flashcard testa UM ÚNICO fato, decisão ou raciocínio.

2. PROIBIDO perguntas genéricas como:
"O que é...", "Explique sobre...", "Fale sobre...".

3. Priorize:
- raciocínio clínico;
- escolha terapêutica;
- contraindicações;
- diagnóstico;
- critérios;
- valores importantes;
- condutas de prova.

4. Respostas devem ser CURTAS e PRECISAS.

5. Não crie informações que não estejam na resolução.

6. Não repita a mesma informação.

7. Gere entre 3 e 10 flashcards.

8. Se não houver conteúdo suficiente, retorne uma lista vazia.

FORMATO DE SAÍDA:

Responda APENAS com JSON válido:

[
  {
    "pergunta": "...",
    "resposta": "..."
  }
]


RESOLUÇÃO DA QUESTÃO:

"""
{resolucao}
"""
"""


EXISTING_BLOCK_TEMPLATE = """
ATENÇÃO:

Estas fichas já foram criadas anteriormente:

{existentes_json}


Não repita nenhuma delas.

Crie apenas novas fichas que explorem aspectos ainda não abordados.

A instrução do usuário deve ser seguida quando existir.


INSTRUÇÃO DO USUÁRIO:

{instrucao}


Se não houver mais informações relevantes ou se o tema solicitado já
estiver completamente coberto, retorne uma lista vazia.
"""


def build_prompt(
    resolucao: str,
    existentes=None,
    instrucao: str = ""
) -> str:

    prompt = PROMPT_TEMPLATE.format(
        resolucao=resolucao.strip()
    )

    if existentes:

        existentes_json = json.dumps(
            existentes,
            ensure_ascii=False,
            indent=2
        )

        prompt += EXISTING_BLOCK_TEMPLATE.format(
            existentes_json=existentes_json,
            instrucao=instrucao.strip() or "(nenhuma)"
        )

    return prompt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def extract_json_array(text: str):

    cleaned = text.strip()

    cleaned = re.sub(
        r"^```(json)?",
        "",
        cleaned.strip(),
        flags=re.IGNORECASE
    ).strip()

    cleaned = re.sub(
        r"```$",
        "",
        cleaned.strip()
    ).strip()

    match = re.search(
        r"\[.*\]",
        cleaned,
        re.DOTALL
    )

    if match:
        cleaned = match.group(0)

    try:
        return json.loads(cleaned)

    except json.JSONDecodeError:
        return json.loads(
            cleaned,
            strict=False
        )


def normalize_flashcards(raw):

    if isinstance(raw, dict):

        candidate = None

        for value in raw.values():

            if isinstance(value, list):
                candidate = value
                break

        raw = candidate if candidate else []


    if not isinstance(raw, list):
        raw = []


    cleaned = []

    for card in raw:

        if not isinstance(card, dict):
            continue

        pergunta = str(
            card.get("pergunta", "")
        ).strip()

        resposta = str(
            card.get("resposta", "")
        ).strip()


        if pergunta and resposta:

            cleaned.append(
                {
                    "pergunta": pergunta,
                    "resposta": resposta,
                }
            )

    return cleaned
    # ---------------------------------------------------------------------------
# Chamadas às APIs de IA
# ---------------------------------------------------------------------------


def call_gemini(
    resolucao: str,
    api_key: str,
    existentes=None,
    instrucao: str = ""
):

    prompt = build_prompt(
        resolucao,
        existentes,
        instrucao
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.25,
            "maxOutputTokens": 4096,
        },
    }


    last_error = None


    for model in GEMINI_MODELS:

        url = GEMINI_URL.format(
            model=model,
            key=api_key
        )

        try:

            resp = requests.post(
                url,
                json=payload,
                timeout=60
            )


            if resp.status_code == 404:

                last_error = requests.exceptions.HTTPError(
                    f"Modelo '{model}' indisponível",
                    response=resp
                )

                continue


            resp.raise_for_status()


        except requests.exceptions.HTTPError as exc:

            last_error = exc
            continue


        data = resp.json()


        try:

            text = (
                data["candidates"][0]
                ["content"]["parts"][0]["text"]
            )

        except (
            KeyError,
            IndexError,
            TypeError
        ) as exc:

            raise ValueError(
                f"Resposta inesperada do Gemini: {data}"
            ) from exc


        return normalize_flashcards(
            extract_json_array(text)
        )


    raise last_error or ValueError(
        "Nenhum modelo Gemini disponível respondeu."
    )



def call_deepseek(
    resolucao: str,
    api_key: str,
    existentes=None,
    instrucao: str = ""
):

    prompt = build_prompt(
        resolucao,
        existentes,
        instrucao
    )


    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


    payload = {

        "model": "deepseek-chat",

        "messages": [

            {
                "role": "system",
                "content": (
                    "Responda apenas com JSON válido, "
                    "sem markdown e sem texto extra."
                ),
            },

            {
                "role": "user",
                "content": prompt,
            },
        ],

        "temperature": 0.25,
    }


    resp = requests.post(
        DEEPSEEK_URL,
        headers=headers,
        json=payload,
        timeout=60
    )

    resp.raise_for_status()

    data = resp.json()


    try:

        text = (
            data["choices"][0]
            ["message"]["content"]
        )

    except (
        KeyError,
        IndexError,
        TypeError
    ) as exc:

        raise ValueError(
            f"Resposta inesperada do DeepSeek: {data}"
        ) from exc


    return normalize_flashcards(
        extract_json_array(text)
    )



# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------


@app.route("/")
def index():

    return render_template(
        "index.html"
    )



@app.route(
    "/api/generate",
    methods=["POST"]
)
def generate():

    data = request.get_json(
        force=True,
        silent=True
    ) or {}


    resolucao = (
        data.get("resolucao") or ""
    ).strip()


    provider = (
        data.get("provider") or "gemini"
    ).strip().lower()


    api_key = (
        data.get("api_key") or ""
    ).strip()


    instrucao = (
        data.get("instrucao") or ""
    ).strip()



    existentes_raw = (
        data.get("existentes") or []
    )


    existentes = []

    if isinstance(
        existentes_raw,
        list
    ):

        existentes = normalize_flashcards(
            existentes_raw
        )



    if not api_key:

        env_var = (
            "GEMINI_API_KEY"
            if provider == "gemini"
            else "DEEPSEEK_API_KEY"
        )

        api_key = os.environ.get(
            env_var,
            ""
        )



    if not resolucao or len(resolucao) < 20:

        return jsonify(
            {
                "error":
                "Cole o texto completo da resolução antes de gerar."
            }
        ), 400



    if not api_key:

        return jsonify(
            {
                "error":
                "Informe sua chave de API antes de gerar."
            }
        ), 400



    if provider not in (
        "gemini",
        "deepseek"
    ):

        return jsonify(
            {
                "error":
                "Provedor de IA inválido."
            }
        ), 400



    try:

        if provider == "gemini":

            flashcards = call_gemini(
                resolucao,
                api_key,
                existentes,
                instrucao
            )

        else:

            flashcards = call_deepseek(
                resolucao,
                api_key,
                existentes,
                instrucao
            )



    except requests.exceptions.HTTPError as exc:

        detail = (
            exc.response.text[:300]
            if exc.response is not None
            else str(exc)
        )


        return jsonify(
            {
                "error":
                f"A API de IA recusou a requisição: {detail}"
            }
        ), 502



    except requests.exceptions.RequestException as exc:

        return jsonify(
            {
                "error":
                f"Falha de conexão com a IA: {exc}"
            }
        ), 502



    except (
        ValueError,
        json.JSONDecodeError
    ) as exc:

        return jsonify(
            {
                "error":
                f"Não foi possível interpretar a resposta da IA: {exc}"
            }
        ), 502



    if not flashcards:

        if existentes:

            return jsonify(
                {
                    "flashcards": []
                }
            )


        return jsonify(
            {
                "error":
                "A IA não retornou flashcards válidos para este texto. "
                "Tente colar uma resolução mais detalhada."
            }
        ), 502



    return jsonify(
        {
            "flashcards": flashcards
        }
    )



if __name__ == "__main__":

    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )
