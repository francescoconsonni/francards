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

EXEMPLOS DO ESTILO ESPERADO (tema diferente do texto abaixo, apenas para calibrar o padrão):
[
  {{"pergunta": "Qual o tratamento de escolha para dissecção aguda de aorta tipo A?", "resposta": "Cirurgia de emergência imediata"}},
  {{"pergunta": "Por que antiagregantes são contraindicados na dissecção de aorta?", "resposta": "Aumentam o risco de ruptura catastrófica"}},
  {{"pergunta": "Qual medicamento deve ser administrado antes do vasodilatador na dissecção de aorta?", "resposta": "Betabloqueador (ex.: metoprolol)"}}
]

FORMATO DE SAÍDA — responda APENAS com um JSON válido, sem markdown, sem texto antes ou
depois, exatamente neste formato:
{{
  "flashcards": [
    {{"pergunta": "...", "resposta": "..."}}
  ],
  "sugestoes_tema": ["...", "..."]
}}

Em "sugestoes_tema", liste de 2 a 5 aspectos ou subtemas relacionados a esta
resolução que AINDA NÃO foram cobertos pelas fichas geradas acima, mas que
poderiam virar boas fichas adicionais (frases curtas, tipo "farmacocinética
do fármaco X" ou "diagnósticos diferenciais de Y"). Se não houver nenhum
aspecto relevante adicional, retorne uma lista vazia em "sugestoes_tema".

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
lista vazia em "flashcards".

FICHAS JÁ EXISTENTES:
{existentes_json}
"""

FOCO_BLOCK_TEMPLATE = """
O usuário pediu fichas adicionais focando especificamente neste tema/aspecto:
"{tema}"

Gere as fichas priorizando esse foco, mas sempre dentro do conteúdo da
resolução acima. Se a resolução não tiver informação suficiente sobre esse
tema específico, extraia o que for possível relacionado a ele; se não houver
nada relacionado, retorne uma lista vazia em "flashcards".
"""


def build_prompt(resolucao: str, existentes=None, tema=None) -> str:
    prompt = PROMPT_TEMPLATE.format(resolucao=resolucao.strip())
    if existentes:
        existentes_json = json.dumps(existentes, ensure_ascii=False, indent=2)
        prompt += EXISTING_BLOCK_TEMPLATE.format(existentes_json=existentes_json)
    if tema:
        prompt += FOCO_BLOCK_TEMPLATE.format(tema=tema.strip())
    return prompt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def extract_json(text: str):
    """Extrai um valor JSON (objeto ou array) de um texto que pode vir com
    cercas de markdown, preâmbulo ou sufixo indesejado."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(json)?", "", cleaned.strip(), flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned.strip()).strip()

    def _try_loads(s):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            try:
                # Respostas de IA às vezes trazem quebras de linha "cruas"
                # dentro de strings, o que o parser estrito do JSON rejeita.
                return json.loads(s, strict=False)
            except json.JSONDecodeError:
                return None

    result = _try_loads(cleaned)
    if result is not None:
        return result

    for pattern in (r"\{.*\}", r"\[.*\]"):
        match = re.search(pattern, cleaned, re.DOTALL)
        if match:
            result = _try_loads(match.group(0))
            if result is not None:
