// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  screen: 'loading',
  allQuestions: [],
  locales: [],
  marcas: [],

  // Setup
  marca: '',
  local: '',
  auditor: '',
  fecha: new Date().toISOString().split('T')[0],

  // Audit
  categories: [],      // [{name, questions:[...]}]
  categoryIndex: 0,
  answers: {},         // "qId" -> {valor, observacion, foto:{dataURL,name}}

  // Submit
  submitting: false,
  auditId: '',
  error: '',
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
async function init() {
  try {
    const [questionsText, localesText] = await Promise.all([
      fetchText(CONFIG.questionsURL),
      fetchText(CONFIG.localesURL).catch(() => ''),
    ]);

    const qRows = parseCSV(questionsText);
    state.allQuestions = qRows.slice(1).filter(r => r[0]); // skip header, skip empty

    // Marcas únicas
    state.marcas = [...new Set(state.allQuestions.map(r => r[0]).filter(Boolean))];

    // Locales
    if (localesText) {
      state.locales = parseCSV(localesText).flat().map(s => s.trim()).filter(Boolean);
    } else {
      state.locales = ['(Sin locales cargados)'];
    }

    setState({ screen: 'welcome' });
  } catch (err) {
    console.error(err);
    setState({ screen: 'error', error: 'No se pudieron cargar los datos. Verificá tu conexión a internet.' });
  }
}

async function fetchText(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// ============================================================
// CSV PARSER (maneja campos entre comillas y saltos de línea)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"')         { inQ = false; }
      else                        { field += c; }
    } else {
      if      (c === '"')                          { inQ = true; }
      else if (c === ',')                          { row.push(field.trim()); field = ''; }
      else if (c === '\n' || (c === '\r' && n === '\n')) {
        if (c === '\r') i++;
        row.push(field.trim()); rows.push(row); row = []; field = '';
      } else { field += c; }
    }
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

// ============================================================
// PROCESAR PREGUNTAS
// ============================================================
function buildCategories(marca) {
  const qs = state.allQuestions.filter(r =>
    (r[0] || '').trim().toLowerCase() === marca.trim().toLowerCase()
  );

  const map = new Map();
  qs.forEach((r, idx) => {
    const cat = (r[1] || 'Sin categoría').trim();
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push({
      id: `q_${idx}`,
      marca:        r[0] || '',
      categoria:    r[1] || '',
      subcategoria: r[2] || '',
      control:      r[3] || '',
      importancia:  (r[4] || '').trim(),
      explicacion:  r[5] || '',
      pregunta:     r[6] || '',   // opciones de respuesta
      imagen:       (r[7] || '').trim().toLowerCase(), // 'si' o vacío
    });
  });

  return Array.from(map.entries()).map(([name, questions]) => ({ name, questions }));
}

function parseAnswerType(pregunta) {
  if (!pregunta) return { type: 'text', options: [] };
  const lower = pregunta.toLowerCase();
  if (lower.includes('numerico') || lower.includes('numérico') || lower.includes('valor medido')) {
    return { type: 'number', options: [] };
  }
  if (pregunta.includes('/')) {
    return { type: 'radio', options: pregunta.split('/').map(o => o.trim()).filter(Boolean) };
  }
  return { type: 'text', options: [] };
}

function importanciaClass(imp) {
  const i = (imp || '').toLowerCase();
  if (i === 'critico' || i === 'crítico') return 'critico';
  if (i === 'alta')   return 'alta';
  if (i === 'media')  return 'media';
  if (i === 'baja')   return 'baja';
  return 'media';
}

function answerClass(option) {
  const o = (option || '').toLowerCase();
  if (o === 'cumple') return 'selected-cumple';
  if (o.includes('parcial')) return 'selected-parcial';
  if (o.includes('no cumple') || o === 'nocumple') return 'selected-nocumple';
  return 'selected-noaplic';
}

// ============================================================
// STATE MANAGEMENT
// ============================================================
function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render() {
  const app = document.getElementById('app');
  switch (state.screen) {
    case 'loading': app.innerHTML = renderLoading(); break;
    case 'welcome': app.innerHTML = renderWelcome(); break;
    case 'setup':   app.innerHTML = renderSetup();   break;
    case 'audit':   app.innerHTML = renderAudit();   break;
    case 'summary': app.innerHTML = renderSummary(); break;
    case 'success': app.innerHTML = renderSuccess(); break;
    case 'error':   app.innerHTML = renderError();   break;
  }
  attachListeners();
}

// ============================================================
// PANTALLA: LOADING
// ============================================================
function renderLoading() {
  return `<div class="screen-center"><div class="spinner"></div><p class="loading-text">Cargando datos...</p></div>`;
}

// ============================================================
// PANTALLA: WELCOME
// ============================================================
function renderWelcome() {
  return `
    <div class="screen-welcome">
      <div class="welcome-logo">📋</div>
      <h1 class="welcome-title">Sistema de Auditorías</h1>
      <p class="welcome-sub">Herramienta para auditores de locales</p>
      <button class="welcome-btn" id="btn-go-setup">Comenzar Auditoría</button>
    </div>
  `;
}

// ============================================================
// PANTALLA: SETUP
// ============================================================
function renderSetup() {
  const marcasBtns = state.marcas.map(m => `
    <button class="marca-btn ${state.marca === m ? 'selected' : ''}" data-marca="${m}">
      <div class="marca-btn-name">${m}</div>
    </button>
  `).join('');

  const localesOpts = state.locales.map(l =>
    `<option value="${escHtml(l)}" ${state.local === l ? 'selected' : ''}>${escHtml(l)}</option>`
  ).join('');

  return `
    <div class="header">
      <button class="header-back" id="btn-back-welcome">‹</button>
      <div>
        <div class="header-title">Nueva Auditoría</div>
        <div class="header-subtitle">Configuración inicial</div>
      </div>
    </div>

    <div class="main">
      <div class="setup-card">
        <h2>Marca</h2>
        <div class="marca-grid">${marcasBtns}</div>
      </div>

      <div class="setup-card">
        <h2>Datos de la visita</h2>

        <div class="form-group">
          <label class="form-label">Local auditado</label>
          <select class="form-control" id="sel-local">
            <option value="">— Seleccioná un local —</option>
            ${localesOpts}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Nombre del auditor</label>
          <input class="form-control" id="inp-auditor" type="text"
            placeholder="Tu nombre completo" value="${escHtml(state.auditor)}">
        </div>

        <div class="form-group">
          <label class="form-label">Fecha de visita</label>
          <input class="form-control" id="inp-fecha" type="date" value="${state.fecha}">
        </div>
      </div>

      <button class="btn btn-primary btn-large" id="btn-start-audit">Iniciar Auditoría →</button>
      <div style="height:24px"></div>
    </div>
  `;
}

// ============================================================
// PANTALLA: AUDITORÍA
// ============================================================
function renderAudit() {
  const cat = state.categories[state.categoryIndex];
  const total = state.categories.length;
  const pct = Math.round(((state.categoryIndex) / total) * 100);
  const isLast = state.categoryIndex === total - 1;

  const answeredInCat = cat.questions.filter(q => state.answers[q.id]?.valor).length;
  const totalInCat = cat.questions.length;

  const cards = cat.questions.map(q => renderQuestionCard(q)).join('');

  return `
    <div class="header">
      <button class="header-back" id="btn-back-category">‹</button>
      <div style="flex:1">
        <div class="header-title">${escHtml(cat.name)}</div>
        <div class="header-subtitle">${state.local} · ${state.marca}</div>
      </div>
      <div class="header-info">
        <div style="font-size:0.8rem;color:#94a3b8">${state.categoryIndex + 1} / ${total}</div>
        <div style="font-size:0.7rem;color:#64748b">${answeredInCat}/${totalInCat} resp.</div>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>

    <div class="main" style="padding-bottom:80px">
      <div class="category-header">
        <div class="category-tag">Categoría ${state.categoryIndex + 1} de ${total}</div>
        <div class="category-title">${escHtml(cat.name)}</div>
        <div class="category-count">${totalInCat} puntos a revisar</div>
      </div>
      ${cards}
    </div>

    <div class="nav-footer">
      ${state.categoryIndex > 0
        ? `<button class="btn btn-outline" id="btn-prev-cat">← Anterior</button>`
        : ''}
      <button class="btn ${isLast ? 'btn-success' : 'btn-primary'}" id="btn-next-cat">
        ${isLast ? 'Ver Resumen →' : 'Siguiente →'}
      </button>
    </div>
  `;
}

