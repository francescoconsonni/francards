import hashlib
import html
import json
import os
import re
import tempfile
from datetime import datetime

import genanki
import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

load_dotenv()  # lê o arquivo .env na raiz do projeto, se existir (só localmente)

app = Flask(__name__, static_folder="public", static_url_path="")


@app.after_request
def add_cors_headers(response):
    """Permite que a extensão Chrome chame /api/* diretamente do popup.
    Só libera para extensões Chrome (chrome-extension://) e origens locais;
    em produção o Vercel serve os headers corretos automaticamente."""
    origin = request.headers.get("Origin", "")
    if origin.startswith("chrome-extension://") or origin in ("", "null"):
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/api/<path:path>", methods=["OPTIONS"])
def api_options(path):
    """Responde ao preflight CORS das requisições da extensão."""
    response = app.make_default_options_response()
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# A Google aposenta modelos do Gemini com frequência. Tentamos o mais atual
# primeiro e, se ele não existir mais (404), caímos para o próximo da lista.
# As 6 grandes áreas usadas pra classificação leve de cada ficha (versão
# "simples e confiável" — nada de taxonomia fina, que tem alto risco de erro
# de classificação pela IA). Cada entrada: (nome canônico, slug pra tag do Anki).
GRANDE_AREAS = [
    ("Clínica Médica", "clinica-medica"),
    ("Cirurgia", "cirurgia"),
    ("Pediatria e Neonatologia", "pediatria"),
    ("Saúde Coletiva, MFC e Epidemiologia", "saude-coletiva"),
    ("Obstetrícia", "obstetricia"),
    ("Ginecologia e Mastologia", "ginecologia"),
]
GRANDE_AREA_NAMES = [nome for nome, _ in GRANDE_AREAS]
GRANDE_AREA_SLUGS = {nome: slug for nome, slug in GRANDE_AREAS}

# Prevalência real no Acesso Direto HCFMUSP (2022-2026, 579 questões),
# calculada a partir da taxonomia mestra validada com o usuário. Usada só
# pelo painel de progresso — se um dia cobrirmos mais trilhas, isso vira um
# dict por trilha em vez de um valor fixo.
GRANDE_AREA_PREVALENCIA_ACESSO_DIRETO = {
    "Clínica Médica": 21.1,
    "Cirurgia": 19.3,
    "Pediatria e Neonatologia": 18.5,
    "Saúde Coletiva, MFC e Epidemiologia": 18.1,
    "Obstetrícia": 12.4,
    "Ginecologia e Mastologia": 10.5,
}


def normalize_grande_area(value) -> str:
    """Aceita o que a IA mandou de volta e devolve um nome canônico das 6
    áreas, ou "" se não bater com nada reconhecível (evita salvar lixo)."""
    if not value:
        return ""
    value_norm = str(value).strip().lower()
    for nome in GRANDE_AREA_NAMES:
        if nome.lower() == value_norm:
            return nome
    # Tenta por substring, pra pegar variações tipo "Cirurgia Geral" -> "Cirurgia"
    for nome in GRANDE_AREA_NAMES:
        if nome.lower() in value_norm or value_norm in nome.lower():
            return nome
    return ""


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
7. Quando a resolução permitir, prefira perguntas que peçam o PRÓXIMO PASSO/conduta
   diante de um achado, não só o reconhecimento do diagnóstico isolado — é o padrão de
   pergunta mais recorrente em provas de residência.
8. Se dois fatos da resolução são fáceis de confundir entre si (doses parecidas,
   condutas semelhantes para quadros diferentes), formule a ficha de um jeito que force
   a diferenciação explícita entre eles, em vez de testá-los como se fossem isolados.
