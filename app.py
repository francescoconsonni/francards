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
# Prompts
# ---------------------------------------------------------------------------

PROMPT_HEADER = """Você é um médico especialista em criar flashcards de altíssima qualidade para \
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
   retorne uma lista de flashcards vazia."""

QA_BLOCK = """FORMATO PERGUNTA-E-RESPOSTA (tipo "qa"):
- "pergunta": específica o bastante para ter só UMA resposta correta.
- "resposta": curta e precisa (uma frase ou poucas palavras).
Exemplos (tema diferente do texto abaixo, apenas para calibrar o padrão):
[
  {"tipo": "qa", "pergunta": "Qual o tratamento de escolha para dissecção aguda de aorta tipo A?", "resposta": "Cirurgia de emergência imediata"},
  {"tipo": "qa", "pergunta": "Por que antiagregantes são contraindicados na dissecção de aorta?", "resposta": "Aumentam o risco de ruptura catastrófica"}
]"""

CLOZE_BLOCK = """FORMATO CLOZE (tipo "cloze") — oclusão no estilo Anki:
- "texto": uma frase completa e verdadeira, com o termo-chave escondido na sintaxe {{c1::termo}}.
- Esconda o que REALMENTE importa memorizar (o conceito-chave), não uma palavra trivial.
- Idealmente UMA lacuna por ficha ({{c1::...}}); no máximo duas ({{c1::...}} e {{c2::...}}).
- A frase precisa fazer sentido sozinha e a lacuna ter uma única resposta óbvia.
Exemplos (tema diferente do texto abaixo, apenas para calibrar o padrão):
[
  {"tipo": "cloze", "texto": "Na dissecção de aorta tipo A, o tratamento de escolha é a {{c1::cirurgia de emergência}}."},
  {"tipo": "cloze", "texto": "Na dissecção de aorta, administra-se um {{c1::betabloqueador}} antes do vasodilatador para controlar a frequência cardíaca."}
]"""

_OUTPUT_SKELETON = """FORMATO DE SAÍDA — responda APENAS com um JSON válido, sem markdown, sem texto
antes ou depois, exatamente neste formato (um objeto):
{
  "flashcards": [ ...as fichas aqui... ],
  "sugestoes_tema": ["tema ainda não coberto 1", "tema ainda não coberto 2"]
}

__TIPOS__
Cada item de "flashcards" é um objeto no formato: __CARDS_DESC__

Em "sugestoes_tema", liste de 0 a 5 subtemas presentes ou diretamente relacionados
à resolução que as fichas acima NÃO cobriram e que valeriam estudo adicional. Use
frases curtas (2 a 5 palavras). Se não houver nenhum, devolva uma lista vazia."""


def _format_blocks(formato: str):
    """Devolve (bloco_de_exemplos, instrução_de_tipos, descrição_do_card) conforme
    o formato pedido: 'qa', 'cloze' ou 'ambos'."""
    if formato == "cloze":
        return (
            CLOZE_BLOCK,
            'Gere APENAS fichas do tipo "cloze".',
            '{"tipo": "cloze", "texto": "frase com {{c1::termo escondido}}"}',
        )
    if formato == "ambos":
        return (
            QA_BLOCK + "\n\n" + CLOZE_BLOCK,
            "Gere fichas dos DOIS tipos, escolhendo para cada fato o formato que memoriza melhor.",
            '{"tipo": "qa", "pergunta": "...", "resposta": "..."}  OU  {"tipo": "cloze", "texto": "... {{c1::termo}} ..."}',
        )
    return (
        QA_BLOCK,
        'Gere APENAS fichas do tipo "qa".',
        '{"tipo": "qa", "pergunta": "...", "resposta": "..."}',
    )

