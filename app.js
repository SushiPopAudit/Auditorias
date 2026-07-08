// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  screen: 'loading',
  allQuestions: [],
  locales: [],       // [{nombre, isCausa, emails}]

  // Auth
  user:         null,   // {email, nombre, rol, locales, token, savedAt}
  auditor:      '',
  auditorEmail: '',
  acompanante:         '',
  posicionAcompanante: '',

  // Setup
  local: null,       // {nombre, isCausa, emails}
  fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })(),

  // Audit
  categories:    [],
  categoryIndex: 0,
  questionIndex: 0,  // una pregunta a la vez
  answers:       {},
  skipped:       {},

  // Submit
  submitting:      false,
  auditId:         '',
  error:           '',
  returnScreen:    '',
  sendUnconfirmed: false,

  // Admin
  adminTab:              'usuarios',
  adminUsers:            [],
  adminLoading:          false,
  adminError:            '',
  adminSearch:           '',
  adminEditingUserEmail: null,
  adminLocales:          [],
  adminLocalesLoading:   false,
  adminLocalesError:     '',
  adminEditingLocalIdx:  null,
  adminLocalesSearch:      '',
  adminShowCreateUser:     false,
  adminShowCreateLocal:    false,
  adminExpandedUserEmail:  null,
  adminExpandedLocalIdx:   null,
  adminAddEmailLocalIdx:   null,
  loginShowForgot:         false,
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

    const session = loadSession();
    if (session) {
      state.user         = session;
      state.auditor      = session.nombre;
      state.auditorEmail = session.email;
      setState({ screen: session.rol === 'Admin' ? 'admin' : 'welcome', adminTab: 'menu' });
    } else {
      setState({ screen: 'login' });
    }
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
// AUTH
// ============================================================
async function hashPwd(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callAPI(params) {
  const qs = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const r = await fetch(CONFIG.appsScriptURL + '?' + qs, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function loadSession() {
  try {
    const raw = localStorage.getItem('user_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.email || !s.token) return null;
    if (Date.now() - (s.savedAt || 0) > 7 * 24 * 3600 * 1000) { clearSession(); return null; }
    return s;
  } catch(e) { return null; }
}

function saveSession(user) {
  try {
    localStorage.setItem('user_session', JSON.stringify(Object.assign({}, user, { savedAt: Date.now() })));
  } catch(e) {}
}

function clearSession() {
  try { localStorage.removeItem('user_session'); } catch(e) {}
}

function logout() {
  clearSession();
  state.user        = null;
  state.auditor     = '';
  state.auditorEmail = '';
  setState({ screen: 'login' });
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
const NO_NAV_SCREENS = new Set(['loading', 'login', 'change-password', 'error']);

function render() {
  const app = document.getElementById('app');
  switch (state.screen) {
    case 'loading':          app.innerHTML = renderLoading();          break;
    case 'login':            app.innerHTML = renderLogin();            break;
    case 'change-password':  app.innerHTML = renderChangePassword();   break;
    case 'welcome':          app.innerHTML = renderWelcome();          break;
    case 'setup':            app.innerHTML = renderSetup();            break;
    case 'cat-select':       app.innerHTML = renderCatSelect();        break;
    case 'audit':            app.innerHTML = renderAudit();            break;
    case 'incumplimientos':  app.innerHTML = renderIncumplimientos();  break;
    case 'summary':          app.innerHTML = renderSummary();          break;
    case 'success':          app.innerHTML = renderSuccess();          break;
    case 'admin':            app.innerHTML = renderAdmin();            break;
    case 'error':            app.innerHTML = renderError();            break;
  }
  // Bottom nav for Admin on all screens except login/loading/error
  if (state.user?.rol === 'Admin' && !NO_NAV_SCREENS.has(state.screen)) {
    app.insertAdjacentHTML('beforeend', renderAdminBottomNav());
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
  const u = state.user;
  const rolBadge = u ? `<span style="font-size:0.75rem;background:${u.rol === 'Admin' ? '#7c3aed' : u.rol === 'Franquiciado' ? '#0369a1' : '#166534'};color:#fff;padding:2px 8px;border-radius:999px;font-weight:600">${escHtml(u.rol)}</span>` : '';

  let draftBanner = '';
  try {
    const raw = localStorage.getItem('audit_draft');
    if (raw) {
      const draft = JSON.parse(raw);
      const age = Date.now() - (draft.ts || 0);
      if (age < 86400000 && draft.local && draft.local.nombre) {
        draftBanner = `
          <div id="draft-banner" style="background:#fffbeb;border:2px solid #f97316;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;width:100%;box-sizing:border-box">
            <div style="font-size:0.9rem;font-weight:700;color:#92400e;margin-bottom:4px">Auditoría incompleta guardada</div>
            <div style="font-size:0.85rem;color:#1a1a1a;margin-bottom:12px">
              <strong>${escHtml(draft.local.nombre)}</strong> &mdash; ${escHtml(draft.fecha || '')}
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" id="btn-draft-continue" style="flex:1;font-size:0.85rem">Continuar auditoría</button>
              <button class="btn btn-outline" id="btn-draft-discard" style="flex:1;font-size:0.85rem">Descartar</button>
            </div>
          </div>`;
      }
    }
  } catch(e) {}

  const adminBtn = u && u.rol === 'Admin'
    ? `<button class="btn btn-outline" id="btn-go-admin" style="width:100%;margin-bottom:8px">Administración de usuarios</button>`
    : '';

  return `
    <div class="screen-welcome">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
      <h1 class="welcome-title">Sistema de Auditorías</h1>
      ${u ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${rolBadge}<span style="font-size:0.9rem;color:#64748b">${escHtml(u.nombre)}</span></div>` : ''}
      <p class="welcome-sub" style="margin-bottom:20px">${u && u.rol === 'Franquiciado' ? 'Auditoría interna' : 'Auditoría oficial'}</p>
      ${draftBanner}
      ${adminBtn}
      <button class="welcome-btn" id="btn-go-setup">Comenzar Auditoría</button>
      <button class="btn btn-outline" id="btn-logout" style="width:100%;margin-top:8px;color:#94a3b8;border-color:#94a3b8;font-size:0.85rem">Cerrar sesión</button>
    </div>
  `;
}

// ============================================================
// PANTALLA: SETUP
// ============================================================
// ============================================================
// PANTALLA: LOGIN
// ============================================================
function renderLogin() {
  const showForgot = state.loginShowForgot;
  if (showForgot) {
    return `
      <div class="screen-welcome">
        <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
        <h1 class="welcome-title" style="font-size:1.4rem">Recuperar contraseña</h1>
        <p class="welcome-sub" style="margin-bottom:24px">Ingresá tu email y te enviamos una contraseña temporal</p>
        <div style="width:100%;max-width:340px;text-align:left">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="inp-forgot-email" type="email" placeholder="tu@email.com" autocomplete="email" inputmode="email">
          </div>
          <div id="forgot-msg" style="font-size:0.85rem;margin-bottom:12px;min-height:20px"></div>
          <button class="btn btn-primary btn-large" id="btn-forgot-submit" style="width:100%;margin-bottom:12px">Enviar email</button>
          <button class="btn btn-outline" id="btn-forgot-back" style="width:100%">Volver al login</button>
        </div>
      </div>`;
  }
  return `
    <div class="screen-welcome">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
      <h1 class="welcome-title">Sistema de Auditorías</h1>
      <p class="welcome-sub" style="margin-bottom:24px">Iniciá sesión para continuar</p>
      <div style="width:100%;max-width:340px;text-align:left">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" id="inp-login-email" type="email" placeholder="tu@email.com" autocomplete="email" inputmode="email">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input class="form-control" id="inp-login-pwd" type="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <div id="login-error" style="color:#ef4444;font-size:0.85rem;margin-bottom:12px;min-height:20px"></div>
        <button class="btn btn-primary btn-large" id="btn-login-submit" style="width:100%;margin-bottom:12px">Ingresar</button>
        <button class="btn btn-outline" id="btn-show-forgot" style="width:100%;font-size:0.85rem;color:#6b7280;border-color:#e5e7eb">Olvidé mi contraseña</button>
      </div>
    </div>`;
}

// ============================================================
// PANTALLA: CAMBIO DE CONTRASEÑA
// ============================================================
function renderChangePassword() {
  return `
    <div class="screen-welcome">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
      <h1 class="welcome-title" style="font-size:1.4rem">Primera vez que ingresás</h1>
      <p class="welcome-sub" style="margin-bottom:24px">Elegí una nueva contraseña para tu cuenta</p>
      <div style="width:100%;max-width:340px;text-align:left">
        <div class="form-group">
          <label class="form-label">Nueva contraseña</label>
          <input class="form-control" id="inp-newpwd" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña</label>
          <input class="form-control" id="inp-newpwd2" type="password" placeholder="Repetir contraseña" autocomplete="new-password">
        </div>
        <div id="changepwd-error" style="color:#ef4444;font-size:0.85rem;margin-bottom:12px;min-height:20px"></div>
        <button class="btn btn-primary btn-large" id="btn-changepwd-submit" style="width:100%">Cambiar contraseña</button>
      </div>
    </div>
  `;
}

// ============================================================
// PANTALLA: ADMIN
// ============================================================
function renderAdminBottomNav() {
  const tab = state.adminTab || 'menu';
  const auditScreens = new Set(['setup','cat-select','audit','incumplimientos','summary','success','welcome']);
  const isAudit = auditScreens.has(state.screen);
  const active = 'color:#e4001b;font-weight:700';
  const idle   = 'color:#9ca3af;font-weight:400';
  const base   = 'flex:1;padding:8px 4px 6px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px';
  return `
    <nav style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;display:flex;z-index:100;padding-bottom:env(safe-area-inset-bottom,0px);max-width:100vw">
      <button id="nav-admin-inicio" style="${base};${tab==='menu'?active:idle}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span style="font-size:0.62rem">Inicio</span>
      </button>
      <button id="nav-admin-usuarios" style="${base};${tab==='usuarios'?active:idle}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <span style="font-size:0.62rem">Usuarios</span>
      </button>
      <button id="nav-admin-locales" style="${base};${tab==='locales'?active:idle}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="22"/><circle cx="19" cy="8" r="3"/></svg>
        <span style="font-size:0.62rem">Locales</span>
      </button>
      <button id="nav-admin-auditoria" style="${base};${isAudit?active:idle}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <span style="font-size:0.62rem">Auditoría</span>
      </button>
    </nav>
    <div style="height:68px"></div>`;
}

function renderAdmin() {
  const u = state.user;
  if (!u || u.rol !== 'Admin') return `<div class="screen-center"><p>Acceso denegado.</p></div>`;
  const tab = state.adminTab || 'menu';
  if (tab === 'menu')     return renderAdminMenu();
  if (tab === 'usuarios') return renderAdminSubscreen('Usuarios', renderAdminUsuarios());
  if (tab === 'locales')  return renderAdminSubscreen('Locales',  renderAdminLocales());
  return renderAdminMenu();
}

function renderAdminMenu() {
  let draftBanner = '';
  try {
    const raw = localStorage.getItem('audit_draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (Date.now() - (d.ts||0) < 86400000 && d.local?.nombre) {
        draftBanner = `
          <div style="background:#fffbeb;border:2px solid #f97316;border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">
            <div style="font-size:0.88rem;font-weight:700;color:#92400e;margin-bottom:4px">Auditoría incompleta guardada</div>
            <div style="font-size:0.83rem;color:#1a1a1a;margin-bottom:10px"><strong>${escHtml(d.local.nombre)}</strong> &mdash; ${escHtml(d.fecha||'')}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" id="btn-draft-continue" style="flex:1;font-size:0.83rem">Continuar auditoría</button>
              <button class="btn btn-outline" id="btn-draft-discard" style="flex:1;font-size:0.83rem">Descartar</button>
            </div>
          </div>`;
      }
    }
  } catch(e) {}
  const u = state.user;
  return `
    <div class="screen-welcome" style="padding-top:40px">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
      <h1 class="welcome-title" style="margin-bottom:4px">Sistema de Auditorías</h1>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
        <span style="font-size:0.75rem;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:999px;font-weight:600">Admin</span>
        <span style="font-size:0.88rem;color:#94a3b8">${escHtml(u?.nombre||'')}</span>
      </div>
      ${draftBanner}
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary btn-large" id="btn-go-setup" style="width:100%">Nueva Auditoría</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button id="btn-admin-go-usuarios" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:20px 12px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
            <span style="font-size:1.6rem">👥</span>Usuarios
          </button>
          <button id="btn-admin-go-locales" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:20px 12px;font-size:0.95rem;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
            <span style="font-size:1.6rem">🏪</span>Locales
          </button>
        </div>
        <button class="btn btn-outline" id="btn-logout" style="width:100%;color:#94a3b8;border-color:#334155;font-size:0.85rem">Cerrar sesión</button>
      </div>
    </div>`;
}

function renderAdminSubscreen(title, content) {
  return `
    <div class="main" style="padding-top:16px">
      ${content}
      <div style="height:24px"></div>
    </div>`;
}

function renderAdminUsuarios() {
  const u = state.user;
  const users   = state.adminUsers   || [];
  const loading = state.adminLoading;
  const err     = state.adminError   || '';
  const search  = (state.adminSearch || '').toLowerCase();
  const editingEmail = state.adminEditingUserEmail || null;

  const filtered = search
    ? users.filter(usr => usr.nombre.toLowerCase().includes(search) || (usr.locales||'').toLowerCase().includes(search) || usr.email.toLowerCase().includes(search))
    : users;

  const expandedEmail = state.adminExpandedUserEmail;
  const userRows = filtered.map(usr => {
    const isMe = usr.email.toLowerCase() === u.email.toLowerCase();
    const estadoColor = usr.estado === 'Activo' ? '#16a34a' : '#dc2626';
    const isExpanded = expandedEmail === usr.email;
    const isEditing  = editingEmail  === usr.email;

    const editForm = isEditing ? `
      <div style="padding-top:10px">
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Nombre</label>
          <input class="form-control" id="edit-usr-nombre" value="${escHtml(usr.nombre)}" style="font-size:0.85rem;padding:7px 10px">
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Rol</label>
          <select class="form-control" id="edit-usr-rol" style="font-size:0.85rem;padding:7px 10px">
            <option value="Auditor" ${usr.rol==='Auditor'?'selected':''}>Auditor</option>
            <option value="Franquiciado" ${usr.rol==='Franquiciado'?'selected':''}>Franquiciado</option>
            <option value="Admin" ${usr.rol==='Admin'?'selected':''}>Admin</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Locales asignados</label>
          ${localesCheckboxes(usr.locales)}
        </div>
        <div id="edit-usr-error" style="color:#ef4444;font-size:0.8rem;min-height:16px;margin-bottom:6px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-admin-action="edit-save" data-email="${escHtml(usr.email)}" style="flex:1;font-size:0.8rem;padding:7px">Guardar</button>
          <button class="btn btn-outline" data-admin-action="edit-cancel" style="flex:1;font-size:0.8rem;padding:7px">Cancelar</button>
        </div>
      </div>` : '';

    const detail = (isExpanded && !isEditing) ? `
      <div style="padding-top:8px;padding-bottom:4px">
        <div style="font-size:0.78rem;color:#6b7280;margin-bottom:2px">Email</div>
        <div style="font-size:0.85rem;color:#1a1a1a;margin-bottom:8px">${escHtml(usr.email)}</div>
        <div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
          <div><div style="font-size:0.78rem;color:#6b7280">Rol</div><div style="font-size:0.85rem;color:#1a1a1a">${escHtml(usr.rol)}</div></div>
          <div><div style="font-size:0.78rem;color:#6b7280">Estado</div><div style="font-size:0.85rem;font-weight:600;color:${estadoColor}">${escHtml(usr.estado)}</div></div>
        </div>
        <div style="font-size:0.78rem;color:#6b7280;margin-bottom:4px">Locales</div>
        <div style="font-size:0.85rem;color:#1a1a1a;margin-bottom:10px">${escHtml(usr.locales||'Todos')}</div>
        ${isMe ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline" data-admin-action="edit-open" data-email="${escHtml(usr.email)}" style="font-size:0.8rem;padding:5px 12px">Editar</button>
          <button class="btn btn-outline" data-admin-action="reset" data-email="${escHtml(usr.email)}" style="font-size:0.8rem;padding:5px 12px">Reset contraseña</button>
          ${usr.estado === 'Activo'
            ? `<button class="btn" data-admin-action="baja" data-email="${escHtml(usr.email)}" style="font-size:0.8rem;padding:5px 12px;background:#7f1d1d;color:#fff;border:none;border-radius:8px">Dar de baja</button>`
            : `<button class="btn btn-outline" data-admin-action="reactivar" data-email="${escHtml(usr.email)}" style="font-size:0.8rem;padding:5px 12px">Reactivar</button>`}
        </div>`}
      </div>` : '';

    return `
      <div style="border-bottom:1px solid #e5e7eb;padding:10px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer" data-admin-action="expand" data-email="${escHtml(usr.email)}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:1rem;color:#1a1a1a">${escHtml(usr.nombre)}</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap">
              <span style="font-size:0.75rem;color:#6b7280">${escHtml(usr.rol)}</span>
              <span style="font-size:0.75rem;font-weight:600;color:${estadoColor}">${escHtml(usr.estado)}</span>
            </div>
          </div>
          <span style="color:#9ca3af;font-size:1rem;flex-shrink:0">${isExpanded || isEditing ? '▲' : '▼'}</span>
        </div>
        ${detail}${editForm}
      </div>`;
  }).join('');

  const showCreate = state.adminShowCreateUser;
  const createForm = showCreate ? `
    <div class="setup-card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">Nuevo usuario</h2>
        <button id="btn-admin-cancel-create" style="background:none;border:none;color:#64748b;font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div class="form-group"><label class="form-label">Nombre completo</label><input class="form-control" id="inp-admin-nombre" type="text" placeholder="Nombre Apellido"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="inp-admin-email" type="email" placeholder="usuario@email.com"></div>
      <div class="form-group"><label class="form-label">Rol</label>
        <select class="form-control" id="sel-admin-rol">
          <option value="Auditor">Auditor</option><option value="Franquiciado">Franquiciado</option><option value="Admin">Admin</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Locales asignados</label>
        ${localesCheckboxes('todos')}
      </div>
      <div id="admin-create-error" style="color:#ef4444;font-size:0.85rem;margin-bottom:8px;min-height:18px"></div>
      <button class="btn btn-primary" id="btn-admin-create" style="width:100%">Crear y enviar email</button>
    </div>` : '';

  return `
    ${createForm}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <h3 style="color:#1a1a1a;margin:0;flex:1">Usuarios (${users.length})</h3>
      ${loading ? '<div class="spinner" style="width:20px;height:20px;border-width:2px"></div>' : ''}
      <button id="btn-admin-new-user" style="background:#f97316;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">+</button>
    </div>
    <input class="form-control" id="inp-admin-search" placeholder="Buscar por nombre, email o local..." value="${escHtml(state.adminSearch||'')}" style="margin-bottom:12px">
    ${err ? `<p style="color:#ef4444;font-size:0.85rem">${escHtml(err)}</p>` : ''}
    ${userRows || (!loading ? `<p style="color:#64748b;font-size:0.85rem">${search ? 'Sin resultados.' : 'No hay usuarios.'}</p>` : '')}`;
}

function renderAdminLocales() {
  const loading = state.adminLocalesLoading;
  const err     = state.adminLocalesError || '';
  const locales = state.adminLocales || [];
  const editingIdx = state.adminEditingLocalIdx;

  const search = (state.adminLocalesSearch || '').toLowerCase();
  const filtered = search
    ? locales.filter(l => l.nombre.toLowerCase().includes(search) || (l.emails||'').toLowerCase().includes(search))
    : locales;
  const expandedIdx = state.adminExpandedLocalIdx;
  const filteredRows = filtered.map(loc => {
    const isExpanded = expandedIdx === loc.idx;
    const isEditing  = editingIdx  === loc.idx;

    const editForm = isEditing ? `
      <div style="padding-top:10px">
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Nombre del local</label>
          <input class="form-control" id="edit-loc-nombre" value="${escHtml(loc.nombre)}" style="font-size:0.85rem;padding:7px 10px">
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Marca CAUSA</label>
          <select class="form-control" id="edit-loc-causa" style="font-size:0.85rem;padding:7px 10px">
            <option value="false" ${!loc.isCausa?'selected':''}>No</option>
            <option value="true"  ${loc.isCausa ?'selected':''}>Sí</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.78rem">Emails de resultados (uno por línea o separados por coma)</label>
          <input class="form-control" id="edit-loc-emails" value="${escHtml(loc.emails||'')}" placeholder="mail1@..., mail2@..." style="font-size:0.85rem;padding:7px 10px">
        </div>
        <div id="edit-loc-error" style="color:#ef4444;font-size:0.8rem;min-height:16px;margin-bottom:6px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-loc-action="save" data-idx="${loc.idx}" style="flex:1;font-size:0.8rem;padding:7px">Guardar</button>
          <button class="btn btn-outline" data-loc-action="cancel" style="flex:1;font-size:0.8rem;padding:7px">Cancelar</button>
        </div>
      </div>` : '';

    const isAddingEmail = state.adminAddEmailLocalIdx === loc.idx;
    const addEmailForm = isAddingEmail ? `
      <div style="display:flex;gap:6px;margin-top:6px;margin-bottom:8px">
        <input class="form-control" id="inp-add-email" type="email" placeholder="nuevo@email.com" style="flex:1;font-size:0.85rem;padding:6px 10px">
        <button class="btn btn-primary" data-loc-action="add-email-save" data-idx="${loc.idx}" style="font-size:0.8rem;padding:6px 10px;white-space:nowrap">Agregar</button>
        <button class="btn btn-outline" data-loc-action="add-email-cancel" style="font-size:0.8rem;padding:6px 8px">✕</button>
      </div>` : '';

    const detail = (isExpanded && !isEditing) ? `
      <div style="padding-top:8px;padding-bottom:4px">
        ${loc.isCausa ? '<div style="margin-bottom:8px"><span style="font-size:0.75rem;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:999px">CAUSA</span></div>' : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:0.78rem;color:#6b7280">Emails de resultados</span>
          ${!isAddingEmail ? `<button data-loc-action="add-email-open" data-idx="${loc.idx}" style="background:#16a34a;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:0.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">+</button>` : ''}
        </div>
        ${addEmailForm}
        <div style="margin-bottom:10px">${emailPills(loc.emails)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline" data-loc-action="edit" data-idx="${loc.idx}" style="font-size:0.8rem;padding:5px 12px">Editar</button>
          <button class="btn" data-loc-action="delete" data-idx="${loc.idx}" data-nombre="${escHtml(loc.nombre)}" style="font-size:0.8rem;padding:5px 12px;background:#7f1d1d;color:#fff;border:none;border-radius:8px">Eliminar</button>
        </div>
      </div>` : '';

    return `
      <div style="border-bottom:1px solid #e5e7eb;padding:10px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer" data-loc-action="expand" data-idx="${loc.idx}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:1rem;color:#1a1a1a">${escHtml(loc.nombre)}</div>
            <div style="font-size:0.75rem;color:#6b7280;margin-top:2px">${loc.isCausa ? 'CAUSA · ' : ''}${loc.emails ? loc.emails.split(',').length + ' email' + (loc.emails.split(',').length > 1 ? 's' : '') : 'Sin email'}</div>
          </div>
          <span style="color:#9ca3af;font-size:1rem;flex-shrink:0">${isExpanded || isEditing ? '▲' : '▼'}</span>
        </div>
        ${detail}${editForm}
      </div>`;
  }).join('');

  const showCreate = state.adminShowCreateLocal;
  const createForm = showCreate ? `
    <div class="setup-card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">Nuevo local</h2>
        <button id="btn-admin-cancel-create-loc" style="background:none;border:none;color:#64748b;font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div class="form-group"><label class="form-label">Nombre</label><input class="form-control" id="inp-loc-nombre" type="text" placeholder="Nombre del local"></div>
      <div class="form-group"><label class="form-label">Marca CAUSA</label>
        <select class="form-control" id="sel-loc-causa"><option value="false">No</option><option value="true">Sí</option></select>
      </div>
      <div class="form-group"><label class="form-label">Emails de resultados</label>
        <input class="form-control" id="inp-loc-emails" type="text" placeholder="mail@local.com, otro@local.com">
      </div>
      <div id="admin-loc-create-error" style="color:#ef4444;font-size:0.85rem;margin-bottom:8px;min-height:18px"></div>
      <button class="btn btn-primary" id="btn-loc-create" style="width:100%">Agregar local</button>
    </div>` : '';

  return `
    ${createForm}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <h3 style="color:#1a1a1a;margin:0;flex:1">Locales (${locales.length})</h3>
      ${loading ? '<div class="spinner" style="width:20px;height:20px;border-width:2px"></div>' : ''}
      <button id="btn-admin-new-local" style="background:#f97316;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">+</button>
    </div>
    <input class="form-control" id="inp-locales-search" placeholder="Buscar por nombre o email..." value="${escHtml(state.adminLocalesSearch||'')}" style="margin-bottom:12px">
    ${err ? `<p style="color:#ef4444;font-size:0.85rem">${escHtml(err)}</p>` : ''}
    ${filteredRows || (!loading ? `<p style="color:#64748b;font-size:0.85rem">${search ? 'Sin resultados.' : 'No hay locales cargados.'}</p>` : '')}`;
}

function emailPills(emailsStr) {
  if (!emailsStr) return '<span style="color:#6b7280;font-size:0.8rem">Sin email configurado</span>';
  return emailsStr.split(',').map(e => e.trim()).filter(Boolean)
    .map(e => `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:999px;padding:2px 8px;font-size:0.72rem;margin:2px 2px 2px 0">${escHtml(e)}</span>`)
    .join('');
}

function localesCheckboxes(selectedStr) {
  const all = state.adminLocales || [];
  if (state.adminLocalesLoading) return `<div style="color:#6b7280;font-size:0.85rem;padding:8px 0">Cargando locales…</div>`;
  if (!all.length) return `<input class="form-control" id="inp-loc-fallback" type="text" placeholder="vacío = todos" value="${escHtml(selectedStr||'')}">`;
  const isTodos = !selectedStr || selectedStr === 'todos';
  const sel = selectedStr ? selectedStr.split(',').map(l => l.trim().toLowerCase()) : [];
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;max-height:180px;overflow-y:auto;background:#fff">
    <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;cursor:pointer;border-bottom:1px solid #e5e7eb;margin-bottom:6px;color:#1a1a1a">
      <input type="checkbox" class="chk-loc-todos" style="accent-color:#f97316;width:16px;height:16px" ${isTodos?'checked':''}> <strong>Todos los locales</strong>
    </label>
    ${all.map(l => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;cursor:pointer;color:#1a1a1a">
      <input type="checkbox" class="chk-loc-item" value="${escHtml(l.nombre)}" style="accent-color:#f97316;width:16px;height:16px" ${!isTodos && sel.includes(l.nombre.toLowerCase())?'checked':''}> ${escHtml(l.nombre)}
    </label>`).join('')}
  </div>`;
}

function getSelectedLocalesFromDOM() {
  const todosChk = document.querySelector('.chk-loc-todos');
  if (todosChk && todosChk.checked) return 'todos';
  const items = Array.from(document.querySelectorAll('.chk-loc-item:checked')).map(c => c.value);
  return items.length ? items.join(', ') : 'todos';
}

function getVisibleLocales() {
  const u = state.user;
  if (!u || u.rol !== 'Franquiciado' || !u.locales || u.locales === 'todos') return state.locales;
  const assigned = u.locales.split(',').map(l => l.trim().toLowerCase());
  return state.locales.filter(l => assigned.includes(l.nombre.toLowerCase()));
}

function renderSetup() {
  const visibleLocales = getVisibleLocales();
  const localesOpts = visibleLocales.map(l =>
    `<option value="${escHtml(l.nombre)}" ${state.local?.nombre === l.nombre ? 'selected' : ''}>${escHtml(l.nombre)}</option>`
  ).join('');

  const u = state.user;
  const auditorField = u
    ? `<div class="auditor-badge">
         <span class="auditor-avatar">${(u.nombre[0] || '?').toUpperCase()}</span>
         <div>
           <div class="auditor-name">${escHtml(u.nombre)}</div>
           <div class="auditor-email">${escHtml(u.email)}</div>
         </div>
       </div>`
    : `<input class="form-control" id="inp-auditor" type="text"
         placeholder="Tu nombre completo" value="${escHtml(state.auditor)}">`;

  return `
    <div class="main" style="padding-top:16px">
      <div class="setup-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0">Datos de la visita</h2>
          <button id="btn-back-welcome" style="background:none;border:none;color:#6b7280;font-size:0.82rem;cursor:pointer;padding:0">← Volver</button>
        </div>

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
          <label class="form-label">Acompañante (opcional)</label>
          <input class="form-control" id="inp-acompanante" type="text"
            placeholder="Nombre del acompañante" value="${escHtml(state.acompanante || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">Posición del acompañante</label>
          <select class="form-control" id="sel-posicion-acomp">
            <option value="">— Sin especificar —</option>
            <option value="Franquiciado" ${state.posicionAcompanante === 'Franquiciado' ? 'selected' : ''}>Franquiciado</option>
            <option value="Jefe de cocina" ${state.posicionAcompanante === 'Jefe de cocina' ? 'selected' : ''}>Jefe de cocina</option>
            <option value="Supervisor" ${state.posicionAcompanante === 'Supervisor' ? 'selected' : ''}>Supervisor</option>
            <option value="Encargado" ${state.posicionAcompanante === 'Encargado' ? 'selected' : ''}>Encargado</option>
            <option value="Otro" ${state.posicionAcompanante === 'Otro' ? 'selected' : ''}>Otro</option>
          </select>
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
// PANTALLA: SELECCIÓN DE CATEGORÍA
// ============================================================
function renderCatSelect() {
  const allQs = state.categories.flatMap(c => c.questions);
  const totalAnswered = allQs.filter(q => state.answers[q.id]?.valor).length;
  const pct = allQs.length ? Math.round(totalAnswered / allQs.length * 100) : 0;
  const incumplCnt = allQs.filter(q => {
    const val = (state.answers[q.id]?.valor || '').toLowerCase();
    return val.includes('no cumple') || val === 'nocumple' || val.includes('parcial');
  }).length;

  const catCards = state.categories.map((cat, ci) => {
    const total      = cat.questions.length;
    const answered   = cat.questions.filter(q => state.answers[q.id]?.valor).length;
    const skippedCnt = cat.questions.filter(q => state.skipped[q.id]).length;
    const complete   = answered === total && skippedCnt === 0;
    const inProgress = answered > 0 || skippedCnt > 0;

    let bg, border, labelTxt, labelColor;
    if (complete)        { bg='#f0fdf4'; border='#16a34a'; labelTxt='✓ Completa';                                  labelColor='#16a34a'; }
    else if (skippedCnt) { bg='#fff7ed'; border='#f97316'; labelTxt=skippedCnt+' pendiente'+(skippedCnt!==1?'s':''); labelColor='#ea580c'; }
    else if (inProgress) { bg='#fffbeb'; border='#d97706'; labelTxt=answered+'/'+total+' respondidas';             labelColor='#d97706'; }
    else                 { bg='#f8fafc'; border='#cbd5e1'; labelTxt=total+' preguntas';                            labelColor='#64748b'; }

    const barHtml = inProgress && !complete
      ? `<div style="margin-top:8px;background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden"><div style="background:${border};width:${Math.round(answered/total*100)}%;height:100%;border-radius:99px"></div></div>`
      : '';

    return `<button class="cat-select-card" data-ci="${ci}"
      style="background:${bg};border:2px solid ${border};border-radius:12px;padding:16px;width:100%;text-align:left;cursor:pointer;margin-bottom:10px;display:block;box-sizing:border-box">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:15px;font-weight:700;color:#1a1a1a">${escHtml(cat.name)}</div>
        <div style="font-size:12px;font-weight:700;color:${labelColor};white-space:nowrap;margin-left:8px">${labelTxt}</div>
      </div>${barHtml}
    </button>`;
  }).join('');

  const allComplete = state.categories.every(cat =>
    cat.questions.every(q => state.answers[q.id]?.valor && !state.skipped[q.id])
  );

  return `
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>

    <div class="main" style="padding-bottom:120px;padding-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <button id="btn-back-to-setup" style="background:none;border:none;color:#6b7280;font-size:0.82rem;cursor:pointer;padding:0;margin-bottom:4px;display:block">← Editar datos</button>
          <div style="font-size:1rem;font-weight:700;color:#1a1a1a">${escHtml(state.local.nombre)}</div>
          <div style="font-size:0.78rem;color:#6b7280">${totalAnswered} de ${allQs.length} preguntas respondidas</div>
        </div>
        <button id="btn-borrar-auditoria" style="background:none;border:1px solid #fca5a5;color:#ef4444;font-size:0.78rem;font-weight:600;cursor:pointer;padding:4px 10px;border-radius:8px;white-space:nowrap">Borrar</button>
      </div>
      ${catCards}
    </div>

    <div class="nav-footer" style="flex-direction:column;gap:8px">
      ${incumplCnt > 0
        ? `<button class="btn btn-outline" id="btn-ver-incumplimientos" style="width:100%;color:#e4001b;border-color:#fca5a5">⚠ Ver incumplimientos (${incumplCnt})</button>`
        : ''}
      ${allComplete
        ? `<button class="btn btn-success" id="btn-go-summary" style="width:100%">Ver Resumen →</button>`
        : `<button class="btn btn-outline" style="width:100%;color:#94a3b8;border-color:#e2e8f0;pointer-events:none">Completá todas las categorías para continuar</button>`}
    </div>`;
}

function borrarAuditoria() {
  if (confirm('¿Borrar la auditoría? Se eliminarán todas las respuestas guardadas.')) {
    borrarBorrador();
    Object.assign(state, {
      screen: 'welcome', local: null, acompanante: '', posicionAcompanante: '',
      categories: [], categoryIndex: 0, questionIndex: 0,
      answers: {}, skipped: {}, auditId: '', error: '', submitting: false,
    });
    render();
  }
}

// ============================================================
// PANTALLA: AUDITORÍA — UNA PREGUNTA A LA VEZ
// ============================================================
function renderAudit() {
  const cat          = state.categories[state.categoryIndex];
  const q            = cat.questions[state.questionIndex];
  const totalQsInCat = cat.questions.length;

  const allQs     = state.categories.flatMap(c => c.questions);
  const globalIdx = state.categories
    .slice(0, state.categoryIndex)
    .reduce((sum, c) => sum + c.questions.length, 0) + state.questionIndex;
  const pct = Math.round(((globalIdx + 1) / allQs.length) * 100);

  const isFirst      = state.questionIndex === 0;
  const isLast       = state.questionIndex === totalQsInCat - 1;
  const skippedInCat = cat.questions.filter(q2 => state.skipped[q2.id]).length;

  return `
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>

    <div class="main" style="padding-bottom:110px;padding-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:0.78rem;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">${escHtml(cat.name)}</div>
        <div style="font-size:0.78rem;color:#9ca3af">${state.questionIndex + 1} / ${totalQsInCat}</div>
      </div>
      ${renderQuestionCard(q)}
    </div>

    <div class="nav-footer" style="flex-direction:column;gap:6px;padding:8px 16px">
      <div style="display:flex;gap:8px;width:100%">
        ${!isFirst
          ? `<button class="btn btn-outline" id="btn-prev-q-footer" style="flex:1;font-size:0.85rem;padding:9px 8px">← Anterior</button>`
          : `<div style="flex:1"></div>`}
        ${isLast
          ? `<button class="btn btn-success" id="btn-next-q" style="flex:2;font-size:0.85rem;padding:9px 8px">Completar →</button>`
          : `<button class="btn btn-primary" id="btn-next-q" style="flex:2;font-size:0.85rem;padding:9px 8px">Siguiente →</button>`}
      </div>
      <button class="btn btn-outline" id="btn-back-to-cats-footer" style="width:100%;font-size:0.82rem;color:#6b7280;border-color:#e5e7eb;padding:7px">‹ Volver a categorías</button>
    </div>`;
}

function renderQuestionCard(q) {
  const imp = importanciaClass(q.importancia);
  const ans = state.answers[q.id] || {};
  const { type, options } = parseAnswerType(q.pregunta);
  const needsPhoto = q.imagen === 'si' || q.imagen === 'obligatorio';

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
          inputmode="decimal" pattern="[0-9.,]*"
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

  const selectedVal = (ans.valor || '').toLowerCase();
  const obsRequired = selectedVal === 'no cumple' || selectedVal.includes('parcial');
  const obsHtml = type === 'radio' ? `
    <div class="observacion-wrap">
      <span class="observacion-label">Observaciones${obsRequired ? ' <span style="color:#e4001b;font-weight:700">* Requerida</span>' : ''}</span>
      <textarea class="observacion-textarea" placeholder="${obsRequired ? '* Observación requerida...' : 'Observaciones opcionales...'}"
        data-qid="${q.id}" data-field="observacion"
        style="${obsRequired ? 'border:2px solid #e4001b;' : ''}">${ans.observacion || ''}</textarea>
    </div>` : '';

  const fotos = ans.fotos || (ans.foto ? [ans.foto] : []);
  const valLower = (ans.valor || '').toLowerCase();
  const fotoByAnswer = valLower === 'no cumple' || valLower.includes('parcial');
  const fotoRequired = needsPhoto || fotoByAnswer;
  const fotoReqLabel = fotoRequired && fotos.length === 0
    ? '<div style="font-size:12px;color:#e4001b;font-weight:700;margin-top:4px">* Foto requerida</div>'
    : '';
  const fotosPreviewHtml = fotos.map((f, idx) => `
    <div class="photo-preview-wrap" style="margin-top:8px">
      <img class="photo-preview" src="${f.dataURL}" alt="foto ${idx + 1}">
      <button class="photo-remove" data-qid="${q.id}" data-fotoidx="${idx}">✕</button>
    </div>`).join('');
  const photoHtml = `
    <div class="photo-section">
      <button class="photo-btn ${fotoRequired ? 'required' : ''} ${fotos.length > 0 ? 'has-photo' : ''}"
        data-qid="${q.id}" id="photobtn_${q.id}">
        📷 ${fotos.length > 0
          ? fotos.length + ' foto' + (fotos.length !== 1 ? 's' : '') + ' ✓ &mdash; Agregar otra'
          : fotoRequired ? 'Foto requerida *' : 'Agregar foto'}
      </button>
      ${fotoReqLabel}
      <input type="file" accept="image/*" capture="environment"
        id="fileinput_${q.id}" data-qid="${q.id}" style="display:none">
      ${fotosPreviewHtml}
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
// HELPERS DE IMPORTANCIA (frontend)
// ============================================================
function impBg(imp) {
  const i = (imp || '').toLowerCase();
  if (i === 'critico' || i === 'crítico') return '#fff1f2';
  if (i === 'alta')  return '#fff7ed';
  if (i === 'media') return '#fffbeb';
  return '#f0fdf4';
}
function impColor(imp) {
  const i = (imp || '').toLowerCase();
  if (i === 'critico' || i === 'crítico') return '#e4001b';
  if (i === 'alta')  return '#ea580c';
  if (i === 'media') return '#d97706';
  return '#16a34a';
}

// ============================================================
// PANTALLA: INCUMPLIMIENTOS
// ============================================================
function renderIncumplimientos() {
  const items = [];
  state.categories.forEach(cat => {
    cat.questions.forEach(q => {
      const ans = state.answers[q.id] || {};
      const val = (ans.valor || '').toLowerCase();
      if (val.includes('no cumple') || val === 'nocumple' || val.includes('parcial')) {
        items.push({ q, ans, catName: cat.name });
      }
    });
  });

  const backBtn = `<button class="header-back" id="btn-back-incumpl">‹</button>`;

  if (!items.length) {
    return `
      <div class="header">${backBtn}
        <div style="flex:1"><div class="header-title">Incumplimientos</div>
        <div class="header-subtitle">${escHtml(state.local.nombre)}</div></div>
      </div>
      <div class="main" style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center">
        <div style="font-size:52px;margin-bottom:12px">✓</div>
        <div style="font-size:18px;font-weight:700;color:#16a34a;margin-bottom:8px">Sin incumplimientos registrados</div>
        <div style="font-size:14px;color:#64748b">Todos los puntos respondidos cumplen.</div>
        <button class="btn btn-outline" id="btn-back-incumpl" style="margin-top:24px">Volver</button>
      </div>`;
  }

  // Agrupar por categoría
  const byCat = {};
  const catOrder = [];
  items.forEach(item => {
    if (!byCat[item.catName]) { byCat[item.catName] = []; catOrder.push(item.catName); }
    byCat[item.catName].push(item);
  });

  const cardsHtml = catOrder.map(catName => {
    const filasHtml = byCat[catName].map(({ q, ans }) => {
      const val       = (ans.valor || '').toLowerCase();
      const isNC      = val.includes('no cumple') || val === 'nocumple';
      const resColor  = isNC ? '#e4001b' : '#d97706';
      const resBg     = isNC ? '#fff1f2' : '#fffbeb';
      const fotos     = ans.fotos || (ans.foto ? [ans.foto] : []);
      const fotosHtml = fotos.map(f =>
        `<img src="${f.dataURL}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;margin:4px 4px 0 0">`
      ).join('');
      return `
        <div style="background:${resBg};border-left:4px solid ${resColor};border-radius:8px;padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1">
              <div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">${escHtml(q.subcategoria)}</div>
              <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:6px">${escHtml(q.control)}</div>
              <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${resBg};border:1px solid ${resColor};color:${resColor};margin-bottom:6px">${escHtml(ans.valor)}</span>
              ${ans.observacion ? `<div style="font-size:13px;color:#555;font-style:italic;margin-top:4px">"${escHtml(ans.observacion)}"</div>` : ''}
            </div>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${impBg(q.importancia)};color:${impColor(q.importancia)};white-space:nowrap;flex-shrink:0">${escHtml(q.importancia)}</span>
          </div>
          ${fotosHtml ? `<div style="display:flex;flex-wrap:wrap;margin-top:4px">${fotosHtml}</div>` : ''}
        </div>`;
    }).join('');
    return `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #e2e8f0">${escHtml(catName)}</div>
        ${filasHtml}
      </div>`;
  }).join('');

  return `
    <div class="header">${backBtn}
      <div style="flex:1">
        <div class="header-title">Incumplimientos (${items.length})</div>
        <div class="header-subtitle">${escHtml(state.local.nombre)} · Revisión con acompañante</div>
      </div>
    </div>

    <div class="main" style="padding-bottom:80px">
      <div style="padding:8px 0 16px;font-size:13px;color:#64748b;text-align:center">
        Revisá estos puntos con el acompañante antes de enviar la auditoría.
      </div>
      ${cardsHtml}
    </div>

    <div class="nav-footer">
      <button class="btn btn-outline" id="btn-back-incumpl" style="width:100%">Volver</button>
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

    <div class="nav-footer" style="flex-direction:column;gap:8px">
      ${(() => {
        const cnt = state.categories.flatMap(c => c.questions).filter(q => {
          const v = (state.answers[q.id]?.valor || '').toLowerCase();
          return v.includes('no cumple') || v === 'nocumple' || v.includes('parcial');
        }).length;
        return cnt > 0
          ? `<button class="btn btn-outline" id="btn-ver-incumplimientos-summary" style="width:100%;color:#e4001b;border-color:#fca5a5">⚠ Revisar incumplimientos con acompañante (${cnt})</button>`
          : '';
      })()}
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-outline" id="btn-back-to-audit" style="flex:1">← Revisar</button>
        <button class="btn btn-primary" id="btn-submit" style="flex:2">Enviar ✓</button>
      </div>
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

  const unconfirmedBanner = state.sendUnconfirmed ? `
    <div style="background:#fff7ed;border:2px solid #f97316;border-radius:12px;padding:16px;margin:12px 0;text-align:left">
      <div style="font-weight:700;color:#c2410c;margin-bottom:6px">⚠ No se pudo confirmar la recepción</div>
      <p style="font-size:0.83rem;color:#92400e;margin:0 0 10px">El servidor no confirmó que guardó la auditoría. Puede deberse a conexión inestable. El borrador se mantuvo guardado.</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="btn-reenviar-audit" style="flex:1;font-size:0.85rem">Reenviar auditoría</button>
        <button class="btn btn-outline" id="btn-confirmar-igualmente" style="flex:1;font-size:0.85rem">Llegó igual, descartar</button>
      </div>
    </div>` : `<p class="success-sub">✓ Confirmado en el servidor.</p>`;

  return `
    <div class="screen-success">
      <div class="success-icon">${state.sendUnconfirmed ? '⚠' : '✓'}</div>
      <h1 class="success-title">${state.sendUnconfirmed ? 'Auditoría enviada' : '¡Auditoría enviada!'}</h1>
      ${puntajeHtml}
      ${unconfirmedBanner}
      ${!state.sendUnconfirmed && state.local?.emails ? `<p class="success-sub" style="font-size:0.85rem">📧 Informe enviado a ${escHtml(state.local.emails)}</p>` : ''}
      ${state.desviosRepetidos?.length ? `
        <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:12px;padding:16px;margin:16px 0;text-align:left">
          <div style="font-size:0.95rem;font-weight:700;color:#c2410c;margin-bottom:8px">🔁 Desvíos reiterados (${state.desviosRepetidos.length})</div>
          <p style="font-size:0.8rem;color:#92400e;margin:0 0 10px">Sin resolver en las últimas 3 auditorías:</p>
          ${state.desviosRepetidos.map(d => `<div style="font-size:0.82rem;padding:4px 0;border-bottom:1px solid #fed7aa;color:#1a1a1a;display:flex;justify-content:space-between;align-items:center"><span><strong>${escHtml(d.control)}</strong> <span style="color:#92400e">${escHtml(d.categoria)} › ${escHtml(d.subcategoria)}</span></span><span style="font-size:0.75rem;font-weight:700;color:${d.repeticiones>=2?'#e4001b':'#ea580c'}">${d.repeticiones>=2?'3 auditorías':'2 auditorías'}</span></div>`).join('')}
        </div>` : ''}
      <p class="success-id">ID: ${state.auditId}</p>
      ${!state.sendUnconfirmed ? `<button class="btn btn-primary btn-large" id="btn-new-audit">Nueva Auditoría</button>` : ''}
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
  // Login
  on('btn-login-submit', 'click', async () => {
    const email = (document.getElementById('inp-login-email')?.value || '').trim().toLowerCase();
    const pwd   =  document.getElementById('inp-login-pwd')?.value || '';
    const errEl =  document.getElementById('login-error');
    if (!email || !pwd) { if (errEl) errEl.textContent = 'Completá email y contraseña.'; return; }
    const btn = document.getElementById('btn-login-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Ingresando...'; }
    try {
      const hash = await hashPwd(pwd);
      const res  = await callAPI({ action: 'login', email, hash });
      if (!res.success) {
        if (errEl) errEl.textContent = res.error === 'Contraseña incorrecta' ? 'Contraseña incorrecta.' : res.error === 'Usuario no encontrado' ? 'Usuario no encontrado.' : res.error || 'Error al iniciar sesión.';
        if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
        return;
      }
      const userData = Object.assign({}, res.user, { token: hash });
      if (res.user.primerLogin) {
        state.user = userData;
        setState({ screen: 'change-password' });
      } else {
        saveSession(userData);
        state.user         = userData;
        state.auditor      = userData.nombre;
        state.auditorEmail = userData.email;
        setState({ screen: userData.rol === 'Admin' ? 'admin' : 'welcome', adminTab: 'menu' });
      }
    } catch(err) {
      if (errEl) errEl.textContent = 'Error de conexión. Intentá de nuevo.';
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    }
  });

  // Enter en campo de contraseña activa login
  const inpLoginPwd = document.getElementById('inp-login-pwd');
  if (inpLoginPwd) inpLoginPwd.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-login-submit')?.click(); });

  // Olvidé mi contraseña
  on('btn-show-forgot', 'click', () => setState({ loginShowForgot: true }));
  on('btn-forgot-back', 'click', () => setState({ loginShowForgot: false }));
  on('btn-forgot-submit', 'click', async () => {
    const email = (document.getElementById('inp-forgot-email')?.value || '').trim().toLowerCase();
    const msgEl = document.getElementById('forgot-msg');
    if (!email) { if (msgEl) { msgEl.style.color='#ef4444'; msgEl.textContent='Ingresá tu email.'; } return; }
    const btn = document.getElementById('btn-forgot-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      const res = await callAPI({ action: 'forgotPassword', email });
      if (res.success) {
        if (msgEl) { msgEl.style.color='#16a34a'; msgEl.textContent='Email enviado. Revisá tu casilla y seguí las instrucciones.'; }
        if (btn) btn.textContent = 'Enviado ✓';
      } else {
        if (msgEl) { msgEl.style.color='#ef4444'; msgEl.textContent = res.error || 'Error al enviar.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar email'; }
      }
    } catch(e) {
      if (msgEl) { msgEl.style.color='#ef4444'; msgEl.textContent='Error de conexión.'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar email'; }
    }
  });

  // Cambio de contraseña
  on('btn-changepwd-submit', 'click', async () => {
    const pwd1  = document.getElementById('inp-newpwd')?.value  || '';
    const pwd2  = document.getElementById('inp-newpwd2')?.value || '';
    const errEl = document.getElementById('changepwd-error');
    if (pwd1.length < 6) { if (errEl) errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (pwd1 !== pwd2)   { if (errEl) errEl.textContent = 'Las contraseñas no coinciden.'; return; }
    const btn = document.getElementById('btn-changepwd-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    try {
      const oldHash = state.user.token;
      const newHash = await hashPwd(pwd1);
      const res = await callAPI({ action: 'changePassword', email: state.user.email, oldHash, newHash });
      if (!res.success) {
        if (errEl) errEl.textContent = res.error || 'Error al cambiar la contraseña.';
        if (btn) { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; }
        return;
      }
      const updatedUser = Object.assign({}, state.user, { token: newHash, primerLogin: false });
      saveSession(updatedUser);
      state.user         = updatedUser;
      state.auditor      = updatedUser.nombre;
      state.auditorEmail = updatedUser.email;
      setState({ screen: updatedUser.rol === 'Admin' ? 'admin' : 'welcome', adminTab: 'menu' });
    } catch(err) {
      if (errEl) errEl.textContent = 'Error de conexión. Intentá de nuevo.';
      if (btn) { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; }
    }
  });

  // Logout
  on('btn-logout', 'click', () => {
    if (confirm('¿Cerrar sesión?')) logout();
  });

  // Helpers para recargar datos de admin
  async function recargarUsuarios() {
    state.adminLoading = true; render();
    try {
      const res = await callAPI({ action: 'getUsuarios', adminEmail: state.user.email, adminToken: state.user.token });
      state.adminUsers   = res.usuarios || [];
      state.adminLoading = false;
      state.adminError   = res.success ? '' : (res.error || 'Error al cargar usuarios.');
    } catch(e) { state.adminLoading = false; state.adminError = 'Error de conexión.'; }
    render();
  }
  async function recargarLocales() {
    state.adminLocalesLoading = true; render();
    try {
      const res = await callAPI({ action: 'getLocales', adminEmail: state.user.email, adminToken: state.user.token });
      state.adminLocales        = res.locales || [];
      state.adminLocalesLoading = false;
      state.adminLocalesError   = res.success ? '' : (res.error || 'Error al cargar locales.');
    } catch(e) { state.adminLocalesLoading = false; state.adminLocalesError = 'Error de conexión.'; }
    render();
  }

  // Ir a admin
  on('btn-go-admin', 'click', () => setState({ screen: 'admin', adminTab: 'menu' }));

  on('btn-admin-back', 'click', () => {
    if (state.adminTab === 'menu') { setState({ screen: 'welcome' }); return; }
    setState({ adminTab: 'menu', adminShowCreateUser: false, adminShowCreateLocal: false,
               adminSearch: '', adminLocalesSearch: '', adminEditingUserEmail: null, adminEditingLocalIdx: null });
  });

  // Menu cards + bottom nav → usuarios
  async function goToUsuarios() {
    state.screen = 'admin'; state.adminTab = 'usuarios'; state.adminShowCreateUser = false; state.adminEditingUserEmail = null; state.adminSearch = '';
    render();
    if (!state.adminUsers.length) await recargarUsuarios();
  }
  async function goToLocales() {
    state.screen = 'admin'; state.adminTab = 'locales'; state.adminShowCreateLocal = false; state.adminEditingLocalIdx = null; state.adminLocalesSearch = '';
    render();
    if (!state.adminLocales.length) await recargarLocales();
  }

  on('btn-admin-go-usuarios',  'click', goToUsuarios);
  on('btn-admin-go-locales',   'click', goToLocales);
  on('nav-admin-inicio',       'click', () => setState({ screen: 'admin', adminTab: 'menu', adminShowCreateUser: false, adminShowCreateLocal: false }));
  on('nav-admin-usuarios',     'click', goToUsuarios);
  on('nav-admin-locales',      'click', goToLocales);
  on('nav-admin-auditoria',    'click', () => setState({ screen: 'setup' }));

  // New user / new local toggle
  on('btn-admin-new-user', 'click', async () => {
    setState({ adminShowCreateUser: true });
    if (!state.adminLocales.length) await recargarLocales();
  });
  on('btn-admin-cancel-create', 'click', () => setState({ adminShowCreateUser: false }));
  on('btn-admin-new-local', 'click', () => setState({ adminShowCreateLocal: true }));
  on('btn-admin-cancel-create-loc', 'click', () => setState({ adminShowCreateLocal: false }));

  // Buscadores — restaurar foco después del render para no interrumpir la escritura
  const inpSearch = document.getElementById('inp-admin-search');
  if (inpSearch) inpSearch.addEventListener('input', () => {
    const val = inpSearch.value; const pos = inpSearch.selectionStart;
    state.adminSearch = val; render();
    const el = document.getElementById('inp-admin-search');
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch(e){} }
  });
  const inpLocSearch = document.getElementById('inp-locales-search');
  if (inpLocSearch) inpLocSearch.addEventListener('input', () => {
    const val = inpLocSearch.value; const pos = inpLocSearch.selectionStart;
    state.adminLocalesSearch = val; render();
    const el = document.getElementById('inp-locales-search');
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch(e){} }
  });

  // Admin: crear usuario
  on('btn-admin-create', 'click', async () => {
    const nombre  = (document.getElementById('inp-admin-nombre')?.value  || '').trim();
    const email   = (document.getElementById('inp-admin-email')?.value   || '').trim().toLowerCase();
    const rol     =  document.getElementById('sel-admin-rol')?.value     || 'Auditor';
    const locales = getSelectedLocalesFromDOM();
    const errEl   =  document.getElementById('admin-create-error');
    if (!nombre || !email) { if (errEl) { errEl.style.color='#ef4444'; errEl.textContent = 'Completá nombre y email.'; } return; }
    const btn = document.getElementById('btn-admin-create');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    try {
      const res = await callAPI({ action: 'crearUsuario', adminEmail: state.user.email, adminToken: state.user.token, nombre, email, rol, locales });
      if (res.success) {
        if (errEl) { errEl.style.color = '#16a34a'; errEl.textContent = 'Usuario creado. Se envió un email con la contraseña temporal.'; }
        document.getElementById('inp-admin-nombre').value  = '';
        document.getElementById('inp-admin-email').value   = '';
        document.getElementById('inp-admin-locales').value = '';
        await recargarUsuarios();
      } else {
        if (errEl) { errEl.style.color = '#ef4444'; errEl.textContent = res.error || 'Error al crear usuario.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Crear y enviar email'; }
        render();
      }
    } catch(e) {
      if (errEl) { errEl.style.color = '#ef4444'; errEl.textContent = 'Error de conexión.'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Crear y enviar email'; }
      render();
    }
  });

  // Admin: acciones por usuario
  document.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action      = btn.dataset.adminAction;
      const targetEmail = btn.dataset.email;
      if (action === 'expand') {
        const already = state.adminExpandedUserEmail === targetEmail;
        state.adminExpandedUserEmail = already ? null : targetEmail;
        state.adminEditingUserEmail = null; render();
      } else if (action === 'edit-open') {
        state.adminEditingUserEmail = targetEmail; state.adminExpandedUserEmail = null; render();
        if (!state.adminLocales.length) recargarLocales();
      } else if (action === 'edit-cancel') {
        state.adminEditingUserEmail = null; state.adminExpandedUserEmail = targetEmail; render();
      } else if (action === 'edit-save') {
        const nombre  = (document.getElementById('edit-usr-nombre')?.value || '').trim();
        const rol     =  document.getElementById('edit-usr-rol')?.value    || '';
        const locales = getSelectedLocalesFromDOM();
        const errEl   =  document.getElementById('edit-usr-error');
        if (!nombre) { if (errEl) errEl.textContent = 'El nombre no puede estar vacío.'; return; }
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'editarUsuario', adminEmail: state.user.email, adminToken: state.user.token, targetEmail, nombre, rol, locales });
          if (res.success) { state.adminEditingUserEmail = null; await recargarUsuarios(); }
          else { if (errEl) errEl.textContent = res.error || 'Error.'; btn.disabled = false; }
        } catch(e) { if (errEl) errEl.textContent = 'Error de conexión.'; btn.disabled = false; }
      } else if (action === 'reset') {
        if (!confirm('¿Resetear la contraseña de ' + targetEmail + '? Se le enviará un email.')) return;
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'resetPassword', adminEmail: state.user.email, adminToken: state.user.token, targetEmail });
          alert(res.success ? 'Contraseña reseteada y email enviado.' : res.error || 'Error.');
        } catch(e) { alert('Error de conexión.'); }
        btn.disabled = false;
      } else if (action === 'baja') {
        if (!confirm('¿Dar de baja a ' + targetEmail + '?')) return;
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'darDeBaja', adminEmail: state.user.email, adminToken: state.user.token, targetEmail });
          if (res.success) await recargarUsuarios();
          else { alert(res.error || 'Error.'); btn.disabled = false; }
        } catch(e) { alert('Error de conexión.'); btn.disabled = false; }
      } else if (action === 'reactivar') {
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'reactivarUsuario', adminEmail: state.user.email, adminToken: state.user.token, targetEmail });
          if (res.success) await recargarUsuarios();
          else { alert(res.error || 'Error.'); btn.disabled = false; }
        } catch(e) { alert('Error de conexión.'); btn.disabled = false; }
      }
    });
  });

  // Admin: crear local
  on('btn-loc-create', 'click', async () => {
    const nombre  = (document.getElementById('inp-loc-nombre')?.value  || '').trim();
    const isCausa =  document.getElementById('sel-loc-causa')?.value   || 'false';
    const emails  = (document.getElementById('inp-loc-emails')?.value  || '').trim();
    const errEl   =  document.getElementById('admin-loc-create-error');
    if (!nombre) { if (errEl) { errEl.style.color='#ef4444'; errEl.textContent = 'Ingresá el nombre del local.'; } return; }
    const btn = document.getElementById('btn-loc-create');
    if (btn) { btn.disabled = true; btn.textContent = 'Agregando...'; }
    try {
      const res = await callAPI({ action: 'crearLocal', adminEmail: state.user.email, adminToken: state.user.token, nombre, isCausa, emails });
      if (res.success) {
        document.getElementById('inp-loc-nombre').value = '';
        document.getElementById('inp-loc-emails').value = '';
        await recargarLocales();
      } else {
        if (errEl) { errEl.style.color='#ef4444'; errEl.textContent = res.error || 'Error.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Agregar local'; }
        render();
      }
    } catch(e) {
      if (errEl) { errEl.style.color='#ef4444'; errEl.textContent = 'Error de conexión.'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Agregar local'; }
      render();
    }
  });

  // Admin: acciones por local
  document.querySelectorAll('[data-loc-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.locAction;
      const idx    = parseInt(btn.dataset.idx);
      if (action === 'add-email-open') {
        state.adminAddEmailLocalIdx = idx; render();
        document.getElementById('inp-add-email')?.focus();
      } else if (action === 'add-email-cancel') {
        state.adminAddEmailLocalIdx = null; render();
      } else if (action === 'add-email-save') {
        const newEmail = (document.getElementById('inp-add-email')?.value || '').trim().toLowerCase();
        if (!newEmail) return;
        const loc = (state.adminLocales||[]).find(l => l.idx === idx);
        if (!loc) return;
        const current = loc.emails ? loc.emails.split(',').map(e => e.trim()).filter(Boolean) : [];
        if (current.includes(newEmail)) { alert('Ese email ya está en la lista.'); return; }
        current.push(newEmail);
        const emails = current.join(', ');
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'updateLocal', adminEmail: state.user.email, adminToken: state.user.token, idx, nombre: loc.nombre, isCausa: loc.isCausa, emails });
          if (res.success) { state.adminAddEmailLocalIdx = null; await recargarLocales(); }
          else { alert(res.error || 'Error.'); btn.disabled = false; }
        } catch(e) { alert('Error de conexión.'); btn.disabled = false; }
      } else if (action === 'expand') {
        const already = state.adminExpandedLocalIdx === idx;
        state.adminExpandedLocalIdx = already ? null : idx;
        state.adminAddEmailLocalIdx = null;
        state.adminEditingLocalIdx = null; render();
      } else if (action === 'edit') {
        state.adminEditingLocalIdx = idx; state.adminExpandedLocalIdx = null; render();
      } else if (action === 'cancel') {
        state.adminEditingLocalIdx = null; state.adminExpandedLocalIdx = idx; render();
      } else if (action === 'save') {
        const nombre  = (document.getElementById('edit-loc-nombre')?.value  || '').trim();
        const isCausa =  document.getElementById('edit-loc-causa')?.value   || 'false';
        const emails  = (document.getElementById('edit-loc-emails')?.value  || '').trim();
        const errEl   =  document.getElementById('edit-loc-error');
        if (!nombre) { if (errEl) errEl.textContent = 'El nombre no puede estar vacío.'; return; }
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'updateLocal', adminEmail: state.user.email, adminToken: state.user.token, idx, nombre, isCausa, emails });
          if (res.success) { state.adminEditingLocalIdx = null; await recargarLocales(); }
          else { if (errEl) errEl.textContent = res.error || 'Error.'; btn.disabled = false; }
        } catch(e) { if (errEl) errEl.textContent = 'Error de conexión.'; btn.disabled = false; }
      } else if (action === 'delete') {
        const nombre = btn.dataset.nombre || '';
        if (!confirm('¿Eliminar el local "' + nombre + '"? Esta acción no se puede deshacer.')) return;
        btn.disabled = true;
        try {
          const res = await callAPI({ action: 'eliminarLocal', adminEmail: state.user.email, adminToken: state.user.token, idx });
          if (res.success) await recargarLocales();
          else { alert(res.error || 'Error.'); btn.disabled = false; }
        } catch(e) { alert('Error de conexión.'); btn.disabled = false; }
      }
    });
  });

  on('btn-go-setup',    'click', () => setState({ screen: 'setup' }));
  on('btn-back-welcome','click', () => {
    const backScreen = state.user?.rol === 'Admin' ? 'admin' : 'welcome';
    setState({ screen: backScreen, adminTab: 'menu' });
  });

  // Borrar auditoría (aparece en cat-select y en header de audit)
  on('btn-borrar-auditoria',   'click', borrarAuditoria);
  on('btn-borrar-audit-header','click', borrarAuditoria);

  // Cat-select: tarjetas de categoría
  document.querySelectorAll('.cat-select-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci  = parseInt(btn.dataset.ci);
      const cat = state.categories[ci];
      // Empezar en la primera pregunta sin responder (o skipped), sino en la primera
      let startQ = 0;
      const firstPending = cat.questions.findIndex(q => !state.answers[q.id]?.valor || state.skipped[q.id]);
      if (firstPending !== -1) startQ = firstPending;
      setState({ screen: 'audit', categoryIndex: ci, questionIndex: startQ });
    });
  });

  // Incumplimientos
  on('btn-ver-incumplimientos', 'click', () => {
    state.returnScreen = 'cat-select';
    setState({ screen: 'incumplimientos' });
  });
  on('btn-ver-incumplimientos-summary', 'click', () => {
    state.returnScreen = 'summary';
    setState({ screen: 'incumplimientos' });
  });
  on('btn-back-incumpl', 'click', () => setState({ screen: state.returnScreen || 'cat-select' }));

  // Cat-select: volver a setup, ver resumen
  on('btn-back-to-setup', 'click', () => {
    if (confirm('¿Volver a la configuración? El progreso se mantiene guardado.')) {
      setState({ screen: 'setup' });
    }
  });
  on('btn-go-summary', 'click', () => setState({ screen: 'summary' }));

  // Audit: volver a cat-select (header y footer)
  on('btn-back-to-cats',        'click', () => { saveCurrentAnswer(); setState({ screen: 'cat-select' }); });
  on('btn-back-to-cats-footer', 'click', () => { saveCurrentAnswer(); setState({ screen: 'cat-select' }); });

  // Borrador
  on('btn-draft-continue', 'click', () => {
    try {
      const raw = localStorage.getItem('audit_draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft.local) return;
      const cats = buildCategories(draft.local.isCausa);
      Object.assign(state, {
        auditor:             draft.auditor             || state.auditor,
        auditorEmail:        draft.auditorEmail        || state.auditorEmail,
        acompanante:         draft.acompanante         || '',
        posicionAcompanante: draft.posicionAcompanante || '',
        local:               draft.local,
        fecha:               draft.fecha               || state.fecha,
        categories:          cats,
        categoryIndex:       draft.categoryIndex       || 0,
        questionIndex:       draft.questionIndex       || 0,
        answers:             draft.answers             || {},
        skipped:             draft.skipped             || {},
        screen:              'cat-select',
      });
      render();
    } catch(e) {
      alert('No se pudo restaurar el borrador.');
    }
  });
  on('btn-draft-discard', 'click', () => {
    borrarBorrador();
    render();
  });

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

  const inpAcompanante = document.getElementById('inp-acompanante');
  if (inpAcompanante) inpAcompanante.addEventListener('input', () => { state.acompanante = inpAcompanante.value; });

  const selPosicion = document.getElementById('sel-posicion-acomp');
  if (selPosicion) selPosicion.addEventListener('change', () => { state.posicionAcompanante = selPosicion.value; });

  const inpFecha = document.getElementById('inp-fecha');
  if (inpFecha) inpFecha.addEventListener('change', () => { state.fecha = inpFecha.value; });

  on('btn-start-audit', 'click', () => {
    // Leer valores actuales
    if (selLocal)       state.local               = state.locales.find(l => l.nombre === selLocal.value) || state.local;
    if (inpAuditor)     state.auditor             = inpAuditor.value     || state.auditor;
    if (inpAcompanante) state.acompanante         = inpAcompanante.value || state.acompanante;
    if (selPosicion)    state.posicionAcompanante = selPosicion.value    || state.posicionAcompanante;
    if (inpFecha)       state.fecha               = inpFecha.value       || state.fecha;

    if (!state.local)   return alert('Seleccioná un local.');
    if (!state.auditor) return alert('Ingresá el nombre del auditor.');

    const cats = buildCategories(state.local.isCausa);
    if (!cats.length) return alert('No se encontraron preguntas para este local.');

    setState({ categories: cats, categoryIndex: 0, questionIndex: 0, answers: {}, skipped: {}, screen: 'cat-select' });
  });

  // Navegación pregunta a pregunta
  on('btn-next-q', 'click', nextQuestion);
  on('btn-prev-q', 'click', prevQuestion);
  on('btn-prev-q-footer', 'click', prevQuestion);
  on('btn-skip-q', 'click', skipQuestion);
  on('btn-go-first-skipped', 'click', goToFirstSkipped);
  on('skipped-badge', 'click', goToFirstSkipped);

  // Volver a cat-select desde summary
  on('btn-back-to-audit', 'click', () => setState({ screen: 'cat-select' }));

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
      guardarBorrador();
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
      if (!state.answers[qid].fotos) state.answers[qid].fotos = [];
      state.answers[qid].fotos.push({ dataURL, name: file.name });
      guardarBorrador();
      render();
    });
  });

  document.querySelectorAll('.photo-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const qid = btn.dataset.qid;
      const idx = parseInt(btn.dataset.fotoidx);
      if (state.answers[qid]?.fotos) state.answers[qid].fotos.splice(idx, 1);
      guardarBorrador();
      render();
    });
  });

  on('btn-reenviar-audit', 'click', () => {
    setState({ screen: 'summary' });
  });
  on('btn-confirmar-igualmente', 'click', () => {
    borrarBorrador();
    setState({ screen: 'success', sendUnconfirmed: false });
  });

  on('btn-submit',    'click', submitAudit);
  on('btn-new-audit', 'click', () => {
    Object.assign(state, {
      screen: 'welcome', local: null, acompanante: '', posicionAcompanante: '',
      categories: [], categoryIndex: 0, questionIndex: 0,
      answers: {}, skipped: {}, auditId: '', error: '', submitting: false,
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

  const cat0 = state.categories[state.categoryIndex];
  const q0   = cat0.questions[state.questionIndex];
  const ans0 = state.answers[q0.id] || {};
  const val0 = (ans0.valor || '').toLowerCase();

  // Solo validar reglas condicionales si hay una respuesta
  if (val0 === 'no cumple' || val0.includes('parcial')) {
    if (!(ans0.observacion || '').trim()) {
      alert('La observación es obligatoria cuando la respuesta es "No cumple" o parcial.');
      return;
    }
  }

  // Validar foto obligatoria si No cumple / Parcial
  if (val0 === 'no cumple' || val0.includes('parcial')) {
    const fotos0 = ans0.fotos || (ans0.foto ? [ans0.foto] : []);
    if (!fotos0.length) {
      alert('La foto es obligatoria cuando la respuesta es "No cumple" o parcial.');
      return;
    }
  }


  // Remover de skipped si estaba salteada
  if (state.skipped[q0.id]) delete state.skipped[q0.id];

  const cat = state.categories[state.categoryIndex];
  if (state.questionIndex < cat.questions.length - 1) {
    setState({ questionIndex: state.questionIndex + 1 });
  } else {
    setState({ screen: 'cat-select' });
  }
  guardarBorrador();
}

function prevQuestion() {
  saveCurrentAnswer();
  if (state.questionIndex > 0) {
    setState({ questionIndex: state.questionIndex - 1 });
  } else {
    setState({ screen: 'cat-select' });
  }
}

function skipQuestion() {
  saveCurrentAnswer();
  const cat = state.categories[state.categoryIndex];
  const q   = cat.questions[state.questionIndex];
  state.skipped[q.id] = true;

  const totalQsInCat = cat.questions.length;
  if (state.questionIndex < totalQsInCat - 1) {
    setState({ questionIndex: state.questionIndex + 1 });
  } else {
    setState({ screen: 'cat-select' });
  }
  guardarBorrador();
}

function goToFirstSkipped() {
  const skippedIds = Object.keys(state.skipped);
  if (!skippedIds.length) return;
  for (let ci = 0; ci < state.categories.length; ci++) {
    const cat = state.categories[ci];
    for (let qi = 0; qi < cat.questions.length; qi++) {
      if (state.skipped[cat.questions[qi].id]) {
        setState({ categoryIndex: ci, questionIndex: qi });
        return;
      }
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
// BORRADOR (auto-guardado)
// ============================================================
function guardarBorrador() {
  if (!state.local || state.screen === 'success') return;
  try {
    const draft = {
      ts:                  Date.now(),
      auditor:             state.auditor,
      auditorEmail:        state.auditorEmail,
      acompanante:         state.acompanante,
      posicionAcompanante: state.posicionAcompanante,
      local:               state.local,
      fecha:               state.fecha,
      categoryIndex:       state.categoryIndex,
      questionIndex:       state.questionIndex,
      answers:             state.answers,
      skipped:             state.skipped,
    };
    const json = JSON.stringify(draft);
    // Si supera ~4MB, guardar sin fotos
    if (json.length > 4 * 1024 * 1024) {
      const answersSinFotos = {};
      Object.keys(draft.answers).forEach(qid => {
        const a = Object.assign({}, draft.answers[qid]);
        delete a.foto;
        delete a.fotos;
        answersSinFotos[qid] = a;
      });
      draft.answers = answersSinFotos;
      localStorage.setItem('audit_draft', JSON.stringify(draft));
    } else {
      localStorage.setItem('audit_draft', json);
    }
  } catch(e) {}
}

function borrarBorrador() {
  try { localStorage.removeItem('audit_draft'); } catch(e) {}
}

// ============================================================
// ENVIAR AUDITORÍA
// ============================================================
async function submitAudit() {
  const auditId = `AUD_${state.local.nombre.replace(/\s+/g,'_')}_${Date.now()}`;

  const allQs = state.categories.flatMap(c => c.questions);
  const respuestas = allQs.map(q => {
    const ans   = state.answers[q.id] || {};
    const fotos = ans.fotos || (ans.foto ? [ans.foto] : []);
    return {
      marca:        q.marca,
      categoria:    q.categoria,
      subcategoria: q.subcategoria,
      control:      q.control,
      importancia:  q.importancia,
      explicacion:  q.explicacion,
      respuesta:    ans.valor       || '',
      observacion:  ans.observacion || '',
      fotosBase64:  fotos
        .filter(f => f.dataURL)
        .map(f => ({ base64: f.dataURL.split(',')[1], nombre: f.name || 'foto.jpg' })),
    };
  });

  const allQsForScore = state.categories.flatMap(c => c.questions);
  const puntaje = calcularPuntaje(allQsForScore, state.answers);

  const payload = {
    auditId,
    fecha:        state.fecha,
    hora:         new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    auditor:      state.auditor,
    auditorEmail: state.auditorEmail,
    acompanante:         state.acompanante         || '',
    posicionAcompanante: state.posicionAcompanante || '',
    local:               state.local.nombre,
    marca:        state.local.isCausa ? 'Multimarca + Causa' : 'Multimarca',
    emailsLocal:  state.local.emails,
    tipoAuditoria: state.user?.rol === 'Franquiciado' ? 'Interna' : 'Oficial',
    puntaje:      { pct: puntaje.pct, nivel: puntaje.nivel, obtenido: puntaje.obtenido, posible: puntaje.posible, reprobado: puntaje.reprobado },
    respuestas,
  };

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="spinner"></div><div class="overlay-text">Enviando auditoría...</div>`;
  document.body.appendChild(overlay);

  try {
    // Enviar la auditoría (no-cors: no podemos leer la respuesta)
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 45000);
    const sendStart  = Date.now();
    try {
      await fetch(CONFIG.appsScriptURL, {
        method: 'POST',
        body:   JSON.stringify(payload),
        mode:   'no-cors',
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name !== 'AbortError') throw fetchErr;
      // AbortError: solo continuar si el request estuvo en vuelo bastante tiempo
      // (< 3s probablemente fue rechazado antes de llegar al servidor)
      if (Date.now() - sendStart < 3000) {
        throw new Error('La auditoría no pudo enviarse. Verificá tu conexión e intentá de nuevo.');
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Verificar con GET que el auditId quedó guardado en el sheet (hasta 4 intentos, 6s entre c/u)
    overlay.querySelector('.overlay-text').textContent = 'Verificando que llegó al servidor...';
    let confirmed = false;
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 6000));
      try {
        const vRes = await callAPI({ action: 'verificarAudit', auditId });
        if (vRes.found) { confirmed = true; break; }
      } catch(e) { /* red inestable, reintentar */ }
    }

    if (confirmed) {
      setState({ screen: 'success', auditId, emailStatus: '', lastPuntaje: puntaje, desviosRepetidos: [] });
      borrarBorrador();
    } else {
      // El POST llegó (o creemos que sí) pero no aparece en el sheet todavía
      setState({ screen: 'success', auditId, emailStatus: '', lastPuntaje: puntaje, desviosRepetidos: [], sendUnconfirmed: true });
      // NO borramos el borrador — el usuario puede reenviar si es necesario
    }
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