9. Gere entre 3 e 10 flashcards, de acordo com a densidade real de informação relevante.
10. Se a resolução não tiver conteúdo suficiente para nenhum flashcard de qualidade,
    retorne uma lista de flashcards vazia."""

GRANDE_AREA_BLOCK = (
    "CLASSIFICAÇÃO POR GRANDE ÁREA: além dos campos do card, cada ficha precisa de um "
    'campo "grande_area" com EXATAMENTE um destes 6 valores (copie a grafia exata):\n'
    + "\n".join(f'- "{nome}"' for nome in GRANDE_AREA_NAMES)
    + "\nEscolha a área clinicamente mais adequada ao conteúdo da ficha. Se a ficha "
    "não se encaixar claramente em nenhuma, use a mais próxima — não deixe em branco."
)

QA_BLOCK = """FORMATO PERGUNTA-E-RESPOSTA (tipo "qa"):
- "pergunta": específica o bastante para ter só UMA resposta correta.
- "resposta": curta e precisa (uma frase ou poucas palavras).
Exemplos (temas diferentes do texto abaixo, apenas para calibrar o padrão — note que
"grande_area" muda conforme o assunto de cada ficha, não é sempre o mesmo valor):
[
  {"tipo": "qa", "pergunta": "Qual o tratamento de escolha para dissecção aguda de aorta tipo A?", "resposta": "Cirurgia de emergência imediata", "grande_area": "Cirurgia"},
  {"tipo": "qa", "pergunta": "Qual o exame de escolha para diagnóstico de TEP em paciente hemodinamicamente estável?", "resposta": "Angiotomografia de tórax", "grande_area": "Clínica Médica"}
]"""

CLOZE_BLOCK = """FORMATO CLOZE (tipo "cloze") — oclusão no estilo Anki:
- "texto": uma frase completa e verdadeira, com o termo-chave escondido na sintaxe {{c1::termo}}.
- Esconda o que REALMENTE importa memorizar (o conceito-chave), não uma palavra trivial.
- Idealmente UMA lacuna por ficha ({{c1::...}}); no máximo duas ({{c1::...}} e {{c2::...}}).
- A frase precisa fazer sentido sozinha e a lacuna ter uma única resposta óbvia.
Exemplos (temas diferentes do texto abaixo, apenas para calibrar o padrão — note que
"grande_area" muda conforme o assunto de cada ficha, não é sempre o mesmo valor):
[
  {"tipo": "cloze", "texto": "Na dissecção de aorta tipo A, o tratamento de escolha é a {{c1::cirurgia de emergência}}.", "grande_area": "Cirurgia"},
  {"tipo": "cloze", "texto": "Na insuficiência cardíaca com fração de ejeção reduzida, a classe de fármaco associada a maior redução de mortalidade é o {{c1::inibidor de SGLT2}}.", "grande_area": "Clínica Médica"}
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
            '{"tipo": "cloze", "texto": "frase com {{c1::termo escondido}}", "grande_area": "..."}',
        )
    if formato == "ambos":
        return (
            QA_BLOCK + "\n\n" + CLOZE_BLOCK,
            "Gere fichas dos DOIS tipos, escolhendo para cada fato o formato que memoriza melhor.",
            '{"tipo": "qa", "pergunta": "...", "resposta": "...", "grande_area": "..."}  OU  {"tipo": "cloze", "texto": "... {{c1::termo}} ...", "grande_area": "..."}',
        )
    return (
        QA_BLOCK,
        'Gere APENAS fichas do tipo "qa".',
        '{"tipo": "qa", "pergunta": "...", "resposta": "...", "grande_area": "..."}',
    )

STUDY_HEADER = """Você é um médico especialista em criar flashcards de altíssima qualidade para \
estudo com repetição espaçada (Anki), a partir de material de estudo (aula, capítulo \
de livro, UpToDate ou diretriz clínica) — não de uma resolução de questão.

Sua tarefa: ler o MATERIAL abaixo e extrair dele flashcards que testem os pontos mais \
importantes para memorizar — definições, critérios diagnósticos, classificações, doses, \
prazos, indicações e contraindicações, condutas.

REGRAS OBRIGATÓRIAS (siga todas, sem exceção):
1. Cada flashcard testa UM ÚNICO fato ou conceito (princípio atômico).
2. PROIBIDO perguntas genéricas como "Explique sobre...", "O que é...", "Fale sobre...".
   Toda pergunta deve ser específica o bastante para ter apenas UMA resposta correta.
3. Priorize o que tem MAIOR valor de prova/prática clínica: critérios, valores de corte,
   doses, indicações/contraindicações, condutas — não trivia nem conceito genérico.
4. Respostas devem ser CURTAS e PRECISAS — idealmente uma frase ou poucas palavras.
5. Não crie flashcards sobre informação que não estava explícita no material.
6. Não repita a mesma informação em cards diferentes.
7. Quando o material permitir, prefira perguntas que peçam o PRÓXIMO PASSO/conduta
   diante de um achado, não só o reconhecimento do diagnóstico isolado — é o padrão de
   pergunta mais recorrente em provas de residência.
8. Se dois fatos do material são fáceis de confundir entre si (doses parecidas,
   critérios semelhantes para quadros diferentes), formule a ficha de um jeito que force
   a diferenciação explícita entre eles, em vez de testá-los como se fossem isolados.
9. Gere até 20 flashcards nesta rodada, conforme a densidade real do material — não
   existe piso mínimo obrigatório. Priorize QUALIDADE sobre quantidade: é melhor devolver
   3 fichas excelentes que 10 fracas só pra parecer completo. Se o material for extenso,
   o usuário pode pedir mais fichas depois (botão "gerar mais").
10. Se o material não tiver conteúdo suficiente para nenhum flashcard de qualidade,
    retorne uma lista de flashcards vazia."""

TIPO_CONTEUDO_BLOCKS = {
    "aula": (
        "TIPO DE MATERIAL: aula/slides. O conteúdo pode estar telegráfico (tópicos, "
        "sem frases completas) — reconstrua o raciocínio clínico implícito ao formular "
        "cada ficha, não copie o slide literalmente."
    ),
    "livro": (
        "TIPO DE MATERIAL: capítulo de livro-texto. Priorize definições, fisiopatologia "
        "central, classificações e condutas descritas em detalhe — um capítulo tem "
        "profundidade suficiente para fichas mais específicas que um resumo de aula."
    ),
    "diretriz": (
        "TIPO DE MATERIAL: UpToDate ou diretriz clínica. Priorize fortemente critérios "
        "diagnósticos explícitos, grau de recomendação/nível de evidência quando citado, "
        "doses e esquemas terapêuticos exatos, e situações de exceção/contraindicação — "
        "é isso que diferencia uma diretriz de um resumo genérico."
    ),
}

OBJETIVO_BLOCKS = {
    "revisao": (
        "OBJETIVO DESTA RODADA: revisão ampla. Priorize COBERTURA — fichas mais curtas "
        "e numerosas, tocando o máximo de subtemas distintos do material, boa para uma "
        "primeira passada por um assunto novo."
    ),
    "aprofundamento": (
        "OBJETIVO DESTA RODADA: aprofundamento e raciocínio clínico. Priorize "
        "PROFUNDIDADE sobre cobertura — menos fichas, mas cada uma forçando "
        'justificativa clínica, diagnóstico diferencial ou o "e se o cenário fosse '
        'diferente". Prefira perguntas que peçam para prever a próxima conduta, não só '
        "reconhecer um nome."
    ),
    "protocolo": lambda formato: (
        "OBJETIVO DESTA RODADA: fixação de protocolo e números. Priorize testar "
        "exatamente doses, prazos, critérios diagnósticos numéricos, escalas e "
        "classificações — o tipo de informação que se esquece por não ter lógica "
        "embutida, só decoreba. "
        + (
            "Como o formato desta rodada é CLOZE, esconda o número/valor exato na "
            "lacuna {{c1::...}}, nunca um termo secundário da frase."
            if formato == "cloze"
            else "Como o formato desta rodada é PERGUNTA-RESPOSTA, a resposta deve ser "
            "só o número/valor exato (ex: \"7,5 mg/kg\"), nunca uma explicação."
            if formato == "qa"
            else "Prefira o formato CLOZE para os números/valores, escondendo-os na "
            "lacuna {{c1::...}} — reserve pergunta-resposta para o que não é um valor "
            "isolado."
        )
    ),
    "caso-clinico": (
        "OBJETIVO DESTA RODADA: estilo caso clínico. Sempre que possível, formule a "
        "pergunta como um mini-caso clínico plausível e compatível com o critério/conduta "
        'sendo testado ("paciente de 45 anos, dor torácica há 2h, ECG mostra X — qual a '
        'conduta?"), em vez de uma pergunta didática seca. Isso simula melhor o formato '
        "real de uma prova de residência."
    ),
}

