// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  screen: 'loading',
  allQuestions: [],
  locales: [],       // [{nombre, isCausa, emails}]

  // Auth
  auditor:      '',
  auditorEmail: '',
  googleReady:  false,

  // Setup
  local: null,       // {nombre, isCausa, emails}
  fecha: new Date().toISOString().split('T')[0],

  // Audit
  categories:    [],
  categoryIndex: 0,
  questionIndex: 0,  // una pregunta a la vez
  answers:       {},

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
    state.allQuestions = qRows.slice(1).filter(r => r[0]);

    if (localesText) {
      const lRows = parseCSV(localesText);
      // Hoja Locales: A=nombre, B=TRUE si es Causa, C=emails
      state.locales = lRows.slice(1)
        .map(r => ({
          nombre:  (r[0] || '').trim(),
          isCausa: (r[1] || '').trim().toUpperCase() === 'TRUE',
          emails:  (r[2] || '').trim(),
        }))
        .filter(l => l.nombre);
    }

    if (!state.locales.length) {
      state.locales = [{ nombre: '(Sin locales cargados)', isCausa: false, emails: '' }];
    }

    // Google Sign-In
    initGoogleSignIn();

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
// GOOGLE SIGN-IN
// ============================================================
function initGoogleSignIn() {
  if (!CONFIG.googleClientId || CONFIG.googleClientId.startsWith('REEMPLAZAR')) {
    state.googleReady = false;
    return;
  }
  if (typeof google === 'undefined') {
    state.googleReady = false;
    return;
  }
  state.googleReady = true;
  google.accounts.id.initialize({
    client_id: CONFIG.googleClientId,
    callback: handleGoogleCredential,
    auto_select: false,
    context: 'signin',
  });
}

function handleGoogleCredential(response) {
  try {
    // Decodificar JWT sin librería externa
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    state.auditor      = payload.name  || payload.email;
    state.auditorEmail = payload.email || '';
    setState({ screen: 'setup' });
  } catch (e) {
    alert('Error al iniciar sesión con Google.');
  }
}

function renderGoogleBtn() {
  if (!state.googleReady) return '';
  // El SDK de Google renderiza el botón en este div
  setTimeout(() => {
    const el = document.getElementById('google-signin-div');
    if (el && typeof google !== 'undefined') {
      google.accounts.id.renderButton(el, {
        theme: 'outline', size: 'large', width: 280,
        text: 'signin_with', shape: 'rectangular',
      });
    }
  }, 50);
  return `<div id="google-signin-div" style="margin-bottom:16px"></div>`;
}

