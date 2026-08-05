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

  historial:              null,
  historialLoading:       false,
  historialError:         '',
  historialSearch:        '',
  historialBorradoMsg:    '',
  historialDetalle:       null,
  historialDetalleLoading: false,
  historialDetalleError:  '',
  historialBorrando:      false,
  historialAccionando:    '',
  editingAuditId:         '',

  dashboard:              null,
  dashboardLoading:       false,
  dashboardError:         '',
  dashboardLocal:         '',
  dashboardTipo:          'Oficial',
  dashboardView:          'local',
  dashboardRankingPeriod: 'mesActual',

  historialTipo:          '',
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
      setTimeout(recargarHistorialSilente, 800);
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
      validacion:   (r[10] || '').trim(),
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

function parseValidacion(v) {
  if (!v) return null;
  const parts = v.split('|');
  const tipo = parts[0].toLowerCase();
  if (tipo === 'headcount') return { tipo: 'headcount' };
  if (tipo === 'fecha') return { tipo: 'fecha', allowNA: parts.includes('NA') };
  if (tipo === 'numero') {
    const allowNA = parts.includes('NA');
    let cumple = null, parcial = null;
    parts.forEach(p => {
      if (p.startsWith('C:')) {
        const [,a,b] = p.split(':');
        cumple = { min: a === '*' ? null : parseFloat(a), max: b === undefined ? null : parseFloat(b) };
      } else if (p.startsWith('P:')) {
        const [,a,b] = p.split(':');
        parcial = { min: parseFloat(a), max: parseFloat(b) };
      }
    });
    return { tipo: 'numero', cumple, parcial, allowNA };
  }
  return null;
}

function evaluarNumero(val, regla) {
  if (!regla || regla.tipo !== 'numero') return null;
  const n = parseFloat(String(val).replace(',', '.'));
  if (isNaN(n)) return null;
  const { cumple, parcial } = regla;
  if (cumple) {
    const okMin = cumple.min === null || n >= cumple.min;
    const okMax = cumple.max === null || n <= cumple.max;
    if (okMin && okMax) return 'Cumple';
  }
  if (parcial) {
    const okMin = n >= parcial.min;
    const okMax = n <= parcial.max;
    if (okMin && okMax) return 'Cumple parcialmente';
  }
  return 'No Cumple';
}

function evaluarFecha(val) {
  if (!val) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fecha = new Date(val + 'T00:00:00');
  if (isNaN(fecha.getTime())) return null;
  if (fecha < hoy) return { resultado: 'No Cumple', advertencia: null };
  const tresMeses = new Date(hoy); tresMeses.setMonth(tresMeses.getMonth() + 3);
  if (fecha <= tresMeses) return { resultado: 'Cumple', advertencia: 'Próximo a vencer' };
  return { resultado: 'Cumple', advertencia: null };
}

// Restaura el estado de respuesta de una pregunta a partir de una fila del historial
function restoreAnswerFromRow(q, row) {
  const regla = parseValidacion(q.validacion || '');
  const ans = { valor: row.respuesta || '', observacion: row.observacion || '' };
  if (regla && regla.tipo === 'numero') {
    ans.rawValor = row.rawValor || '';
    // Si rawValor existe, recalcular valor (por si el rango cambió); si no, mantener respuesta
    if (ans.rawValor) ans.valor = evaluarNumero(ans.rawValor, regla) || ans.rawValor;
  } else if (regla && regla.tipo === 'fecha') {
    ans.fechaRaw = row.rawValor || '';
    if (ans.fechaRaw) {
      const ev = evaluarFecha(ans.fechaRaw);
      ans.valor = ev ? ev.resultado : ans.fechaRaw;
    }
  } else if (regla && regla.tipo === 'headcount') {
    // observacion tiene "salon: 3 | cocina: 2" — restaurar headcount object
    ans.valor = 'N/A';
    if (row.observacion) {
      ans.headcount = {};
      row.observacion.split('|').forEach(part => {
        const [k, v] = part.split(':').map(s => s.trim());
        if (k && v !== undefined) ans.headcount[k.replace(/ /g, '_')] = v;
      });
    }
  }
  return ans;
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
    const regla = parseValidacion(q.validacion || '');
    // Solo puntúan: radio, número con validación y fecha con validación
    const tieneValidacion = regla && (regla.tipo === 'numero' || regla.tipo === 'fecha');
    if (type !== 'radio' && !tieneValidacion) return;
    // headcount nunca puntúa
    if (regla && regla.tipo === 'headcount') return;

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
  const app    = document.getElementById('app');
  const hasNav = !!state.user && !NO_NAV_SCREENS.has(state.screen);
  document.body.classList.toggle('admin-nav', hasNav);
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
    case 'historial':         app.innerHTML = renderHistorial();         break;
    case 'historial-detalle': app.innerHTML = renderHistorialDetalle();  break;
    case 'dashboard':         app.innerHTML = renderDashboard();         break;
    case 'error':            app.innerHTML = renderError();            break;
  }
  if (hasNav) {
    app.insertAdjacentHTML('beforeend',
      state.user.rol === 'Admin' ? renderAdminBottomNav() : renderUserBottomNav()
    );
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
      const isUnconfirmed = !!localStorage.getItem('audit_unconfirmed');
      if (age < 259200000 && draft.local && draft.local.nombre) { // 72h window
        const tsStr = draft.ts ? new Date(draft.ts).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        if (isUnconfirmed) {
          draftBanner = `
            <div id="draft-banner" style="background:#fff1f2;border:2px solid #e4001b;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;width:100%;box-sizing:border-box">
              <div style="font-size:0.9rem;font-weight:700;color:#b80015;margin-bottom:4px">⚠ Auditoría enviada sin confirmar</div>
              <div style="font-size:0.85rem;color:#1a1a1a;margin-bottom:4px">
                <strong>${escHtml(draft.local.nombre)}</strong> &mdash; ${escHtml(draft.fecha || '')}
              </div>
              <div style="font-size:0.78rem;color:#6b7280;margin-bottom:12px">El servidor no confirmó la recepción. Puede que igual haya llegado.</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-danger" id="btn-draft-reenviar" style="flex:1;font-size:0.82rem;min-width:120px">Reenviar ahora</button>
                <button class="btn btn-outline" id="btn-draft-export" style="flex:1;font-size:0.82rem;min-width:100px">Exportar datos</button>
                <button class="btn" id="btn-confirmar-igualmente" style="flex:1;font-size:0.82rem;min-width:100px;border:1px solid #d1d5db;color:#6b7280">Llegó igual</button>
              </div>
            </div>`;
        } else {
          draftBanner = `
            <div id="draft-banner" style="background:#fffbeb;border:2px solid #f97316;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;width:100%;box-sizing:border-box">
              <div style="font-size:0.9rem;font-weight:700;color:#92400e;margin-bottom:4px">Auditoría incompleta guardada</div>
              <div style="font-size:0.85rem;color:#1a1a1a;margin-bottom:4px">
                <strong>${escHtml(draft.local.nombre)}</strong> &mdash; ${escHtml(draft.fecha || '')}
              </div>
              ${tsStr ? `<div style="font-size:0.78rem;color:#6b7280;margin-bottom:12px">Guardada: ${tsStr}</div>` : '<div style="margin-bottom:12px"></div>'}
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary" id="btn-draft-continue" style="flex:1;font-size:0.85rem">Continuar</button>
                <button class="btn btn-outline" id="btn-draft-export" style="flex:1;font-size:0.85rem">Exportar</button>
                <button class="btn btn-ghost" id="btn-draft-discard" style="flex:1;font-size:0.85rem;border:1px solid #d1d5db">Descartar</button>
              </div>
            </div>`;
        }
      }
    }
  } catch(e) {}

  return `
    <div class="screen-welcome">
      <img src="logo.png" alt="Sushi POP" class="welcome-logo" onerror="this.style.display='none'">
      <h1 class="welcome-title">Sistema de Auditorías</h1>
      ${u ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${rolBadge}<span style="font-size:0.9rem;color:#64748b">${escHtml(u.nombre)}</span></div>` : ''}
      <p class="welcome-sub" style="margin-bottom:20px">${u && u.rol === 'Franquiciado' ? 'Auditoría interna' : 'Auditoría oficial'}</p>
      ${draftBanner}
      <button class="btn btn-outline" id="btn-logout" style="width:100%;max-width:340px;margin-top:8px;color:#94a3b8;border-color:#94a3b8;font-size:0.85rem">Cerrar sesión</button>
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
  const tab         = state.adminTab || 'menu';
  const auditScreens = new Set(['setup','cat-select','audit','incumplimientos','summary','success','welcome']);
  const histScreens  = new Set(['historial','historial-detalle']);
  const isAudit      = auditScreens.has(state.screen);
  const isHistorial  = histScreens.has(state.screen);
  const isDashboard  = state.screen === 'dashboard';
  const onAdmin      = state.screen === 'admin';
  const active = 'color:#e4001b;font-weight:700';
  const idle   = 'color:#9ca3af;font-weight:400';
  const base   = 'flex:1;padding:6px 2px 5px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation';
  const iconStyle  = 'font-size:1.2rem;line-height:1';
  const labelStyle = 'font-size:0.6rem;letter-spacing:0.01em';
  return `
    <nav style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;display:flex;align-items:center;z-index:100;padding-bottom:env(safe-area-inset-bottom,0px)">
      <button id="nav-admin-dashboard" style="${base};${isDashboard?active:idle}">
        <span style="${iconStyle}">📊</span><span style="${labelStyle}">Dashboard</span>
      </button>
      <button id="nav-admin-usuarios" style="${base};${onAdmin&&tab==='usuarios'?active:idle}">
        <span style="${iconStyle}">👥</span><span style="${labelStyle}">Usuarios</span>
      </button>
      <button id="nav-admin-auditoria" style="flex:1;padding:0 2px 5px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation;position:relative;top:-10px">
        <div style="width:52px;height:52px;border-radius:50%;background:${isAudit?'#15803d':'#16a34a'};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(22,163,74,0.4);transition:background 0.15s">
          <span style="color:#fff;font-size:1.8rem;line-height:1;font-weight:300">+</span>
        </div>
        <span style="${labelStyle};${isAudit?active:idle}">Nueva</span>
      </button>
      <button id="nav-admin-historial" style="${base};${isHistorial?active:idle}">
        <span style="${iconStyle}">📋</span><span style="${labelStyle}">Historial</span>
      </button>
      <button id="nav-admin-locales" style="${base};${onAdmin&&tab==='locales'?active:idle}">
        <span style="${iconStyle}">🏪</span><span style="${labelStyle}">Locales</span>
      </button>
    </nav>
    <div style="height:calc(68px + env(safe-area-inset-bottom,0px))"></div>`;
}