function renderQuestionCard(q) {
  const imp = importanciaClass(q.importancia);
  const ans = state.answers[q.id] || {};
  const { type, options } = parseAnswerType(q.pregunta);
  const needsPhoto = q.imagen === 'si';

  let inputHtml = '';
  if (type === 'radio') {
    const radioName = `radio_${q.id}`;
    const radios = options.map(opt => {
      const isSelected = ans.valor === opt;
      const cls = answerClass(opt);
      return `
        <label class="answer-label ${isSelected ? cls : ''}" data-cls="${cls}">
          <input type="radio" name="${radioName}" value="${escHtml(opt)}"
            data-qid="${q.id}" class="answer-radio" ${isSelected ? 'checked' : ''}>
          ${escHtml(opt)}
        </label>`;
    }).join('');
    inputHtml = `<div class="answer-options">${radios}</div>`;
  } else if (type === 'number') {
    inputHtml = `
      <div class="number-input-wrap">
        <input class="number-input" type="number" step="0.1"
          id="num_${q.id}" placeholder="0.0"
          value="${ans.valor || ''}"
          data-qid="${q.id}">
        <span class="number-unit">°C</span>
      </div>
    `;
  } else {
    inputHtml = `
      <textarea class="observacion-textarea" placeholder="Ingresá el valor..."
        data-qid="${q.id}" data-field="valor"
        style="min-height:48px">${ans.valor || ''}</textarea>
    `;
  }

  const showObservacion = type === 'radio';
  const obsHtml = showObservacion ? `
    <div class="observacion-wrap">
      <span class="observacion-label">Observaciones</span>
      <textarea class="observacion-textarea" placeholder="Observaciones opcionales..."
        data-qid="${q.id}" data-field="observacion">${ans.observacion || ''}</textarea>
    </div>
  ` : '';

  const hasPhoto = ans.foto?.dataURL;
  const photoHtml = `
    <div class="photo-section">
      <button class="photo-btn ${needsPhoto ? 'required' : ''} ${hasPhoto ? 'has-photo' : ''}"
        data-qid="${q.id}" id="photobtn_${q.id}">
        📷 ${hasPhoto ? 'Foto tomada ✓' : needsPhoto ? 'Foto requerida *' : 'Agregar foto'}
      </button>
      <input type="file" accept="image/*" capture="environment"
        id="fileinput_${q.id}" data-qid="${q.id}" style="display:none">
      ${hasPhoto ? `
        <div class="photo-preview-wrap" style="display:block;width:100%;margin-top:8px">
          <img class="photo-preview" src="${ans.foto.dataURL}" alt="foto">
          <button class="photo-remove" data-qid="${q.id}" id="photoremove_${q.id}">✕</button>
        </div>` : ''}
    </div>
  `;

  return `
    <div class="question-card imp-${imp}" data-qid="${q.id}">
      <div class="question-meta">
        <span class="badge badge-${imp}">${q.importancia || 'Media'}</span>
        <span class="question-subcategoria">${escHtml(q.subcategoria)}</span>
      </div>
      <div class="question-control">${escHtml(q.control)}</div>
      ${q.explicacion ? `<div class="question-explicacion">${escHtml(q.explicacion)}</div>` : ''}
      ${inputHtml}
      ${obsHtml}
      ${photoHtml}
    </div>
  `;
}