// ============================================================
// CSV PARSER
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
      if      (c === '"')                            { inQ = true; }
      else if (c === ',')                            { row.push(field.trim()); field = ''; }
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
function buildCategories(isCausa) {
  const qs = state.allQuestions.filter(r => {
    const m = (r[0] || '').trim();
    return m === 'Multimarca' || (isCausa && m === 'Causa');
  });

  const map = new Map();
  qs.forEach((r, idx) => {
    const cat = (r[1] || 'Sin categoría').trim();
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push({
      id:           `q_${idx}`,
      marca:        r[0] || '',
      categoria:    r[1] || '',
      subcategoria: r[2] || '',
      control:      r[3] || '',
      importancia:  (r[4] || '').trim(),
      explicacion:  r[5] || '',
      pregunta:     r[6] || '',
      imagen:       (r[7] || '').trim().toLowerCase(),
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

// ============================================================
// SISTEMA DE PUNTOS
// ============================================================
function calcularPuntaje(questions, answers) {
  const maxPts     = { 'critico': 4, 'crítico': 4, 'alta': 3, 'media': 2, 'baja': 1 };
  const parcialPts = { 'critico': 2, 'crítico': 2, 'alta': 1, 'media': 1, 'baja': 0 };

  let obtenido = 0, posible = 0, reprobado = false;

  questions.forEach(q => {
    const { type } = parseAnswerType(q.pregunta);
    if (type !== 'radio') return; // numéricos/texto libre: sin puntaje automático por ahora

    const imp = (q.importancia || '').toLowerCase().trim();
    const val = (answers[q.id]?.valor || '').toLowerCase().trim();
    const max = maxPts[imp];

    if (!max) return;                        // importancia desconocida
    if (!val) return;                        // sin responder
    if (val.includes('aplica')) return;      // No aplica → excluir del cálculo

    posible += max;

    if (val === 'cumple') {
      obtenido += max;
    } else if (val.includes('parcial')) {
      obtenido += parcialPts[imp] || 0;
    } else if (val.includes('no cumple') || val === 'nocumple') {
      if (imp === 'critico' || imp === 'crítico') reprobado = true;
      // 0 puntos
    }
  });

  const pct = posible > 0 ? Math.round((obtenido / posible) * 100) : 0;

  let nivel, nivelClass, nivelEmoji;
  if (reprobado)    { nivel = 'Reprobado';       nivelClass = 'reprobado';    nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';     nivelClass = 'excelente';    nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio'; nivelClass = 'satisfactorio';nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'Requiere mejora';nivelClass = 'mejora';      nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';    nivelClass = 'deficiente';   nivelEmoji = '🔴'; }

  return { obtenido, posible, pct, reprobado, nivel, nivelClass, nivelEmoji };
}

function importanciaClass(imp) {
  const i = (imp || '').toLowerCase();
  if (i === 'critico' || i === 'crítico') return 'critico';
  if (i === 'alta')  return 'alta';
  if (i === 'media') return 'media';
  if (i === 'baja')  return 'baja';
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
// STATE
// ============================================================
function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ============================================================
// RENDER
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
  const googleBtn = renderGoogleBtn();
  const skipBtn = state.googleReady
    ? '' // Si Google está configurado, solo login con Google
    : `<button class="welcome-btn" id="btn-go-setup">Comenzar Auditoría</button>`;

  return `
    <div class="screen-welcome">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo"
        onerror="this.style.display='none'">
      <h1 class="welcome-title">Sistema de Auditorías</h1>
      <p class="welcome-sub">Herramienta para auditores de locales</p>
      ${googleBtn}
      ${skipBtn}
    </div>
  `;
}

// ============================================================
// PANTALLA: SETUP
// ============================================================
function renderSetup() {
  const localesOpts = state.locales.map(l =>
    `<option value="${escHtml(l.nombre)}" ${state.local?.nombre === l.nombre ? 'selected' : ''}>${escHtml(l.nombre)}</option>`
  ).join('');

  const auditorField = state.auditorEmail
    ? `<div class="auditor-badge">
         <span class="auditor-avatar">${(state.auditor[0] || '?').toUpperCase()}</span>
         <div>
           <div class="auditor-name">${escHtml(state.auditor)}</div>
           <div class="auditor-email">${escHtml(state.auditorEmail)}</div>
         </div>
       </div>`
    : `<input class="form-control" id="inp-auditor" type="text"
         placeholder="Tu nombre completo" value="${escHtml(state.auditor)}">`;

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
        <h2>Datos de la visita</h2>

        <div class="form-group">
          <label class="form-label">Local auditado</label>
          <select class="form-control" id="sel-local">
            <option value="">— Seleccioná un local —</option>
            ${localesOpts}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Auditor</label>
          ${auditorField}
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
// PANTALLA: AUDITORÍA — UNA PREGUNTA A LA VEZ
// ============================================================
function renderAudit() {
  const cat      = state.categories[state.categoryIndex];
  const q        = cat.questions[state.questionIndex];
  const totalCats = state.categories.length;
  const totalQsInCat = cat.questions.length;

  // Progreso global
  const allQs = state.categories.flatMap(c => c.questions);
  const globalIdx = state.categories
    .slice(0, state.categoryIndex)
    .reduce((sum, c) => sum + c.questions.length, 0) + state.questionIndex;
  const pct = Math.round(((globalIdx + 1) / allQs.length) * 100);

  const isFirst = state.categoryIndex === 0 && state.questionIndex === 0;
  const isLast  = state.categoryIndex === totalCats - 1
               && state.questionIndex === totalQsInCat - 1;

  return `
    <div class="header">
      <button class="header-back" id="btn-prev-q">‹</button>
      <div style="flex:1">
        <div class="header-title">${escHtml(cat.name)}</div>
        <div class="header-subtitle">${escHtml(state.local.nombre)}</div>
      </div>
      <div class="header-info">
        <div style="font-size:0.85rem;color:#fff;font-weight:700">${globalIdx + 1}<span style="color:#94a3b8;font-weight:400"> / ${allQs.length}</span></div>
        <div style="font-size:0.7rem;color:#64748b">Cat. ${state.categoryIndex + 1}/${totalCats}</div>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>

    <div class="main" style="padding-bottom:88px">
      <div class="question-step-label">
        Pregunta ${state.questionIndex + 1} de ${totalQsInCat}
        <span class="step-cat-name">· ${escHtml(cat.name)}</span>
      </div>
      ${renderQuestionCard(q)}
    </div>

    <div class="nav-footer">
      ${!isFirst
        ? `<button class="btn btn-outline" id="btn-prev-q-footer">← Anterior</button>`
        : `<div></div>`}
      <button class="btn ${isLast ? 'btn-success' : 'btn-primary'}" id="btn-next-q">
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
          id="num_${q.id}" placeholder="0.0" value="${ans.valor || ''}"
          data-qid="${q.id}">
        <span class="number-unit">°C</span>
      </div>`;
  } else {
    inputHtml = `
      <textarea class="observacion-textarea" placeholder="Ingresá el valor..."
        data-qid="${q.id}" data-field="valor"
        style="min-height:48px">${ans.valor || ''}</textarea>`;
  }

  const obsHtml = type === 'radio' ? `
    <div class="observacion-wrap">
      <span class="observacion-label">Observaciones</span>
      <textarea class="observacion-textarea" placeholder="Observaciones opcionales..."
        data-qid="${q.id}" data-field="observacion">${ans.observacion || ''}</textarea>
    </div>` : '';

  const hasPhoto = ans.foto?.dataURL;
  const photoHtml = `
    <div class="photo-section">
      <button class="photo-btn ${needsPhoto ? 'required' : ''} ${hasPhoto ? 'has-photo' : ''}"
        data-qid="${q.id}" id="photobtn_${q.id}">
        📷 ${hasPhoto ? 'Foto tomada ✓' : needsPhoto ? 'Foto requerida *' : 'Agregar foto'}
      </button>
      <input type="file" accept="image/*" capture="environment"
        id="fileinput_${q.id}" data-qid="${q.id}" style="display:none">
      ${hasPhoto
        ? `<div class="photo-preview-wrap" style="margin-top:8px">
             <img class="photo-preview" src="${ans.foto.dataURL}" alt="foto">
             <button class="photo-remove" data-qid="${q.id}" id="photoremove_${q.id}">✕</button>
           </div>` : ''}
    </div>`;

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
    </div>`;
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
    const v   = (state.answers[q.id]?.valor || '').toLowerCase();
    return (imp === 'critico' || imp === 'crítico')
      && (v.includes('no cumple') || v === 'nocumple' || !v);
  });

  const desviosHtml = criticos.length ? `
    <div class="desvios-section">
      <div class="desvios-title">⚠ Desvíos críticos (${criticos.length})</div>
      ${criticos.map(q => `
        <div class="desvio-item">
          <div class="desvio-item-control">${escHtml(q.control)}</div>
          <div class="desvio-item-cat">${escHtml(q.categoria)} › ${escHtml(q.subcategoria)}</div>
        </div>`).join('')}
    </div>` : '';

  const warnHtml = unanswered > 0 ? `
    <div class="incomplete-warning">
      ⚠ ${unanswered} ${unanswered === 1 ? 'punto sin responder' : 'puntos sin responder'}.
      Podés enviar igual.
    </div>` : '';

  const puntaje = calcularPuntaje(allQs, state.answers);

  const emailInfo = state.local?.emails
    ? `<p class="text-muted mt-8">📧 Informe se enviará a: <strong>${escHtml(state.local.emails)}</strong></p>`
    : '';

  const puntajeHtml = `
    <div class="puntaje-card puntaje-${puntaje.nivelClass}">
      <div class="puntaje-emoji">${puntaje.nivelEmoji}</div>
      <div class="puntaje-pct">${puntaje.reprobado ? '⛔' : puntaje.pct + '%'}</div>
      <div class="puntaje-nivel">${puntaje.nivel}</div>
      ${!puntaje.reprobado ? `<div class="puntaje-detalle">${puntaje.obtenido} / ${puntaje.posible} pts</div>` : ''}
      ${puntaje.reprobado ? `<div class="puntaje-detalle">Desvío crítico sin resolver</div>` : ''}
    </div>`;

  return `
    <div class="header">
      <button class="header-back" id="btn-back-to-audit">‹</button>
      <div>
        <div class="header-title">Resumen de Auditoría</div>
        <div class="header-subtitle">${escHtml(state.local.nombre)} · ${state.fecha}</div>
      </div>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>

    <div class="main" style="padding-bottom:80px">
      ${puntajeHtml}

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
          <div class="stat-label">Parcial</div>
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
        <p class="text-muted mt-8">🏪 Local: <strong>${escHtml(state.local.nombre)}</strong></p>
        <p class="text-muted mt-8">🏷 Marca: <strong>${state.local.isCausa ? 'Multimarca + Causa' : 'Multimarca'}</strong></p>
        <p class="text-muted mt-8">👤 Auditor: <strong>${escHtml(state.auditor)}</strong></p>
        <p class="text-muted mt-8">📅 Fecha: <strong>${state.fecha}</strong></p>
        <p class="text-muted mt-8">📝 Total de puntos: <strong>${allQs.length}</strong></p>
        ${emailInfo}
      </div>
    </div>

    <div class="nav-footer">
      <button class="btn btn-outline" id="btn-back-to-audit">← Revisar</button>
      <button class="btn btn-primary" id="btn-submit">Enviar ✓</button>
    </div>`;
}

// ============================================================
// PANTALLA: SUCCESS
// ============================================================
function renderSuccess() {
  const p = state.lastPuntaje;
  const puntajeHtml = p ? `
    <div class="puntaje-card puntaje-${p.nivelClass}" style="margin:16px 0">
      <div class="puntaje-emoji">${p.nivelEmoji}</div>
      <div class="puntaje-pct">${p.reprobado ? '⛔' : p.pct + '%'}</div>
      <div class="puntaje-nivel">${p.nivel}</div>
      ${!p.reprobado ? `<div class="puntaje-detalle">${p.obtenido} / ${p.posible} pts</div>` : '<div class="puntaje-detalle">Desvío crítico sin resolver</div>'}
    </div>` : '';

  return `
    <div class="screen-success">
      <div class="success-icon">✓</div>
      <h1 class="success-title">¡Auditoría enviada!</h1>
      ${puntajeHtml}
      <p class="success-sub">Los datos fueron guardados correctamente.</p>
      ${state.local?.emails ? `<p class="success-sub" style="font-size:0.85rem">📧 Informe enviado a ${escHtml(state.local.emails)}</p>` : ''}
      ${state.desviosRepetidos?.length ? `
        <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:12px;padding:16px;margin:16px 0;text-align:left">
          <div style="font-size:0.95rem;font-weight:700;color:#c2410c;margin-bottom:8px">🔁 Desvíos reiterados (${state.desviosRepetidos.length})</div>
          <p style="font-size:0.8rem;color:#92400e;margin:0 0 10px">Sin resolver en las últimas 3 auditorías:</p>
          ${state.desviosRepetidos.map(d => `<div style="font-size:0.82rem;padding:4px 0;border-bottom:1px solid #fed7aa;color:#1a1a1a"><strong>${escHtml(d.control)}</strong> <span style="color:#92400e">${escHtml(d.categoria)} › ${escHtml(d.subcategoria)}</span></div>`).join('')}
        </div>` : ''}
      <p class="success-id">ID: ${state.auditId}</p>
      <button class="btn btn-primary btn-large" id="btn-new-audit">Nueva Auditoría</button>
    </div>`;
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
    </div>`;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachListeners() {
  on('btn-go-setup',   'click', () => setState({ screen: 'setup' }));
  on('btn-back-welcome','click', () => setState({ screen: 'welcome' }));

  // Setup — local
  const selLocal = document.getElementById('sel-local');
  if (selLocal) {
    selLocal.addEventListener('change', () => {
      const nombre = selLocal.value;
      state.local = state.locales.find(l => l.nombre === nombre) || null;
    });
  }

  // Setup — auditor (cuando no hay Google)
  const inpAuditor = document.getElementById('inp-auditor');
  if (inpAuditor) inpAuditor.addEventListener('input', () => { state.auditor = inpAuditor.value; });

  const inpFecha = document.getElementById('inp-fecha');
  if (inpFecha) inpFecha.addEventListener('change', () => { state.fecha = inpFecha.value; });

  on('btn-start-audit', 'click', () => {
    // Leer valores actuales
    if (selLocal)    state.local   = state.locales.find(l => l.nombre === selLocal.value) || state.local;
    if (inpAuditor)  state.auditor = inpAuditor.value || state.auditor;
    if (inpFecha)    state.fecha   = inpFecha.value   || state.fecha;

    if (!state.local)   return alert('Seleccioná un local.');
    if (!state.auditor) return alert('Ingresá el nombre del auditor.');

    const cats = buildCategories(state.local.isCausa);
    if (!cats.length) return alert('No se encontraron preguntas para este local.');

    setState({ categories: cats, categoryIndex: 0, questionIndex: 0, answers: {}, screen: 'audit' });
  });

  // Navegación pregunta a pregunta
  on('btn-next-q', 'click', nextQuestion);
  on('btn-prev-q', 'click', prevQuestion);
  on('btn-prev-q-footer', 'click', prevQuestion);

  // Volver al audit desde summary
  on('btn-back-to-audit', 'click', () => {
    const last = state.categories[state.categories.length - 1];
    setState({
      screen: 'audit',
      categoryIndex: state.categories.length - 1,
      questionIndex: last.questions.length - 1,
    });
  });

  // Respuestas radio
  document.querySelectorAll('.answer-radio').forEach(input => {
    input.addEventListener('change', () => {
      const qid = input.dataset.qid;
      const val = input.value;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].valor = val;

      const group = document.querySelectorAll(`input[name="radio_${qid}"]`);
      group.forEach(r => {
        const lbl = r.closest('.answer-label');
        if (!lbl) return;
        lbl.className = 'answer-label' + (r.checked ? ' ' + lbl.dataset.cls : '');
      });
    });
  });

  // Inputs numéricos
  document.querySelectorAll('.number-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const qid = inp.dataset.qid;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].valor = inp.value;
    });
  });

  // Observaciones y campos texto
  document.querySelectorAll('.observacion-textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      const qid   = ta.dataset.qid;
      const field = ta.dataset.field || 'observacion';
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid][field] = ta.value;
    });
  });

  // Fotos
  document.querySelectorAll('[id^="photobtn_"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`fileinput_${btn.dataset.qid}`)?.click();
    });
  });

  document.querySelectorAll('[id^="fileinput_"]').forEach(input => {
    input.addEventListener('change', async () => {
      const qid  = input.dataset.qid;
      const file = input.files[0];
      if (!file) return;
      const dataURL = await compressImage(file, 800, 0.65);
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].foto = { dataURL, name: file.name };

      const photoBtn = document.getElementById(`photobtn_${qid}`);
      if (photoBtn) { photoBtn.className = 'photo-btn has-photo'; photoBtn.innerHTML = '📷 Foto tomada ✓'; }

      const wrap = photoBtn?.closest('.photo-section');
      if (wrap && !wrap.querySelector('.photo-preview')) {
        const div = document.createElement('div');
        div.className = 'photo-preview-wrap';
        div.style.marginTop = '8px';
        div.innerHTML = `<img class="photo-preview" src="${dataURL}" alt="foto">
          <button class="photo-remove" data-qid="${qid}" id="photoremove_${qid}">✕</button>`;
        wrap.appendChild(div);
        div.querySelector('.photo-remove').addEventListener('click', e => {
          e.stopPropagation();
          if (state.answers[qid]) delete state.answers[qid].foto;
          div.remove();
          if (photoBtn) { photoBtn.className = 'photo-btn'; photoBtn.innerHTML = '📷 Agregar foto'; }
        });
      }
    });
  });

  document.querySelectorAll('[id^="photoremove_"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      if (state.answers[qid]) delete state.answers[qid].foto;
      btn.closest('.photo-preview-wrap')?.remove();
      const photoBtn = document.getElementById(`photobtn_${qid}`);
      if (photoBtn) { photoBtn.className = 'photo-btn'; photoBtn.innerHTML = '📷 Agregar foto'; }
    });
  });

  on('btn-submit',    'click', submitAudit);
  on('btn-new-audit', 'click', () => {
    Object.assign(state, {
      screen: 'welcome', local: null,
      categories: [], categoryIndex: 0, questionIndex: 0,
      answers: {}, auditId: '', error: '', submitting: false,
    });
    if (!state.auditorEmail) state.auditor = ''; // limpiar si no es Google
    render();
  });
}

