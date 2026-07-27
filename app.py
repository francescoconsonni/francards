import json
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request


load_dotenv()


app = Flask(
    __name__,
    static_folder="public",
    static_url_path=""
)


# -------------------------------------------------------------------
# CONFIGURAÇÕES DAS APIs
# -------------------------------------------------------------------

GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest"
]


GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)


DEEPSEEK_URL = (
    "https://api.deepseek.com/chat/completions"
)



# -------------------------------------------------------------------
# PROMPTS
# -------------------------------------------------------------------

PROMPT_TEMPLATE = """
Você é um médico especialista em criar flashcards de altíssima qualidade
para estudo com repetição espaçada (Anki), a partir de resoluções de questões.

Sua tarefa é ler a RESOLUÇÃO abaixo e extrair flashcards que testem
raciocínio clínico específico.

REGRAS OBRIGATÓRIAS:

1. Cada flashcard deve testar UM único fato, decisão ou raciocínio.

2. Não faça perguntas genéricas como:
- "Explique sobre..."
- "O que é..."
- "Fale sobre..."

3. Priorize:
- condutas de primeira linha;
- contraindicações;
- critérios diagnósticos;
- exames importantes;
- decisões clínicas;
- diferenças entre alternativas.

4. As respostas devem ser curtas e objetivas.

5. Não invente informações que não estejam na resolução.

6. Não repita conceitos.

7. Gere entre 3 e 10 flashcards.

8. Caso não exista conteúdo relevante, retorne [].


FORMATO DE SAÍDA:

Responda APENAS com JSON válido:

[
  {
    "pergunta": "...",
    "resposta": "..."
  }
]


RESOLUÇÃO DA QUESTÃO:

\"\"\"
{resolucao}
\"\"\"
"""


EXISTING_BLOCK_TEMPLATE = """

ATENÇÃO:

Os flashcards abaixo já foram criados.

Não repita perguntas existentes,
nem perguntas reformuladas.

Crie apenas flashcards novos.

FLASHCARDS EXISTENTES:

{existentes_json}

"""


INSTRUCTION_BLOCK_TEMPLATE = """

O usuário pediu uma orientação adicional:

"{instrucao}"

Crie flashcards especificamente sobre esse ponto,
desde que exista informação suficiente na resolução.

"""


def build_prompt(
    resolucao: str,
    existentes=None,
    instrucao=None
):

    prompt = PROMPT_TEMPLATE.format(
        resolucao=resolucao.strip()
    )


    if existentes:

        prompt += EXISTING_BLOCK_TEMPLATE.format(
            existentes_json=json.dumps(
                existentes,
                ensure_ascii=False,
                indent=2
            )
        )


    if instrucao:

        prompt += INSTRUCTION_BLOCK_TEMPLATE.format(
            instrucao=instrucao
        )


    return prompt
    
    
# -------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------


def extract_json_array(text):

    cleaned = text.strip()


    cleaned = re.sub(
        r"^```(json)?",
        "",
        cleaned,
        flags=re.IGNORECASE
    ).strip()


    cleaned = re.sub(
        r"```$",
        "",
        cleaned
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

        raw = candidate or []


    if not isinstance(raw, list):

        raw = []


    result = []


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

            result.append(
                {
                    "pergunta": pergunta,
                    "resposta": resposta
                }
            )


    return result





    
# -------------------------------------------------------------------
# CHAMADAS ÀS APIs DE IA
# -------------------------------------------------------------------


def call_gemini(
    resolucao,
    api_key,
    existentes=None,
    instrucao=None
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

            "maxOutputTokens": 4096

        }

    }


    last_error = None


    for model in GEMINI_MODELS:


        url = GEMINI_URL.format(
            model=model,
            key=api_key
        )


        try:

            response = requests.post(
                url,
                json=payload,
                timeout=60
            )


            if response.status_code == 404:

                last_error = Exception(
                    f"Modelo Gemini indisponível: {model}"
                )

                continue


            response.raise_for_status()


        except requests.exceptions.HTTPError as exc:

            last_error = exc

            continue



        data = response.json()


        try:

            text = (
                data["candidates"][0]
                ["content"]
                ["parts"][0]
                ["text"]
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



    raise last_error or Exception(
        "Nenhum modelo Gemini respondeu."
    )





def call_deepseek(
    resolucao,
    api_key,
    existentes=None,
    instrucao=None
):

    prompt = build_prompt(
        resolucao,
        existentes,
        instrucao
    )


    headers = {

        "Authorization":
            f"Bearer {api_key}",

        "Content-Type":
            "application/json"

    }


    payload = {

        "model":
            "deepseek-chat",


        "messages": [

            {

                "role":
                    "system",

                "content":
                    "Responda apenas com JSON válido."

            },


            {

                "role":
                    "user",

                "content":
                    prompt

            }

        ],


        "temperature":
            0.25

    }


    response = requests.post(
        DEEPSEEK_URL,
        headers=headers,
        json=payload,
        timeout=60
    )


    response.raise_for_status()


    data = response.json()


    try:

        text = (
            data["choices"][0]
            ["message"]
            ["content"]
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
   
# -------------------------------------------------------------------
# ROTAS
# -------------------------------------------------------------------


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
        data.get("resolucao")
        or ""
    ).strip()



    provider = (
        data.get("provider")
        or "gemini"
    ).strip().lower()



    api_key = (
        data.get("api_key")
        or ""
    ).strip()



    instrucao = (
        data.get("instrucao")
        or ""
    ).strip()



    existentes_raw = (
        data.get("existentes")
        or []
    )



    existentes = (
        normalize_flashcards(
            existentes_raw
        )
        if isinstance(
            existentes_raw,
            list
        )
        else []
    )



    # Permite usar chave armazenada no servidor
    if not api_key:

        env_name = (
            "GEMINI_API_KEY"
            if provider == "gemini"
            else "DEEPSEEK_API_KEY"
        )


        api_key = os.environ.get(
            env_name,
            ""
        )



    if len(resolucao) < 20:

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

        detail = ""

        if exc.response is not None:

            detail = exc.response.text[:300]


        return jsonify(
            {
                "error":
                f"A API de IA recusou a requisição: {detail}"
            }
        ), 502




    except Exception as exc:

        return jsonify(
            {
                "error":
                str(exc)
            }
        ), 502




    return jsonify(
        {
            "flashcards":
            flashcards
        }
    )





# -------------------------------------------------------------------
# EXECUÇÃO LOCAL
# -------------------------------------------------------------------


if __name__ == "__main__":

    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )
