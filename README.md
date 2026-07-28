# Fichário Clínico — Gerador de Flashcards para Anki

Sistema web que transforma a resolução de uma questão em flashcards objetivos
(pergunta específica → resposta precisa) usando Gemini ou DeepSeek, com envio
de um clique para o Anki via AnkiConnect.

```
flashcard-anki/
├── app.py              # App Flask (rotas + chamadas às IAs + serve os arquivos abaixo)
├── templates/index.html # Interface
├── public/style.css     # Estilo (pasta lida direto pela Vercel também)
├── public/script.js     # Lógica de geração + integração com AnkiConnect
├── requirements.txt
├── vercel.json
└── .env.example
```

**Importante sobre como funciona:** o texto da resolução é enviado ao seu
servidor (local ou na Vercel) só para chamar a API de IA e gerar as
perguntas/respostas. O envio para o Anki acontece **direto do seu navegador**
para o AnkiConnect (`http://127.0.0.1:8765`) — o servidor nunca fala com o
Anki. Por isso, o botão "Enviar para o Anki" só funciona quando você acessa a
página **pelo mesmo computador** onde o Anki está aberto (ou por um
dispositivo na mesma rede, se você expuser o AnkiConnect — veja a seção
"Usar do celular/tablet" abaixo).

---

## 1. Pré-requisitos