// ============================================================
// PANTALLA: RESUMEN
// ============================================================
function renderSummary() {
  const allQs = state.categories.flatMap(c => c.questions);
  const answered = allQs.filter(q => state.answers[q.id]?.valor);
  const unanswered = allQs.length - answered.length;

  let cumple = 0, parcial = 0, noCumple = 0, noAplica = 0;
  answered.forEach(q => {
    const v = (state.answers[q.id]?.valor || '').toLowerCase();
    if (v === 'cumple') cumple++;
    else if (v.includes('parcial')) parcial++;
    else if (v.includes('no cumple') || v === 'nocumple') noCumple++;
    else if (v.includes('aplica')) noAplica++;
  });

  const criticos = allQs.filter(q => {
    const imp = (q.importancia || '').toLowerCase();
    const v = (state.answers[q.id]?.valor || '').toLowerCase();
    return (imp === 'critico' || imp === 'crítico') &&
      (v.includes('no cumple') || v === 'nocumple' || !v);
  });

  const desviosHtml = criticos.length ? `
    <div class="desvios-section">
      <div class="desvios-title">⚠ Desvíos críticos (${criticos.length})</div>
      ${criticos.map(q => `
        <div class="desvio-item">
          <div class="desvio-item-control">${escHtml(q.control)}</div>
          <div class="desvio-item-cat">${escHtml(q.categoria)} › ${escHtml(q.subcategoria)}</div>
        </div>
      `).join('')}
    </div>` : '';

  const warnHtml = unanswered > 0 ? `
    <div class="incomplete-warning">
      ⚠ Tenés ${unanswered} ${unanswered === 1 ? 'punto sin responder' : 'puntos sin responder'}.
      Podés enviar igual, pero quedarán en blanco.
    </div>` : '';

  return `
    <div class="header">
      <button class="header-back" id="btn-back-audit">‹</button>
      <div>
        <div class="header-title">Resumen de Auditoría</div>
        <div class="header-subtitle">${escHtml(state.local)} · ${state.fecha}</div>
      </div>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>

    <div class="main" style="padding-bottom:80px">
      <div class="summary-stats">
        <div class="stat-card stat-green">
          <div class="stat-number">${cumple}</div>
          <div class="stat-label">Cumple</div>
        </div>
        <div class="stat-card stat-red">
          <div class="stat-number">${noCumple}</div>
          <div class="stat-label">No Cumple</div>
        </div>
        <div class="stat-card stat-orange">
          <div class="stat-number">${parcial}</div>
          <div class="stat-label">Cumple Parcial</div>
        </div>
        <div class="stat-card stat-blue">
          <div class="stat-number">${noAplica}</div>
          <div class="stat-label">No Aplica</div>
        </div>
      </div>

      ${warnHtml}
      ${desviosHtml}

      <div class="setup-card">
        <h3>Detalle de la visita</h3>
        <p class="text-muted mt-8">🏪 Local: <strong>${escHtml(state.local)}</strong></p>
        <p class="text-muted mt-8">🏷 Marca: <strong>${escHtml(state.marca)}</strong></p>
        <p class="text-muted mt-8">👤 Auditor: <strong>${escHtml(state.auditor)}</strong></p>
        <p class="text-muted mt-8">📅 Fecha: <strong>${state.fecha}</strong></p>
        <p class="text-muted mt-8">📝 Total de puntos: <strong>${allQs.length}</strong></p>
      </div>
    </div>

    <div class="nav-footer">
      <button class="btn btn-outline" id="btn-back-audit">← Revisar</button>
      <button class="btn btn-primary" id="btn-submit">Enviar Auditoría ✓</button>
    </div>
  `;
}

// ============================================================
// PANTALLA: SUCCESS
// ============================================================
function renderSuccess() {
  return `
    <div class="screen-success">
      <div class="success-icon">✓</div>
      <h1 class="success-title">¡Auditoría enviada!</h1>
      <p class="success-sub">Los datos fueron guardados correctamente.</p>
      <p class="success-id">ID: ${state.auditId}</p>
      <button class="btn btn-primary btn-large" id="btn-new-audit">Nueva Auditoría</button>
    </div>
  `;
}