RESOLVE_PROMPT_TEMPLATE = """Você é um professor de medicina especialista em resolver questões de \
provas de residência médica com raciocínio clínico explícito.

Resolva a QUESTÃO abaixo. Sua resolução deve:
1. Indicar a alternativa correta.
2. Explicar POR QUE ela é correta (raciocínio clínico, achados-chave, condutas, valores de referência).
3. Explicar POR QUE cada alternativa incorreta está errada, quando houver alternativas.
4. Ser objetiva e estruturada — o texto será usado depois para gerar flashcards de estudo.

Responda em português, apenas com a resolução (sem preâmbulo do tipo "aqui está").

QUESTÃO:
\"\"\"
{questao}
\"\"\"
"""


def build_generate_prompt(resolucao: str, tema: str = "", existentes=None, formato: str = "qa") -> str:
    """Monta o prompt de geração. formato: 'qa' (pergunta/resposta), 'cloze'
    (oclusão do Anki) ou 'ambos'. Opcionalmente foca num tema e evita repetir
    fichas que já existem (para o botão 'Gerar mais fichas')."""
    parts = [PROMPT_HEADER]

    if tema:
        parts.append(
            "FOCO OBRIGATÓRIO DESTA RODADA: gere flashcards especificamente sobre o tema "
            f'"{tema.strip()}", desde que ele apareça ou se relacione à resolução abaixo.'
        )

    existentes = existentes or []
    ja_existentes = []
    for c in existentes:
        if isinstance(c, dict):
            val = str(c.get("pergunta", "")).strip() or str(c.get("texto", "")).strip()
            if val:
                ja_existentes.append(val)
    if ja_existentes:
        lista = "\n".join(f"- {p}" for p in ja_existentes)
        parts.append(
            "AS FICHAS ABAIXO JÁ EXISTEM. NÃO as repita nem crie variações equivalentes. "
            "Gere apenas fichas NOVAS e complementares (se não houver nada novo de qualidade, "
            "devolva uma lista de flashcards vazia):\n" + lista
        )

    exemplo_block, tipos_txt, cards_desc = _format_blocks(formato)
    parts.append(exemplo_block)
    parts.append(
        _OUTPUT_SKELETON.replace("__TIPOS__", tipos_txt).replace("__CARDS_DESC__", cards_desc)
    )
    parts.append('RESOLUÇÃO DA QUESTÃO:\n"""\n' + resolucao.strip() + '\n"""')

    return "\n\n".join(parts)


def build_resolve_prompt(questao: str) -> str:
    return RESOLVE_PROMPT_TEMPLATE.format(questao=questao.strip())


# ---------------------------------------------------------------------------
# Helpers de parsing
# ---------------------------------------------------------------------------


def _strip_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(json)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def extract_json(text: str):
    """Extrai um objeto OU array JSON de um texto que pode vir com cercas de
    markdown, preâmbulo ou sufixo indesejado."""
    cleaned = _strip_fences(text)

    # Recorta a partir do PRIMEIRO delimitador que aparecer no texto — se um
    # '[' vier antes de um '{', é um array (formato antigo); caso contrário é
    # um objeto. Assim não confundimos o objeto interno de um array com o todo.
    first_obj = cleaned.find("{")
    first_arr = cleaned.find("[")
    starts = [i for i in (first_obj, first_arr) if i != -1]
    if starts:
        start = min(starts)
        pattern = r"\{.*\}" if cleaned[start] == "{" else r"\[.*\]"
        match = re.search(pattern, cleaned[start:], re.DOTALL)
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
    """Aceita uma lista de cards e devolve os válidos, com 'tipo' definido:
    - qa:    {"tipo": "qa", "pergunta": ..., "resposta": ...}
    - cloze: {"tipo": "cloze", "texto": ...}
    Se o 'tipo' vier ausente, ele é inferido pelos campos presentes."""
    if not isinstance(raw, list):
        raw = []

    cleaned = []
    for card in raw:
        if not isinstance(card, dict):
            continue
        tipo = str(card.get("tipo", "")).strip().lower()
        texto = str(card.get("texto", "")).strip()
        pergunta = str(card.get("pergunta", "")).strip()
        resposta = str(card.get("resposta", "")).strip()

        if not tipo:
            tipo = "cloze" if (texto and not (pergunta and resposta)) else "qa"

        if tipo == "cloze":
            if texto:
                cleaned.append({"tipo": "cloze", "texto": texto})
        else:
            if pergunta and resposta:
                cleaned.append({"tipo": "qa", "pergunta": pergunta, "resposta": resposta})
    return cleaned