function renderUserBottomNav() {
  const auditScreens = new Set(['setup','cat-select','audit','incumplimientos','summary','success']);
  const histScreens  = new Set(['historial','historial-detalle']);
  const isAudit      = auditScreens.has(state.screen);
  const isHistorial  = histScreens.has(state.screen);
  const isDashboard  = state.screen === 'dashboard';
  const onWelcome    = state.screen === 'welcome';
  const rol          = state.user?.rol || '';
  const active = 'color:#e4001b;font-weight:700';
  const idle   = 'color:#9ca3af;font-weight:400';
  const base   = 'flex:1;padding:6px 2px 5px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation';
  const labelStyle = 'font-size:0.6rem;letter-spacing:0.01em';
  const centerBtn = `
    <button id="nav-user-auditoria" style="flex:1;padding:0 2px 5px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation;position:relative;top:-10px">
      <div style="width:52px;height:52px;border-radius:50%;background:${isAudit?'#15803d':'#16a34a'};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(22,163,74,0.4)">
        <span style="color:#fff;font-size:1.8rem;line-height:1;font-weight:300">+</span>
      </div>
      <span style="${labelStyle};${isAudit?active:idle}">Nueva</span>
    </button>`;
  if (rol === 'Franquiciado') {
    return `
    <nav style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;display:flex;align-items:center;z-index:100;padding-bottom:env(safe-area-inset-bottom,0px)">
      <button id="nav-user-dashboard" style="${base};${isDashboard?active:idle}">
        <span style="font-size:1.2rem;line-height:1">📊</span><span style="${labelStyle}">Dashboard</span>
      </button>
      ${centerBtn}
      <button id="nav-user-historial" style="${base};${isHistorial?active:idle}">
        <span style="font-size:1.2rem;line-height:1">📋</span><span style="${labelStyle}">Historial</span>
      </button>
    </nav>
    <div style="height:calc(68px + env(safe-area-inset-bottom,0px))"></div>`;
  }
  return `
    <nav style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;display:flex;align-items:center;z-index:100;padding-bottom:env(safe-area-inset-bottom,0px)">
      <button id="nav-user-inicio" style="${base};${onWelcome?active:idle}">
        <span style="font-size:1.2rem;line-height:1">🏠</span><span style="${labelStyle}">Inicio</span>
      </button>
      ${centerBtn}
      <button id="nav-user-historial" style="${base};${isHistorial?active:idle}">
        <span style="font-size:1.2rem;line-height:1">📋</span><span style="${labelStyle}">Historial</span>
      </button>
    </nav>
    <div style="height:calc(68px + env(safe-area-inset-bottom,0px))"></div>`;
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
      const isUnconfirmed = !!localStorage.getItem('audit_unconfirmed');
      if (Date.now() - (d.ts||0) < 259200000 && d.local?.nombre) {
        if (isUnconfirmed) {
          draftBanner = `
            <div style="background:#fff1f2;border:2px solid #e4001b;border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">
              <div style="font-size:0.88rem;font-weight:700;color:#b80015;margin-bottom:4px">⚠ Auditoría enviada sin confirmar</div>
              <div style="font-size:0.83rem;color:#1a1a1a;margin-bottom:10px"><strong>${escHtml(d.local.nombre)}</strong> &mdash; ${escHtml(d.fecha||'')}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-danger" id="btn-draft-reenviar" style="flex:1;font-size:0.82rem;min-width:100px">Reenviar</button>
                <button class="btn btn-outline" id="btn-draft-export" style="flex:1;font-size:0.82rem;min-width:100px">Exportar</button>
                <button class="btn" id="btn-confirmar-igualmente" style="flex:1;font-size:0.82rem;min-width:80px;border:1px solid #d1d5db;color:#6b7280">Llegó igual</button>
              </div>
            </div>`;
        } else {
          draftBanner = `
            <div style="background:#fffbeb;border:2px solid #f97316;border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">
              <div style="font-size:0.88rem;font-weight:700;color:#92400e;margin-bottom:4px">Auditoría incompleta guardada</div>
              <div style="font-size:0.83rem;color:#1a1a1a;margin-bottom:10px"><strong>${escHtml(d.local.nombre)}</strong> &mdash; ${escHtml(d.fecha||'')}</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary" id="btn-draft-continue" style="flex:1;font-size:0.83rem">Continuar</button>
                <button class="btn btn-outline" id="btn-draft-export" style="flex:1;font-size:0.83rem">Exportar</button>
                <button class="btn btn-ghost" id="btn-draft-discard" style="flex:1;font-size:0.83rem;border:1px solid #d1d5db">Descartar</button>
              </div>
            </div>`;
        }
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

// ============================================================
// PANTALLA: DASHBOARD
// ============================================================
function renderDashboard() {
  const loading = state.dashboardLoading;
  const err     = state.dashboardError || '';
  const data    = state.dashboard;
  const pb      = `padding-bottom:calc(78px + env(safe-area-inset-bottom,0px))`;

  const isRanking = state.dashboardView === 'ranking';
  const dbTipo    = state.dashboardTipo || '';

  const header = `<div style="background:#e4001b;color:#fff;padding:16px 16px 14px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:1.1rem;font-weight:700">📊 Dashboard</div>
    <button id="btn-dashboard-refresh" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer">↻</button>
  </div>
  <div style="background:#fff;padding:8px 14px;display:flex;gap:6px;border-bottom:1px solid #f3f4f6;flex-wrap:wrap">
    ${['Oficial','Interna'].map(function(t) {
      const active = !isRanking && dbTipo === t;
      return `<button onclick="window.__dbTipo('${t}')" style="border:none;border-radius:20px;padding:5px 13px;font-size:0.72rem;font-weight:700;cursor:pointer;transition:all .15s;${active ? 'background:#e4001b;color:#fff' : 'background:#f3f4f6;color:#6b7280'}">${t}</button>`;
    }).join('')}
    <button onclick="state.dashboardView='ranking';render();" style="border:none;border-radius:20px;padding:5px 13px;font-size:0.72rem;font-weight:700;cursor:pointer;transition:all .15s;${isRanking ? 'background:#1d4ed8;color:#fff' : 'background:#dbeafe;color:#1d4ed8'}">🏆 Ranking</button>
  </div>`;

  if (loading) return `<div style="display:flex;flex-direction:column;min-height:100vh;${pb}">${header}
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <div style="text-align:center;color:#6b7280"><div style="font-size:2rem;margin-bottom:8px">⏳</div><div>Cargando dashboard…</div></div>
    </div></div>`;

  if (err) return `<div style="display:flex;flex-direction:column;min-height:100vh;${pb}">${header}
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="text-align:center;color:#6b7280">
        <div style="font-size:2rem;margin-bottom:8px">⚠️</div>
        <div style="margin-bottom:16px">${escHtml(err)}</div>
        <button id="btn-dashboard-retry" style="background:#e4001b;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:0.95rem;cursor:pointer">Reintentar</button>
      </div>
    </div></div>`;

  if (!data) return `<div style="display:flex;flex-direction:column;min-height:100vh;${pb}">${header}
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <div style="text-align:center;color:#6b7280"><div style="font-size:2rem;margin-bottom:8px">📊</div><div>Sin datos</div></div>
    </div></div>`;

  const localesList  = data.locales || [];
  const porLocal     = data.porLocal || {};
  const globalData   = data.global   || {};

  let selLocal = state.dashboardLocal || '';

  function validPct(p) { return p !== null && p !== undefined && !isNaN(p); }
  function pctColor(p) {
    if (!validPct(p)) return '#6b7280';
    if (p >= 85) return '#16a34a';
    if (p >= 70) return '#2563eb';
    if (p >= 55) return '#d97706';
    return '#e4001b';
  }
  function pctBg(p) {
    if (!validPct(p)) return '#f3f4f6';
    if (p >= 85) return '#dcfce7';
    if (p >= 70) return '#dbeafe';
    if (p >= 55) return '#fef3c7';
    return '#fee2e2';
  }
  function pctBadge(p, label) {
    if (!validPct(p)) return `<span style="color:#9ca3af">–</span>`;
    return `<span style="font-size:${label?'0.75':'1rem'};font-weight:800;color:${pctColor(p)}">${p}%${label?' '+label:''}</span>`;
  }
  function vsGlobal(localPct, globalPct) {
    if (!validPct(localPct) || !validPct(globalPct)) return '';
    const diff = localPct - globalPct;
    const sign = diff >= 0 ? '+' : '';
    const col  = diff >= 0 ? '#16a34a' : '#e4001b';
    return `<span style="font-size:0.7rem;color:${col};font-weight:700">${sign}${diff}% vs. promedio general</span>`;
  }

  // '' = Todos, cualquier otro valor = local específico
  const isTodos = !selLocal || !porLocal[selLocal];

  // Si hay un solo local, nunca mostramos "Todos" — directo al único local
  const mostrarTodos = localesList.length > 1;
  if (!mostrarTodos && !selLocal) selLocal = localesList[0] || '';

  const selectStyle = `width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;background:#fff;color:#111827;appearance:none;-webkit-appearance:none;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%236b7280%22><path fill-rule=%22evenodd%22 d=%22M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z%22/></svg>');background-repeat:no-repeat;background-position:right 10px center;background-size:16px;padding-right:32px`;

  const selectorHtml = localesList.length > 0 ? `
    <div style="padding:12px 14px 0">
      <select id="db-local-select" style="${selectStyle}" onchange="state.dashboardLocal=this.value;render();">
        ${mostrarTodos ? `<option value=""${isTodos?' selected':''}>Todos los locales</option>` : ''}
        ${localesList.map(l => `<option value="${escHtml(l)}"${l===selLocal&&!isTodos?' selected':''}>${escHtml(l)}</option>`).join('')}
      </select>
    </div>` : '';

  if (!localesList.length) {
    return `<div style="display:flex;flex-direction:column;min-height:100vh;background:#f9fafb;${pb}">${header}
      <div style="flex:1;display:flex;align-items:center;justify-content:center">
        <div style="text-align:center;color:#9ca3af;padding:40px 0"><div style="font-size:2rem;margin-bottom:8px">📊</div><div>Sin auditorías registradas</div></div>
      </div></div>`;
  }

  const gd = globalData;
  const ld = isTodos ? null : porLocal[selLocal];

  // ── helpers visuales ──
  function tendenciaIcon(t, diff) {
    if (t === 'sube') return `<span style="color:#16a34a;font-weight:700">▲ ${diff !== null ? '+'+diff+'%' : ''}</span>`;
    if (t === 'baja') return `<span style="color:#e4001b;font-weight:700">▼ ${diff !== null ? diff+'%' : ''}</span>`;
    if (t === 'estable') return `<span style="color:#6b7280">→ Estable</span>`;
    return `<span style="color:#9ca3af">Sin datos</span>`;
  }
  function diasBadge(dias) {
    if (dias === null || dias === undefined) return '–';
    if (dias > 45) return `<span style="color:#e4001b;font-weight:700">⚠️ ${dias} días</span>`;
    if (dias > 25) return `<span style="color:#d97706;font-weight:700">${dias} días</span>`;
    return `<span style="color:#16a34a;font-weight:700">${dias} días</span>`;
  }
  function reincBadge(r) {
    if (r === null || r === undefined) return '–';
    const col = r > 50 ? '#e4001b' : r > 25 ? '#d97706' : '#16a34a';
    return `<span style="color:${col};font-weight:700">${r}%</span>`;
  }

  // ── Vista RANKING ──
  if (isRanking) {
    const rankingData = data.ranking || {};
    const period      = state.dashboardRankingPeriod || 'mesActual';
    const items       = rankingData[period] || [];
    const periodLabels = { mesActual: 'Mes actual', mesAnterior: 'Mes anterior', ult3Meses: 'Últ. 3 meses' };
    const myLocales   = new Set(localesList);

    const periodBtns = ['mesActual', 'mesAnterior', 'ult3Meses'].map(function(p) {
      const active = period === p;
      return `<button onclick="state.dashboardRankingPeriod='${p}';render();" style="flex:1;border:none;border-radius:8px;padding:8px 4px;font-size:0.72rem;font-weight:700;cursor:pointer;${active ? 'background:#e4001b;color:#fff' : 'background:#f3f4f6;color:#6b7280'}">${periodLabels[p]}</button>`;
    }).join('');

    const rankHtml = items.length === 0
      ? `<div style="text-align:center;color:#9ca3af;padding:40px 0">Sin auditorías en este período</div>`
      : items.map(function(item, idx) {
          const pos   = idx + 1;
          const mine  = myLocales.has(item.local);
          const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `<span style="font-size:0.8rem;font-weight:700;color:#9ca3af;min-width:20px;text-align:center">${pos}</span>`;
          const p     = item.promedio;
          const barColor = p >= 85 ? '#16a34a' : p >= 70 ? '#2563eb' : p >= 55 ? '#d97706' : '#e4001b';
          const barW  = p;
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;${mine ? 'background:#fffbeb;margin:0 -14px;padding:10px 14px;' : ''}">
            <div style="width:28px;text-align:center;flex-shrink:0">${medal}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:0.82rem;font-weight:${mine?'800':'600'};color:${mine?'#b45309':'#374151'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.local)}${mine?' ★':''}</div>
              <div style="margin-top:3px;height:4px;background:#e5e7eb;border-radius:2px">
                <div style="height:4px;width:${barW}%;background:${barColor};border-radius:2px"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:1.1rem;font-weight:800;color:${barColor}">${p}%</div>
              <div style="font-size:0.6rem;color:#9ca3af">${item.auditCount} audit.</div>
            </div>
          </div>`;
        }).join('');

    return `<div style="display:flex;flex-direction:column;min-height:100vh;background:#f9fafb;${pb}">${header}
      <div style="padding:12px 14px 0">
        <div style="display:flex;gap:6px;margin-bottom:12px">${periodBtns}</div>
        <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);padding:14px">
          <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Ranking de locales</div>
          <div style="font-size:0.65rem;color:#9ca3af;margin-bottom:10px">${items.length} locales · ${escHtml(periodLabels[period])}${dbTipo ? ' · '+escHtml(dbTipo) : ''}</div>
          ${rankHtml}
        </div>
      </div>
    </div>`;
  }

  // ── Vista TODOS ──
  if (isTodos) {
    const totalLocales = gd.totalLocales || localesList.length;

    function renderControlesGlobal(items) {
      if (!items || !items.length) return '<div style="color:#9ca3af;font-size:0.8rem;text-align:center;padding:16px 0">Sin datos</div>';
      const maxLC = items[0].localCount;
      return items.slice(0, 10).map(function(d) {
        const barW = Math.round(d.localCount / maxLC * 100);
        const pctLocales = Math.round(d.localCount / totalLocales * 100);
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3px;gap:6px">
            <div style="font-size:0.72rem;color:#374151;flex:1">
              <span style="color:#9ca3af;font-size:0.62rem">${escHtml(d.categoria)}</span><br>
              <span style="font-weight:600">${escHtml(d.control)}</span>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:1rem;font-weight:800;color:#e4001b">${d.localCount}/${totalLocales}</div>
              <div style="font-size:0.62rem;color:#9ca3af">locales</div>
            </div>
          </div>
          <div style="height:5px;background:#fecaca;border-radius:3px">
            <div style="height:5px;width:${barW}%;background:#e4001b;border-radius:3px"></div>
          </div>
        </div>`;
      }).join('');
    }

    function renderCategoriasGlobal(items) {
      if (!items || !items.length) return '<div style="color:#9ca3af;font-size:0.8rem;text-align:center;padding:16px 0">Sin datos</div>';
      return items.map(function(c) {
        const p = c.pct !== null ? c.pct : 0;
        const barColor = p >= 85 ? '#16a34a' : p >= 70 ? '#2563eb' : p >= 55 ? '#d97706' : '#e4001b';
        const belowStr = c.localsBelowTarget > 0
          ? `<span style="font-size:0.62rem;color:#e4001b;font-weight:600">${c.localsBelowTarget} local${c.localsBelowTarget!==1?'es':''} con dificultad</span>`
          : `<span style="font-size:0.62rem;color:#16a34a;font-weight:600">Todos OK</span>`;
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:0.72rem;color:#374151;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%">${escHtml(c.categoria)}</span>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              ${belowStr}
              <span style="font-size:0.8rem;font-weight:800;color:${barColor}">${p}%</span>
            </div>
          </div>
          <div style="height:5px;background:#e5e7eb;border-radius:3px">
            <div style="height:5px;width:${p}%;background:${barColor};border-radius:3px"></div>
          </div>
        </div>`;
      }).join('');
    }

    const todosHtml = `
      <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
        <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Promedio general</div>
        <div style="font-size:2.4rem;font-weight:900;color:${pctColor(gd.promedio)};line-height:1">${validPct(gd.promedio) ? gd.promedio+'%' : '–'}</div>
        <div style="font-size:0.72rem;color:#9ca3af;margin-top:4px">${totalLocales} local${totalLocales!==1?'es':''} evaluados</div>
      </div>
      <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
        <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Puntos que más fallan — por local</div>
        <div style="font-size:0.68rem;color:#9ca3af;margin-bottom:10px">Cuántos locales incumplieron este punto en su última auditoría</div>
        ${renderControlesGlobal(gd.rankingControles)}
      </div>
      <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
        <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Categorías con más dificultad</div>
        <div style="font-size:0.68rem;color:#9ca3af;margin-bottom:10px">Promedio de cumplimiento de todos los locales. Locales con dificultad = por debajo del 80%</div>
        ${renderCategoriasGlobal(gd.rankingCategorias)}
      </div>`;

    return `<div style="display:flex;flex-direction:column;min-height:100vh;background:#f9fafb;${pb}">${header}
      ${selectorHtml}
      <div style="padding:12px 14px 0">${todosHtml}</div>
    </div>`;
  }

  // ── Vista local individual ──

  // Indicadores
  const sectionIndicadores = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
      <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Indicadores</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
        <div style="background:#f9fafb;border-radius:8px;padding:10px 6px">
          <div style="font-size:0.6rem;color:#9ca3af;text-transform:uppercase;font-weight:600;margin-bottom:4px">Tendencia</div>
          <div style="font-size:0.85rem">${tendenciaIcon(ld.tendencia, ld.tendenciaDiff)}</div>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:10px 6px">
          <div style="font-size:0.6rem;color:#9ca3af;text-transform:uppercase;font-weight:600;margin-bottom:4px">Última audit.</div>
          <div style="font-size:0.82rem">${diasBadge(ld.diasSinAuditoria)}</div>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:10px 6px">
          <div style="font-size:0.6rem;color:#9ca3af;text-transform:uppercase;font-weight:600;margin-bottom:4px">Reincidencia</div>
          <div style="font-size:0.82rem">${reincBadge(ld.reincidencia)}</div>
        </div>
      </div>
    </div>`;

  // A) Promedio últimas 3
  const sectionA = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
      <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Promedio últimas ${ld.auditsCount || 3} auditorías</div>
      <div style="display:flex;align-items:center;gap:16px">
        <div>
          <div style="font-size:2.4rem;font-weight:900;color:${pctColor(ld.promedio3)};line-height:1">${validPct(ld.promedio3) ? ld.promedio3+'%' : '–'}</div>
          <div style="margin-top:4px">${vsGlobal(ld.promedio3, gd.promedio)}</div>
        </div>
        ${validPct(gd.promedio) ? `<div style="border-left:1px solid #f3f4f6;padding-left:16px">
          <div style="font-size:0.65rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px">Promedio general</div>
          <div style="font-size:1.4rem;font-weight:800;color:${pctColor(gd.promedio)}">${gd.promedio}%</div>
        </div>` : ''}
      </div>
    </div>`;

  // B) Últimas 3 auditorías individuales
  const audits = ld.ultimasAuditorias || [];
  const sectionB = audits.length ? `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
      <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Últimas auditorías</div>
      ${audits.map(function(a, i) {
        const p = validPct(a.pct) ? Math.round(a.pct) : null;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;${i < audits.length-1 ? 'border-bottom:1px solid #f3f4f6' : ''}">
          <div>
            <div style="font-size:0.82rem;font-weight:600;color:#374151">${escHtml(a.fecha)}</div>
            <div style="font-size:0.65rem;color:#9ca3af">${escHtml(a.auditor)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:1.2rem;font-weight:800;color:${pctColor(p)}">${validPct(p) ? p+'%' : '–'}</div>
            ${a.reprobado ? `<div style="font-size:0.62rem;font-weight:700;color:#e4001b;background:#fee2e2;padding:1px 5px;border-radius:8px">Reprobado</div>` : (a.nivel ? `<div style="font-size:0.62rem;color:${pctColor(p)};background:${pctBg(p)};padding:1px 5px;border-radius:8px;font-weight:600">${escHtml(a.nivel)}</div>` : '')}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  // C) Ranking controles — metric: "falló en X de N auditorías" + badge si también falla en otros locales
  function renderRankingControles(items, globalItems, auditsCount) {
    if (!items || !items.length) return '';
    const maxFA = items[0].failedAudits || 1;
    const gMap = {};
    (globalItems || []).forEach(function(g){ gMap[g.control] = g.localCount; });
    return `<div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
      <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Puntos con más incumplimientos</div>
      <div style="font-size:0.68rem;color:#9ca3af;margin-bottom:10px">En cuántas de las últimas ${auditsCount} auditorías falló este punto</div>
      ${items.slice(0, 10).map(function(d) {
        const fa = d.failedAudits || 0;
        const barW = Math.round(fa / maxFA * 100);
        const gLC = gMap[d.control];
        const globalBadge = gLC > 1 ? `<span style="font-size:0.6rem;color:#9ca3af;font-weight:600;background:#f3f4f6;padding:1px 5px;border-radius:8px">también en ${gLC} locales</span>` : '';
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3px;gap:6px">
            <div style="font-size:0.72rem;color:#374151;flex:1">
              <span style="color:#9ca3af;font-size:0.62rem">${escHtml(d.categoria)}</span><br>
              <span style="font-weight:600">${escHtml(d.control)}</span>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:0.9rem;font-weight:800;color:#e4001b">${fa} de ${auditsCount}</div>
              <div style="font-size:0.6rem;color:#9ca3af">auditorías</div>
              ${globalBadge}
            </div>
          </div>
          <div style="height:5px;background:#fecaca;border-radius:3px">
            <div style="height:5px;width:${barW}%;background:#e4001b;border-radius:3px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // D) Ranking categorías — metric: % cumplimiento + diff vs global
  function renderRankingCategorias(items, globalItems) {
    if (!items || !items.length) return '';
    const gMap = {};
    (globalItems || []).forEach(function(g){ gMap[g.categoria] = g.pct; });
    return `<div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:12px;padding:14px">
      <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Categorías con más dificultad</div>
      <div style="font-size:0.68rem;color:#9ca3af;margin-bottom:10px">% de cumplimiento promedio en las últimas auditorías. Las más bajas primero.</div>
      ${items.map(function(c) {
        const p = c.pct !== null ? c.pct : 0;
        const barColor = p >= 85 ? '#16a34a' : p >= 70 ? '#2563eb' : p >= 55 ? '#d97706' : '#e4001b';
        const gPct = gMap[c.categoria];
        const diff = (gPct !== undefined && c.pct !== null) ? c.pct - gPct : null;
        const diffStr = diff !== null
          ? `<span style="font-size:0.62rem;color:${diff >= 0 ? '#16a34a' : '#e4001b'};font-weight:700">${diff >= 0 ? '+' : ''}${diff}% vs. gral</span>`
          : '';
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:0.72rem;color:#374151;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%">${escHtml(c.categoria)}</span>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              ${diffStr}
              <span style="font-size:0.8rem;font-weight:800;color:${barColor}">${p}%</span>
            </div>
          </div>
          <div style="height:5px;background:#e5e7eb;border-radius:3px">
            <div style="height:5px;width:${p}%;background:${barColor};border-radius:3px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  const sectionC = renderRankingControles(ld.rankingControles, gd.rankingControles, ld.auditsCount || 3);
  const sectionD = renderRankingCategorias(ld.rankingCategorias, gd.rankingCategorias);

  return `<div style="display:flex;flex-direction:column;min-height:100vh;background:#f9fafb;${pb}">${header}
    ${selectorHtml}
    <div style="padding:12px 14px 0">
      ${sectionIndicadores}
      ${sectionA}
      ${sectionB}
      ${sectionC}
      ${sectionD}
    </div>
  </div>`;
}

// ============================================================
// PANTALLA: HISTORIAL
// ============================================================
function renderHistorial() {
  const loading = state.historialLoading;
  const err     = state.historialError || '';
  const lista   = state.historial;
  const search  = (state.historialSearch || '').toLowerCase().trim();

  if (loading || lista === null) return `
    <div class="main" style="padding-top:24px;display:flex;align-items:center;gap:12px">
      <div class="spinner"></div>
      <span style="color:#6b7280;font-size:0.9rem">Cargando auditorías...</span>
    </div>`;

  if (err) return `
    <div class="main" style="padding-top:24px">
      <div class="error-box"><h2>Error</h2><p>${escHtml(err)}</p>
        <button class="btn btn-primary" id="btn-historial-retry" style="margin-top:12px">Reintentar</button>
      </div>
    </div>`;

  const histTipo = state.historialTipo || '';
  const _now = new Date();
  const _cutoff = new Date(_now.getFullYear(), _now.getMonth() - 1, 1); // 1° del mes anterior
  const filtered = lista.filter(a => {
    if (a.fechaISO && a.fechaISO < _cutoff.toISOString().slice(0,7)) return false;
    if (histTipo && (a.tipo || 'Oficial') !== histTipo) return false;
    if (!search) return true;
    return a.local.toLowerCase().includes(search) ||
           a.auditor.toLowerCase().includes(search) ||
           a.fecha.toLowerCase().includes(search);
  });

  function scoreColor(a) {
    if (a.reprobado) return '#e4001b';
    if (a.pct >= 90) return '#16a34a';
    if (a.pct >= 75) return '#ca8a04';
    if (a.pct >= 60) return '#ea580c';
    return '#e4001b';
  }
  function scoreBg(a) {
    if (a.reprobado) return '#fff1f2';
    if (a.pct >= 90) return '#f0fdf4';
    if (a.pct >= 75) return '#fefce8';
    if (a.pct >= 60) return '#fff7ed';
    return '#fff1f2';
  }

  const rol         = state.user?.rol || '';
  const accionando  = state.historialAccionando || '';
  const btnBase     = 'border:none;border-radius:8px;padding:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1rem;flex-shrink:0;touch-action:manipulation';

  const cardsHtml = filtered.length === 0
    ? `<div style="text-align:center;padding:48px 16px;color:#6b7280">
        <div style="font-size:2.5rem;margin-bottom:8px">📋</div>
        <div style="font-weight:600;margin-bottom:4px">${search ? 'Sin resultados' : 'Sin auditorías'}</div>
        <div style="font-size:0.85rem">${search ? 'Probá con otro término' : 'Todavía no hay auditorías registradas'}</div>
       </div>`
    : filtered.map(a => {
        const cargando   = accionando === a.auditId;
        const showEdit   = rol === 'Admin' || rol === 'Auditor';
        const showDelete = rol === 'Admin';
        const accBtns = cargando
          ? `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div></div>`
          : `<div style="display:flex;gap:4px;flex-shrink:0">
              <button class="hist-btn-ver"    data-audit-id="${escHtml(a.auditId)}" title="Ver" style="${btnBase};background:#eff6ff;color:#1d4ed8">👁</button>
              ${showEdit   ? `<button class="hist-btn-editar" data-audit-id="${escHtml(a.auditId)}" title="Editar" style="${btnBase};background:#f0fdf4;color:#15803d">✏️</button>` : ''}
              ${showDelete ? `<button class="hist-btn-borrar" data-audit-id="${escHtml(a.auditId)}" data-local="${escHtml(a.local)}" data-fecha="${escHtml(a.fecha)}" title="Borrar" style="${btnBase};background:#fff1f2;color:#e4001b">🗑</button>` : ''}
             </div>`;
        return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
          <div style="background:${scoreBg(a)};color:${scoreColor(a)};font-weight:800;font-size:0.9rem;min-width:48px;padding:7px 4px;border-radius:8px;text-align:center;flex-shrink:0;line-height:1.1">
            ${a.reprobado ? '⛔' : (a.pct !== null ? a.pct + '%' : '—')}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:0.92rem;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(a.local)}</div>
            <div style="font-size:0.75rem;color:#6b7280;margin-top:1px">${escHtml(a.fecha)}${a.hora ? ' · ' + escHtml(a.hora) : ''} · ${escHtml(a.auditor)}</div>
            ${a.tipo === 'Interna' ? `<span style="font-size:0.65rem;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:99px;font-weight:600;margin-top:2px;display:inline-block">Interna</span>` : ''}
          </div>
          ${accBtns}
        </div>`;
      }).join('');

  const borradoMsg = state.historialBorradoMsg || '';
  if (borradoMsg) setTimeout(() => { state.historialBorradoMsg = ''; render(); }, 3500);

  return `
    <div class="main" style="padding-top:16px;padding-bottom:120px">
      ${borradoMsg ? `<div style="background:#f0fdf4;border:1px solid #86efac;color:#15803d;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-weight:600;font-size:0.88rem">${escHtml(borradoMsg)}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2 style="font-size:1.05rem;font-weight:700;color:#1a1a1a;margin:0">Auditorías (${filtered.length})</h2>
        <button class="btn" id="btn-historial-refresh" style="font-size:0.78rem;color:#6b7280;border:1px solid #e5e7eb;padding:4px 10px;min-height:0">↻ Actualizar</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${['', 'Oficial', 'Interna'].map(t => {
          const active = histTipo === t;
          return `<button onclick="window.__histTipo('${t}')" style="border:none;border-radius:20px;padding:5px 13px;font-size:0.72rem;font-weight:700;cursor:pointer;${active ? 'background:#e4001b;color:#fff' : 'background:#f3f4f6;color:#6b7280'}">${t || 'Todos'}</button>`;
        }).join('')}
      </div>
      <div style="position:relative;margin-bottom:14px">
        <input class="form-control" id="inp-historial-search" type="search"
          placeholder="Buscar local, auditor o fecha..."
          value="${escHtml(state.historialSearch || '')}" autocomplete="off"
          style="padding-left:36px">
        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:1rem;pointer-events:none">🔍</span>
      </div>
      ${cardsHtml}
    </div>`;
}

function renderHistorialDetalle() {
  const loading = state.historialDetalleLoading;
  const err     = state.historialDetalleError || '';
  const d       = state.historialDetalle;

  if (loading || (!d && !err)) return `
    <div class="main" style="padding-top:24px;display:flex;align-items:center;gap:12px">
      <div class="spinner"></div>
      <span style="color:#6b7280;font-size:0.9rem">Cargando auditoría...</span>
    </div>`;

  if (err || !d) return `
    <div class="main" style="padding-top:24px">
      <button id="btn-historial-detalle-back" style="background:none;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer;color:#6b7280;font-size:0.82rem;margin-bottom:16px;touch-action:manipulation">← Volver</button>
      <div class="error-box"><h2>Error</h2><p>${escHtml(err || 'No se pudo cargar la auditoría.')}</p></div>
    </div>`;

  const p = d.puntaje || {};
  const pctColor = p.reprobado ? '#e4001b' : (p.pct||0) >= 90 ? '#16a34a' : (p.pct||0) >= 75 ? '#ca8a04' : (p.pct||0) >= 60 ? '#ea580c' : '#e4001b';
  const pctBg    = p.reprobado ? '#fff1f2' : (p.pct||0) >= 90 ? '#f0fdf4' : (p.pct||0) >= 75 ? '#fefce8' : (p.pct||0) >= 60 ? '#fff7ed' : '#fff1f2';

  const byCat = {}, catOrder = [];
  (d.respuestas || []).forEach(r => {
    if (!byCat[r.categoria]) { byCat[r.categoria] = []; catOrder.push(r.categoria); }
    byCat[r.categoria].push(r);
  });

  // Convert Drive file URL → thumbnail URL (same logic as backend driveImgUrl)
  function toDriveThumb(url) {
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
  }

  const catHtml = catOrder.map((cat, catIdx) => {
    const rows   = byCat[cat];
    const ncCnt  = rows.filter(r => { const v = (r.respuesta||'').toLowerCase(); return v.includes('no cumple')||v==='nocumple'; }).length;
    const parCnt = rows.filter(r => (r.respuesta||'').toLowerCase().includes('parcial')).length;
    // Categories with incumplimientos start expanded; others start collapsed
    const startOpen = false;
    const catId = `cat-acc-${catIdx}`;

    const rowsHtml = rows.map(r => {
      const v        = (r.respuesta||'').toLowerCase();
      const isNC     = v.includes('no cumple') || v === 'nocumple';
      const isParcial = v.includes('parcial');
      const isCumple  = v === 'cumple' || v === 'n/a';
      const resColor  = isNC ? '#e4001b' : isParcial ? '#d97706' : isCumple ? '#16a34a' : '#6b7280';
      const resBg     = isNC ? '#fff1f2' : isParcial ? '#fffbeb' : isCumple ? '#f0fdf4' : '#f1f5f9';
      const imp_i     = (r.importancia||'').toLowerCase().replace(/í/g,'i');
      const impC      = imp_i==='critico'?'#e4001b':imp_i==='alta'?'#ea580c':imp_i==='media'?'#d97706':'#16a34a';
      const impB      = imp_i==='critico'?'#fff1f2':imp_i==='alta'?'#fff7ed':imp_i==='media'?'#fffbeb':'#f0fdf4';

      const fotos = r.fotoUrls && r.fotoUrls.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
            ${r.fotoUrls.map(url => {
              const thumb = toDriveThumb(url);
              return `<a href="${escHtml(toDriveThumb(url))}" target="_blank" rel="noopener" style="display:block;width:80px;height:80px;flex-shrink:0">
                <img src="${escHtml(thumb)}" alt="foto"
                  style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;display:block"
                  onerror="this.style.display='none'">
              </a>`;
            }).join('')}
          </div>` : '';

      const rowBg = isNC ? 'background:#fff1f2;border-left:3px solid #e4001b;padding-left:13px;' : '';
      return `
        <div style="${rowBg}padding:11px 0;border-bottom:1px solid #f3f4f6">
          <div style="font-size:0.72rem;color:#9ca3af;margin-bottom:1px">${escHtml(r.subcategoria)}</div>
          <div style="font-size:0.86rem;font-weight:600;color:#1a1a1a;margin-bottom:5px">${escHtml(r.control)}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
            <span style="font-size:0.67rem;background:${impB};color:${impC};padding:1px 7px;border-radius:99px;font-weight:700">${escHtml(r.importancia)}</span>
            <span style="font-size:0.67rem;background:${resBg};color:${resColor};padding:1px 7px;border-radius:99px;font-weight:700">${escHtml(r.respuesta||'—')}${r.rawValor ? ` (${escHtml(String(r.rawValor))})` : ''}</span>
          </div>
          ${r.observacion ? `<div style="font-size:0.76rem;color:#6b7280;margin-top:5px;font-style:italic">"${escHtml(r.observacion)}"</div>` : ''}
          ${fotos}
        </div>`;
    }).join('');

    const headerBg = ncCnt > 0 ? '#fff1f2' : '#f8fafc';
    const headerBorder = ncCnt > 0 ? 'border-left:3px solid #e4001b;' : '';
    const badge = ncCnt > 0
      ? `<span style="font-size:0.67rem;font-weight:700;color:#e4001b;background:#fecaca;padding:1px 7px;border-radius:99px">${ncCnt} incumpl.</span>`
      : parCnt > 0
        ? `<span style="font-size:0.67rem;font-weight:700;color:#d97706;background:#fef3c7;padding:1px 7px;border-radius:99px">${parCnt} parcial</span>`
        : `<span style="font-size:0.67rem;font-weight:700;color:#16a34a">✓ OK</span>`;

    return `
      <div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:10px;overflow:hidden">
        <button class="cat-acc-btn" data-target="${catId}"
          style="width:100%;padding:11px 16px;background:${headerBg};${headerBorder}display:flex;justify-content:space-between;align-items:center;border:none;cursor:pointer;text-align:left;touch-action:manipulation">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            <span style="font-size:0.86rem;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(cat)}</span>
            ${badge}
          </div>
          <span class="cat-acc-arrow" style="font-size:0.75rem;color:#9ca3af;margin-left:8px;transition:transform 0.2s;transform:rotate(${startOpen?'180':'0'}deg)">▼</span>
        </button>
        <div id="${catId}" style="padding:0 16px;${startOpen?'':'display:none'}">${rowsHtml}</div>
      </div>`;
  }).join('');

  const tipoBadge = d.tipo === 'Interna'
    ? `<span style="font-size:0.72rem;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:99px;font-weight:600">Interna</span>`
    : `<span style="font-size:0.72rem;background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:99px;font-weight:600">Oficial</span>`;

  const isAdminDet = state.user?.rol === 'Admin';
  const pb         = isAdminDet ? 'calc(78px + env(safe-area-inset-bottom, 0px))' : 'calc(16px + env(safe-area-inset-bottom, 0px))';

  return `
    <div class="main" style="padding-top:16px;padding-bottom:${pb}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button id="btn-historial-detalle-back" style="background:none;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer;color:#6b7280;font-size:0.82rem;flex-shrink:0;touch-action:manipulation">← Volver</button>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.98rem;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(d.local)}</div>
          <div style="font-size:0.75rem;color:#6b7280">${escHtml(d.fecha)}${d.hora ? ' · ' + escHtml(d.hora) : ''}</div>
        </div>
        <div style="background:${pctBg};color:${pctColor};font-weight:800;font-size:0.9rem;padding:7px 10px;border-radius:8px;flex-shrink:0;text-align:center;min-width:48px">
          ${p.reprobado ? '⛔' : (p.pct !== null && p.pct !== undefined ? p.pct + '%' : '—')}
        </div>
      </div>

      <div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:14px 16px;margin-bottom:14px">
        ${[
          ['AUDITOR',                 escHtml(d.auditor || '—')],
          ['ACOMPAÑANTE',             d.acompanante ? escHtml(d.acompanante) : null],
          ['POSICIÓN ACOMPAÑANTE',    d.posicionAcompanante ? escHtml(d.posicionAcompanante) : null],
          ['HEAD COUNT', (() => { const hcResp = (d.respuestas||[]).find(r => r.headcount); return hcResp ? Object.entries(hcResp.headcount).map(([k,v]) => `${k.replace(/_/g,' ')}: ${v}`).join(' | ') : null; })()],
          ['TIPO',                    tipoBadge],
          ['RESULTADO',               `<span style="font-weight:700;color:${pctColor}">${p.reprobado ? 'Reprobado' : (p.nivel || '—')}</span>`],
          ['NOTA',                    p.pct !== null && p.pct !== undefined ? `<span style="font-weight:800;font-size:1.05rem;color:${pctColor}">${p.pct}%</span>` : '—'],
        ].filter(([, val]) => val !== null).map(([label, val]) =>
          `<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:0.82rem">
            <div style="color:#9ca3af;font-size:0.7rem;font-weight:600;text-transform:uppercase;flex-shrink:0">${label}</div>
            <div style="font-weight:600;text-align:right">${val}</div>
          </div>`
        ).join('')}
      </div>

      ${(() => {
        const resp = d.respuestas || [];
        const tot = resp.filter(r => r.respuesta).length;
        const cum = resp.filter(r => (r.respuesta||'').toLowerCase() === 'cumple').length;
        const nc  = resp.filter(r => (r.respuesta||'').toLowerCase().includes('no cumple')).length;
        const par = resp.filter(r => (r.respuesta||'').toLowerCase().includes('parcial')).length;
        if (!tot) return '';
        return `<div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:14px 16px;margin-bottom:14px">
          <div style="font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Distribución</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
            <div style="background:#f0fdf4;border-radius:8px;padding:8px 4px">
              <div style="font-size:1.3rem;font-weight:800;color:#16a34a">${cum}</div>
              <div style="font-size:0.65rem;color:#16a34a;font-weight:600;text-transform:uppercase">Cumple</div>
            </div>
            <div style="background:#fff1f2;border-radius:8px;padding:8px 4px">
              <div style="font-size:1.3rem;font-weight:800;color:#e4001b">${nc}</div>
              <div style="font-size:0.65rem;color:#e4001b;font-weight:600;text-transform:uppercase">No Cumple</div>
            </div>
            <div style="background:#fffbeb;border-radius:8px;padding:8px 4px">
              <div style="font-size:1.3rem;font-weight:800;color:#d97706">${par}</div>
              <div style="font-size:0.65rem;color:#d97706;font-weight:600;text-transform:uppercase">Parcial</div>
            </div>
          </div>
        </div>`;
      })()}
      ${catHtml}
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
          <label class="form-label">Auditor</label>
          ${auditorField}
        </div>

        <div class="form-group">
          <label class="form-label">Local auditado</label>
          <select class="form-control" id="sel-local">
            <option value="">— Seleccioná un local —</option>
            ${localesOpts}
          </select>
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
            <option value="Gerente" ${state.posicionAcompanante === 'Gerente' ? 'selected' : ''}>Gerente</option>
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
            <div style="font-size:1rem;font-weight:700;color:#1a1a1a">${escHtml(state.local.nombre)}</div>
          <div style="font-size:0.78rem;color:#6b7280">${totalAnswered} de ${allQs.length} preguntas respondidas</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button id="btn-back-to-setup" style="background:none;border:1px solid #93c5fd;color:#2563eb;font-size:0.78rem;font-weight:600;cursor:pointer;padding:4px 10px;border-radius:8px;white-space:nowrap">Editar</button>
          <button id="btn-borrar-auditoria" style="background:none;border:1px solid #fca5a5;color:#ef4444;font-size:0.78rem;font-weight:600;cursor:pointer;padding:4px 10px;border-radius:8px;white-space:nowrap">Borrar</button>
        </div>
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

    <div style="padding:10px 16px 0;display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:0.78rem;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">${escHtml(cat.name)}</div>
      <div style="font-size:0.78rem;color:#9ca3af">${state.questionIndex + 1} / ${totalQsInCat}</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:10px 16px 8px">
      ${renderQuestionCard(q)}
    </div>
    <div class="audit-q-footer">
      <div style="display:flex;gap:8px">
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
  const regla = parseValidacion(q.validacion || '');
  const needsPhoto = q.imagen === 'si' || q.imagen === 'obligatorio';

  let inputHtml = '';
  if (regla && regla.tipo === 'headcount') {
    const hc = ans.headcount || {};
    inputHtml = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      ${['SUSHI','COCINA CALIENTE','ENCARGADO/LOGÍSTICA'].map(sector => {
        const key = sector.replace(/\//g,'_').replace(/\s+/g,'_');
        return `<div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:0.78rem;color:#374151;min-width:140px">${sector}</span>
          <input type="number" inputmode="numeric" min="0" class="headcount-input"
            data-qid="${q.id}" data-sector="${key}"
            style="width:70px;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;text-align:center"
            value="${escHtml(String(hc[key] || ''))}">
        </div>`;
      }).join('')}
    </div>`;
  } else if (regla && regla.tipo === 'fecha') {
    const eval_ = ans.fechaRaw ? evaluarFecha(ans.fechaRaw) : null;
    const colorMap = { 'Cumple': '#16a34a', 'No Cumple': '#e4001b' };
    const badgeHtml = eval_ ? `
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
      <span style="background:${eval_.resultado==='Cumple'?'#f0fdf4':'#fff1f2'};color:${colorMap[eval_.resultado]};font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:20px">${eval_.resultado}</span>
      ${eval_.advertencia ? `<span style="font-size:0.7rem;color:#d97706;font-weight:600">⚠ ${eval_.advertencia}</span>` : ''}
    </div>` : '';
    const naChecked = ans.valor === 'No aplica';
    inputHtml = `
    <div style="margin-top:8px">
      <input type="date" class="fecha-venc-input form-control"
        data-qid="${q.id}" value="${naChecked ? '' : escHtml(ans.fechaRaw || '')}"
        style="${naChecked ? 'opacity:0.4;pointer-events:none' : ''}">
      ${badgeHtml}
      ${regla.allowNA ? `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:0.8rem;color:#6b7280">
        <input type="checkbox" class="fecha-na-check" data-qid="${q.id}" ${naChecked?'checked':''}> No aplica
      </label>` : ''}
    </div>`;
  } else if (regla && regla.tipo === 'numero') {
    const numVal = ans.rawValor || '';
    const resultado = numVal && numVal !== 'No aplica' ? evaluarNumero(numVal, regla) : null;
    const colorMap = { 'Cumple': '#16a34a', 'Cumple parcialmente': '#d97706', 'No Cumple': '#e4001b' };
    const bgMap = { 'Cumple': '#f0fdf4', 'Cumple parcialmente': '#fffbeb', 'No Cumple': '#fff1f2' };
    const badgeHtml = resultado ? `
    <div style="margin-top:6px">
      <span style="background:${bgMap[resultado]};color:${colorMap[resultado]};font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:20px">${resultado}</span>
    </div>` : '';
    const naChecked = ans.valor === 'No aplica';
    inputHtml = `
    <div style="margin-top:8px;display:flex;gap:6px;align-items:center;${naChecked?'opacity:0.4;pointer-events:none':''}">
      <input class="number-input-validated form-control" type="number" inputmode="decimal"
        step="0.1" autocomplete="off" spellcheck="false"
        id="num_${q.id}" placeholder="Ej: -2.5" value="${naChecked ? '' : escHtml(numVal)}"
        data-qid="${q.id}" style="flex:1;min-width:0">
    </div>
    <div id="badge_num_${q.id}" style="margin-top:6px;${resultado ? '' : 'display:none'}">
      <span style="background:${resultado ? bgMap[resultado] : ''};color:${resultado ? colorMap[resultado] : ''};font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:20px">${resultado || ''}</span>
    </div>
    ${regla.allowNA ? `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:0.8rem;color:#6b7280">
      <input type="checkbox" class="numero-na-check" data-qid="${q.id}" ${naChecked?'checked':''}> No aplica
    </label>` : ''}`;
  } else if (type === 'radio') {
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
    const unitMatch = q.pregunta.match(/\(([^)]{1,8})\)/);
    const unit = unitMatch ? unitMatch[1] : '';
    inputHtml = `
      <div class="number-input-wrap">
        <input class="number-input" type="text" inputmode="decimal"
          pattern="[0-9.,-]*" autocomplete="off" spellcheck="false"
          id="num_${q.id}" placeholder="Ej: 36,5" value="${escHtml(ans.valor || '')}"
          data-qid="${q.id}">
        ${unit ? `<span class="number-unit">${escHtml(unit)}</span>` : ''}
      </div>`;
  } else {
    inputHtml = `
      <textarea class="observacion-textarea" placeholder="Ingresá el valor..."
        data-qid="${q.id}" data-field="valor"
        style="min-height:48px">${ans.valor || ''}</textarea>`;
  }

  const selectedVal = (ans.valor || '').toLowerCase();
  const reglaQ = parseValidacion(q.validacion || '');
  const tieneValidacionNumerica = reglaQ && (reglaQ.tipo === 'numero' || reglaQ.tipo === 'fecha');
  const obsRequired = !tieneValidacionNumerica && (selectedVal === 'no cumple' || selectedVal.includes('parcial'));
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

  if (!items.length) {
    return `
      <div class="main" style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center;padding-bottom:140px">
        <div style="font-size:52px;margin-bottom:12px">✓</div>
        <div style="font-size:18px;font-weight:700;color:#16a34a;margin-bottom:8px">Sin incumplimientos registrados</div>
        <div style="font-size:14px;color:#64748b">Todos los puntos respondidos cumplen.</div>
      </div>
      <div class="nav-footer">
        <button class="btn btn-outline" id="btn-back-incumpl">Volver</button>
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
    <div class="main" style="padding-bottom:140px;padding-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:1rem;font-weight:700;color:#1a1a1a">Incumplimientos (${items.length})</div>
          <div style="font-size:0.78rem;color:#6b7280">Revisá estos puntos con el acompañante.</div>
        </div>
      </div>
      ${cardsHtml}
    </div>

    <div class="nav-footer">
      <button class="btn btn-outline" id="btn-back-incumpl">Volver</button>
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
      <p style="font-size:0.83rem;color:#92400e;margin:0 0 10px">El servidor no confirmó la llegada. Puede que igual haya llegado, o podés reenviar. El borrador está guardado.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-reenviar-audit" style="flex:1;font-size:0.82rem;min-width:100px">Reenviar</button>
        <button class="btn btn-outline" id="btn-export-unconfirmed" style="flex:1;font-size:0.82rem;min-width:100px">Exportar datos</button>
        <button class="btn" id="btn-confirmar-igualmente" style="flex:1;font-size:0.82rem;min-width:100px;border:1px solid #d1d5db;color:#6b7280">Llegó igual</button>
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
function recargarHistorialSilente() {
  if (!state.user || state.historial !== null) return;
  callAPI({ action: 'getAuditorias', email: state.user.email, token: state.user.token })
    .then(res => {
      // Only store if we got real data; leave null on error so the historial screen loads normally
      if (res.success && res.auditorias && res.auditorias.length > 0) {
        state.historial = res.auditorias;
      }
    })
    .catch(() => {});
}

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
        setTimeout(recargarHistorialSilente, 500);
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
  async function recargarDashboard() {
    setState({ dashboardLoading: true, dashboardError: '' });
    try {
      const res = await callAPI({ action: 'getDashboard', email: state.user.email, token: state.user.token, tipo: state.dashboardTipo || '' });
      if (res.success) setState({ dashboard: res, dashboardLoading: false });
      else setState({ dashboardLoading: false, dashboardError: res.error || 'Error al cargar dashboard' });
    } catch(e) {
      setState({ dashboardLoading: false, dashboardError: 'Error de conexión: ' + e.message });
    }
  }

  async function recargarHistorial() {
    setState({ historialLoading: true, historialError: '' });
    try {
      const res = await callAPI({ action: 'getAuditorias', email: state.user.email, token: state.user.token });
      if (res.success) {
        setState({ historial: res.auditorias || [], historialLoading: false });
      } else {
        setState({ historialLoading: false, historialError: res.error || 'Error al cargar auditorías' });
      }
    } catch(e) {
      setState({ historialLoading: false, historialError: 'Error de conexión: ' + e.message });
    }
  }

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
    const promises = [];
    if (!state.adminUsers.length)  promises.push(recargarUsuarios());
    if (!state.adminLocales.length) promises.push(recargarLocales());
    if (promises.length) await Promise.all(promises);
  }
  async function goToLocales() {
    state.screen = 'admin'; state.adminTab = 'locales'; state.adminShowCreateLocal = false; state.adminEditingLocalIdx = null; state.adminLocalesSearch = '';
    render();
    const promises = [];
    if (!state.adminLocales.length) promises.push(recargarLocales());
    if (!state.adminUsers.length)   promises.push(recargarUsuarios());
    if (promises.length) await Promise.all(promises);
  }

  on('btn-admin-go-usuarios',  'click', goToUsuarios);
  on('btn-admin-go-locales',   'click', goToLocales);
  on('nav-admin-inicio',       'click', () => setState({ screen: 'admin', adminTab: 'menu', adminShowCreateUser: false, adminShowCreateLocal: false }));
  on('nav-admin-dashboard',    'click', async () => {
    setState({ screen: 'dashboard' });
    if (!state.dashboard) await recargarDashboard();
  });
  on('nav-user-dashboard',     'click', async () => {
    setState({ screen: 'dashboard' });
    if (!state.dashboard) await recargarDashboard();
  });
  on('nav-admin-usuarios',     'click', goToUsuarios);
  on('nav-admin-locales',      'click', goToLocales);
  on('nav-admin-auditoria',    'click', () => setState({ screen: 'setup' }));
  on('nav-user-inicio',        'click', () => setState({ screen: 'welcome' }));
  on('nav-user-auditoria',     'click', () => setState({ screen: 'setup' }));
  on('nav-user-historial',     'click', async () => {
    setState({ screen: 'historial', historialDetalle: null });
    if (!state.historial) await recargarHistorial();
  });

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
  on('btn-draft-export', 'click', exportarBorrador);
  on('btn-draft-reenviar', 'click', () => {
    // Restaurar el estado del borrador y reenviar
    try {
      const raw = localStorage.getItem('audit_draft');
      if (!raw) { alert('No hay borrador para reenviar.'); return; }
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
        sendUnconfirmed:     false,
      });
      submitAudit();
    } catch(e) {
      alert('No se pudo reenviar el borrador: ' + e.message);
    }
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
      // Normalizar coma decimal → punto (Argentina usa coma, internamente usamos punto)
      const normalized = inp.value.replace(/,/g, '.');
      state.answers[qid].valor = normalized;
    });
  });

  // Número con validación automática — sin render() para no perder el foco
  const colorMap = { 'Cumple': '#16a34a', 'Cumple parcialmente': '#d97706', 'No Cumple': '#e4001b' };
  const bgMap    = { 'Cumple': '#f0fdf4', 'Cumple parcialmente': '#fffbeb', 'No Cumple': '#fff1f2' };
  document.querySelectorAll('.number-input-validated').forEach(inp => {
    inp.addEventListener('input', () => {
      const qid = inp.dataset.qid;
      const q = state.categories.flatMap(c => c.questions).find(q => q.id === qid);
      if (!state.answers[qid]) state.answers[qid] = {};
      const raw = inp.value; // type="number" always gives period-separated decimals
      state.answers[qid].rawValor = raw;
      const regla = parseValidacion(q?.validacion || '');
      const resultado = raw ? evaluarNumero(raw, regla) : null;
      state.answers[qid].valor = resultado || raw;
      guardarBorrador();
      // Actualizar badge sin re-renderizar
      const badge = document.getElementById(`badge_num_${qid}`);
      if (badge) {
        if (resultado) {
          badge.style.display = '';
          const sp = badge.querySelector('span');
          if (sp) { sp.style.background = bgMap[resultado]; sp.style.color = colorMap[resultado]; sp.textContent = resultado; }
        } else {
          badge.style.display = 'none';
        }
      }
    });
  });


  // Fecha vencimiento — usar blur para no interrumpir el tipeo del año
  document.querySelectorAll('.fecha-venc-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      const qid = inp.dataset.qid;
      if (!inp.value) return;
      if (!state.answers[qid]) state.answers[qid] = {};
      state.answers[qid].fechaRaw = inp.value;
      const ev = evaluarFecha(inp.value);
      state.answers[qid].valor = ev ? ev.resultado : inp.value;
      guardarBorrador();
      render();
    });
  });

  // Fecha No aplica
  document.querySelectorAll('.fecha-na-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const qid = chk.dataset.qid;
      if (!state.answers[qid]) state.answers[qid] = {};
      if (chk.checked) {
        state.answers[qid].valor = 'No aplica';
        state.answers[qid].fechaRaw = '';
      } else {
        state.answers[qid].valor = '';
        state.answers[qid].fechaRaw = '';
      }
      guardarBorrador();
      render();
    });
  });

  // Número No aplica
  document.querySelectorAll('.numero-na-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const qid = chk.dataset.qid;
      if (!state.answers[qid]) state.answers[qid] = {};
      if (chk.checked) {
        state.answers[qid].valor = 'No aplica';
        state.answers[qid].rawValor = '';
      } else {
        state.answers[qid].valor = '';
        state.answers[qid].rawValor = '';
      }
      guardarBorrador();
      render();
    });
  });

  // Headcount
  document.querySelectorAll('.headcount-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const qid = inp.dataset.qid;
      const sector = inp.dataset.sector;
      if (!state.answers[qid]) state.answers[qid] = {};
      if (!state.answers[qid].headcount) state.answers[qid].headcount = {};
      state.answers[qid].headcount[sector] = inp.value;
      state.answers[qid].valor = 'N/A';
      guardarBorrador();
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
      const dataURL = await compressImage(file, 600, 0.55);
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

  on('btn-reenviar-audit', 'click', submitAudit);
  on('btn-export-unconfirmed', 'click', exportarBorrador);
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

  // ============================================================
  // HISTORIAL
  // ============================================================
  on('btn-go-historial', 'click', async () => {
    setState({ screen: 'historial', historialDetalle: null });
    if (!state.historial) await recargarHistorial();
  });
  on('nav-admin-historial', 'click', async () => {
    setState({ screen: 'historial', historialDetalle: null });
    if (!state.historial) await recargarHistorial();
  });
  on('btn-dashboard-refresh', 'click', async () => {
    setState({ dashboard: null });
    await recargarDashboard();
  });
  on('btn-dashboard-retry', 'click', recargarDashboard);
  window.__dbTipo = async function(tipo) {
    if (state.dashboardTipo === tipo && state.dashboardView !== 'ranking') return;
    state.dashboardTipo = tipo;
    state.dashboardView = 'local';
    state.dashboard = null;
    render();
    await recargarDashboard();
  };
  window.__histTipo = function(tipo) {
    state.historialTipo = tipo;
    render();
  };
  const dbSelect = document.getElementById('db-local-select');
  if (dbSelect) {
    dbSelect.addEventListener('change', () => {
      state.dashboardLocal = dbSelect.value;
      render();
    });
  }
  on('btn-historial-refresh', 'click', async () => {
    setState({ historial: null });
    await recargarHistorial();
  });
  on('btn-historial-retry', 'click', recargarHistorial);

  // Search input
  const inpHistSearch = document.getElementById('inp-historial-search');
  if (inpHistSearch) {
    inpHistSearch.addEventListener('input', () => {
      const val = inpHistSearch.value;
      const pos = inpHistSearch.selectionStart;
      state.historialSearch = val;
      render();
      const el = document.getElementById('inp-historial-search');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch(e){} }
    });
  }

  // Helper: cargar detalle completo de una auditoría
  async function cargarDetalleAudit(auditId) {
    const res = await callAPI({ action: 'getAuditoria', email: state.user.email, token: state.user.token, auditId });
    if (!res.success) throw new Error(res.error || 'Error al cargar');
    return res;
  }

  // 👁 Ver detalle
  document.querySelectorAll('.hist-btn-ver').forEach(btn => {
    btn.addEventListener('click', async () => {
      const auditId = btn.dataset.auditId;
      if (!auditId) return;
      setState({ screen: 'historial-detalle', historialDetalleLoading: true, historialDetalle: null, historialDetalleError: '', historialAccionando: auditId });
      try {
        const res = await cargarDetalleAudit(auditId);
        setState({ historialDetalle: res, historialDetalleLoading: false, historialAccionando: '' });
      } catch(e) {
        setState({ historialDetalleLoading: false, historialDetalleError: e.message, historialAccionando: '' });
      }
    });
  });

  // ✏️ Editar (carga detalle y abre cat-select)

  document.querySelectorAll('.hist-btn-editar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const auditId = btn.dataset.auditId;
      if (!auditId) return;
      setState({ historialAccionando: auditId });
      try {
        const d = await cargarDetalleAudit(auditId);
        setState({ historialAccionando: '', historialDetalle: d });
        const localObj = state.locales.find(l => l.nombre === d.local) || { nombre: d.local, isCausa: false, emails: '' };
        const cats = buildCategories(localObj.isCausa);
        const newAnswers = {};
        cats.forEach(cat => {
          cat.questions.forEach(q => {
            const row = d.respuestas.find(r => r.control === q.control);
            if (row) newAnswers[q.id] = restoreAnswerFromRow(q, row);
          });
        });
        Object.assign(state, {
          screen: 'cat-select', local: localObj,
          fecha: d.fechaISO || d.fecha || state.fecha,
          auditor: d.auditor || state.auditor,
          auditorEmail: d.auditorEmail || state.auditorEmail,
          acompanante: d.acompanante || '', posicionAcompanante: '',
          categories: cats, categoryIndex: 0, questionIndex: 0,
          answers: newAnswers, skipped: {},
          editingAuditId: auditId,
        });
        render();
      } catch(e) {
        setState({ historialAccionando: '' });
        alert('Error al cargar auditoría: ' + e.message);
      }
    });
  });

  // 🗑 Borrar desde la lista
  document.querySelectorAll('.hist-btn-borrar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const auditId = btn.dataset.auditId;
      const local   = btn.dataset.local;
      const fecha   = btn.dataset.fecha;
      if (!auditId) return;
      if (!confirm(`¿Borrar la auditoría de "${local}" del ${fecha}?\nEsta acción no se puede deshacer.`)) return;
      setState({ historialAccionando: auditId });
      try {
        await callAPI({ action: 'borrarAuditoria', auditId });
        setState({ historialAccionando: '', historial: null, historialBorradoMsg: `✓ Auditoría de ${local} borrada correctamente` });
        await recargarHistorial();
      } catch(e) {
        setState({ historialAccionando: '' });
        alert('Error al borrar: ' + e.message);
      }
    });
  });

  on('btn-historial-detalle-back',        'click', () => setState({ screen: 'historial' }));
  on('btn-historial-detalle-back-footer', 'click', () => setState({ screen: 'historial' }));

  // Acordeón de categorías en historial detalle
  document.querySelectorAll('.cat-acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const arrow  = btn.querySelector('.cat-acc-arrow');
      if (!target) return;
      const isOpen = target.style.display !== 'none';
      target.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  });

  on('btn-historial-borrar', 'click', async () => {
    const d = state.historialDetalle;
    if (!d) return;
    if (!confirm(`¿Borrar la auditoría de "${d.local}" del ${d.fecha}?\nEsta acción no se puede deshacer.`)) return;
    setState({ historialBorrando: true });
    try {
      await callAPI({ action: 'borrarAuditoria', auditId: d.auditId });
      setState({ historialBorrando: false, screen: 'historial', historialDetalle: null, historial: null, historialBorradoMsg: `✓ Auditoría de ${d.local} borrada correctamente` });
      await recargarHistorial();
    } catch(e) {
      setState({ historialBorrando: false });
      alert('Error al borrar: ' + e.message);
    }
  });

  // Edit: load answers back into state and open cat-select
  on('btn-historial-editar', 'click', () => {
    const d = state.historialDetalle;
    if (!d) return;
    const localObj = state.locales.find(l => l.nombre === d.local) || { nombre: d.local, isCausa: false, emails: '' };
    const cats = buildCategories(localObj.isCausa);
    const newAnswers = {};
    cats.forEach(cat => {
      cat.questions.forEach(q => {
        const row = d.respuestas.find(r => r.control === q.control);
        if (row) newAnswers[q.id] = restoreAnswerFromRow(q, row);
      });
    });
    Object.assign(state, {
      screen:              'cat-select',
      local:               localObj,
      fecha:               d.fechaISO || d.fecha || state.fecha,
      auditor:             d.auditor  || state.auditor,
      auditorEmail:        d.auditorEmail || state.auditorEmail,
      acompanante:         d.acompanante || '',
      posicionAcompanante: '',
      categories:          cats,
      categoryIndex:       0,
      questionIndex:       0,
      answers:             newAnswers,
      skipped:             {},
      editingAuditId:      d.auditId,
    });
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
  const regla0 = parseValidacion(q0.validacion || '');
  const tieneVal0 = regla0 && (regla0.tipo === 'numero' || regla0.tipo === 'fecha');
  if (!tieneVal0 && (val0 === 'no cumple' || val0.includes('parcial'))) {
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
  if (!state.local) return;
  // No guardar en success a menos que haya quedado sin confirmar (necesitamos el borrador para reenviar)
  if (state.screen === 'success' && !state.sendUnconfirmed) return;
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
    if (json.length <= 4 * 1024 * 1024) {
      localStorage.setItem('audit_draft', json);
    } else {
      // Draft too large: strip photos only from the localStorage copy.
      // state.answers in memory is NEVER touched — photos stay live during the session.
      const slim = Object.assign({}, draft);
      const answersSinFotos = {};
      Object.keys(draft.answers).forEach(qid => {
        const a = Object.assign({}, draft.answers[qid]);
        delete a.foto;
        delete a.fotos;
        answersSinFotos[qid] = a;
      });
      slim.answers = answersSinFotos;
      try { localStorage.setItem('audit_draft', JSON.stringify(slim)); } catch(e2) {}
    }
  } catch(e) {}
}

function borrarBorrador() {
  try { localStorage.removeItem('audit_draft'); } catch(e) {}
  try { localStorage.removeItem('audit_unconfirmed'); } catch(e) {}
  state.editingAuditId = '';
}

function exportarBorrador() {
  try {
    const raw = localStorage.getItem('audit_draft');
    if (!raw) { alert('No hay borrador guardado.'); return; }
    const draft = JSON.parse(raw);
    let txt = '=== AUDITORÍA EXPORTADA ===\n';
    txt += `Local: ${draft.local?.nombre || ''}\n`;
    txt += `Fecha: ${draft.fecha || ''}\n`;
    txt += `Auditor: ${draft.auditor || ''}\n`;
    if (draft.ts) txt += `Guardada: ${new Date(draft.ts).toLocaleString('es-AR')}\n`;
    txt += '\n--- RESPUESTAS ---\n\n';
    const answers = draft.answers || {};
    const allQs = state.categories?.length
      ? state.categories.flatMap(c => c.questions)
      : [];
    if (allQs.length) {
      allQs.forEach(q => {
        const a = answers[q.id] || {};
        txt += `[${q.categoria}] ${q.control}\n`;
        txt += `  Respuesta: ${a.valor || '(sin responder)'}\n`;
        if (a.observacion) txt += `  Obs: ${a.observacion}\n`;
        txt += '\n';
      });
    } else {
      txt += JSON.stringify(answers, null, 2);
    }
    if (navigator.share) {
      navigator.share({ title: 'Auditoría exportada', text: txt }).catch(() => copiarAlPortapapeles(txt));
    } else {
      copiarAlPortapapeles(txt);
    }
  } catch(e) {
    alert('No se pudieron exportar las respuestas.');
  }
}

function copiarAlPortapapeles(txt) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt)
      .then(() => alert('✓ Texto copiado al portapapeles.\nPodés pegarlo en un email o WhatsApp.'))
      .catch(() => mostrarTextoExportado(txt));
  } else {
    mostrarTextoExportado(txt);
  }
}

