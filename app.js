// static/app.js
(function(){
  'use strict';

  // DOM refs
  const micBtn = document.getElementById('micBtn');
  const micLabel = document.getElementById('micLabel');
  const statusEl = document.querySelector('.status');
  const textInput = document.getElementById('textInput');
  const addBtn = document.getElementById('addBtn');
  const itemsWrap = document.getElementById('items');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.querySelector('.count');
  const recommendationsBox = document.getElementById('recommendationsBox');
  const themeToggle = document.getElementById('themeToggle');
  const substituteToastEl = document.getElementById('substituteToast');

  const STORAGE_KEY = 'voice_shopping_items_v1';
  const HISTORY_KEY = 'voice_shopping_history_v1';
  const THEME_KEY = 'voice_theme_v1';

  // --- language selector (inject into hero) ---
  function addLangSelector(){
    const container = document.getElementById('langContainer');
    if(!container) return;
    const sel = document.createElement('select');
    sel.id = 'langSelect';
    sel.title = 'Choose recognition language';
    sel.innerHTML = `
      <option value="en-IN">English (India)</option>
      <option value="en-US">English (US)</option>
      <option value="hi-IN">हिंदी (Hindi)</option>
      <option value="mr-IN">मराठी (Marathi)</option>
      <option value="bn-IN">বাংলা (Bengali)</option>
      <option value="ta-IN">தமிழ் (Tamil)</option>
    `;
    container.appendChild(sel);
  }
  addLangSelector();
  const langSelect = document.getElementById('langSelect');

  // ---------------- storage helpers ----------------
  function loadItems(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; } }
  function saveItems(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
  function loadHistory(){ try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); } catch(e){ return {}; } }
  function saveHistory(obj){ localStorage.setItem(HISTORY_KEY, JSON.stringify(obj)); }
  function recordPurchase(name, qty=1){
    if(!name) return;
    const h = loadHistory();
    const k = name.toLowerCase();
    h[k] = (h[k]||0) + (qty||1);
    h['__last_'+k] = new Date().toISOString();
    saveHistory(h);
  }

  // ---------------- categorization & substitutes ----------------
  const CATEGORY_KEYWORDS = { Dairy:['milk','cheese','yogurt','butter','paneer'], Produce:['apple','banana','orange','tomato','potato','onion','mango'], Bakery:['bread','bagel','bun'], Drinks:['water','juice','coffee','tea'], Snacks:['chips','biscuit','chocolate'], Household:['detergent','soap','shampoo','toilet paper'], Spices:['salt','pepper','turmeric'] };
  function categorizeItem(name){ const low=(name||'').toLowerCase(); for(const k in CATEGORY_KEYWORDS) for(const w of CATEGORY_KEYWORDS[k]) if(low.includes(w)) return k; return 'Other'; }
  const SUBSTITUTES = { milk:['almond milk','soy milk','oat milk'], butter:['margarine'], sugar:['honey'] };
  function getSubstitutes(name){ const low=(name||'').toLowerCase(); for(const k of Object.keys(SUBSTITUTES)) if(low.includes(k)) return SUBSTITUTES[k]; return []; }

  // ---------------- rendering ----------------
  function render(){
    const items = loadItems();
    countEl.textContent = items.length + (items.length===1 ? ' item' : ' items');
    itemsWrap.innerHTML = '';
    if(items.length===0){ emptyState.style.display='block'; } else { emptyState.style.display='none'; }
    const grouped = {};
    items.forEach(it=>{
      const cat = it.category || categorizeItem(it.name);
      if(!grouped[cat]) grouped[cat]=[];
      grouped[cat].push(it);
    });
    Object.keys(grouped).sort().forEach(cat=>{
      const catDiv = document.createElement('div'); catDiv.className='category-section';
      const header = document.createElement('div'); header.className='category-header'; header.innerHTML = `<strong>${cat}</strong><span class="cat-count">(${grouped[cat].length})</span>`;
      catDiv.appendChild(header);
      const list = document.createElement('div'); list.className='category-list';
      grouped[cat].forEach(it=>{
        const el = document.createElement('div'); el.className='item';
        const left = document.createElement('div'); left.style.display='flex'; left.style.gap='12px'; left.style.alignItems='center';
        const thumb = document.createElement('div'); thumb.className='thumb'; thumb.textContent = (it.name||'').charAt(0).toUpperCase();
        const meta = document.createElement('div'); meta.className='item-meta';
        const title = document.createElement('div'); title.className='item-title'; title.textContent = it.name;
        const sub = document.createElement('div'); sub.className='item-sub'; sub.textContent = (it.qty ? (it.qty + (it.qty>1 ? ' pcs':' pc')) : '');
        meta.appendChild(title); meta.appendChild(sub);
        left.appendChild(thumb); left.appendChild(meta);
        const actions = document.createElement('div'); actions.className='item-actions';
        const dec = document.createElement('button'); dec.className='btn-ghost'; dec.textContent='-'; dec.onclick = ()=> adjustQty(findIndex(it), -1);
        const inc = document.createElement('button'); inc.className='btn-ghost'; inc.textContent='+'; inc.onclick = ()=> adjustQty(findIndex(it), +1);
        const rem = document.createElement('button'); rem.className='btn-ghost'; rem.textContent='Remove'; rem.onclick = ()=> removeItem(findIndex(it));
        actions.appendChild(dec); actions.appendChild(inc); actions.appendChild(rem);
        el.appendChild(left); el.appendChild(actions); list.appendChild(el);
      });
      catDiv.appendChild(list);
      itemsWrap.appendChild(catDiv);
    });
    renderRecommendations();
  }

  function findIndex(item){
    const arr = loadItems();
    for(let i=0;i<arr.length;i++){
      if(arr[i].addedAt && item.addedAt && arr[i].addedAt === item.addedAt) return i;
    }
    return loadItems().findIndex(x=>x.name.toLowerCase() === (item.name||'').toLowerCase());
  }

  // ---------------- CRUD ----------------
  function addItem(name, qty){
    if(!name || !name.trim()) return;
    name = name.trim();
    const arr = loadItems();
    const idx = arr.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
    if(idx>=0){
      arr[idx].qty = (parseInt(arr[idx].qty||0,10)||0) + (qty || 1);
    } else {
      arr.push({ name, qty: qty || 1, category: categorizeItem(name), addedAt: new Date().toISOString() });
    }
    saveItems(arr); recordPurchase(name, qty || 1); render(); showSubstituteIfAny(name);
  }
  function removeItem(idx){
    const arr = loadItems(); if(idx<0||idx>=arr.length) return; arr.splice(idx,1); saveItems(arr); render();
  }
  function adjustQty(idx, delta){
    const arr = loadItems(); if(idx<0||idx>=arr.length) return; let v = parseInt(arr[idx].qty||0,10)||0; v += delta; if(v<0) v=0; arr[idx].qty = v; saveItems(arr); render();
  }

  // ---------------- parse local qty and simple commands (fallback) ----------------
  const NUM_WORDS = {'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10};
  function extractQuantity(text){
    text = (text||'').trim();
    let m = text.match(/^(\d+)\b/); if(m) return {qty:parseInt(m[1],10), rest:text.replace(m[0],'').trim()};
    m = text.match(/^([a-z]+)\s+(.+)$/i); if(m && NUM_WORDS[m[1].toLowerCase()]) return {qty:NUM_WORDS[m[1].toLowerCase()], rest:m[2].trim()};
    m = text.match(/(.+)\s+x\s+(\d+)/i); if(m) return {qty:parseInt(m[2],10), rest:m[1].trim()};
    return {qty:'', rest:text};
  }

  // ---------------- detect price filter (rupee-aware) ----------------
  function detectPriceFilterCommand(phrase){
    if(!phrase) return null;
    const p = phrase.toLowerCase().trim();
    if(!/^(find|show|search|look for|get|show me)/.test(p) && !/under|below|between|above|over|less than|more than/.test(p)) {
      // allow short forms like "toothpaste under 500"
    }
    let m = p.match(/(?:find|show|search|get|look for|look up|show me)?\s*(.+?)\s+(?:under|below|less than)\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m) return { q: m[1].trim(), min_price: null, max_price: parseFloat(m[2]), brand: null };
    m = p.match(/(?:find|show|search)?\s*(.+?)\s+between\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)\s+(?:and|-)\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m) return { q: m[1].trim(), min_price: parseFloat(m[2]), max_price: parseFloat(m[3]) };
    m = p.match(/(?:find|show|search|look for)?\s*(.+?)\s+(?:from|by)\s+([a-z0-9\s]+?)\s+(?:under|below)\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m) return { q: m[1].trim(), brand: m[2].trim(), min_price: null, max_price: parseFloat(m[3]) };
    m = p.match(/^(.+?)\s+(?:under|below|less than)\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m) return { q: m[1].trim(), min_price: null, max_price: parseFloat(m[2]) };
    m = p.match(/(?:find|show|search)?\s*(.+?)\s+(?:above|over|more than)\s*(?:₹|\u20B9|rs|rupees)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if(m) return { q: m[1].trim(), min_price: parseFloat(m[2]), max_price: null };
    m = p.match(/(?:find|show|search)(?: me)?\s+(.+?)\s+(?:from|by)\s+([a-z0-9\s]+)/);
    if(m) return { q: m[1].trim(), brand: m[2].trim(), min_price: null, max_price: null };
    return null;
  }

  async function handlePriceFilterCommand(phrase){
    const pf = detectPriceFilterCommand(phrase);
    if(!pf) return false;
    if(recommendationsBox) recommendationsBox.innerHTML = '<div style="color:var(--muted)">Searching products…</div>';
    const params = new URLSearchParams();
    if(pf.q) params.set('q', pf.q);
    if(pf.min_price !== null && pf.min_price !== undefined) params.set('min_price', String(pf.min_price));
    if(pf.max_price !== null && pf.max_price !== undefined) params.set('max_price', String(pf.max_price));
    if(pf.brand) params.set('brand', pf.brand);
    params.set('currency','INR'); params.set('limit','12');
    try {
      const res = await fetch('/api/products/search?' + params.toString());
      if(!res.ok) throw new Error('search failed ' + res.status);
      const data = await res.json();
      renderProductResultsINR(data.items || []);
    } catch(err){
      console.error(err);
      if(recommendationsBox) recommendationsBox.innerHTML = '<div style="color:var(--muted)">Product search failed.</div>';
    }
    return true;
  }

  function renderProductResultsINR(items){
    if(!recommendationsBox) return;
    recommendationsBox.innerHTML = '';
    if(!items || !items.length){ recommendationsBox.innerHTML = '<div style="color:var(--muted)">No products found for that filter.</div>'; return; }
    const list = document.createElement('div'); list.style.display='flex'; list.style.flexDirection='column'; list.style.gap='10px';
    items.forEach(p=>{
      const card = document.createElement('div'); card.style.display='flex'; card.style.justifyContent='space-between'; card.style.alignItems='center'; card.style.padding='10px'; card.style.border='1px solid rgba(99,102,241,0.06)'; card.style.borderRadius='8px';
      const left = document.createElement('div'); left.style.display='flex'; left.style.flexDirection='column';
      const name = document.createElement('div'); name.textContent = p.name; name.style.fontWeight='600';
      const meta = document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='13px'; meta.textContent = (p.brand? p.brand + ' • ' : '') + (p.category || '');
      left.appendChild(name); left.appendChild(meta);
      const right = document.createElement('div'); right.style.display='flex'; right.style.flexDirection='column'; right.style.alignItems='flex-end'; right.style.gap='8px';
      const price = document.createElement('div'); price.textContent = p.price || ('₹' + (p.price_inr||0).toFixed(2)); price.style.fontWeight='700';
      const add = document.createElement('button'); add.className='btn-primary'; add.textContent='Add'; add.onclick = ()=> { addItem(p.name,1); };
      right.appendChild(price); right.appendChild(add);
      card.appendChild(left); card.appendChild(right); list.appendChild(card);
    });
    recommendationsBox.appendChild(list);
  }

  // ---------------- substitutes toast ----------------
  function showSubstituteIfAny(name){
    const subs = getSubstitutes(name);
    if(!subs || subs.length===0) return;
    showSubstituteToast(name, subs);
  }
  function showSubstituteToast(orig, subs){
    const t = substituteToastEl;
    t.innerHTML = `<div>Substitutes for "${orig}"</div>`;
    const list = document.createElement('div'); list.className='sub-list';
    subs.forEach(s=>{
      const b = document.createElement('button'); b.className='btn-primary'; b.textContent = s; b.onclick = ()=> { addItem(s,1); hideToast(); };
      list.appendChild(b);
    });
    const close = document.createElement('button'); close.className='btn-ghost'; close.textContent='Close'; close.onclick = hideToast;
    t.appendChild(list); t.appendChild(close);
    t.classList.remove('hidden');
    setTimeout(()=> t.classList.add('show'), 20);
    window.clearTimeout(t._dismissTimer);
    t._dismissTimer = setTimeout(hideToast, 10000);
  }
  function hideToast(){ const t=substituteToastEl; if(!t) return; t.classList.remove('show'); setTimeout(()=> t.classList.add('hidden'), 240); }

  // ---------------- SpeechRecognition wiring ----------------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null, listening = false;
  if(!SpeechRecognition){
    console.warn('SpeechRecognition not available. Use Chrome/Edge on localhost/HTTPS.');
    setStatus('not supported');
    if(micBtn) micBtn.disabled = true;
  } else {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = (langSelect && langSelect.value) || (navigator.language || 'en-IN');
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = ()=> { listening=true; setStatus('listening...'); if(micLabel) micLabel.textContent='Listening'; if(micBtn) micBtn.setAttribute('aria-pressed','true'); };
    recognition.onend = ()=> { listening=false; setStatus('idle'); if(micLabel) micLabel.textContent='Start Listening'; if(micBtn) micBtn.setAttribute('aria-pressed','false'); };
    recognition.onerror = (e)=>{ console.error('Speech error', e); setStatus(e.error || 'error'); };

    recognition.onresult = (ev)=>{
      let interim='', finalTranscript='';
      for(let i=ev.resultIndex;i<ev.results.length;++i){
        const res = ev.results[i];
        if(res.isFinal) finalTranscript += res[0].transcript + ' ';
        else interim += res[0].transcript + ' ';
      }
      if(textInput) textInput.value = interim.trim();
      if(finalTranscript){
        const final = finalTranscript.trim();
        // first check price-filter (client-side quick)
        handlePriceFilterCommand(final).then(did=> {
          if(!did) {
            // send to server NLU
            sendToNLU(final);
          }
        });
        if(textInput) textInput.value = '';
      }
    };
  }

  // start/stop mic button
  if(micBtn){
    micBtn.addEventListener('click', async ()=>{
      if(!SpeechRecognition) return;
      if(!listening){
        try { await navigator.mediaDevices.getUserMedia({ audio:true }); } catch(err){ console.warn('Mic permission denied', err); setStatus('microphone denied'); return; }
        try { recognition.start(); } catch(e){ console.warn('recognition start failed', e); }
      } else {
        try { recognition.stop(); } catch(e){ console.warn('recognition stop failed', e); }
      }
    });
    micBtn.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); micBtn.click(); } });
  }

  // language selector change
  if(langSelect){
    langSelect.addEventListener('change', ()=> {
      if(recognition) recognition.lang = langSelect.value;
    });
  }

  // add via button/enter
  if(addBtn) addBtn.addEventListener('click', ()=> { if(textInput.value.trim()){ parseAndApply(textInput.value.trim()); textInput.value=''; } });
  if(textInput) textInput.addEventListener('keydown', e=> { if(e.key==='Enter') addBtn.click(); });

  // ---------------- send transcript to server NLU ----------------
  async function sendToNLU(finalTranscript){
    try {
      const res = await fetch('/api/parse-command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phrase: finalTranscript, lang: recognition ? recognition.lang : (navigator.language || 'en') }) });
      if(!res.ok) throw new Error('NLU failed ' + res.status);
      const intent = await res.json();
      applyIntent(intent, finalTranscript);
    } catch(err){
      console.warn('NLU error, falling back:', err);
      parseAndApply(finalTranscript); // local fallback simple parser
    }
  }

  // ---------------- apply Gemini intent to actions ----------------
  function applyIntent(intent, rawPhrase){
    if(!intent || intent.intent === 'unknown'){
      // fallback to local parsing
      parseAndApply(rawPhrase || '');
      return;
    }
    const act = intent.intent;
    const name = intent.item;
    const qty = (typeof intent.qty === 'number') ? intent.qty : (intent.qty ? parseInt(intent.qty,10) : undefined);

    if(act === 'add' && name){
      addItem(name, qty || 1); return;
    }
    if(act === 'remove' && name){
      if(typeof qty === 'number'){
        // reduce quantity
        const items = loadItems(); const idx = items.findIndex(i=>i.name.toLowerCase() === name.toLowerCase());
        if(idx>=0){
          const cur = parseInt(items[idx].qty||0,10)||0; const after = Math.max(0, cur - qty);
          if(after === 0) removeItem(idx); else { items[idx].qty = after; saveItems(items); render(); }
        }
      } else {
        const items = loadItems(); const idx = items.findIndex(i=>i.name.toLowerCase() === name.toLowerCase());
        if(idx>=0) removeItem(idx);
      }
      return;
    }
    if(act === 'replace' && name && intent.substitute && intent.substitute.alternatives && intent.substitute.alternatives.length){
      // replace using first alternative
      parseAndApply(`replace ${name} with ${intent.substitute.alternatives[0]}`); return;
    }
    if(act === 'set_qty' && name && typeof qty === 'number'){
      const items = loadItems(); const idx = items.findIndex(i=>i.name.toLowerCase() === name.toLowerCase());
      if(idx>=0){ items[idx].qty = qty; saveItems(items); render(); } return;
    }
    if(act === 'clear'){
      localStorage.removeItem(STORAGE_KEY); render(); return;
    }
    if(act === 'search' || intent.price_filter){
      // call search with price_filter/brand if present
      const pf = intent.price_filter || null;
      const phrase = rawPhrase || (name ? `find ${name}` : '');
      if(pf){
        const str = `${phrase} ${pf.min ? 'from ' + pf.min : ''} ${pf.max ? 'to ' + pf.max : ''}`;
        handlePriceFilterCommand(str);
      } else {
        handlePriceFilterCommand(phrase);
      }
      return;
    }

    // substitutes if suggested
    if(intent.substitute && intent.substitute.suggest && Array.isArray(intent.substitute.alternatives)){
      showSubstituteToast(name || '', intent.substitute.alternatives);
    }
  }

  // ---------------- simple local parser fallback ----------------
  function parseAndApply(phrase){
    if(!phrase) return;
    const lower = phrase.toLowerCase().trim();
    if(/^(clear|clear list|empty list|remove all|delete all)$/.test(lower)){ localStorage.removeItem(STORAGE_KEY); render(); return; }
    let m = lower.match(/^(?:replace|substitute|swap)\s+(.+?)\s+(?:with|to)\s+(.+)$/);
    if(m){ const from=m[1].trim(), to=m[2].trim(); const items=loadItems(); const idx=items.findIndex(i=>i.name.toLowerCase()===from.toLowerCase()); if(idx>=0){ items[idx].name = to; items[idx].category = categorizeItem(to); saveItems(items); render(); } else parseAndApply('add ' + to); return; }
    m = lower.match(/^(?:set|change)\s+(.+?)\s+to\s+(\d+)\b/);
    if(m){ const name=m[1].trim(), qty=parseInt(m[2],10); const items=loadItems(); const idx=items.findIndex(i=>i.name.toLowerCase()===name.toLowerCase()); if(idx>=0){ items[idx].qty = qty; saveItems(items); render(); } return; }
    m = lower.match(/^(?:remove|delete)\s+(\d+)\s+(.+)$/);
    if(m){ const qty=parseInt(m[1],10), name=m[2].trim(); const items=loadItems(); const idx=items.findIndex(i=>i.name.toLowerCase()===name.toLowerCase()); if(idx>=0){ const cur = parseInt(items[idx].qty||0,10)||0; const after = Math.max(0, cur - qty); if(after===0) items.splice(idx,1); else items[idx].qty = after; saveItems(items); render(); } return; }
    m = lower.match(/^(?:remove|delete)\s+(.+)$/);
    if(m){ const name=m[1].trim(); const items=loadItems(); let idx=items.findIndex(i=>i.name.toLowerCase()===name.toLowerCase()); if(idx>=0) removeItem(idx); else { idx = items.findIndex(i => name.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(name)); if(idx>=0) removeItem(idx); } return; }
    m = lower.match(/^(?:add|buy|put|i want to buy|i need)\s+(.+)$/);
    let rest = m ? m[1].trim() : lower;
    if(rest.includes(' and ')){ rest.split(/\s+and\s+/).forEach(p=> parseAndApply(p)); return; }
    const q = extractQuantity(rest);
    const qty = (typeof q.qty === 'number' && !isNaN(q.qty)) ? q.qty : (q.qty === '' ? '' : parseInt(q.qty,10));
    const name = q.rest || rest;
    addItem(name, qty || 1);
  }

  // ---------------- theme toggle persistence ----------------
  function applyTheme(t){ if(t==='dark') document.documentElement.setAttribute('data-theme','dark'); else document.documentElement.removeAttribute('data-theme'); }
  const storedTheme = localStorage.getItem(THEME_KEY);
  if(storedTheme) applyTheme(storedTheme); else { const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(prefersDark ? 'dark':'light'); }
  if(themeToggle){ themeToggle.addEventListener('click', ()=>{ const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; applyTheme(now); localStorage.setItem(THEME_KEY, now); themeToggle.setAttribute('aria-checked', now==='dark'); }); themeToggle.setAttribute('aria-checked', document.documentElement.getAttribute('data-theme') === 'dark' ? 'true' : 'false'); }

  // ---------------- small helpers ----------------
  function setStatus(t){ if(statusEl) statusEl.textContent = 'Status: ' + t; }
  function init(){ render(); setStatus('idle'); }

  // expose small debug helpers
  window.voiceShopping = { addItem, removeItem, parseAndApply, render };
  init();

})();
