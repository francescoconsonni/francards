# Extensão do Chrome — "Francards: Capturar questão"

Captura a questão que você errou (no medcof ou em qualquer site) e abre o
Francards já com o texto preenchido, pronto para gerar o flashcard.

Modelo escolhido: **captura & handoff**. A extensão NÃO fala com a IA nem com
o Anki — ela só lê a questão da página e entrega ao site Francards, que faz o
resto (gerar as fichas e mandar para o Anki, como já funcionava).

---

## 1. Como funciona (fluxo)

1. Você resolve uma questão no `qbank-prime.medcof.com.br` e erra — o comentário/gabarito aparece.
2. Clica no ícone da extensão na barra do Chrome.
3. O popup mostra o texto capturado (enunciado + comentário), **editável**.
4. Clica em **"Criar flashcard →"**. Abre o Francards numa aba nova com esse texto no campo de resolução.
5. No Francards: **Gerar flashcards** → revisar → **Enviar para o Anki**. Fluxo de sempre.

O texto vai no fragmento (`#`) da URL do Francards, que **não é enviado ao
servidor** — mesma garantia de privacidade do resto do app.

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

- A extensão só **abre** o Francards com o texto; gerar e enviar ao Anki continua sendo no site (de propósito — mantém a extensão simples e com pouquíssimas permissões: `activeTab`, `scripting`, `storage`).
- Não roda em páginas internas do Chrome (`chrome://…`).
- A captura automática é específica do medcof; em outros sites use a seleção manual.