// ============================================================
// PANTALLA: ERROR
// ============================================================
function renderError() {
  return `
    <div class="error-box">
      <h2>Error</h2>
      <p>${escHtml(state.error)}</p>
      <button class="btn btn-primary mt-16" onclick="init()">Reintentar</button>
    </div>
  `;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachListeners() {
  on('btn-go-setup', 'click', () => setState({ screen: 'setup' }));

  on('btn-back-welcome', 'click', () => setState({ screen: 'welcome' }));

  on('btn-back-audit', 'click', () => {
    setState({ screen: 'audit', categoryIndex: state.categories.length - 1 });
  });

  // Marcas
  document.querySelectorAll('.marca-btn').forEach(btn => {
    btn.addEventListener('click', () => setState({ marca: btn.dataset.marca }));
  });

  // Setup inputs (live save to state)
  onChange('sel-local',    v => { state.local   = v; });
  onChange('inp-auditor',  v => { state.auditor  = v; });
  onChange('inp-fecha',    v => { state.fecha    = v; });

  // Iniciar auditoría
  on('btn-start-audit', 'click', () => {
    // Leer valores actuales antes de validar
    state.local   = val('sel-local')   || state.local;
    state.auditor = val('inp-auditor') || state.auditor;
    state.fecha   = val('inp-fecha')   || state.fecha;

    if (!state.marca)   return alert('Seleccioná una marca.');
    if (!state.local)   return alert('Seleccioná un local.');
    if (!state.auditor) return alert('Ingresá el nombre del auditor.');

    const cats = buildCategories(state.marca);
    if (!cats.length) return alert('No se encontraron preguntas para esta marca.');

    setState({ categories: cats, categoryIndex: 0, answers: {}, screen: 'audit' });
  });

  // Navegación de categorías
  on('btn-prev-cat', 'click', () => {
    saveCurrentAnswers();
    setState({ categoryIndex: state.categoryIndex - 1 });
  });

  on('btn-next-cat', 'click', () => {
    saveCurrentAnswers();
    if (state.categoryIndex < state.categories.length - 1) {
      setState({ categoryIndex: state.categoryIndex + 1 });
    } else {
      setState({ screen: 'summary' });
    }
  });

  on('btn-back-category', 'click', () => {
    saveCurrentAnswers();
    if (state.categoryIndex > 0) {
      setState({ categoryIndex: state.categoryIndex - 1 });
    } else {
      if (confirm('¿Salir de la auditoría? Se perderá el progreso.')) {
        setState({ screen: 'setup' });
      }
    }
  });

  // Respuestas radio — el browser maneja la exclusión mutua nativamente
  document.querySelectorAll('.answer-radio').forEach(input => {
    input.addEventListener('change', () => {
      const qid = input.dataset.qid;
      const val = input.value;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].valor = val;

      // Actualizar clases visuales de los labels del mismo grupo
      const group = document.querySelectorAll(`input[name="radio_${qid}"]`);
      group.forEach(r => {
        const lbl = r.closest('.answer-label');
        if (!lbl) return;
        lbl.className = 'answer-label' + (r.checked ? ' ' + lbl.dataset.cls : '');
      });

      updateAnswerCounter();
    });
  });

  // Inputs numéricos y texto (debounced save)
  document.querySelectorAll('.number-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const qid = inp.dataset.qid;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].valor = inp.value;
    });
  });

  document.querySelectorAll('.observacion-textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      const qid = ta.dataset.qid;
      const field = ta.dataset.field || 'observacion';
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid][field] = ta.value;
    });
  });

  // Fotos
  document.querySelectorAll('[id^="photobtn_"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset.qid;
      document.getElementById(`fileinput_${qid}`)?.click();
    });
  });

  document.querySelectorAll('[id^="fileinput_"]').forEach(input => {
    input.addEventListener('change', async () => {
      const qid = input.dataset.qid;
      const file = input.files[0];
      if (!file) return;
      const dataURL = await compressImage(file, 800, 0.65);
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].foto = { dataURL, name: file.name };
      // Actualizar solo el botón de foto en el lugar
      const photoBtn = document.getElementById(`photobtn_${qid}`);
      if (photoBtn) {
        photoBtn.className = 'photo-btn has-photo';
        photoBtn.innerHTML = '📷 Foto tomada ✓';
      }
      // Mostrar preview
      const wrap = document.querySelector(`#photobtn_${qid}`)?.closest('.photo-section');
      if (wrap && !wrap.querySelector('.photo-preview')) {
        const previewWrap = document.createElement('div');
        previewWrap.className = 'photo-preview-wrap';
        previewWrap.style.display = 'block';
        previewWrap.style.width = '100%';
        previewWrap.style.marginTop = '8px';
        previewWrap.innerHTML = `<img class="photo-preview" src="${dataURL}" alt="foto"><button class="photo-remove" data-qid="${qid}" id="photoremove_${qid}">✕</button>`;
        wrap.appendChild(previewWrap);
        previewWrap.querySelector('.photo-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.answers[qid]) delete state.answers[qid].foto;
          previewWrap.remove();
          if (photoBtn) { photoBtn.className = 'photo-btn'; photoBtn.innerHTML = '📷 Agregar foto'; }
        });
      }
    });
  });

  document.querySelectorAll('[id^="photoremove_"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      if (state.answers[qid]) delete state.answers[qid].foto;
      btn.closest('.photo-preview-wrap')?.remove();
      const photoBtn = document.getElementById(`photobtn_${qid}`);
      if (photoBtn) { photoBtn.className = 'photo-btn'; photoBtn.innerHTML = '📷 Agregar foto'; }
    });
  });

  // Submit
  on('btn-submit', 'click', submitAudit);

  // Nueva auditoría
  on('btn-new-audit', 'click', () => {
    Object.assign(state, {
      screen: 'welcome',
      marca: '', local: '', auditor: '',
      categories: [], categoryIndex: 0, answers: {},
      auditId: '', error: '', submitting: false,
    });
    render();
  });
}

// ============================================================
// HELPERS
// ============================================================
function on(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
}