PROVA_ALVO_BLOCKS = {
    "hcfmusp-acesso-direto": (
        "CONTEXTO DE PROVA-ALVO: HCFMUSP — Acesso Direto (residência médica). Dois "
        "padrões institucionais fortes, confirmados em 5 trilhas diferentes de prova do "
        "HCFMUSP (não só Acesso Direto), valem prioridade extra sempre que o material "
        "tocar neles: (1) medicina intensiva/emergência como eixo transversal — questões "
        "de manejo agudo, UTI e emergência aparecem com força em todas as áreas, não só "
        "em blocos dedicados; (2) oncologia como o tema mais cobrado quando agregado "
        "entre subáreas — vale prioridade mesmo quando a oncologia aparece só de forma "
        "tangencial no material. Além disso, dê prioridade extra (sem inventar conteúdo "
        "que não esteja no material) a temas que a prova de Acesso Direto historicamente "
        "cobra com frequência: rotura prematura de membranas e profilaxia para GBS, "
        "contraindicações a parto vaginal, alvo pressórico em hipertensão crônica "
        "gestacional, vigilância fetal por idade gestacional, reanimação neonatal, "
        "icterícia neonatal, desenho de estudo e vieses em epidemiologia, "
        "pré-eclâmpsia/eclâmpsia, colangite/coledocolitíase, cetoacidose diabética e "
        "síndrome do ovário policístico. Se o material tocar algum desses pontos, não "
        "deixe de extrair uma ficha sobre ele, mesmo que pareça um detalhe menor."
    ),
}


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


