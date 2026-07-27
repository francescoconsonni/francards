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
    instrucao: $("instrucao"),

    generateBtn: $("generateBtn"),
    generateMoreBtn: $("generateMoreBtn"),

    genStatus: $("genStatus"),

    resultsPanel: $("resultsPanel"),
    cardsGrid: $("cardsGrid"),

    drawerLabel: $("drawerLabel"),

    sendAllBtn: $("sendAllBtn"),
    downloadBtn: $("downloadBtn"),

    ankiStatus: $("ankiStatus"),

  };




  const STORAGE_KEY = "flashcard_anki_settings_v2";





  function loadSettings() {

    try {

      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );


      Object.keys(saved).forEach((key)=>{

        if (els[key]) {
          els[key].value = saved[key];
        }

      });


    } catch (_) {}

  }





  function saveSettings() {

    const settings = {};


    Object.keys(els).forEach((key)=>{

      if (
        els[key] &&
        "value" in els[key]
      ) {

        settings[key] = els[key].value;

      }

    });


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );

  }





  Object.keys(els).forEach((key)=>{

    if (
      els[key] &&
      "addEventListener" in els[key]
    ) {

      els[key].addEventListener(
        "change",
        saveSettings
      );

    }

  });







  async function ankiRequest(
    action,
    params={}
  ) {


    const body = {

      action,
      version:6,
      params

    };


    const key =
      els.ankiApiKey.value.trim();


    if(key){
      body.key = key;
    }



    const response = await fetch(
      els.ankiUrl.value.trim(),
      {

        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify(body)

      }
    );



    if(!response.ok){

      throw new Error(
        `AnkiConnect respondeu ${response.status}`
      );

    }



    const data =
      await response.json();



    if(data.error){

      throw new Error(data.error);

    }



    return data.result;

  }







  async function checkAnkiConnection(){

    try{

      await ankiRequest("version");

      els.ankiStatus.dataset.state="ok";
      els.ankiStatus.textContent =
        "AnkiConnect conectado";


    }catch(e){

      els.ankiStatus.dataset.state="error";

      els.ankiStatus.textContent =
        "AnkiConnect não encontrado";

    }

  }








  async function ensureDeck(name){

    await ankiRequest(
      "createDeck",
      {
        deck:name
      }
    );

  }







  async function triggerAnkiSync(){

    try{

      await ankiRequest("sync");

    }catch(_){}

  }







  async function sendCardToAnki(card){


    const deck =
      els.deckName.value.trim() ||
      "Medicina";


    await ensureDeck(deck);



    const tags =
      els.tags.value
      .trim()
      .split(/\s+/)
      .filter(Boolean);




    return ankiRequest(
      "addNote",
      {

        note:{

          deckName:deck,

          modelName:
            els.modelName.value.trim()
            || "Basic",


          fields:{

            [
              els.frontField.value.trim()
              || "Front"
            ]:
              card.pergunta,


            [
              els.backField.value.trim()
              || "Back"
            ]:
              card.resposta

          },


          tags,


          options:{

            allowDuplicate:false,
            duplicateScope:"deck"

          }

        }

      }
    );

  }









  function setGenerating(state){

    els.generateBtn.disabled = state;

    els.generateBtn.textContent =
      state
      ? "Gerando..."
      : "Gerar flashcards";

  }






  function setStatus(
    msg,
    state
  ){

    els.genStatus.textContent = msg;


    if(state){

      els.genStatus.dataset.state = state;

    }else{

      delete els.genStatus.dataset.state;

    }

  }










  async function callGenerateApi(
    extra={}
  ){


    const payload = {

      resolucao:
        els.resolucao.value.trim(),

      provider:
        els.provider.value,

      api_key:
        els.apiKey.value.trim(),

      instrucao:
        els.instrucao
        ? els.instrucao.value.trim()
        : "",

      ...extra

    };




    const response =
      await fetch(
        "/api/generate",
        {

          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)

        }
      );






    const text =
      await response.text();



    let data;


    try{

      data =
        JSON.parse(text);


    }catch(_){

      throw new Error(
        "O servidor retornou HTML em vez de JSON. Verifique o log do Vercel."
      );

    }





    if(!response.ok){

      throw new Error(
        data.error ||
        `Erro ${response.status}`
      );

    }



    return data.flashcards || [];

  }









  async function generateFlashcards(){


    if(
      els.resolucao.value.trim().length < 20
    ){

      setStatus(
        "Cole uma resolução válida.",
        "error"
      );

      return;

    }



    setGenerating(true);

    setStatus(
      "Consultando IA..."
    );



    try{


      const cards =
        await callGenerateApi();


      renderCards(cards);



      setStatus(
        `${cards.length} ficha(s) gerada(s).`,
        "ok"
      );



    }catch(err){

      setStatus(
        err.message,
        "error"
      );

    }
    finally{

      setGenerating(false);

    }

  }










  async function generateMoreFlashcards(){


    const existentes =
      collectCurrentCards();



    els.generateMoreBtn.disabled=true;


    setStatus(
      "Buscando novos pontos..."
    );



    try{


      const novas =
        await callGenerateApi(
          {
            existentes
          }
        );



      appendCards(novas);


      setStatus(
        `${novas.length} nova(s) adicionada(s).`,
        "ok"
      );



    }catch(err){

      setStatus(
        err.message,
        "error"
      );

    }
    finally{

      els.generateMoreBtn.disabled=false;

    }

  }









  function renderCards(cards){

    els.cardsGrid.innerHTML="";

    els.resultsPanel.hidden =
      cards.length===0;


    els.drawerLabel.textContent =
      `Fichas geradas — ${cards.length}`;


    cards.forEach(
      (c,i)=>
        els.cardsGrid.appendChild(
          buildCard(c,i)
        )
    );

  }








  function appendCards(cards){


    const start =
      els.cardsGrid.children.length;



    cards.forEach(
      (c,i)=>
        els.cardsGrid.appendChild(
          buildCard(
            c,
            start+i
          )
        )
    );



    els.resultsPanel.hidden=false;


    els.drawerLabel.textContent =
      `Fichas geradas — ${els.cardsGrid.children.length}`;

  }









  function buildCard(
    card,
    index
  ){


    const el =
      document.createElement("article");


    el.className="card";



    el.innerHTML = `

      <div class="card-serial">
        Nº ${String(index+1).padStart(2,"0")}
        <span class="card-flag">
          novo
        </span>
      </div>


      <label>Pergunta</label>

      <textarea class="q-field">${card.pergunta}</textarea>


      <hr class="card-divider">


      <label>Resposta</label>

      <textarea class="a-field">${card.resposta}</textarea>


      <div class="card-footer">

        <button class="btn-ghost">
          excluir
        </button>


        <button class="btn-send">
          Enviar para o Anki
        </button>

      </div>

    `;



    const q =
      el.querySelector(".q-field");


    const a =
      el.querySelector(".a-field");


    const flag =
      el.querySelector(".card-flag");


    const send =
      el.querySelector(".btn-send");



    send._sendAction =
      ()=>sendSingleCard(
        send,
        flag,
        {
          pergunta:q.value.trim(),
          resposta:a.value.trim()
        }
      );



    send.onclick =
      ()=>send._sendAction();



    el.querySelector(".btn-ghost")
      .onclick =
      ()=>el.remove();



    return el;

  }









  function collectCurrentCards(){

    return Array.from(
      els.cardsGrid.querySelectorAll(".card")
    ).map(el=>({

      pergunta:
        el.querySelector(".q-field").value.trim(),

      resposta:
        el.querySelector(".a-field").value.trim()

    }));

  }









  async function sendSingleCard(
    btn,
    flag,
    card
  ){

    try{


      btn.disabled=true;

      btn.textContent =
        "Enviando...";


      await sendCardToAnki(card);



      btn.textContent =
        "Enviado ✓";


      btn.dataset.sent="true";


      flag.textContent =
        "enviado";


      flag.dataset.sent="true";



    }catch(err){

      alert(err.message);

    }
    finally{

      btn.disabled=false;

    }

  }










  async function sendAllCards(){

    const cards =
      Array.from(
        els.cardsGrid.querySelectorAll(".card")
      );


    for(const card of cards){

      const btn =
        card.querySelector(".btn-send");


      if(btn.dataset.sent!=="true"){

        await btn._sendAction();

      }

    }


    await triggerAnkiSync();

  }









  function downloadCardsAsText(){


    const cards =
      collectCurrentCards();


    const txt =
      cards.map(
        c=>`${c.pergunta}\t${c.resposta}`
      )
      .join("\n");



    const blob =
      new Blob(
        [txt],
        {
          type:"text/plain"
        }
      );



    const url =
      URL.createObjectURL(blob);



    const a =
      document.createElement("a");


    a.href=url;

    a.download="flashcards.txt";

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