function onChange(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => fn(el.value));
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saveCurrentAnswers() {
  // Radios
  document.querySelectorAll('.answer-radio:checked').forEach(inp => {
    const qid = inp.dataset.qid;
    if (!state.answers[qid]) state.answers[qid] = {};
    state.answers[qid].valor = inp.value;
  });
  // Inputs numéricos y texto
  document.querySelectorAll('.number-input').forEach(inp => {
    if (!state.answers[inp.dataset.qid]) state.answers[inp.dataset.qid] = {};
    state.answers[inp.dataset.qid].valor = inp.value;
  });
  // Observaciones
  document.querySelectorAll('.observacion-textarea').forEach(ta => {
    const qid = ta.dataset.qid;
    const field = ta.dataset.field || 'observacion';
    if (!state.answers[qid]) state.answers[qid] = {};
    state.answers[qid][field] = ta.value;
  });
}

function updateAnswerCounter() {
  const cat = state.categories[state.categoryIndex];
  if (!cat) return;
  const answered = cat.questions.filter(q => state.answers[q.id]?.valor).length;
  const el = document.querySelector('.header-info div:last-child');
  if (el) el.textContent = `${answered}/${cat.questions.length} resp.`;
}

function refreshCard(qid) {
  const cat = state.categories[state.categoryIndex];
  if (!cat) return;
  const q = cat.questions.find(q => q.id === qid);
  if (!q) return;
  const existing = document.querySelector(`.question-card[data-qid="${qid}"]`);
  if (!existing) return;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderQuestionCard(q);
  const newCard = tempDiv.firstElementChild;
  existing.replaceWith(newCard);
  attachCardListeners(newCard, q);
}

function attachCardListeners(card, q) {
  card.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset.qid;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].valor = btn.dataset.val;
      refreshCard(qid);
    });
  });
  const photobtn = card.querySelector(`#photobtn_${q.id}`);
  const fileinput = card.querySelector(`#fileinput_${q.id}`);
  const removebtn = card.querySelector(`#photoremove_${q.id}`);
  if (photobtn && fileinput) {
    photobtn.addEventListener('click', () => fileinput.click());
    fileinput.addEventListener('change', async () => {
      const file = fileinput.files[0];
      if (!file) return;
      const dataURL = await compressImage(file, 800, 0.65);
      if (!state.answers[q.id]) state.answers[q.id] = {};
      state.answers[q.id].foto = { dataURL, name: file.name };
      refreshCard(q.id);
    });
  }
  if (removebtn) {
    removebtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.answers[q.id]) delete state.answers[q.id].foto;
      refreshCard(q.id);
    });
  }
  card.querySelectorAll('.observacion-textarea, .number-input').forEach(el => {
    el.addEventListener('input', () => {
      const qid = el.dataset.qid;
      const field = el.dataset.field || (el.classList.contains('number-input') ? 'valor' : 'observacion');
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid][field] = el.value;
    });
  });
}

// ============================================================
// COMPRIMIR IMAGEN
// ============================================================
function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// ENVIAR AUDITORÍA
// ============================================================
async function submitAudit() {
  const auditId = `AUD_${state.local.replace(/\s+/g,'_')}_${Date.now()}`;

  // Construir payload
  const allQs = state.categories.flatMap(c => c.questions);
  const respuestas = allQs.map(q => {
    const ans = state.answers[q.id] || {};
    return {
      categoria:    q.categoria,
      subcategoria: q.subcategoria,
      control:      q.control,
      importancia:  q.importancia,
      explicacion:  q.explicacion,
      respuesta:    ans.valor    || '',
      observacion:  ans.observacion || '',
      fotoBase64:   ans.foto?.dataURL ? ans.foto.dataURL.split(',')[1] : '',
      fotoNombre:   ans.foto?.name   || '',
    };
  });

  const payload = {
    auditId,
    fecha:    state.fecha,
    hora:     new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    auditor:  state.auditor,
    local:    state.local,
    marca:    state.marca,
    respuestas,
  };

  // Mostrar overlay
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="spinner"></div><div class="overlay-text">Enviando auditoría...</div>`;
  document.body.appendChild(overlay);

  try {
    const resp = await fetch(CONFIG.appsScriptURL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Error desconocido');
    setState({ screen: 'success', auditId });
  } catch (err) {
    console.error(err);
    alert('Error al enviar: ' + err.message + '\n\nVerificá la configuración del Apps Script.');
  } finally {
    overlay.remove();
  }
}

// ============================================================
// ARRANCAR
// ============================================================
init();
