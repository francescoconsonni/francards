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

## 4. Os dois modos de captura

**Automático (padrão):** ao abrir o popup, a extensão tenta extrair sozinha o
enunciado + comentário usando os seletores do medcof.

**Manual (fallback, sempre funciona):** se a captura automática vier errada ou
vazia, **selecione com o mouse** o trecho certo na página e clique no ↻
(recapturar) do popup — a seleção tem prioridade sobre tudo. Funciona em
qualquer site, mesmo que o medcof mude o layout.

---

## 5. Calibrar os seletores do medcof  ⚠️ (é aqui que preciso da sua ajuda)

A captura automática depende de seletores CSS que apontam para os blocos certos
da página. Coloquei um chute inicial, mas para acertar em cheio preciso do HTML
real de uma questão **já respondida**. Como gerar:

1. Responda uma questão no medcof (até aparecer o comentário).
2. `F12` → aba **Elements** → clique com o botão direito no elemento `<html>` → **Copy → Copy outerHTML**.
3. Cole num arquivo `medcof-exemplo.html` e me mande (ou salve na pasta do projeto).

Com isso eu ajusto o `SITE_RULES` no topo de `popup.js` (as listas
`question` e `explanation`) e a captura automática passa a acertar sempre.
Enquanto isso não acontece, use o **modo manual** (seção 4) — ele já funciona.

Onde editar, se quiser mexer você mesmo — topo de `extensao/popup.js`:

```js
const SITE_RULES = {
  "qbank-prime.medcof.com.br": {
    question:    ["...seletores do enunciado..."],
    explanation: ["...seletores do comentário/gabarito..."],
  },
};
```

---

## 6. Limitações

- A extensão só **abre** o Francards com o texto; gerar e enviar ao Anki continua sendo no site (de propósito — mantém a extensão simples e com pouquíssimas permissões: `activeTab`, `scripting`, `storage`).
- Não roda em páginas internas do Chrome (`chrome://…`).
- A captura automática é específica do medcof; em outros sites use a seleção manual.