def parse_generation(raw) -> dict:
    """Interpreta a saída da IA, que pode ser:
      - um objeto {"flashcards": [...], "sugestoes_tema": [...]}
      - um dict com uma lista de cards em qualquer chave (formato antigo)
      - uma lista de cards diretamente (formato antigo)
    Devolve sempre {"flashcards": [...], "sugestoes_tema": [...]}.
    """
    flashcards_raw = []
    sugestoes = []

    if isinstance(raw, dict):
        if isinstance(raw.get("flashcards"), list):
            flashcards_raw = raw["flashcards"]
        else:
            # formato antigo: primeira lista de dicts encontrada
            for value in raw.values():
                if isinstance(value, list) and (not value or isinstance(value[0], dict)):
                    flashcards_raw = value
                    break
        if isinstance(raw.get("sugestoes_tema"), list):
            sugestoes = raw["sugestoes_tema"]
    elif isinstance(raw, list):
        flashcards_raw = raw

    sugestoes = [str(t).strip() for t in sugestoes if str(t).strip()][:5]

    return {
        "flashcards": normalize_flashcards(flashcards_raw),
        "sugestoes_tema": sugestoes,
    }


# ---------------------------------------------------------------------------
# Chamadas às APIs de IA (devolvem TEXTO cru; o parsing fica por conta de quem chama)
# ---------------------------------------------------------------------------


MAX_IMAGES = 4
ALLOWED_IMAGE_MIME = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


def normalize_images(raw) -> list:
    """Valida a lista de imagens vinda do cliente. Cada item deve ser
    {"mime": "image/png", "data": "<base64 sem prefixo>"}. Retorna no máximo
    MAX_IMAGES imagens válidas."""
    if not isinstance(raw, list):
        return []
    out = []
    for img in raw:
        if not isinstance(img, dict):
            continue
        mime = str(img.get("mime", "")).strip().lower()
        data = str(img.get("data", "")).strip()
        if mime in ALLOWED_IMAGE_MIME and len(data) > 32:
            out.append({"mime": "image/jpeg" if mime == "image/jpg" else mime, "data": data})
        if len(out) >= MAX_IMAGES:
            break
    return out


def _call_gemini_text(prompt: str, api_key: str, images=None) -> str:
    parts = [{"text": prompt}]
    for img in images or []:
        parts.append({"inline_data": {"mime_type": img["mime"], "data": img["data"]}})

    payload = {
        "contents": [{"parts": parts}],
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
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError(f"Resposta inesperada do Gemini: {data}") from exc

    # Nenhum modelo da lista funcionou.
    raise last_error or ValueError("Nenhum modelo Gemini disponível respondeu.")


def _call_deepseek_text(prompt: str, api_key: str, system: str) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.25,
    }
    resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Resposta inesperada do DeepSeek: {data}") from exc


def call_llm_text(prompt: str, provider: str, api_key: str, system: str, images=None) -> str:
    """Fachada única para as duas IAs. Devolve o texto cru da resposta.
    Só o Gemini é multimodal; no DeepSeek as imagens são ignoradas."""
    if provider == "gemini":
        return _call_gemini_text(prompt, api_key, images=images)
    return _call_deepseek_text(prompt, api_key, system)


# ---------------------------------------------------------------------------
# Resolução de chave / provedor
# ---------------------------------------------------------------------------