- Python 3.9+
- [Anki](https://apps.ankiweb.net/) instalado no computador
- Addon [AnkiConnect](https://ankiweb.net/shared/info/2055492159) instalado no Anki
- Uma chave de API do [Gemini](https://aistudio.google.com/apikey) e/ou do [DeepSeek](https://platform.deepseek.com/api_keys)

### Configurar o AnkiConnect

1. No Anki: `Ferramentas → Complementos → AnkiConnect → Config`.
2. Adicione a origem da sua página em `webCorsOriginList`. Para rodar local:

```json
{
  "apiKey": null,
  "webBindAddress": "127.0.0.1",
  "webBindPort": 8765,
  "webCorsOriginList": [
    "http://localhost:5000",
    "http://127.0.0.1:5000"
  ]
}
```

   Se for usar a versão hospedada na Vercel, adicione também a URL dela, por
   exemplo `"https://seu-projeto.vercel.app"`.

3. Reinicie o Anki e deixe-o aberto enquanto usa o sistema.

---

## 2. Rodar localmente

```bash
git clone <seu-repositorio>
cd flashcard-anki

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

python app.py
```

Abra `http://localhost:5000` no navegador. Com o Anki aberto e o
AnkiConnect configurado (passo anterior), você já pode colar uma resolução,
escolher o provedor de IA, colar sua chave de API e gerar as fichas.

---

## 3. Como usar

1. **Configuração**: escolha Gemini ou DeepSeek, cole sua chave de API,
   defina o baralho de destino e tags opcionais. Escolha também o **formato
   das fichas**: *Pergunta e resposta*, *Cloze* (lacuna no estilo Anki,
   `{{c1::...}}`) ou *Ambos*. Isso fica salvo no seu navegador (não é enviado
   a lugar nenhum além da chamada de geração).
2. **Resolução da questão**: cole o texto completo da resolução (quanto mais
   raciocínio clínico explícito, melhores as fichas) e clique em **Gerar
   flashcards**. Você também pode **anexar uma imagem** (ECG, radiografia, foto
   clínica) — arraste, escolha o arquivo ou cole (Ctrl+V) na área de imagem. No
   **Gemini**, a IA analisa a figura ao criar as fichas (o DeepSeek não lê
   imagens). Marque *"Anexar a imagem também nas fichas"* para que ela vá junto
   no cartão do Anki.
3. Revise as fichas geradas — os campos de pergunta e resposta são
   editáveis diretamente no cartão.
4. Clique em **Enviar para o Anki** em cada ficha, ou em **Enviar todas para
   o Anki** para mandar tudo de uma vez. Duplicatas (mesma pergunta já
   existente no baralho) são detectadas pelo Anki e não são reenviadas.

O modelo de nota padrão é `Basic` (campos `Front`/`Back`, o modelo padrão do
Anki). Fichas **cloze** usam o modelo `Cloze` (campo `Text`), que também já vem
no Anki. Se você usa modelos diferentes ou com os campos renomeados, ajuste em
**Avançado** (há campos separados para o modelo de pergunta/resposta e para o
de cloze).

---

## 4. Hospedar na Vercel

O deploy sobe apenas a parte de **geração de flashcards** (interface +
chamada às IAs). O envio para o Anki continua acontecendo do navegador do
usuário para o AnkiConnect local, como explicado acima.

### Opção A — via CLI

```bash
npm install -g vercel
cd flashcard-anki
vercel login
vercel
```

Siga as perguntas do assistente (aceite os padrões). Ao final, use
`vercel --prod` para publicar em produção.

### Opção B — via GitHub + painel da Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), clique em **Add New → Project** e
   importe o repositório.
3. A Vercel detecta o `vercel.json` automaticamente — não precisa mudar
   nenhuma configuração de build.
4. (Opcional) Em **Settings → Environment Variables**, adicione
   `GEMINI_API_KEY` e/ou `DEEPSEEK_API_KEY` apenas se você quiser uma chave
   fixa no servidor como fallback — por padrão isso não é necessário, cada
   usuário cola a própria chave na interface.
5. Clique em **Deploy**.

Depois do deploy, adicione a URL gerada (`https://seu-projeto.vercel.app`)
em `webCorsOriginList` no config do AnkiConnect, como mostrado no passo 1.

---

## 5. Usar do computador, tablet e celular

- **Gerar flashcards** funciona em qualquer dispositivo, já que só depende
  da internet e da API de IA.
- **Enviar para o Anki** exige que o dispositivo consiga alcançar o
  AnkiConnect. Duas opções:
  - **Mesmo computador**: acesse a página nesse computador — funciona sem
    configuração extra (endereço padrão `http://127.0.0.1:8765`).
  - **Celular/tablet na mesma rede Wi-Fi**: no computador com o Anki, mude
    `webBindAddress` para `"0.0.0.0"` no config do AnkiConnect, descubra o
    IP local do computador (ex.: `192.168.0.15`) e, na seção **Avançado** da
    interface, mude o campo "Endereço do AnkiConnect" para
    `http://192.168.0.15:8765`. Adicione também a origem correspondente em
    `webCorsOriginList`.

---

## 6. Deixar a chave de API fixa (não precisar colar toda vez)

Por padrão cada pessoa cola a própria chave na interface. Se for só você
usando, dá pra fixar a chave no servidor — o campo da interface pode ficar
em branco que ele usa a chave fixa automaticamente.

### No computador (rodando local)

1. Na pasta do projeto, copie o arquivo `.env.example` e renomeie a cópia
   para `.env` (exatamente esse nome, com o ponto na frente).
2. Abra o `.env` num editor de texto e preencha:

```
GEMINI_API_KEY=cole_sua_chave_aqui
```

3. Salve. Pare o servidor (`Ctrl + C`) e rode `python app.py` de novo.

O `.env` nunca é enviado ao GitHub (já está no `.gitignore`), então sua
chave não fica exposta publicamente.

### Na Vercel

1. No painel do seu projeto na Vercel, vá em **Settings → Environment
   Variables**.
2. Em **Key**, digite `GEMINI_API_KEY`. Em **Value**, cole sua chave.
3. Marque os três ambientes (Production, Preview, Development) e clique em
   **Save**.
4. Vá em **Deployments**, clique nos "..." do deployment mais recente e
   escolha **Redeploy** (a variável só é aplicada em deploys novos).

Depois disso, o campo "Chave de API" na interface pode ficar vazio — o
servidor usa a chave fixa automaticamente. Se alguém digitar uma chave
diferente no campo, ela tem prioridade sobre a fixa só naquela requisição.

---

## 7. Gerar fichas fora de casa e importar depois

Se você gerar fichas de um lugar onde não consegue alcançar o AnkiConnect
(trabalho, fora de casa, sem a configuração da seção 9), use o botão
**"Baixar fichas (.txt)"** em vez de "Enviar para o Anki". Ele salva um
arquivo de texto com uma pergunta e uma resposta por linha, separadas por
tab — o formato que o próprio Anki entende para importação em lote.

Para importar esse arquivo depois, no computador com o Anki:

1. Abra o Anki → **Arquivo → Importar** (ou arraste o `.txt` para a janela
   principal do Anki).
2. Selecione o arquivo baixado.
3. Na tela de importação, confira: **Type** = "Notas em texto", **Fields
   separated by** = Tab, e o mapeamento de campos: campo 1 → `Front` (ou
   `Pergunta`), campo 2 → `Back` (ou `Resposta`).
4. Escolha o baralho de destino e clique em **Importar**.

---

## 8. Usar seu computador de casa como servidor (acesso de qualquer lugar)

Isso permite clicar em "Enviar para o Anki" estando fora de casa — o
celular se conecta ao AnkiConnect do seu computador através de um túnel
privado e seguro, sem precisar abrir portas do roteador para a internet
inteira (o que seria perigoso).

Vamos usar o [Tailscale](https://tailscale.com), que cria uma rede privada
só entre os seus próprios aparelhos.

### 8.1 Instalar e conectar

1. No computador de casa: baixe e instale em
   [tailscale.com/download](https://tailscale.com/download). Abra o
   programa e faça login (pode ser com sua conta Google).
2. No celular: instale o app **Tailscale** (App Store / Play Store) e faça
   login **com a mesma conta**.
3. Pronto — os dois aparelhos agora enxergam um ao outro por uma rede
   privada, mesmo estando em lugares diferentes.

### 8.2 Expor o AnkiConnect só para você (não para a internet)

No computador de casa, com o Anki aberto, abra um terminal (mesmo processo
do Passo 5 da instalação, mas não precisa estar na pasta do projeto) e
rode:

```
tailscale serve --bg 8765
```

Ele vai mostrar uma mensagem parecida com esta:

```
https://seu-computador.tailXXXXX.ts.net
|-- / proxy http://127.0.0.1:8765
```

Copie esse endereço `https://seu-computador.tailXXXXX.ts.net` — é ele que
você vai usar no lugar de `http://127.0.0.1:8765`. Esse comando só precisa
ser rodado uma vez (o `--bg` faz continuar funcionando mesmo depois de
fechar o terminal e reiniciar o computador).

### 8.3 Configurar no site

1. Acesse o site (da Vercel) de qualquer lugar, com o app do Tailscale
   ativo no celular/computador que está usando.
2. Na seção **Avançado**, troque o campo **"Endereço do AnkiConnect"** para
   o link `https://seu-computador.tailXXXXX.ts.net` que você copiou (sem
   `:8765` no final — o Tailscale já cuida disso).
3. Gere e envie as fichas normalmente.

### 8.4 O que você precisa manter

- O computador de casa precisa ficar **ligado e sem hibernar**, com o
  **Anki aberto**, sempre que quiser enviar fichas remotamente.
- Só aparelhos logados na **mesma conta Tailscale** conseguem alcançar seu
  AnkiConnect — ninguém de fora consegue, mesmo sabendo o link.

### 8.5 Acessar de qualquer aparelho, sem instalar o Tailscale nele

O Tailscale Serve (que configuramos acima) só funciona entre aparelhos
logados na sua conta Tailscale. Se você quiser acessar de um computador
qualquer — de um amigo, de uma lan house, do trabalho — sem instalar nada
nele, existe o **Tailscale Funnel**, que expõe o endereço para a internet
inteira, não só para os seus aparelhos.

**Isso muda o risco**: qualquer pessoa que descobrir o link poderia, em
teoria, tentar mexer no seu Anki. Por isso, ao usar Funnel, é
**obrigatório** proteger o AnkiConnect com uma senha (chamada de `apiKey`
no config dele). Já deixei um campo pronto na interface para isso.

**1. Definir uma senha no AnkiConnect**

No Anki: **Ferramentas → Complementos → AnkiConnect → Config**, e adicione
uma chave (invente uma senha longa e única, tipo
`f8x2-kR9m-plQ7-anki`):

```json
{
  "apiKey": "f8x2-kR9m-plQ7-anki",
  "webBindAddress": "127.0.0.1",
  "webBindPort": 8765,
  "webCorsOriginList": [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "https://francards.vercel.app"
  ]
}
```

Salve e reinicie o Anki.

**2. Trocar Serve por Funnel**

No terminal do computador de casa:

```
tailscale funnel --bg 8765
```

Isso te dá o mesmo tipo de link (`https://seu-computador.tailXXXXX.ts.net`),
mas agora acessível pela internet toda, não só pelo tailnet.

**3. Configurar no site**

Na seção **Avançado**:
- **Endereço do AnkiConnect**: o link do Funnel (igual antes).
- **Chave do AnkiConnect (apiKey)**: a mesma senha que você colocou no
  config do AnkiConnect no passo 1.

Sem preencher esse campo de chave, todas as chamadas serão recusadas pelo
AnkiConnect (ele passa a exigir a senha em toda requisição assim que você
configura `apiKey`).

**Resumo da diferença:**

| | Serve | Funnel |
|---|---|---|
| Quem acessa | Só seus aparelhos logados no Tailscale | Qualquer aparelho, de qualquer lugar |
| Precisa instalar o Tailscale no aparelho usado | Sim | Não |
| Precisa de senha (`apiKey`) | Opcional | Obrigatório |


---

## 9. Solução de problemas

| Sintoma | Causa provável |
|---|---|
| "AnkiConnect não encontrado — abra o Anki" | Anki fechado, addon não instalado, ou `webCorsOriginList` não inclui a origem da página. |
| Erro de CORS no console do navegador ao enviar | Falta adicionar a URL exata da página em `webCorsOriginList` no config do AnkiConnect (com `http://` ou `https://`, sem barra no final). |
| "A API de IA recusou a requisição" | Chave de API inválida, sem crédito, ou limite de uso atingido — veja o detalhe retornado na mensagem. |
| "Não foi possível interpretar a resposta da IA" | A IA devolveu algo fora do formato esperado; tente gerar novamente ou reduza o tamanho do texto colado. |
| "Cartão duplicado — não enviado" | Já existe uma nota igual nesse baralho; o AnkiConnect recusa duplicatas por padrão. |
| "Insufficient Balance" (DeepSeek) | A conta usada para gerar a chave está sem créditos — adicione saldo em platform.deepseek.com ou use o Gemini. |
| Erro 429 "quota" (Gemini) | Você bateu no limite de chamadas por minuto/dia da cota gratuita — espere um pouco e tente de novo. |
| Erro 404 "model ... no longer available" (Gemini) | O Google descontinuou aquele modelo — o app já tenta modelos alternativos sozinho; se persistir, pode ser necessário atualizar a lista `GEMINI_MODELS` em `app.py`. |
| Fichas não chegam mesmo com Tailscale configurado | Confirme que o app do Tailscale está **ativo/conectado** no aparelho que está usando, e que o computador de casa está ligado com o Anki aberto. |

---

## 10. Extensão do Chrome (capturar questão do medcof)

Há uma extensão em `extensao/` que captura a questão que você errou (no
`qbank-prime.medcof.com.br` ou em qualquer site) e abre o Francards já
preenchido para gerar o flashcard. Instalação, uso e como calibrar os
seletores do medcof estão em [`extensao/README-extensao.md`](extensao/README-extensao.md).

## 11. Rodar os testes (desenvolvimento)

```bash
pip install pytest responses
python -m pytest -q          # backend: /api/generate, /api/resolve, parsing
python test_handoff.py       # handoff extensão -> site (usa Chromium)
python test_extractor.py     # extração da extensão (seleção / seletores / heurística)
```

Os dois últimos exigem o Playwright/Chromium (`pip install playwright && playwright install chromium`).
O backend é testado com a IA mockada — nenhuma chave de API é gasta.
