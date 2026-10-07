/* Envío del formulario a Supabase.
   El formulario llama a window.ccEnviar(payload) al terminar. Acá:
   1. se comprimen las fotos subidas (máx. 1600 px, JPEG),
   2. todo se guarda primero en el navegador (IndexedDB) para no perder nada,
   3. se suben las fotos al bucket `referencias` y se inserta la fila en `respuestas_habitar`,
   4. si algo falla, se reintenta solo (con espera creciente, al volver la conexión y al reabrir el link).
   El id de la respuesta se genera acá: reintentar nunca duplica filas ni fotos. */
(function () {
  'use strict';
  var CFG = window.CC_CONFIG || {};
  var DB = 'cc-habitar-envios', STORE = 'pendientes', ENVIADO = 'cc-habitar-ultimo-envio';
  var PREGUNTAS_FOTOS = ['referencias', 'conservar'];
  var memoria = {};            // respaldo si IndexedDB no está disponible (modo privado, etc.)
  var enCurso = false, intento = 0, timer = null;

  /* ---------- IndexedDB ---------- */
  function abrir() {
    return new Promise(function (ok, mal) {
      if (!window.indexedDB) return mal(new Error('sin indexedDB'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }) };
      r.onsuccess = function () { ok(r.result) };
      r.onerror = function () { mal(r.error) };
    });
  }
  function tx(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, mal) {
        var t = db.transaction(STORE, modo), st = t.objectStore(STORE), res;
        res = fn(st);
        t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res) };
        t.onerror = t.onabort = function () { mal(t.error) };
      });
    });
  }
  var guardar = function (job) { memoria[job.id] = job; return tx('readwrite', function (s) { return s.put(job) }).catch(function () {}) };
  var borrar = function (id) { delete memoria[id]; return tx('readwrite', function (s) { return s.delete(id) }).catch(function () {}) };
  var todos = function () {
    return tx('readonly', function (s) { return s.getAll() })
      .then(function (l) { var m = {}; (l || []).concat(Object.values(memoria)).forEach(function (j) { m[j.id] = m[j.id] || j }); return Object.values(m) })
      .catch(function () { return Object.values(memoria) });
  };

  /* ---------- Fotos ---------- */
  function comprimir(blob) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b || blob) }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null) }; // formato que el navegador no abre (p. ej. HEIC en Android)
      img.src = url;
    });
  }
  function leerFotos(respuestas) {
    // FILES es del formulario: guarda una URL local por foto, en el mismo orden que A[pregunta + '_fotos'].
    var locales = (typeof FILES !== 'undefined' && FILES) || {};
    var tareas = [];
    PREGUNTAS_FOTOS.forEach(function (q) {
      (respuestas[q + '_fotos'] || []).forEach(function (it, k) {
        var u = (locales[q] || [])[k];
        tareas.push((u ? fetch(u).then(function (r) { return r.blob() }).then(comprimir) : Promise.resolve(null))
          .catch(function () { return null })
          .then(function (blob) { return { pregunta: q, n: k, blob: blob, subida: false } }));
      });
    });
    return Promise.all(tareas);
  }

  /* ---------- Supabase (REST, sin librerías) ---------- */
  function headers(extra) {
    var h = { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function subirFoto(job, f) {
    var ruta = job.id + '/' + f.pregunta + '-' + (f.n + 1) + '.jpg';
    return fetch(CFG.supabaseUrl + '/storage/v1/object/referencias/' + ruta, {
      method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: f.blob
    }).then(function (r) {
      if (r.ok) return ruta;
      return r.text().then(function (t) {
        if (r.status === 409 || /Duplicate|already exists/i.test(t)) return ruta; // ya estaba subida en un intento anterior
        throw new Error('foto ' + r.status + ' ' + t);
      });
    });
  }
  function insertar(job) {
    var a = job.respuestas;
    return fetch(CFG.supabaseUrl + '/rest/v1/respuestas_habitar', {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ id: job.id, cliente_nombre: (a.cliente_nombre || '').trim() || null,
        cliente_zona: (a.cliente_zona || '').trim() || null, respuestas: a })
    }).then(function (r) {
      if (r.ok) return;
      return r.text().then(function (t) {
        if (r.status === 409 || /23505|duplicate key/i.test(t)) return; // ya se había insertado
        throw new Error('fila ' + r.status + ' ' + t);
      });
    });
  }

  function procesar(job) {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return Promise.reject(new Error('falta config.js'));
    var cadena = Promise.resolve();
    job.fotos.forEach(function (f) {
      if (f.subida || !f.blob) return;
      cadena = cadena.then(function () { return subirFoto(job, f) }).then(function (ruta) {
        f.subida = true; f.blob = null;
        var it = (job.respuestas[f.pregunta + '_fotos'] || [])[f.n];
        if (it) it.foto = ruta; // ruta dentro del bucket `referencias`
        return guardar(job);
      });
    });
    return cadena.then(function () { return insertar(job) }).then(function () { return borrar(job.id) });
  }

  function vaciarCola() {
    if (enCurso) return;
    enCurso = true; clearTimeout(timer);
    todos().then(function (jobs) {
      jobs.sort(function (a, b) { return a.creado < b.creado ? -1 : 1 });
      return jobs.reduce(function (p, j) { return p.then(function () { return procesar(j) }) }, Promise.resolve())
        .then(function () { return jobs.length });
    }).then(function () { intento = 0; enCurso = false }, function (e) {
      enCurso = false; intento++;
      var espera = Math.min(300000, 4000 * Math.pow(2, intento - 1)); // 4 s, 8 s, 16 s… hasta 5 min
      console.warn('Envío pendiente, reintento en', espera / 1000, 's', e);
      timer = setTimeout(vaciarCola, espera);
    });
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  window.ccEnviar = function (payload) {
    var respuestas = JSON.parse(JSON.stringify(payload.respuestas || {}));
    var huella = JSON.stringify(respuestas);
    try { if (localStorage.getItem(ENVIADO) === huella) return Promise.resolve() } catch (e) {} // mismo contenido ya enviado
    return leerFotos(respuestas).then(function (fotos) {
      var job = { id: uuid(), creado: Date.now(), respuestas: respuestas, fotos: fotos };
      (respuestas.referencias_fotos || []).concat(respuestas.conservar_fotos || []).forEach(function (it) { it.foto = null });
      return guardar(job).then(function () {
        try { localStorage.setItem(ENVIADO, huella) } catch (e) {}
        intento = 0; vaciarCola();
      });
    });
  };

  window.addEventListener('online', vaciarCola);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') vaciarCola() });
  vaciarCola(); // si quedó algo pendiente de una visita anterior
})();