def resolve_api_key(provider: str, api_key: str) -> str:
    if api_key:
        return api_key
    env_var = "GEMINI_API_KEY" if provider == "gemini" else "DEEPSEEK_API_KEY"
    return os.environ.get(env_var, "")


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
    api_key = resolve_api_key(provider, (data.get("api_key") or "").strip())
    tema = (data.get("tema") or "").strip()
    formato = (data.get("formato") or "qa").strip().lower()
    if formato not in ("qa", "cloze", "ambos"):
        formato = "qa"
    existentes = data.get("existentes") or []
    if not isinstance(existentes, list):
        existentes = []
    imagens = normalize_images(data.get("imagens"))

    # Com imagem, o texto pode ser curto (a questão está na figura). Só exigimos
    # os 20 caracteres de resolução quando NÃO há imagem.
    if not imagens and (not resolucao or len(resolucao) < 20):
        return jsonify({"error": "Cole o texto completo da resolução (ou anexe uma imagem) antes de gerar."}), 400
    if not api_key:
        return jsonify({"error": "Informe sua chave de API antes de gerar."}), 400
    if provider not in ("gemini", "deepseek"):
        return jsonify({"error": "Provedor de IA inválido."}), 400

    prompt = build_generate_prompt(resolucao, tema=tema, existentes=existentes, formato=formato)
    if imagens:
        prompt += (
            "\n\nOBSERVAÇÃO: há IMAGEM(NS) anexada(s) a esta questão (ex.: ECG, "
            "radiografia, foto clínica). Analise o que elas mostram e use esses "
            "achados nas fichas."
        )
    system = "Você responde apenas com JSON válido, sem markdown e sem texto extra."

    try:
        text = call_llm_text(prompt, provider, api_key, system, images=imagens)
        parsed = parse_generation(extract_json(text))
    except requests.exceptions.HTTPError as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        return jsonify({"error": f"A API de IA recusou a requisição: {detail}"}), 502
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Falha de conexão com a IA: {exc}"}), 502
    except (ValueError, json.JSONDecodeError) as exc:
        return jsonify({"error": f"Não foi possível interpretar a resposta da IA: {exc}"}), 502

    flashcards = parsed["flashcards"]
    sugestoes = parsed["sugestoes_tema"]

    # Numa geração inicial (sem tema e sem cards existentes) exigimos ao menos
    # uma ficha; em "gerar mais / por tema" uma lista vazia é resultado válido.
    is_initial = not tema and not existentes
    if is_initial and not flashcards:
        return (
            jsonify(
                {
                    "error": "A IA não retornou flashcards válidos para este texto. "
                    "Tente colar uma resolução mais detalhada."
                }
            ),
            502,
        )

    return jsonify({"flashcards": flashcards, "sugestoes_tema": sugestoes})


@app.route("/api/resolve", methods=["POST"])
def resolve():
    data = request.get_json(force=True, silent=True) or {}

    questao = (data.get("questao") or "").strip()
    provider = (data.get("provider") or "gemini").strip().lower()
    api_key = resolve_api_key(provider, (data.get("api_key") or "").strip())

    if not questao or len(questao) < 10:
        return jsonify({"error": "Cole o enunciado da questão antes de pedir a resolução."}), 400
    if not api_key:
        return jsonify({"error": "Informe sua chave de API antes de gerar."}), 400
    if provider not in ("gemini", "deepseek"):
        return jsonify({"error": "Provedor de IA inválido."}), 400

    prompt = build_resolve_prompt(questao)
    system = (
        "Você é um professor de medicina que resolve questões de residência com "
        "raciocínio clínico detalhado, em português."
    )

    try:
        text = call_llm_text(prompt, provider, api_key, system)
    except requests.exceptions.HTTPError as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        return jsonify({"error": f"A API de IA recusou a requisição: {detail}"}), 502
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Falha de conexão com a IA: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": f"Não foi possível interpretar a resposta da IA: {exc}"}), 502

    resolucao = (text or "").strip()
    if not resolucao:
        return jsonify({"error": "A IA não retornou uma resolução. Tente novamente."}), 502

    return jsonify({"resolucao": resolucao})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
