(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);


  const els = {

    provider: $("provider"),
    apiKey: $("apiKey"),

    deckName: $("deckName"),
    tags: $("tags"),

    modelName: $("modelName"),
    frontField: $("frontField"),
    backField: $("backField"),

    ankiUrl: $("ankiUrl"),
    ankiApiKey: $("ankiApiKey"),

    resolucao: $("resolucao"),

    generateBtn: $("generateBtn"),
    generateMoreBtn: $("generateMoreBtn"),

    genStatus: $("genStatus"),

    resultsPanel: $("resultsPanel"),
    cardsGrid: $("cardsGrid"),

    drawerLabel: $("drawerLabel"),

    sendAllBtn: $("sendAllBtn"),
    downloadBtn: $("downloadBtn"),

    ankiStatus: $("ankiStatus"),

    // NOVO
    morePrompt: $("morePrompt"),
  };



  const STORAGE_KEY =
    "flashcard_anki_settings_v1";



  function loadSettings() {

    try {

      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );


      Object.keys(saved).forEach((key) => {

        if (els[key]) {
          els[key].value = saved[key];
        }

      });


    } catch (_) {}

  }




  function saveSettings() {

    const settings = {

      provider: els.provider.value,
      apiKey: els.apiKey.value,

      deckName: els.deckName.value,
      tags: els.tags.value,

      modelName: els.modelName.value,
      frontField: els.frontField.value,
      backField: els.backField.value,

      ankiUrl: els.ankiUrl.value,
      ankiApiKey: els.ankiApiKey.value,

    };


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );

  }




  [
    "provider",
    "apiKey",
    "deckName",
    "tags",
    "modelName",
    "frontField",
    "backField",
    "ankiUrl",
    "ankiApiKey",

  ].forEach((id) => {

    els[id].addEventListener(
      "change",
      saveSettings
    );

  });





  async function ankiRequest(
    action,
    params = {}
  ) {

    const body = {

      action,
      version: 6,
      params,

    };


    const key =
      els.ankiApiKey.value.trim();


    if (key) {

      body.key = key;

    }



    const res = await fetch(
      els.ankiUrl.value.trim(),
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(body),
      }
    );



    if (!res.ok) {

      throw new Error(
        `AnkiConnect respondeu ${res.status}`
      );

    }



    const data =
      await res.json();



    if (data.error) {

      throw new Error(data.error);

    }


    return data.result;

  }





  async function checkAnkiConnection() {

    try {

      await ankiRequest(
        "version"
      );


      els.ankiStatus.dataset.state =
        "ok";


      els.ankiStatus.textContent =
        "AnkiConnect conectado";



    } catch (_) {


      els.ankiStatus.dataset.state =
        "error";


      els.ankiStatus.textContent =
        "AnkiConnect não encontrado — abra o Anki";


    }

  }





  async function ensureDeck(deckName) {

    await ankiRequest(
      "createDeck",
      {
        deck: deckName,
      }
    );

  }




  async function triggerAnkiSync() {

    try {

      await ankiRequest(
        "sync"
      );

    } catch (_) {}

  }





  async function sendCardToAnki(card) {

    const deckName =
      els.deckName.value.trim()
      ||
      "Padrão";


    const tags =
      els.tags.value
      .trim()
      .split(/\s+/)
      .filter(Boolean);



    await ensureDeck(
      deckName
    );



    const note = {

      deckName,

      modelName:
        els.modelName.value.trim()
        ||
        "Basic",


      fields: {

        [els.frontField.value.trim() || "Front"]:
          card.pergunta,


        [els.backField.value.trim() || "Back"]:
          card.resposta,

      },


      tags,


      options: {

        allowDuplicate: false,

        duplicateScope: "deck",

      },

    };



    return ankiRequest(
      "addNote",
      {
        note,
      }
    );

  }





  function setGenerating(value) {

    els.generateBtn.disabled =
      value;


    els.generateBtn.textContent =
      value
      ?
      "Gerando…"
      :
      "Gerar flashcards";

  }




  function setGenStatus(
    message,
    state
  ) {

    els.genStatus.textContent =
      message || "";


    if (state) {

      els.genStatus.dataset.state =
        state;

    }

    else {

      els.genStatus.removeAttribute(
        "data-state"
      );

    }

  }





  async function callGenerateApi(extra = {}) {

    const payload = {

      resolucao:
        els.resolucao.value.trim(),


      provider:
        els.provider.value,


      api_key:
        els.apiKey.value.trim(),


      ...extra,

    };



    const res = await fetch(
      "/api/generate",
      {

        method:
          "POST",


        headers: {

          "Content-Type":
            "application/json",

        },


        body:
          JSON.stringify(payload),

      }
    );



    const data =
      await res.json();



    if (!res.ok) {

      throw new Error(
        data.error ||
        `Erro ${res.status}`
      );

    }



    return data.flashcards;
      async function generateFlashcards() {

    const resolucao =
      els.resolucao.value.trim();


    if (resolucao.length < 20) {

      setGenStatus(
        "Cole o texto completo da resolução antes de gerar.",
        "error"
      );

      return;

    }



    setGenerating(true);

    setGenStatus(
      "Consultando a IA…"
    );



    try {

      const flashcards =
        await callGenerateApi();



      renderCards(
        flashcards
      );


      setGenStatus(
        `${flashcards.length} ficha(s) gerada(s).`,
        "ok"
      );



    } catch (err) {


      setGenStatus(
        err.message ||
        "Falha ao gerar flashcards.",
        "error"
      );


    } finally {

      setGenerating(false);

    }

  }





  function collectCurrentCards() {

    return Array.from(
      els.cardsGrid.querySelectorAll(".card")
    ).map((el) => ({

      pergunta:
        el.querySelector(".q-field")
          .value.trim(),


      resposta:
        el.querySelector(".a-field")
          .value.trim(),

    }));

  }





  async function generateMoreFlashcards() {


    const existentes =
      collectCurrentCards();


    const instrucao =
      els.morePrompt.value.trim();



    els.generateMoreBtn.disabled =
      true;


    els.generateMoreBtn.textContent =
      "Gerando mais…";



    setGenStatus(
      instrucao
      ?
      "Consultando a IA com sua instrução…"
      :
      "Consultando a IA por fichas adicionais…"
    );



    try {


      const novas =
        await callGenerateApi({

          existentes,

          instrucao,

        });



      if (novas.length === 0) {


        setGenStatus(
          "A IA não encontrou novas fichas relevantes.",
          "ok"
        );


      } else {


        appendCards(
          novas
        );


        setGenStatus(
          `${novas.length} ficha(s) nova(s) adicionada(s).`,
          "ok"
        );


        // limpa o pedido depois de usar
        els.morePrompt.value = "";


      }



    } catch (err) {


      setGenStatus(
        err.message ||
        "Falha ao gerar mais flashcards.",
        "error"
      );


    } finally {


      els.generateMoreBtn.disabled =
        false;


      els.generateMoreBtn.textContent =
        "Gerar mais fichas";


    }


  }





  function renderCards(flashcards) {


    els.cardsGrid.innerHTML =
      "";


    els.resultsPanel.hidden =
      flashcards.length === 0;


    els.drawerLabel.textContent =
      `Fichas geradas — ${flashcards.length}`;



    flashcards.forEach((card, i) => {

      els.cardsGrid.appendChild(
        buildCardEl(card, i)
      );

    });


  }





  function appendCards(flashcards) {


    const startIndex =
      els.cardsGrid.children.length;



    els.resultsPanel.hidden =
      false;



    flashcards.forEach((card, i) => {


      els.cardsGrid.appendChild(
        buildCardEl(
          card,
          startIndex + i
        )
      );


    });



    els.drawerLabel.textContent =
      `Fichas geradas — ${els.cardsGrid.children.length}`;


  }





  function buildCardEl(card, index) {


    const el =
      document.createElement("article");


    el.className =
      "card";



    const serial =
      document.createElement("div");


    serial.className =
      "card-serial";



    const num =
      document.createElement("span");


    num.textContent =
      `Nº ${String(index + 1).padStart(2, "0")}`;



    const flag =
      document.createElement("span");


    flag.className =
      "card-flag";


    flag.textContent =
      "novo";



    serial.append(
      num,
      flag
    );




    const qLabel =
      document.createElement("label");


    qLabel.textContent =
      "Pergunta";



    const qField =
      document.createElement("textarea");


    qField.className =
      "q-field";


    qField.rows =
      2;


    qField.value =
      card.pergunta;




    const divider =
      document.createElement("hr");


    divider.className =
      "card-divider";




    const aLabel =
      document.createElement("label");


    aLabel.textContent =
      "Resposta";




    const aField =
      document.createElement("textarea");


    aField.className =
      "a-field";


    aField.rows =
      2;


    aField.value =
      card.resposta;



    autoGrow(qField);

    autoGrow(aField);




    const footer =
      document.createElement("div");


    footer.className =
      "card-footer";




    const delBtn =
      document.createElement("button");


    delBtn.className =
      "btn-ghost";


    delBtn.type =
      "button";


    delBtn.textContent =
      "excluir";



    delBtn.onclick =
      () => {

        el.remove();

        els.drawerLabel.textContent =
          `Fichas geradas — ${els.cardsGrid.children.length}`;

      };




    const sendBtn =
      document.createElement("button");


    sendBtn.className =
      "btn-send";


    sendBtn.type =
      "button";


    sendBtn.textContent =
      "Enviar para o Anki";




    sendBtn._sendAction =
      (opts) =>
        sendSingleCard(
          sendBtn,
          flag,
          {
            pergunta:
              qField.value.trim(),

            resposta:
              aField.value.trim(),
          },
          opts
        );



    sendBtn.onclick =
      () =>
        sendBtn._sendAction();




    footer.append(
      delBtn,
      sendBtn
    );



    el.append(
      serial,
      qLabel,
      qField,
      divider,
      aLabel,
      aField,
      footer
    );



    return el;

  }





  function autoGrow(textarea) {

    const resize =
      () => {

        textarea.style.height =
          "auto";


        textarea.style.height =
          `${textarea.scrollHeight}px`;

      };



    textarea.addEventListener(
      "input",
      resize
    );


    setTimeout(
      resize,
      0
    );

  }





  async function sendSingleCard(
    button,
    flagEl,
    card,
    { sync = true } = {}
  ) {


    if (!card.pergunta || !card.resposta) {

      alert(
        "Pergunta e resposta não podem ficar vazias."
      );

      return;

    }



    button.disabled =
      true;


    button.textContent =
      "Enviando…";



    try {


      await sendCardToAnki(
        card
      );



      button.textContent =
        "Enviado ✓";



      button.dataset.sent =
        "true";



      flagEl.textContent =
        "enviado";


      flagEl.dataset.sent =
        "true";



      if (sync) {

        triggerAnkiSync();

      }



    } catch (err) {


      alert(
        `Não foi possível enviar para o Anki: ${err.message}`
      );


    } finally {


      button.disabled =
        false;


    }

  }





  async function sendAllCards() {

    const cards =
      Array.from(
        els.cardsGrid.querySelectorAll(".card")
      );



    for (const card of cards) {

      const btn =
        card.querySelector(".btn-send");


      if (btn.dataset.sent !== "true") {

        await btn._sendAction({
          sync:false
        });

      }

    }


    await triggerAnkiSync();

  }





  function downloadCardsAsText() {


    const cards =
      Array.from(
        els.cardsGrid.querySelectorAll(".card")
      );


    const lines =
      cards.map((el) => {

        return (
          el.querySelector(".q-field").value.trim()
          +
          "\t"
          +
          el.querySelector(".a-field").value.trim()
        );

      });



    const blob =
      new Blob(
        [
          lines.join("\n")
        ],
        {
          type:
          "text/plain;charset=utf-8"
        }
      );



    const url =
      URL.createObjectURL(blob);



    const a =
      document.createElement("a");


    a.href =
      url;


    a.download =
      "flashcards.txt";


    a.click();


    URL.revokeObjectURL(url);

  }





  els.generateBtn.onclick =
    generateFlashcards;


  els.generateMoreBtn.onclick =
    generateMoreFlashcards;


  els.sendAllBtn.onclick =
    sendAllCards;


  els.downloadBtn.onclick =
    downloadCardsAsText;



  loadSettings();

  checkAnkiConnection();


})();

  }