// ============================================================
// NAVEGACIÓN PREGUNTA A PREGUNTA
// ============================================================
function nextQuestion() {
  saveCurrentAnswer();
  const cat = state.categories[state.categoryIndex];
  if (state.questionIndex < cat.questions.length - 1) {
    setState({ questionIndex: state.questionIndex + 1 });
  } else if (state.categoryIndex < state.categories.length - 1) {
    setState({ categoryIndex: state.categoryIndex + 1, questionIndex: 0 });
  } else {
    setState({ screen: 'summary' });
  }
}

function prevQuestion() {
  saveCurrentAnswer();
  if (state.questionIndex > 0) {
    setState({ questionIndex: state.questionIndex - 1 });
  } else if (state.categoryIndex > 0) {
    const prev = state.categories[state.categoryIndex - 1];
    setState({ categoryIndex: state.categoryIndex - 1, questionIndex: prev.questions.length - 1 });
  } else {
    if (confirm('¿Salir de la auditoría? Se perderá el progreso no guardado.')) {
      setState({ screen: 'setup' });
    }
  }
}

function saveCurrentAnswer() {
  document.querySelectorAll('.answer-radio:checked').forEach(inp => {
    const qid = inp.dataset.qid;
    if (!state.answers[qid]) state.answers[qid] = {};
    state.answers[qid].valor = inp.value;
  });
  document.querySelectorAll('.number-input').forEach(inp => {
    if (!inp.value) return;
    if (!state.answers[inp.dataset.qid]) state.answers[inp.dataset.qid] = {};
    state.answers[inp.dataset.qid].valor = inp.value;
  });
  document.querySelectorAll('.observacion-textarea').forEach(ta => {
    if (!ta.value) return;
    const qid = ta.dataset.qid;
    const field = ta.dataset.field || 'observacion';
    if (!state.answers[qid]) state.answers[qid] = {};
    state.answers[qid][field] = ta.value;
  });
}