def build_generate_prompt(
    resolucao: str,
    tema: str = "",
    existentes=None,
    formato: str = "qa",
    modo: str = "questao",
    tipo_conteudo: str = "",
    objetivo: str = "",
    prova_alvo: str = "",
) -> str:
    """Monta o prompt de geração. formato: 'qa' (pergunta/resposta), 'cloze'
    (oclusão do Anki) ou 'ambos'. Opcionalmente foca num tema e evita repetir
    fichas que já existem (para o botão 'Gerar mais fichas').

    modo: 'questao' (padrão — resolução de questão) ou 'documento' (aula,
    capítulo de livro, UpToDate/diretriz). No modo documento, tipo_conteudo,
    objetivo e prova_alvo calibram o prompt para material de estudo em vez de
    resolução de questão.
    """
    is_documento = modo == "documento"
    parts = [STUDY_HEADER if is_documento else PROMPT_HEADER]

    if is_documento:
        bloco_tipo = TIPO_CONTEUDO_BLOCKS.get(tipo_conteudo)
        if bloco_tipo:
            parts.append(bloco_tipo)
        bloco_objetivo = OBJETIVO_BLOCKS.get(objetivo)
        if callable(bloco_objetivo):
            bloco_objetivo = bloco_objetivo(formato)
        if bloco_objetivo:
            parts.append(bloco_objetivo)
        bloco_prova = PROVA_ALVO_BLOCKS.get(prova_alvo)
        if bloco_prova:
            parts.append(bloco_prova)

    if tema:
        parts.append(
            "FOCO OBRIGATÓRIO DESTA RODADA: gere flashcards especificamente sobre o tema "
            f'"{tema.strip()}", desde que ele apareça ou se relacione ao texto abaixo.'
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
    parts.append(GRANDE_AREA_BLOCK)
    parts.append(exemplo_block)
    parts.append(
        _OUTPUT_SKELETON.replace("__TIPOS__", tipos_txt).replace("__CARDS_DESC__", cards_desc)
    )
    rotulo = "MATERIAL DE ESTUDO" if is_documento else "RESOLUÇÃO DA QUESTÃO"
    parts.append(f'{rotulo}:\n"""\n' + resolucao.strip() + '\n"""')

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
        grande_area = normalize_grande_area(card.get("grande_area"))

        if not tipo:
            tipo = "cloze" if (texto and not (pergunta and resposta)) else "qa"

        if tipo == "cloze":
            if texto:
                cleaned.append({"tipo": "cloze", "texto": texto, "grande_area": grande_area})
        else:
            if pergunta and resposta:
                cleaned.append(
                    {"tipo": "qa", "pergunta": pergunta, "resposta": resposta, "grande_area": grande_area}
                )
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


@app.route("/api/anki-proxy", methods=["POST"])
def anki_proxy():
    """Repassa uma chamada do AnkiConnect servidor-a-servidor.

    A extensão Chrome não consegue chamar o AnkiConnect diretamente porque
    ele não libera CORS pra origens chrome-extension://. Este endpoint
    resolve isso: o navegador chama ESTE servidor (que tem CORS liberado,
    veja add_cors_headers acima), e o servidor chama o AnkiConnect por fora,
    sem qualquer restrição de CORS (isso só existe no navegador).
    """
    payload = request.get_json(silent=True) or {}

    anki_url = (payload.get("anki_url") or "").strip().rstrip("/")
    anki_api_key = (payload.get("anki_api_key") or "").strip()
    action = payload.get("action")
    params = payload.get("params") or {}

    if not anki_url:
        return jsonify({"error": "Endereço do AnkiConnect não informado."}), 400
    if not action:
        return jsonify({"error": "Ação do AnkiConnect não informada."}), 400

    body = {"action": action, "version": 6, "params": params}
    if anki_api_key:
        body["key"] = anki_api_key

    try:
        resp = requests.post(anki_url, json=body, timeout=20)
    except requests.RequestException as exc:
        return jsonify({
            "error": f"Não foi possível conectar ao AnkiConnect em {anki_url}: {exc}"
        }), 502

    try:
        data = resp.json()
    except ValueError:
        return jsonify({
            "error": f"Resposta inválida do AnkiConnect (status HTTP {resp.status_code})."
        }), 502

    # Erros "de negócio" do AnkiConnect (ex: nota duplicada, deck inexistente)
    # voltam com HTTP 200 e {"error": "..."} — é assim que o popup.js já
    # espera receber (data.error), então não tratamos como falha de proxy.
    if data.get("error"):
        return jsonify({"error": data["error"]}), 200

    return jsonify({"result": data.get("result")})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/share", methods=["POST"])
def share():
    """Web Share Target: recebe texto compartilhado pelo Android (PWA instalado).
    O manifest.json já aponta para cá com method=POST e params.text='text'.
    Renderizamos a mesma página principal injetando o texto via variável de template.
    """
    text = (request.form.get("text") or "").strip()
    return render_template("index.html", shared_text=text)


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

    modo = (data.get("modo") or "questao").strip().lower()
    if modo not in ("questao", "documento"):
        modo = "questao"
    tipo_conteudo = (data.get("tipo_conteudo") or "").strip().lower()
    objetivo = (data.get("objetivo") or "").strip().lower()
    prova_alvo = (data.get("prova_alvo") or "").strip().lower()

    # Com imagem, o texto pode ser curto (a questão está na figura). Só exigimos
    # os 20 caracteres de resolução quando NÃO há imagem.
    if not imagens and (not resolucao or len(resolucao) < 20):
        return jsonify({"error": "Cole o texto completo (ou anexe uma imagem) antes de gerar."}), 400
    if not api_key:
        return jsonify({"error": "Informe sua chave de API antes de gerar."}), 400
    if provider not in ("gemini", "deepseek"):
        return jsonify({"error": "Provedor de IA inválido."}), 400

    prompt = build_generate_prompt(
        resolucao,
        tema=tema,
        existentes=existentes,
        formato=formato,
        modo=modo,
        tipo_conteudo=tipo_conteudo,
        objetivo=objetivo,
        prova_alvo=prova_alvo,
    )
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


@app.route("/api/grande-areas", methods=["GET"])
def grande_areas():
    return jsonify(
        {
            "areas": [
                {
                    "nome": nome,
                    "slug": slug,
                    "prevalencia_acesso_direto": GRANDE_AREA_PREVALENCIA_ACESSO_DIRETO.get(nome, 0),
                }
                for nome, slug in GRANDE_AREAS
            ]
        }
    )


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


# ---------------------------------------------------------------------------
# Exportação .apkg — gera um pacote Anki de verdade (via genanki), sem
# depender do AnkiConnect nem de nenhum computador ligado. O usuário abre o
# arquivo baixado direto no AnkiDroid (ele se auto-associa a .apkg) ou no
# Anki Desktop, e as fichas se mesclam ao baralho existente.
# ---------------------------------------------------------------------------

# IDs fixos: precisam ser sempre os mesmos entre execuções para que reimportar
# um novo .apkg mescle no mesmo modelo de nota, em vez de criar um duplicado.
_APKG_BASIC_MODEL = genanki.Model(
    1607392319,
    "Francards Basic",
    fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[
        {
            "name": "Card 1",
            "qfmt": "{{Front}}",
            "afmt": '{{FrontSide}}<hr id="answer">{{Back}}',
        }
    ],
)

_APKG_CLOZE_MODEL = genanki.Model(
    1607392320,
    "Francards Cloze",
    fields=[{"name": "Text"}],
    templates=[
        {
            "name": "Cloze",
            "qfmt": "{{cloze:Text}}",
            "afmt": "{{cloze:Text}}",
        }
    ],
    model_type=genanki.Model.CLOZE,
)


def _deck_id_for_name(deck_name: str) -> int:
    """Deriva um ID de baralho estável a partir do nome — assim, exportar de
    novo com o mesmo nome de baralho mescla no mesmo baralho no Anki, em vez
    de criar um baralho novo a cada download."""
    digest = hashlib.md5(deck_name.encode("utf-8")).hexdigest()[:8]
    return int(digest, 16)


@app.route("/api/export-apkg", methods=["POST"])
def export_apkg():
    data = request.get_json(force=True, silent=True) or {}

    cards = data.get("cards")
    if not isinstance(cards, list) or not cards:
        return jsonify({"error": "Nenhuma ficha selecionada para exportar."}), 400

    deck_name = (data.get("deck_name") or "Padrão").strip() or "Padrão"
    tags_raw = (data.get("tags") or "").strip()
    tag_list = tags_raw.split() if tags_raw else []

    deck = genanki.Deck(_deck_id_for_name(deck_name), deck_name)

    added = 0
    for card in cards:
        if not isinstance(card, dict):
            continue
        tipo = str(card.get("tipo") or "").strip().lower()

        if tipo == "cloze":
            texto = str(card.get("texto") or "").strip()
            if not texto or not re.search(r"\{\{c\d+::", texto):
                continue
            note = genanki.Note(model=_APKG_CLOZE_MODEL, fields=[html.escape(texto)], tags=tag_list)
        else:
            pergunta = str(card.get("pergunta") or "").strip()
            resposta = str(card.get("resposta") or "").strip()
            if not pergunta or not resposta:
                continue
            note = genanki.Note(
                model=_APKG_BASIC_MODEL,
                fields=[html.escape(pergunta), html.escape(resposta)],
                tags=tag_list,
            )

        deck.add_note(note)
        added += 1

    if added == 0:
        return jsonify({"error": "Nenhuma das fichas selecionadas é válida para exportar."}), 400

    package = genanki.Package(deck)
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = os.path.join(tmp_dir, "fichas.apkg")
        package.write_to_file(out_path)
        with open(out_path, "rb") as f:
            apkg_bytes = f.read()

    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    return Response(
        apkg_bytes,
        mimetype="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="fichas-{stamp}.apkg"'},
    )


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)