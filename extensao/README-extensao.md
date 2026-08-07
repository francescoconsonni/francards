# Extensão do Chrome — "Francards: Capturar questão"

Captura a questão que você errou (no medcof ou em qualquer site) e gera os
flashcards **direto no popup da extensão**, sem precisar abrir o site.

Modelo atual: **captura & geração inline**. A extensão fala com a IA (Gemini/
DeepSeek) e com o Anki (via `/api/anki-proxy` no seu Francards, que repassa
pro AnkiConnect) diretamente do popup. O botão "Abrir no site" continua
existindo como atalho opcional, caso você prefira revisar no site completo
em vez do popup — mas não é mais o fluxo obrigatório.

---

## 1. Como funciona (fluxo)

1. Você resolve uma questão no `qbank-prime.medcof.com.br` e erra — o comentário/gabarito aparece.
2. Clica no ícone da extensão na barra do Chrome.
3. O popup mostra o texto capturado (enunciado + comentário), **editável**.
4. Clica em **"Gerar flashcards"**. As fichas aparecem ali mesmo no popup,
   uma por uma, editáveis.
5. Revisa e clica em **"Enviar ao Anki"** em cada ficha, ou **"Enviar todas"**
   — vai direto pro seu Anki (via AnkiConnect), sincronizando com o AnkiWeb
   automaticamente em seguida.
6. Precisa de mais fichas do mesmo texto? **"+ Gerar mais fichas"** ou os
   chips de tema sugeridos fazem isso sem perder o que já foi gerado.

O texto capturado nunca é salvo em servidor nenhum — só trafega até a API de
geração (mesma garantia de privacidade do site).

**Nota:** hoje a extensão não tem os botões de baixar `.txt`/`.apkg` nem a
seleção de fichas que o site tem — só o envio direto ao Anki. Se isso virar
um incômodo no seu uso, vale considerar trazer essas duas coisas pra cá
também.

---

## 2. Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ligue o **"Modo do desenvolvedor"** (canto superior direito).
3. Clique em **"Carregar sem compactação"** e selecione a pasta `extensao/`.
4. O ícone do Francards aparece na barra. Fixe-o (ícone de peça de quebra-cabeça → alfinete) para ficar sempre à vista.

Para atualizar depois de qualquer mudança: volte em `chrome://extensions` e clique no ↻ do card da extensão.

---

## 3. Apontar para o seu Francards

No popup, abra **Configuração** e preencha **Endereço do Francards**:

- Testando local: `http://localhost:5000` (com `python app.py` rodando).
- Em produção: `https://francards.vercel.app` (ou a URL que você publicar).

Fica salvo — só precisa configurar uma vez.

---

## 4. Como a captura funciona (vários sites)

A extensão tenta capturar nesta ordem:

1. **Seleção manual (sempre funciona, prioridade máxima):** se você **selecionar
   com o mouse** um trecho na página e clicar no ↻ (recapturar), ela usa a sua
   seleção. Funciona em **qualquer site**, mesmo que o layout mude.
2. **Regra específica do site:** para o medcof, ela pega sozinha enunciado +
   alternativas + comentário (calibrado sobre a página real).
3. **Regra genérica:** em **outros bancos de questões**, ela tenta achar
   enunciado/alternativas/comentário por nomes de classe comuns. Não é perfeita,
   mas cobre muitos sites.
4. **Heurística:** se nada acima funcionar, pega o maior bloco de texto da página.

O popup mostra de onde veio a captura (ex.: `auto (medcof)`, `auto (genérico)`,
`seleção manual`, `página (heurística)`). Se vier ruim, é só selecionar na mão.

---

## 5. Calibrar / adicionar um site novo

Se um banco de questões específico não capturar bem sozinho, dá pra criar uma
regra própria pra ele (como a do medcof). Como gerar o exemplo:

1. Responda uma questão no site (até aparecer o comentário/gabarito).
2. `F12` → aba **Elements** → botão direito no elemento `<html>` → **Copy → Copy outerHTML**.
3. Salve num arquivo `.html` e me mande (ou guarde na pasta do projeto).

Com o HTML real eu ajusto as regras no topo de `extensao/popup.js`. A estrutura é:

```js
const RULES = {
  sites: [
    {
      name: "medcof",
      match: ["qbank-prime.medcof.com.br", "medcof.com.br"],
      sections: [
        ["...seletores do enunciado..."],
        ["...seletores das alternativas..."],
        ["...seletores do comentário/gabarito..."],
      ],
      noise: ["...regex de ruído a remover..."],
    },
    // Para um site novo: copie o bloco acima, troque "name" e "match"
    // (pedaço do endereço do site) e ajuste os "sections".
  ],
  generic: { /* seletores comuns, usados em qualquer site */ },
};
```

Cada item de `sections` é uma seção (enunciado, alternativas, comentário); dentro
dela a extensão usa o **primeiro** seletor que encontrar texto.

---

## 6. Limitações

- Sem baixar `.txt`/`.apkg` nem seleção de fichas pelo popup ainda — só envio
  direto ao Anki (via AnkiConnect, com sincronização automática). O site tem
  essas opções extras, a extensão por enquanto não.
- Não roda em páginas internas do Chrome (`chrome://…`).
- A captura automática é específica do medcof; em outros sites use a seleção manual.
- O envio ao Anki passa pelo seu Francards (rota `/api/anki-proxy`), que
  repassa pro AnkiConnect — então precisa do AnkiConnect acessível a partir
  de onde o Francards estiver rodando (local ou, se publicado na Vercel, via
  Tailscale Funnel). Veja a seção 8 do README principal.