function mostrarTextoExportado(txt) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;flex-direction:column;padding:16px;gap:12px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:16px;flex:1;display:flex;flex-direction:column;gap:8px;overflow:hidden">
      <div style="font-weight:700;font-size:0.95rem">Seleccioná y copiá el texto</div>
      <textarea readonly style="flex:1;font-size:0.75rem;border:1px solid #e5e7eb;border-radius:8px;padding:8px;resize:none;font-family:monospace;-webkit-user-select:all;user-select:all">${txt.replace(/</g,'&lt;')}</textarea>
      <button style="background:#e4001b;color:#fff;border:none;border-radius:8px;padding:12px;font-weight:600;font-size:0.9rem;cursor:pointer" id="btn-close-export">Cerrar</button>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector('textarea');
  ta.focus(); ta.select();
  overlay.querySelector('#btn-close-export').addEventListener('click', () => overlay.remove());
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
      headcount:    ans.headcount   || null,
      rawValor:     ans.rawValor    || null,
      fechaRaw:     ans.fechaRaw    || null,
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
    const originalAuditId = state.editingAuditId;

    if (originalAuditId) {
      // ── EDICIÓN EN EL LUGAR ──────────────────────────────────
      overlay.querySelector('.overlay-text').textContent = 'Guardando cambios...';
      const editPayload = {
        action:          'editarAuditoria',
        originalAuditId,
        hora:            new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        auditorEmail:    state.auditorEmail,
        token:           state.user?.token || '',
        respuestas,
      };
      const editRaw = await fetch(CONFIG.appsScriptURL, { method: 'POST', body: JSON.stringify(editPayload), redirect: 'follow' });
      if (!editRaw.ok) throw new Error('HTTP ' + editRaw.status);
      const editRes = await editRaw.json();
      if (!editRes.success) throw new Error(editRes.error || 'Error al guardar cambios');
      const editPuntaje = { pct: editRes.pct, nivel: editRes.nivel, reprobado: editRes.reprobado };
      setState({ screen: 'success', auditId: originalAuditId, emailStatus: '', lastPuntaje: editPuntaje, desviosRepetidos: [], editingAuditId: '' });
      borrarBorrador();
      // ─────────────────────────────────────────────────────────
    } else {
      // ── NUEVA AUDITORÍA ──────────────────────────────────────
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
        if (Date.now() - sendStart < 3000) {
          throw new Error('La auditoría no pudo enviarse. Verificá tu conexión e intentá de nuevo.');
        }
      } finally {
        clearTimeout(timeoutId);
      }

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
        setState({ screen: 'success', auditId, emailStatus: '', lastPuntaje: puntaje, desviosRepetidos: [], editingAuditId: '' });
        borrarBorrador();
      } else {
        setState({ screen: 'success', auditId, emailStatus: '', lastPuntaje: puntaje, desviosRepetidos: [], sendUnconfirmed: true });
        try { localStorage.setItem('audit_unconfirmed', auditId); } catch(e) {}
      }
      // ─────────────────────────────────────────────────────────
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
