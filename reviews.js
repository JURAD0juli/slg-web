(function(){
  // Firebase > Configuración del proyecto > Tus apps > Web: copia apiKey y projectId.
  var FIREBASE_API_KEY = '';
  var FIREBASE_PROJECT_ID = '';
  var COLLECTION = 'resenas';
  var PAGE = 6;
  var COOLDOWN_MS = 10 * 60 * 1000;

  var $ = function(id){ return document.getElementById(id); };
  var list = $('rv-list');
  if(!list) return;
  var form = $('rv-form'), wrap = $('rv-form-wrap'), toggle = $('rv-toggle'), msg = $('rv-msg'),
      submit = $('rv-submit'), more = $('rv-more'), empty = $('rv-empty'), chars = $('rv-chars');

  var configured = !!(FIREBASE_API_KEY && FIREBASE_PROJECT_ID);
  var base = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents';
  var reviews = [];
  var shown = 0;
  var dateFmt = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' });

  function setMsg(text, kind){ msg.textContent = text; msg.className = 'rv-msg' + (kind ? ' ' + kind : ''); }

  function initials(name){
    var p = name.trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }

  function card(r, isNew){
    var a = document.createElement('article');
    a.className = 'tst' + (isNew ? ' rv-new' : '');
    var q = document.createElement('span'); q.className = 'quote'; q.textContent = '“';
    var s = document.createElement('div'); s.className = 'stars';
    s.textContent = '★★★★★'.slice(0, r.calificacion) + '☆☆☆☆☆'.slice(0, 5 - r.calificacion);
    s.setAttribute('aria-label', r.calificacion + ' de 5 estrellas');
    var p = document.createElement('p'); p.textContent = r.comentario;
    var who = document.createElement('div'); who.className = 'who';
    var av = document.createElement('span'); av.className = 'av'; av.textContent = initials(r.nombre);
    var info = document.createElement('div');
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.nombre;
    info.appendChild(nm);
    if(r.empresa){ var rl = document.createElement('div'); rl.className = 'rl'; rl.textContent = r.empresa; info.appendChild(rl); }
    who.appendChild(av); who.appendChild(info);
    if(r.fecha){ var d = document.createElement('span'); d.className = 'rv-date'; d.textContent = dateFmt.format(r.fecha); who.appendChild(d); }
    a.appendChild(q); a.appendChild(s); a.appendChild(p); a.appendChild(who);
    return a;
  }

  function renderSummary(){
    var n = reviews.length;
    if(!configured && !n){
      $('rv-avg').textContent = '–';
      $('rv-count').textContent = 'Las reseñas estarán disponibles muy pronto';
      return;
    }
    var avg = n ? reviews.reduce(function(t, r){ return t + r.calificacion; }, 0) / n : 0;
    $('rv-avg').textContent = n ? avg.toFixed(1) : '–';
    $('rv-avg-stars').firstElementChild.style.width = (avg / 5 * 100) + '%';
    $('rv-count').textContent = n === 1 ? '1 reseña' : n + ' reseñas';
  }

  function renderMore(){
    var next = reviews.slice(shown, shown + PAGE);
    next.forEach(function(r){ list.appendChild(card(r)); });
    shown += next.length;
    more.hidden = shown >= reviews.length;
    empty.hidden = reviews.length > 0;
  }

  function parse(doc){
    var f = doc.fields || {};
    var r = {
      nombre: (f.nombre && f.nombre.stringValue) || '',
      empresa: (f.empresa && f.empresa.stringValue) || '',
      calificacion: Math.min(5, Math.max(1, parseInt(f.calificacion && f.calificacion.integerValue, 10) || 5)),
      comentario: (f.comentario && f.comentario.stringValue) || '',
      fecha: f.fecha && f.fecha.timestampValue ? new Date(f.fecha.timestampValue) : null
    };
    return r.nombre && r.comentario ? r : null;
  }

  function load(){
    if(!configured){ renderSummary(); renderMore(); return; }
    fetch(base + ':runQuery?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        orderBy: [{ field: { fieldPath: 'fecha' }, direction: 'DESCENDING' }],
        limit: 300
      }})
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(rows){
      reviews = rows.filter(function(x){ return x.document; }).map(function(x){ return parse(x.document); }).filter(Boolean);
      renderSummary(); renderMore();
    }).catch(function(err){
      if(window.console) console.warn('[Reseñas SLG]', err);
      $('rv-count').textContent = 'No se pudieron cargar las reseñas';
      empty.hidden = true;
    });
  }

  function randomId(){
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '';
    var buf = new Uint32Array(20); crypto.getRandomValues(buf);
    for(var i = 0; i < 20; i++) out += c.charAt(buf[i] % c.length);
    return out;
  }

  function lastSent(){ try { return +localStorage.getItem('slg-rv-last') || 0; } catch(e){ return 0; } }
  function markSent(){ try { localStorage.setItem('slg-rv-last', String(Date.now())); } catch(e){} }

  toggle.addEventListener('click', function(){
    var open = wrap.hidden;
    wrap.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if(open){ setMsg(''); $('rv-s5').focus(); }
  });

  $('rv-text').addEventListener('input', function(){ chars.textContent = this.value.length; });

  more.addEventListener('click', renderMore);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var rating = form.querySelector('input[name="calificacion"]:checked');
    var nombre = form.nombre.value.trim().replace(/\s+/g, ' ');
    var empresa = form.empresa.value.trim().replace(/\s+/g, ' ');
    var comentario = form.comentario.value.trim();

    if(form.web.value) return;
    if(!rating) return setMsg('Selecciona una calificación de 1 a 5 estrellas.', 'err');
    if(nombre.length < 2) { form.nombre.focus(); return setMsg('Escribe tu nombre.', 'err'); }
    if(comentario.length < 10) { form.comentario.focus(); return setMsg('Tu reseña debe tener al menos 10 caracteres.', 'err'); }
    if(!configured) return setMsg('La publicación de reseñas se activará muy pronto. ¡Gracias por tu interés!', 'err');
    if(Date.now() - lastSent() < COOLDOWN_MS) return setMsg('Ya publicaste una reseña hace unos minutos. Intenta de nuevo más tarde.', 'err');

    var review = { nombre: nombre, empresa: empresa, calificacion: +rating.value, comentario: comentario };
    var fields = {
      nombre: { stringValue: nombre },
      calificacion: { integerValue: String(review.calificacion) },
      comentario: { stringValue: comentario }
    };
    if(empresa) fields.empresa = { stringValue: empresa };

    submit.disabled = true;
    setMsg('Publicando…');
    fetch(base + ':commit?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{
        update: { name: 'projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + COLLECTION + '/' + randomId(), fields: fields },
        updateTransforms: [{ fieldPath: 'fecha', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false }
      }]})
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      markSent();
      review.fecha = new Date();
      reviews.unshift(review);
      shown++;
      list.insertBefore(card(review, true), list.firstChild);
      empty.hidden = true;
      renderSummary();
      form.reset();
      chars.textContent = '0';
      setMsg('¡Gracias! Tu reseña ya está publicada.', 'ok');
      setTimeout(function(){ wrap.hidden = true; toggle.setAttribute('aria-expanded', 'false'); setMsg(''); }, 2500);
    }).catch(function(err){
      if(window.console) console.warn('[Reseñas SLG]', err);
      setMsg('No pudimos publicar tu reseña. Intenta de nuevo en unos minutos.', 'err');
    }).then(function(){ submit.disabled = false; });
  });

  load();
})();