// ============================================================
// HELPERS
// ============================================================
function on(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function compressImage(file, maxWidth, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
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
  const auditId = `AUD_${state.local.nombre.replace(/\s+/g,'_')}_${Date.now()}`;

  const allQs = state.categories.flatMap(c => c.questions);
  const respuestas = allQs.map(q => {
    const ans = state.answers[q.id] || {};
    return {
      categoria:    q.categoria,
      subcategoria: q.subcategoria,
      control:      q.control,
      importancia:  q.importancia,
      explicacion:  q.explicacion,
      respuesta:    ans.valor       || '',
      observacion:  ans.observacion || '',
      fotoBase64:   ans.foto?.dataURL ? ans.foto.dataURL.split(',')[1] : '',
      fotoNombre:   ans.foto?.name   || '',
    };
  });

  const allQsForScore = state.categories.flatMap(c => c.questions);
  const puntaje = calcularPuntaje(allQsForScore, state.answers);

  const payload = {
    auditId,
    fecha:       state.fecha,
    hora:        new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    auditor:     state.auditor,
    auditorEmail: state.auditorEmail,
    local:       state.local.nombre,
    marca:       state.local.isCausa ? 'Multimarca + Causa' : 'Multimarca',
    emailsLocal: state.local.emails,
    puntaje:     { pct: puntaje.pct, nivel: puntaje.nivel, obtenido: puntaje.obtenido, posible: puntaje.posible, reprobado: puntaje.reprobado },
    respuestas,
  };

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="spinner"></div><div class="overlay-text">Enviando auditoría...</div>`;
  document.body.appendChild(overlay);

  try {
    const resp = await fetch(CONFIG.appsScriptURL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Error desconocido');
    console.log('Email status:', data.email);
    setState({ screen: 'success', auditId, emailStatus: data.email || '', lastPuntaje: puntaje, desviosRepetidos: data.desviosRepetidos || [] });
  } catch (err) {
    console.error(err);
    alert('Error al enviar: ' + err.message);
  } finally {
    overlay.remove();
  }
}

// ============================================================
// ARRANCAR
// ============================================================
init();
