// ============================================================
// GOOGLE APPS SCRIPT — Sistema de Auditorías Sushi POP
// ============================================================

const SPREADSHEET_ID  = '1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI';
const SHEET_NAME      = 'Resultados';
const DRIVE_FOLDER_ID = '1SJe5kNlEXBpRlFPylSTbS4XedI0ZIC7P';
const USUARIOS_SHEET          = 'Usuarios';
const USUARIOS_SPREADSHEET_ID = '1TeeKe1eYsKIZ6-8uEPOY0UT-wrtrwl0FW4hAgBoIkzY';

// ============================================================
// CACHÉ — CacheService (TTL en segundos)
// ============================================================
function cacheGetParsed(key) {
  try {
    var s = CacheService.getScriptCache().get(key);
    return s ? JSON.parse(s) : null;
  } catch(e) { return null; }
}
function cachePutObj(key, obj, ttl) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(obj), ttl); } catch(e) {}
}
function cacheRemoveKey(key) {
  try { CacheService.getScriptCache().remove(key); } catch(e) {}
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet  = ss.getSheetByName(SHEET_NAME);

    // Crear hoja si no existe
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'AuditID','Fecha','Hora','Auditor','Local','Marca',
        'Categoría','Subcategoría','Control','Importancia',
        'Explicación','Respuesta','Observación','URL Foto','Email Auditor',
        'Puntaje %','Nivel','Reprobado','Acompañante','Tipo'
      ]);
      sheet.getRange(1,1,1,20).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Carpeta de fotos para esta auditoría: Auditorias/Fotos Auditorias/[Local]/[fecha]/
    let auditFolder = null;
    if (DRIVE_FOLDER_ID) {
      try {
        var rootDrive     = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        var fotosMainIt   = rootDrive.getFoldersByName('Fotos Auditorias');
        var fotosMain     = fotosMainIt.hasNext() ? fotosMainIt.next() : rootDrive.createFolder('Fotos Auditorias');
        var localFotosIt  = fotosMain.getFoldersByName(data.local);
        var localFotos    = localFotosIt.hasNext() ? localFotosIt.next() : fotosMain.createFolder(data.local);
        auditFolder = localFotos.createFolder(formatFechaISO(data.fecha));
      } catch(e) { console.error('Drive folder error:', e); }
    }

    // Construir filas
    const rows = data.respuestas.map(r => {
      var fotoURL = '';
      if (auditFolder) {
        // Soporte para múltiples fotos (fotosBase64) y compatibilidad con fotoBase64 único
        var fotoSources = r.fotosBase64 && r.fotosBase64.length
          ? r.fotosBase64
          : (r.fotoBase64 ? [{ base64: r.fotoBase64, nombre: r.fotoNombre || 'foto.jpg' }] : []);
        var urls = [];
        fotoSources.forEach(function(foto, idx) {
          if (!foto.base64) return;
          try {
            var blob = Utilities.newBlob(Utilities.base64Decode(foto.base64), 'image/jpeg', foto.nombre || ('foto_' + (idx+1) + '.jpg'));
            var file = auditFolder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            urls.push(file.getUrl());
          } catch(imgErr) { console.error('Foto error:', imgErr); }
        });
        fotoURL = urls.join(',');
      }
      return [
        data.auditId, data.fecha, data.hora,
        data.auditor,
        data.local,
        r.marca || data.marca,
        r.categoria, r.subcategoria, r.control, r.importancia,
        r.explicacion, r.respuesta, r.observacion, fotoURL,
        data.auditorEmail || '',
        data.puntaje?.pct    ?? '',             // col P — Puntaje %
        data.puntaje?.nivel  || '',             // col Q — Nivel
        data.puntaje?.reprobado ? 'Sí' : 'No', // col R — Reprobado
        data.acompanante ? (data.acompanante + (data.posicionAcompanante ? '|||' + data.posicionAcompanante : '')) : '', // col S — Acompañante|||Posición
        data.tipoAuditoria || 'Oficial',        // col T — Tipo
      ];
    });

    if (rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 20).setValues(rows);
      // Force text format on Respuesta (col 12) and Observación (col 13) so numbers
      // don't get auto-parsed as dates by Sheets
      sheet.getRange(startRow, 12, rows.length, 2).setNumberFormat('@');
      colorearDesvios(sheet, rows);
      // Invalidar caché de auditorías y dashboard del auditor y del admin
      if (data.auditorEmail) {
        cacheRemoveKey('aud_' + data.auditorEmail.toLowerCase());
        cacheRemoveKey('db_'  + data.auditorEmail.toLowerCase());
      }
      cacheRemoveKey('aud_all');
      cacheRemoveKey('db_all'); // dashboard admin uses db_<adminEmail>, but we don't know it — TTL will expire
    }

    // Detectar desvíos repetidos (aparecen en últimas 2 auditorías del mismo local)
    const desviosRepetidos = detectarDesviosRepetidos(sheet, data.local, data.auditId, rows);

    // Calcular historial y generar PDF
    const historial = calcularHistorial(sheet, data.local, data.auditId, data.fecha, data.puntaje);
    const pdfResult = generarPDF(data, rows, desviosRepetidos, historial);

    // Enviar email al local
    let emailStatus = 'no configurado';
    if (data.emailsLocal && data.emailsLocal.trim()) {
      try {
        enviarEmailAuditoria(data, rows, desviosRepetidos, historial, pdfResult);
        emailStatus = 'enviado a ' + data.emailsLocal;
      } catch(mailErr) {
        console.error('Email error:', mailErr);
        emailStatus = 'ERROR: ' + mailErr.message;
      }
    }

    return jsonResponse({ success: true, auditId: data.auditId, rows: rows.length, email: emailStatus, desviosRepetidos: desviosRepetidos });
  } catch(err) {
    console.error('Error doPost:', err);
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// DETECCIÓN DE DESVÍOS REPETIDOS
// ============================================================
function detectarDesviosRepetidos(sheet, local, auditIdActual, rowsActuales) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // Leer todas las filas del sheet (sin encabezado)
    const allData = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

    // Filtrar filas del mismo local, excluyendo la auditoría actual
    // Col A(0)=AuditID, Col E(4)=Local, Col I(8)=Control, Col G(6)=Categoria, Col H(7)=Subcategoria, Col L(11)=Respuesta
    const rowsLocal = allData.filter(function(r) {
      return r[4] === local && r[0] !== auditIdActual && r[0];
    });

    if (!rowsLocal.length) return [];

    // Obtener los últimos 2 AuditIDs distintos (en orden cronológico)
    var auditIds = [];
    rowsLocal.forEach(function(r) {
      if (auditIds.indexOf(r[0]) === -1) auditIds.push(r[0]);
    });
    var last2 = auditIds.slice(-2);
    if (last2.length < 2) return []; // Necesitamos al menos 2 auditorías previas

    // Recolectar No Cumple por cada auditoría previa
    var noCumplePrevio = {};
    last2.forEach(function(id) { noCumplePrevio[id] = {}; });

    rowsLocal.forEach(function(r) {
      if (last2.indexOf(r[0]) === -1) return;
      var res = (r[11]||'').toLowerCase();
      if (res.includes('no cumple') || res === 'nocumple') {
        var key = r[6] + '|' + r[7] + '|' + r[8]; // categoria|subcategoria|control
        noCumplePrevio[r[0]][key] = true;
      }
    });

    // No Cumple en la auditoría actual
    var noCumpleActual = {};
    rowsActuales.forEach(function(r) {
      var res = (r[11]||'').toLowerCase();
      if (res.includes('no cumple') || res === 'nocumple') {
        var key = r[6] + '|' + r[7] + '|' + r[8];
        noCumpleActual[key] = r;
      }
    });

    // Encontrar los que aparecen en al menos 1 de las 2 previas Y en la actual
    var repetidos = [];
    Object.keys(noCumpleActual).forEach(function(key) {
      var count = last2.filter(function(id) { return noCumplePrevio[id][key]; }).length;
      if (count > 0) {
        var r = noCumpleActual[key];
        repetidos.push({ categoria: r[6], subcategoria: r[7], control: r[8], importancia: r[9], repeticiones: count });
      }
    });

    return repetidos;
  } catch(err) {
    console.error('Error detectarDesviosRepetidos:', err);
    return [];
  }
}

// ============================================================
// HELPER: FECHA → YYYY-MM-DD (para nombres de archivo)
// ============================================================
function formatFechaISO(f) {
  if (!f) return '';
  // Si es Date (de getValues()), usar métodos locales directamente
  if (f instanceof Date) {
    var dd = ('0' + f.getDate()).slice(-2);
    var mm = ('0' + (f.getMonth() + 1)).slice(-2);
    return f.getFullYear() + '-' + mm + '-' + dd;
  }
  // Si es string, parsear manualmente para evitar desfase UTC
  var s = String(f);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Último recurso: new Date (puede haber desfase en strings)
  var d = new Date(f);
  if (!isNaN(d.getTime())) {
    var dd2 = ('0' + d.getDate()).slice(-2);
    var mm2 = ('0' + (d.getMonth() + 1)).slice(-2);
    return d.getFullYear() + '-' + mm2 + '-' + dd2;
  }
  return s;
}

// ============================================================
// HELPER: FORMATEAR FECHA YYYY-MM-DD → DD/MM/AAAA
// ============================================================
function formatFecha(f) {
  if (!f) return '';
  // Si es Date (de getValues()), usar métodos locales directamente
  if (f instanceof Date) {
    var dd = ('0' + f.getDate()).slice(-2);
    var mm = ('0' + (f.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + f.getFullYear();
  }
  // Si es string YYYY-MM-DD, parsear manualmente para evitar desfase UTC
  var s = String(f);
  var p = s.split('-');
  if (p.length === 3 && p[0].length === 4) return p[2] + '/' + p[1] + '/' + p[0];
  // Último recurso: new Date
  var d = new Date(f);
  if (!isNaN(d.getTime())) {
    var dd2  = ('0' + d.getDate()).slice(-2);
    var mm2  = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd2 + '/' + mm2 + '/' + d.getFullYear();
  }
  return s;
}

// ============================================================
// HISTORIAL DEL LOCAL
// ============================================================
function calcularHistorial(sheet, local, auditIdActual, fechaActual, puntajeActual) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    var allData = sheet.getRange(2, 1, lastRow - 1, 20).getValues();

    // Filas del mismo local, excluyendo la auditoría actual
    var rowsLocal = allData.filter(function(col) {
      return col[4] === local && col[0] !== auditIdActual && col[0];
    });

    // Solo auditorías Oficiales para historial y promedio
    var rowsOficial = rowsLocal.filter(function(col) {
      return !col[19] || col[19] === 'Oficial';
    });

    var prevAudit = null;
    if (rowsOficial.length > 0) {
      var last = rowsOficial[rowsOficial.length - 1];
      prevAudit = {
        pct:       last[15],
        nivel:     last[16],
        fecha:     last[1],
        reprobado: last[17] === 'Sí',
      };
    }

    // Promedio del mes — solo Oficial (incluye la auditoría actual si también es Oficial)
    var yearMonth = String(fechaActual).substring(0, 7);
    var rowsMes = rowsOficial.filter(function(col) {
      return String(col[1]).substring(0, 7) === yearMonth;
    });

    var pctValues = rowsMes.map(function(col) { return Number(col[15]) || 0; });
    if (puntajeActual && puntajeActual.pct !== undefined) {
      pctValues.push(Number(puntajeActual.pct) || 0);
    }
    var promedioMes = pctValues.length > 0 ? Math.round(pctValues.reduce(function(a,b){ return a+b; }, 0) / pctValues.length) : null;
    var auditsMes = pctValues.length;

    return { prevAudit: prevAudit, promedioMes: promedioMes, auditsMes: auditsMes };
  } catch(err) {
    console.error('Error calcularHistorial:', err);
    return null;
  }
}

// ============================================================
// GENERAR PDF
// ============================================================
function generarPDF(data, rows, desviosRepetidos, historial) {
  var docTitle = 'Auditoria_' + data.local + '_' + data.fecha + '_' + data.auditId;

  var htmlContent = buildAuditHtml(data, rows, desviosRepetidos, historial, '');
  htmlContent = embedDriveImagesAsBase64(htmlContent); // embeber fotos para que aparezcan en el PDF

  var htmlBlob = Utilities.newBlob(htmlContent, 'text/html', docTitle + '.html');
  var tempFile = DriveApp.createFile(htmlBlob);
  var pdfBlob = tempFile.getAs('application/pdf');
  pdfBlob.setName(docTitle + '.pdf');
  tempFile.setTrashed(true);

  // Guardar PDF en: Auditorias/Informes PDF/[Local]/Aud_[Local]_[fecha].pdf
  var pdfRootFolder  = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var pdfMainIt      = pdfRootFolder.getFoldersByName('Informes PDF');
  var pdfMain        = pdfMainIt.hasNext() ? pdfMainIt.next() : pdfRootFolder.createFolder('Informes PDF');
  var localPdfIt     = pdfMain.getFoldersByName(data.local);
  var localPdfFolder = localPdfIt.hasNext() ? localPdfIt.next() : pdfMain.createFolder(data.local);
  var pdfFileName    = 'Aud_' + data.local.replace(/\s+/g, '_') + '_' + formatFechaISO(data.fecha) + '.pdf';
  pdfBlob.setName(pdfFileName);

  var pdfFile = localPdfFolder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = pdfFile.getUrl();

  var attachBlob = pdfFile.getBlob();
  attachBlob.setName(pdfFileName);

  return { blob: attachBlob, url: pdfUrl, nombre: docTitle + '.pdf' };
}

// ============================================================
// CONSTRUIR HTML DE AUDITORÍA (usado por email y PDF)
// ============================================================
function buildAuditHtml(data, rows, desviosRepetidos, historial, pdfUrl) {
  // Estadísticas
  var cumple   = rows.filter(function(r){ return (r[11]||'').toLowerCase() === 'cumple'; }).length;
  var noCumple = rows.filter(function(r){ var v=(r[11]||'').toLowerCase(); return v.includes('no cumple')||v==='nocumple'; }).length;
  var parcial  = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('parcial'); }).length;
  var noAplica = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('aplica'); }).length;
  var total    = rows.filter(function(r){ return r[11]; }).length;
  var pct      = total ? Math.round(cumple / total * 100) : 0;

  // Gráfico torta
  var chartTotal = cumple + noCumple + parcial;
  var pCumple   = chartTotal ? Math.round(cumple   / chartTotal * 100) : 0;
  var pNoCumple = chartTotal ? Math.round(noCumple / chartTotal * 100) : 0;
  var pParcial  = chartTotal ? Math.round(parcial  / chartTotal * 100) : 0;
  var chartData = JSON.stringify({
    type: 'pie',
    data: {
      labels: ['Cumple ' + pCumple + '%', 'No Cumple ' + pNoCumple + '%', 'Parcial ' + pParcial + '%'],
      datasets: [{ data: [cumple, noCumple, parcial], backgroundColor: ['#16a34a','#e4001b','#d97706'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { fontSize: 13, padding: 16 } },
        datalabels: { display: false }
      }
    }
  });
  var chartUrlRaw = 'https://quickchart.io/chart?c=' + encodeURIComponent(chartData) + '&width=420&height=220&backgroundColor=white';
  // Embed chart as base64 so it renders in PDF (external URLs often blocked in getAs('pdf'))
  var chartUrl = chartUrlRaw;
  try {
    var chartResp = UrlFetchApp.fetch(chartUrlRaw, { muteHttpExceptions: true });
    if (chartResp.getResponseCode() === 200) {
      var chartB64 = Utilities.base64Encode(chartResp.getContent());
      chartUrl = 'data:image/png;base64,' + chartB64;
    }
  } catch(chartErr) { /* keep external URL as fallback */ }

  // ---- 1. HEADER ----
  var fechaHora = formatFecha(data.fecha) + ' - ' + (data.hora || '');
  var puntajeHtml = '';
  if (data.puntaje) {
    var pLabel = data.puntaje.reprobado ? 'REPROBADO' : data.puntaje.pct + '%';
    var pSub   = data.puntaje.nivel + (!data.puntaje.reprobado ? ' · ' + data.puntaje.obtenido + '/' + data.puntaje.posible + ' pts' : '');
    puntajeHtml = '<div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:12px 24px">'
      + '<div style="font-size:40px;font-weight:900;color:#fff">' + pLabel + '</div>'
      + '<div style="font-size:14px;color:rgba(255,255,255,0.9);font-weight:600;margin-top:2px">' + pSub + '</div>'
      + '</div>';
  }

  var headerBg = (data.puntaje && data.puntaje.reprobado) ? '#e4001b' : '#16a34a';
  var headerHtml = '<div style="background:' + headerBg + ';padding:24px 32px;text-align:center">'
    + '<h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Informe de Auditor&iacute;a</h1>'
    + '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">' + data.local + ' · ' + fechaHora + '</p>'
    + puntajeHtml + '</div>';

  // ---- 2. DATOS ----
  var acompananteLabel = data.acompanante
    ? data.acompanante + (data.posicionAcompanante ? ' &mdash; ' + data.posicionAcompanante : '')
    : '';
  var acompananteDiv = acompananteLabel
    ? '<div style="padding:3px 0"><span style="color:#666;font-size:13px">Acompa&ntilde;ante</span><br><span style="font-weight:600;font-size:13px">' + acompananteLabel + '</span></div>'
    : '';

  var datosHtml = '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr>'
    + '<td style="vertical-align:top;width:50%;padding-right:16px">'
    + '<div style="padding:3px 0"><span style="color:#666;font-size:13px">Local</span><br><span style="font-weight:600;font-size:13px">' + data.local + '</span></div>'
    + '<div style="padding:3px 0"><span style="color:#666;font-size:13px">Fecha</span><br><span style="font-weight:600;font-size:13px">' + formatFecha(data.fecha) + ' ' + (data.hora || '') + '</span></div>'
    + '<div style="padding:3px 0"><span style="color:#666;font-size:13px">Marca</span><br><span style="font-weight:600;font-size:13px">' + data.marca + '</span></div>'
    + '</td>'
    + '<td style="vertical-align:top;width:50%">'
    + '<div style="padding:3px 0"><span style="color:#666;font-size:13px">Auditor</span><br><span style="font-weight:600;font-size:13px">' + data.auditor + '</span></div>'
    + acompananteDiv
    + '</td>'
    + '</tr>'
    + '</table></div>';

  // ---- 3. HISTORIAL ----
  var seccionHistorial = '';
  if (historial) {
    var histHtml = '';
    if (historial.prevAudit) {
      var pa = historial.prevAudit;
      var paLabel = pa.reprobado ? 'REPROBADO' : pa.pct + '% (' + pa.nivel + ')';
      histHtml += '<p style="margin:0 0 8px;font-size:13px;color:#1a1a1a">'
        + '<strong>Auditor&iacute;a anterior:</strong> ' + formatFecha(pa.fecha) + ' — ' + paLabel + '</p>';
    }
    if (historial.promedioMes !== null) {
      histHtml += '<p style="margin:0;font-size:13px;color:#1a1a1a">'
        + '<strong>Promedio del mes (' + historial.auditsMes + ' auditor&iacute;a' + (historial.auditsMes !== 1 ? 's' : '') + '):</strong> '
        + historial.promedioMes + '%</p>';
    }
    if (histHtml) {
      seccionHistorial = '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb;background:#f8fafc">'
        + '<h2 style="margin:0 0 12px;font-size:15px;color:#1a1a1a">Historial</h2>'
        + histHtml + '</div>';
    }
  }

  // ---- 4. REPROBADO POR NOTA DE ORO ----
  var seccionReprobado = '';
  if (data.puntaje && data.puntaje.reprobado) {
    var criticosReprobados = rows.filter(function(r) {
      var imp = (r[9]||'').toLowerCase().replace(/í/g,'i');
      var res = (r[11]||'').toLowerCase();
      return (imp === 'critico') && (res.includes('no cumple') || res === 'nocumple');
    });
    var filasCrit = '';
    criticosReprobados.forEach(function(r) {
      var fotoDirecta = driveImgUrl(r[13]);
      var tdWidth = fotoDirecta ? '55%' : '100%';
      var obsHtml = r[12] ? '<div style="font-size:12px;color:#7f1d1d;font-style:italic;margin-top:4px">"' + r[12] + '"</div>' : '';
      var explHtmlCrit = r[10] ? '<div style="font-size:12px;color:#666;font-style:italic;margin-bottom:4px">' + r[10] + '</div>' : '';
      var fotoTd = fotoDirecta
        ? '<td style="vertical-align:top;padding-left:12px;width:45%"><img src="' + fotoDirecta + '" alt="Foto" style="width:100%;max-width:200px;border-radius:6px;border:1px solid #fca5a5"></td>'
        : '';
      filasCrit +=
        '<div style="background:#fff1f2;border-radius:8px;padding:16px;margin-bottom:12px;border-left:4px solid #e4001b">'
        + '<table style="width:100%;border-collapse:collapse"><tr>'
        + '<td style="vertical-align:top;width:' + tdWidth + '">'
        + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' › ' + r[7] + '</div>'
        + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px">' + r[8] + '</div>'
        + explHtmlCrit
        + '<div style="font-size:13px;font-weight:700;color:#e4001b;margin-bottom:4px">● No Cumple (Cr&iacute;tico)</div>'
        + obsHtml
        + '</td>' + fotoTd + '</tr></table></div>';
    });
    seccionReprobado =
      '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;background:#fff1f2">'
      + '<h2 style="margin:0 0 8px;font-size:16px;color:#991b1b">⛔ REPROBADO por Nota de Oro</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;color:#7f1d1d">La auditor&iacute;a fue reprobada por incumplimiento de puntos cr&iacute;ticos (Nota de Oro):</p>'
      + filasCrit + '</div>';
  }

  // ---- 5+6. GRÁFICO Y % POR CATEGORÍA ----
  var maxPts     = { 'critico':4,'crítico':4,'alta':3,'media':2,'baja':1 };
  var parcialPts = { 'critico':2,'crítico':2,'alta':1,'media':1,'baja':0 };
  var catMap = {};
  rows.forEach(function(r) {
    var cat = r[6] || 'Sin categor&iacute;a';
    var res = (r[11]||'').toLowerCase().trim();
    var imp = (r[9]||'').toLowerCase().trim();
    if (!catMap[cat]) catMap[cat] = { obtenido:0, posible:0 };
    if (!res || res.includes('aplica')) return;
    var max = maxPts[imp];
    if (!max) return;
    catMap[cat].posible += max;
    if (res === 'cumple')             catMap[cat].obtenido += max;
    else if (res.includes('parcial')) catMap[cat].obtenido += (parcialPts[imp] || 0);
  });

  var filasCatHtml = '';
  Object.keys(catMap).forEach(function(cat) {
    var v = catMap[cat];
    var p = v.posible > 0 ? Math.round(v.obtenido / v.posible * 100) : 0;
    var barColor = p>=90 ? '#16a34a' : p>=75 ? '#ca8a04' : p>=60 ? '#ea580c' : '#e4001b';
    filasCatHtml +=
      '<tr>'
      + '<td style="padding:10px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f3f4f6">' + cat + '</td>'
      + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;width:50%">'
      + '<div style="background:#f3f4f6;border-radius:99px;height:10px;overflow:hidden">'
      + '<div style="background:' + barColor + ';width:' + p + '%;height:100%;border-radius:99px"></div></div></td>'
      + '<td style="padding:10px 12px;font-size:13px;font-weight:800;color:' + barColor + ';text-align:right;border-bottom:1px solid #f3f4f6;white-space:nowrap">' + p + '%</td>'
      + '<td style="padding:10px 12px;font-size:11px;color:#94a3b8;text-align:right;border-bottom:1px solid #f3f4f6;white-space:nowrap">' + v.obtenido + '/' + v.posible + ' pts</td>'
      + '</tr>';
  });

  var seccionGraficoYCat =
    '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">'
    + '<h2 style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Distribuci&oacute;n de Resultados</h2>'
    + '<div style="text-align:center;margin-bottom:20px"><img src="' + chartUrl + '" alt="Grafico" style="max-width:100%;height:auto"></div>'
    + '<table style="width:100%;border-collapse:collapse;text-align:center"><tr>'
    + '<td style="padding:14px 8px;background:#f0fdf4;border-radius:8px"><div style="font-size:26px;font-weight:800;color:#16a34a">' + cumple + '</div><div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">Cumple</div></td>'
    + '<td style="width:6px"></td>'
    + '<td style="padding:14px 8px;background:#fff1f2;border-radius:8px"><div style="font-size:26px;font-weight:800;color:#e4001b">' + noCumple + '</div><div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">No Cumple</div></td>'
    + '<td style="width:6px"></td>'
    + '<td style="padding:14px 8px;background:#fffbeb;border-radius:8px"><div style="font-size:26px;font-weight:800;color:#d97706">' + parcial + '</div><div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">Parcial</div></td>'
    + '<td style="width:6px"></td>'
    + '<td style="padding:14px 8px;background:#f1f5f9;border-radius:8px"><div style="font-size:26px;font-weight:800;color:#64748b">' + noAplica + '</div><div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">No Aplica</div></td>'
    + '</tr></table>'
    + '<h3 style="margin:20px 0 12px;font-size:14px;color:#1a1a1a">% por Categor&iacute;a</h3>'
    + '<table style="width:100%;border-collapse:collapse">' + filasCatHtml + '</table>'
    + '</div>';

  // ---- 7. PUNTOS A CORREGIR ----
  // Si hay reprobado, excluir los críticos que no cumplen (ya mostrados arriba)
  var noOkRows = rows.filter(function(r){
    var v = (r[11]||'').toLowerCase();
    var esCriticoNC = (r[9]||'').toLowerCase().replace(/í/g,'i') === 'critico' && (v.includes('no cumple') || v === 'nocumple');
    if (data.puntaje && data.puntaje.reprobado && esCriticoNC) return false;
    return v.includes('no cumple') || v === 'nocumple' || v.includes('parcial');
  });

  function buildNoOkFila(r) {
    var res        = (r[11]||'').toLowerCase();
    var esCritico  = (r[9]||'').toLowerCase().replace(/í/g,'i') === 'critico';
    var esNoCumple = res.includes('no cumple') || res === 'nocumple';
    var bgRow      = (esCritico && esNoCumple) ? '#fff1f2' : esNoCumple ? '#fef9f9' : '#fffbeb';
    var resColor   = esNoCumple ? '#e4001b' : '#d97706';
    var fotoDirecta = driveImgUrl(r[13]);
    var tdWidth    = fotoDirecta ? '55%' : '100%';
    var obsHtml    = r[12] ? '<div style="font-size:12px;color:#666;font-style:italic">"' + r[12] + '"</div>' : '';
    var explHtml2  = r[10] ? '<div style="font-size:12px;color:#666;font-style:italic;margin-bottom:4px">' + r[10] + '</div>' : '';
    var fotoTd     = fotoDirecta
      ? '<td style="vertical-align:top;padding-left:12px;width:45%"><img src="' + fotoDirecta + '" alt="Foto" style="width:100%;max-width:200px;border-radius:6px;border:1px solid #e5e7eb"></td>'
      : '';
    return '<div style="background:' + bgRow + ';border-radius:8px;padding:16px;margin-bottom:12px;border-left:4px solid ' + resColor + '">'
      + '<table style="width:100%;border-collapse:collapse"><tr>'
      + '<td style="vertical-align:top;width:' + tdWidth + '">'
      + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' › ' + r[7] + '</div>'
      + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px">' + r[8] + '</div>'
      + explHtml2
      + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(r[9]) + ';color:' + getImpColor(r[9]) + ';margin-bottom:8px">' + r[9] + '</span>'
      + '<div style="font-size:13px;font-weight:700;color:' + resColor + ';margin-bottom:4px">● ' + r[11] + '</div>'
      + obsHtml
      + '</td>' + fotoTd + '</tr></table></div>';
  }

  // Agrupar noOkRows por marca (r[5])
  var marcasNoOk = [];
  var noOkByMarca = {};
  noOkRows.forEach(function(r) {
    var m = (r[5] || 'Sin marca').trim();
    if (!noOkByMarca[m]) { noOkByMarca[m] = []; marcasNoOk.push(m); }
    noOkByMarca[m].push(r);
  });

  var filasNoOkHtml = '';
  var mostrarSubtitulo = marcasNoOk.length > 1;
  marcasNoOk.forEach(function(marca) {
    if (mostrarSubtitulo) {
      filasNoOkHtml += '<div style="font-size:13px;font-weight:700;color:#475569;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;padding-bottom:4px">' + marca + '</div>';
    }
    noOkByMarca[marca].forEach(function(r) {
      filasNoOkHtml += buildNoOkFila(r);
    });
  });

  var seccionNoOk = '';
  if (noOkRows.length) {
    seccionNoOk = '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">'
      + '<h2 style="margin:0 0 16px;font-size:15px;color:#e4001b">⚠ Puntos a Corregir (' + noOkRows.length + ')</h2>'
      + filasNoOkHtml + '</div>';
  }

  // ---- 8. DESVÍOS REITERADOS ----
  var seccionRepetidos = '';
  var rep = desviosRepetidos || [];
  if (rep.length) {
    var filasRep = '';
    rep.forEach(function(d) {
      var rep2 = d.repeticiones >= 2;
      var repBg        = rep2 ? '#fff1f2' : '#fff7ed';
      var repBorder    = rep2 ? '#fca5a5' : '#fed7aa';
      var repBadgeBg   = rep2 ? '#e4001b' : '#ea580c';
      var repLabel     = rep2 ? '🔁 Repite en las últimas 3' : '⚠ Repite en auditoría anterior';
      filasRep +=
        '<tr style="background:' + repBg + '">'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-weight:600;font-size:13px">' + d.control + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:12px;color:#666">' + d.categoria + ' › ' + d.subcategoria + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:12px;text-align:center">'
        + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(d.importancia) + ';color:' + getImpColor(d.importancia) + '">' + d.importancia + '</span>'
        + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:11px;text-align:right;white-space:nowrap">'
        + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + repBadgeBg + ';color:#fff">' + repLabel + '</span>'
        + '</td></tr>';
    });
    seccionRepetidos =
      '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;background:#fffbeb">'
      + '<h2 style="margin:0 0 8px;font-size:15px;color:#c2410c">🔁 Desv&iacute;os Reiterados (' + rep.length + ')</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;color:#92400e">Puntos que no cumplieron en auditor&iacute;as anteriores y contin&uacute;an sin corregirse.</p>'
      + '<table style="width:100%;border-collapse:collapse">'
      + '<tr style="background:#c2410c">'
      + '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Control</th>'
      + '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Categor&iacute;a</th>'
      + '<th style="padding:8px 12px;text-align:center;color:#fff;font-size:12px">Importancia</th>'
      + '<th style="padding:8px 12px;text-align:right;color:#fff;font-size:12px">Reincidencia</th></tr>'
      + filasRep
      + '</table></div>';
  }

  // ---- 9. SISTEMA DE PUNTOS ----
  var seccionSistema =
    '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb;background:#f1f5f9">'
    + '<h2 style="margin:0 0 12px;font-size:14px;color:#475569">Sistema de puntuaci&oacute;n</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<tr style="background:#e2e8f0">'
    + '<th style="padding:6px 10px;text-align:left;color:#334155">Importancia</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#16a34a">Cumple</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#d97706">Parcial</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#e4001b">No Cumple</th>'
    + '</tr>'
    + '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">Cr&iacute;tico</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">4 pts</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">2 pts</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">0 pts + REPRUEBA</td></tr>'
    + '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">Alta</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">3 pts</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">1 pt</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">0 pts</td></tr>'
    + '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">Media</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">2 pts</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">1 pt</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">0 pts</td></tr>'
    + '<tr><td style="padding:6px 10px;font-weight:600">Baja</td>'
    + '<td style="padding:6px 10px;text-align:center">1 pt</td>'
    + '<td style="padding:6px 10px;text-align:center">0 pts</td>'
    + '<td style="padding:6px 10px;text-align:center">0 pts</td></tr>'
    + '</table>'
    + '<p style="margin:12px 0 0;font-size:11px;color:#64748b;font-style:italic">Los puntos Cr&iacute;ticos (Nota de Oro) reprueban la auditor&iacute;a autom&aacute;ticamente si no se cumplen, independientemente del puntaje total.</p>'
    + '</div>';

  // ---- 10. FOOTER ----  (renumbered — was 10)
  var pdfBtnHtml = '';
  if (pdfUrl) {
    pdfBtnHtml = '<a href="' + pdfUrl + '" style="display:inline-block;padding:8px 18px;background:#e4001b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;margin:4px">Descargar PDF</a>';
  }
  var verAuditoriaUrl = 'https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec?action=verAuditoria&auditId=' + data.auditId;
  var verAuditoriaBtnHtml = '<a href="' + verAuditoriaUrl + '" style="display:inline-block;padding:8px 18px;background:#1e40af;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;margin:4px">Ver auditoría completa</a>';

  var footerHtml = '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center">'
    + '<p style="margin:0;font-size:12px;color:#999">Sistema de Auditorías · Sushi POP · ' + formatFecha(data.fecha) + '</p>'
    + '<p style="margin:8px 0 0">' + pdfBtnHtml + verAuditoriaBtnHtml + '</p>'
    + '</div>';

  // ---- ARMAR HTML COMPLETO ----
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8f8f8;margin:0;padding:0">'
    + '<div style="max-width:700px;margin:0 auto;background:#fff">'
    + headerHtml
    + datosHtml
    + seccionHistorial
    + seccionReprobado
    + seccionGraficoYCat
    + seccionNoOk
    + seccionRepetidos
    + seccionSistema
    + footerHtml
    + '</div></body></html>';
}

// ============================================================
// EMAIL HTML AL LOCAL
// ============================================================
function driveImgUrl(url) {
  if (!url) return '';
  var firstUrl = url.split(',')[0].trim(); // si hay varias, tomar la primera
  var m = firstUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w600' : firstUrl;
}

function driveImgUrls(urlStr) {
  if (!urlStr) return [];
  return urlStr.split(',').map(function(u) { return driveImgUrl(u.trim()); }).filter(Boolean);
}

// Embebe imágenes de Drive como base64 en el HTML (necesario para PDF)
function embedDriveImagesAsBase64(html) {
  var regex = /https:\/\/drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)&sz=w600/g;
  var match;
  var replacements = {};
  var tmpHtml = html;
  while ((match = regex.exec(tmpHtml)) !== null) {
    replacements[match[0]] = match[1];
  }
  Object.keys(replacements).forEach(function(imgUrl) {
    var fileId = replacements[imgUrl];
    try {
      var blob = DriveApp.getFileById(fileId).getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      var mime = blob.getContentType() || 'image/jpeg';
      html = html.split(imgUrl).join('data:' + mime + ';base64,' + b64);
    } catch(e) { console.error('Embed img error ' + fileId + ':', e); }
  });
  return html;
}

function enviarEmailAuditoria(data, rows, desviosRepetidos, historial, pdfResult) {
  const emails = data.emailsLocal.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return;

  var html = buildAuditHtml(data, rows, desviosRepetidos, historial, pdfResult ? pdfResult.url : '');

  var emailOpts = {
    htmlBody: html,
    name:     'Franquicias POP',
    from:     'franquicias@sushi-pop.com.ar',
  };
  if (pdfResult && pdfResult.blob) {
    emailOpts.attachments = [pdfResult.blob];
  }

  var pctLabel = (data.puntaje && data.puntaje.reprobado) ? 'REPROBADO' : ((data.puntaje && data.puntaje.pct !== undefined) ? data.puntaje.pct + '% cumplimiento' : '');
  GmailApp.sendEmail(emails.join(','), 'Auditoria ' + data.local + ' - ' + formatFecha(data.fecha) + ' (' + pctLabel + ')', '', emailOpts);
}

function getImpBg(imp) {
  const i = (imp||'').toLowerCase();
  if (i==='critico'||i==='crítico') return '#fff1f2';
  if (i==='alta')  return '#fff7ed';
  if (i==='media') return '#fffbeb';
  return '#f0fdf4';
}
function getImpColor(imp) {
  const i = (imp||'').toLowerCase();
  if (i==='critico'||i==='crítico') return '#e4001b';
  if (i==='alta')  return '#ea580c';
  if (i==='media') return '#d97706';
  return '#16a34a';
}

// ============================================================
// COLOREAR DESVÍOS EN SHEET
// ============================================================
function colorearDesvios(sheet, rows) {
  const firstRow = sheet.getLastRow() - rows.length + 1;
  rows.forEach((row, i) => {
    const imp = (row[9]||'').toLowerCase();   // importancia = índice 9
    const res = (row[11]||'').toLowerCase();  // respuesta   = índice 11
    const isCrit = imp==='critico'||imp==='crítico';
    const isNC   = res.includes('no cumple')||res==='nocumple';
    if (isCrit && isNC) sheet.getRange(firstRow+i,1,1,15).setBackground('#fff1f2');
    else if (isNC)      sheet.getRange(firstRow+i,1,1,15).setBackground('#fff7ed');
    else if (res==='cumple') sheet.getRange(firstRow+i,12,1,1).setBackground('#f0fdf4'); // col 12 = Respuesta
  });
}

// ============================================================
// RECALCULAR PUNTAJE DESDE FILAS
// ============================================================
function recalcularPuntaje(rows) {
  var maxPts     = { 'critico':4, 'crítico':4, 'alta':3, 'media':2, 'baja':1 };
  var parcialPts = { 'critico':2, 'crítico':2, 'alta':1, 'media':1, 'baja':0 };
  var obtenido = 0, posible = 0, reprobado = false;

  rows.forEach(function(r) {
    var imp = (r[9]||'').toLowerCase().trim();
    var res = (r[11]||'').toLowerCase().trim();
    var max = maxPts[imp];
    if (!max) return;
    if (!res || res.includes('aplica')) return;
    // Solo puntúan preguntas de tipo radio (tienen cumple/no cumple/parcial)
    if (!res.includes('cumple') && !res.includes('parcial')) return;
    posible += max;
    if (res === 'cumple') {
      obtenido += max;
    } else if (res.includes('parcial')) {
      obtenido += parcialPts[imp] || 0;
    } else if (res.includes('no cumple') || res === 'nocumple') {
      if (imp === 'critico' || imp === 'crítico') reprobado = true;
    }
  });

  var pct = posible > 0 ? Math.round(obtenido / posible * 100) : 0;
  var nivel, nivelEmoji;
  if (reprobado)      { nivel = 'Reprobado';     nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';     nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio'; nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'A mejorar';     nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';    nivelEmoji = '🔴'; }

  return { pct: pct, nivel: nivel, obtenido: obtenido, posible: posible, reprobado: reprobado, nivelEmoji: nivelEmoji };
}

// ============================================================
// ============================================================
// AUTH — HELPERS
// ============================================================
function hashPassword(pwd) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pwd, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function generarPasswordTemp() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var pwd = '';
  for (var i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

function ensureUsuariosSheet(ss) {
  var sheet = ss.getSheetByName(USUARIOS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USUARIOS_SHEET);
    sheet.appendRow(['Email','Nombre','Rol','Locales','PasswordHash','PrimerLogin','Estado','FechaAlta']);
    sheet.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function encontrarUsuarioRow(sheet, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    if ((emails[i][0] || '').toString().toLowerCase() === email.toLowerCase()) return i + 2;
  }
  return -1;
}

function verificarAdmin(ss, adminEmail, adminToken) {
  var sheet = ss.getSheetByName(USUARIOS_SHEET);
  if (!sheet) return false;
  var row = encontrarUsuarioRow(sheet, adminEmail);
  if (row < 0) return false;
  var data = sheet.getRange(row, 1, 1, 8).getValues()[0];
  return data[2] === 'Admin' && data[4] === adminToken && data[6] === 'Activo';
}

// ============================================================
// REENVÍO DE EMAIL POR AUDIT ID
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'login') {
    var emailLog = ((e.parameter.email) || '').toLowerCase().trim();
    var hashLog  = e.parameter.hash || '';
    if (!emailLog || !hashLog) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssLog    = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var sheetLog = ensureUsuariosSheet(ssLog);
      var rowLog   = encontrarUsuarioRow(sheetLog, emailLog);
      if (rowLog < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dLog = sheetLog.getRange(rowLog, 1, 1, 8).getValues()[0];
      if (dLog[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      if (dLog[4] !== hashLog)  return jsonResponse({ success: false, error: 'Contraseña incorrecta' });
      return jsonResponse({ success: true, user: {
        email:      dLog[0],
        nombre:     dLog[1],
        rol:        dLog[2],
        locales:    dLog[3],
        primerLogin: dLog[5] === true || String(dLog[5]).toLowerCase() === 'true',
      }});
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'changePassword') {
    var emailCP  = ((e.parameter.email) || '').toLowerCase().trim();
    var oldHash  = e.parameter.oldHash || '';
    var newHash  = e.parameter.newHash || '';
    if (!emailCP || !oldHash || !newHash) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssCP    = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var sheetCP = ensureUsuariosSheet(ssCP);
      var rowCP   = encontrarUsuarioRow(sheetCP, emailCP);
      if (rowCP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dCP = sheetCP.getRange(rowCP, 1, 1, 8).getValues()[0];
      if (dCP[4] !== oldHash) return jsonResponse({ success: false, error: 'Contraseña actual incorrecta' });
      sheetCP.getRange(rowCP, 5).setValue(newHash);
      sheetCP.getRange(rowCP, 6).setValue('false');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'crearUsuario') {
    var adminEm  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTok = e.parameter.adminToken || '';
    var nombre   = e.parameter.nombre || '';
    var newEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var rol      = e.parameter.rol || 'Auditor';
    var locales  = e.parameter.locales || 'todos';
    if (!adminEm || !adminTok || !nombre || !newEmail) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssCU = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssCU, adminEm, adminTok)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetCU = ensureUsuariosSheet(ssCU);
      if (encontrarUsuarioRow(sheetCU, newEmail) > 0) return jsonResponse({ success: false, error: 'El email ya está registrado' });
      var tempPwd = generarPasswordTemp();
      var pwdHash = hashPassword(tempPwd);
      sheetCU.appendRow([newEmail, nombre, rol, locales, pwdHash, 'true', 'Activo', new Date()]);
      cacheRemoveKey('usuarios');
      var bodyEmail = 'Hola ' + nombre + ',\n\nTu cuenta fue creada en el Sistema de Auditorías Sushi POP.\n\nUsuario: ' + newEmail + '\nContraseña temporal: ' + tempPwd + '\n\nAl ingresar por primera vez se te pedirá que cambies tu contraseña.\n\nIngresá en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(newEmail, 'Acceso al Sistema de Auditorías Sushi POP', bodyEmail, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP Auditorías' });
      return jsonResponse({ success: true, message: 'Usuario creado y email enviado a ' + newEmail });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'resetPassword') {
    var adminEmR  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokR = e.parameter.adminToken || '';
    var targetEmR = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    if (!adminEmR || !adminTokR || !targetEmR) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssRP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssRP, adminEmR, adminTokR)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetRP = ensureUsuariosSheet(ssRP);
      var rowRP   = encontrarUsuarioRow(sheetRP, targetEmR);
      if (rowRP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var nombreRP = sheetRP.getRange(rowRP, 2).getValue();
      var tempPwdR = generarPasswordTemp();
      sheetRP.getRange(rowRP, 5).setValue(hashPassword(tempPwdR));
      sheetRP.getRange(rowRP, 6).setValue('true');
      var bodyRP = 'Hola ' + nombreRP + ',\n\nTu contraseña fue restablecida.\n\nNueva contraseña temporal: ' + tempPwdR + '\n\nAl ingresar se te pedirá que elijas una nueva contraseña.\n\nIngresá en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(targetEmR, 'Restablecimiento de contraseña - Auditorías Sushi POP', bodyRP, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP Auditorías' });
      return jsonResponse({ success: true, message: 'Contraseña restablecida y email enviado' });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'darDeBaja') {
    var adminEmB  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokB = e.parameter.adminToken || '';
    var targetEmB = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    if (!adminEmB || !adminTokB || !targetEmB) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssBaja = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssBaja, adminEmB, adminTokB)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetBaja = ensureUsuariosSheet(ssBaja);
      var rowBaja   = encontrarUsuarioRow(sheetBaja, targetEmB);
      if (rowBaja < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      sheetBaja.getRange(rowBaja, 7).setValue('Inactivo');
      cacheRemoveKey('usuarios');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'reactivarUsuario') {
    var adminEmA  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokA = e.parameter.adminToken || '';
    var targetEmA = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    if (!adminEmA || !adminTokA || !targetEmA) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssReact = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssReact, adminEmA, adminTokA)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetReact = ensureUsuariosSheet(ssReact);
      var rowReact   = encontrarUsuarioRow(sheetReact, targetEmA);
      if (rowReact < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      sheetReact.getRange(rowReact, 7).setValue('Activo');
      cacheRemoveKey('usuarios');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'getUsuarios') {
    var adminEmG  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokG = e.parameter.adminToken || '';
    if (!adminEmG || !adminTokG) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    var cachedUsuarios = cacheGetParsed('usuarios');
    if (cachedUsuarios) return jsonResponse(cachedUsuarios);
    try {
      var ssGU = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssGU, adminEmG, adminTokG)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetGU = ensureUsuariosSheet(ssGU);
      var lastGU  = sheetGU.getLastRow();
      if (lastGU < 2) return jsonResponse({ success: true, usuarios: [] });
      var dataGU = sheetGU.getRange(2, 1, lastGU - 1, 8).getValues();
      var usuarios = dataGU.filter(function(r){ return r[0]; }).map(function(r){
        return { email: r[0], nombre: r[1], rol: r[2], locales: r[3],
          primerLogin: r[5] === true || String(r[5]).toLowerCase() === 'true',
          estado: r[6], fechaAlta: r[7] ? formatFecha(r[7]) : '' };
      });
      var resGU = { success: true, usuarios: usuarios };
      cachePutObj('usuarios', resGU, 300);
      return jsonResponse(resGU);
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'editarUsuario') {
    var adminEmE  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokE = e.parameter.adminToken || '';
    var targetEmE = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    var newNombre = e.parameter.nombre   || '';
    var newRol    = e.parameter.rol      || '';
    var newLocales= e.parameter.locales  || '';
    var newEstado = e.parameter.estado   || '';
    if (!adminEmE || !adminTokE || !targetEmE) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssE = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssE, adminEmE, adminTokE)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var shE = ensureUsuariosSheet(ssE);
      var rowE = encontrarUsuarioRow(shE, targetEmE);
      if (rowE < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      if (newNombre) shE.getRange(rowE, 2).setValue(newNombre);
      if (newRol)    shE.getRange(rowE, 3).setValue(newRol);
      if (newLocales !== undefined && newLocales !== '') shE.getRange(rowE, 4).setValue(newLocales);
      if (newEstado) shE.getRange(rowE, 7).setValue(newEstado);
      cacheRemoveKey('usuarios');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'getLocales') {
    var adminEmL  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokL = e.parameter.adminToken || '';
    if (!adminEmL || !adminTokL) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    var cachedLocales = cacheGetParsed('locales');
    if (cachedLocales) return jsonResponse(cachedLocales);
    try {
      var ssL  = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssL, adminEmL, adminTokL)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var shL  = ssL.getSheetByName('Locales');
      if (!shL || shL.getLastRow() < 2) return jsonResponse({ success: true, locales: [] });
      var dataL = shL.getRange(2, 1, shL.getLastRow() - 1, 3).getValues();
      var locales = dataL.filter(function(r){ return r[0]; }).map(function(r, i){
        return { idx: i + 2, nombre: r[0], isCausa: String(r[1]).toUpperCase() === 'TRUE', emails: r[2] || '' };
      });
      var resL = { success: true, locales: locales };
      cachePutObj('locales', resL, 300);
      return jsonResponse(resL);
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'crearLocal') {
    var adminEmCL  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokCL = e.parameter.adminToken || '';
    var lNombre    = e.parameter.nombre  || '';
    var lCausa     = e.parameter.isCausa === 'true' ? 'TRUE' : 'FALSE';
    var lEmails    = e.parameter.emails  || '';
    if (!adminEmCL || !adminTokCL || !lNombre) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssCL = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssCL, adminEmCL, adminTokCL)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var shCL = ssCL.getSheetByName('Locales');
      if (!shCL) return jsonResponse({ success: false, error: 'Hoja Locales no encontrada' });
      shCL.appendRow([lNombre, lCausa, lEmails]);
      cacheRemoveKey('locales');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'updateLocal') {
    var adminEmUL  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokUL = e.parameter.adminToken || '';
    var ulIdx      = parseInt(e.parameter.idx) || 0;
    var ulNombre   = e.parameter.nombre  || '';
    var ulCausa    = e.parameter.isCausa === 'true' ? 'TRUE' : 'FALSE';
    var ulEmails   = e.parameter.emails  || '';
    if (!adminEmUL || !adminTokUL || !ulIdx || !ulNombre) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssUL = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssUL, adminEmUL, adminTokUL)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var shUL = ssUL.getSheetByName('Locales');
      if (!shUL) return jsonResponse({ success: false, error: 'Hoja Locales no encontrada' });
      shUL.getRange(ulIdx, 1, 1, 3).setValues([[ulNombre, ulCausa, ulEmails]]);
      cacheRemoveKey('locales');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'eliminarLocal') {
    var adminEmDL  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokDL = e.parameter.adminToken || '';
    var dlIdx      = parseInt(e.parameter.idx) || 0;
    if (!adminEmDL || !adminTokDL || !dlIdx) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssDL = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssDL, adminEmDL, adminTokDL)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var shDL = ssDL.getSheetByName('Locales');
      if (!shDL) return jsonResponse({ success: false, error: 'Hoja Locales no encontrada' });
      shDL.deleteRow(dlIdx);
      cacheRemoveKey('locales');
      return jsonResponse({ success: true });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'verificarAudit') {
    var vId = e.parameter.auditId || '';
    if (!vId) return jsonResponse({ found: false, error: 'Falta auditId' });
    try {
      var ssV    = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shV    = ssV.getSheetByName(SHEET_NAME);
      if (!shV || shV.getLastRow() < 2) return jsonResponse({ found: false });
      var ids = shV.getRange(2, 1, shV.getLastRow() - 1, 1).getValues();
      var found = ids.some(function(r) { return String(r[0]) === vId; });
      return jsonResponse({ found: found });
    } catch(err) { return jsonResponse({ found: false, error: err.message }); }
  }

  if (action === 'forgotPassword') {
    var fpEmail = ((e.parameter.email) || '').toLowerCase().trim();
    if (!fpEmail) return jsonResponse({ success: false, error: 'Falta el email' });
    try {
      var ssFP    = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var sheetFP = ensureUsuariosSheet(ssFP);
      var rowFP   = encontrarUsuarioRow(sheetFP, fpEmail);
      if (rowFP < 0) return jsonResponse({ success: false, error: 'Email no encontrado' });
      var estadoFP = sheetFP.getRange(rowFP, 7).getValue();
      if (estadoFP === 'Inactivo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var nombreFP = sheetFP.getRange(rowFP, 2).getValue();
      var tempFP   = generarPasswordTemp();
      sheetFP.getRange(rowFP, 5).setValue(hashPassword(tempFP));
      sheetFP.getRange(rowFP, 6).setValue('true');
      var bodyFP = 'Hola ' + nombreFP + ',\n\nRecibimos una solicitud para restablecer tu contraseña.\n\nContraseña temporal: ' + tempFP + '\n\nAl ingresar se te pedirá que elijas una nueva contraseña.\n\nIngresá en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(fpEmail, 'Recuperación de contraseña - Auditorías Sushi POP', bodyFP, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP Auditorías' });
      return jsonResponse({ success: true, message: 'Email enviado con contraseña temporal' });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'bootstrapAdmin') {
    var bNombre = e.parameter.nombre || '';
    var bEmail  = ((e.parameter.email) || '').toLowerCase().trim();
    var bPwd    = e.parameter.pwd || '';
    if (!bNombre || !bEmail || !bPwd) return jsonResponse({ success: false, error: 'Faltan parámetros: nombre, email, pwd' });
    try {
      var ssBoot  = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shBoot  = ensureUsuariosSheet(ssBoot);
      if (shBoot.getLastRow() >= 2) return jsonResponse({ success: false, error: 'Ya existen usuarios. Por seguridad este endpoint solo funciona con la hoja vacía.' });
      shBoot.appendRow([bEmail, bNombre, 'Admin', 'todos', hashPassword(bPwd), 'false', 'Activo', new Date()]);
      return jsonResponse({ success: true, message: 'Admin creado: ' + bEmail + '. Ya podés ingresar con esa contraseña.' });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'reenviar') {
    const auditId = e.parameter.auditId;
    if (!auditId) return jsonResponse({ success: false, error: 'Falta auditId' });
    try {
      const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) return jsonResponse({ success: false, error: 'Hoja no encontrada' });

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return jsonResponse({ success: false, error: 'Sin datos' });

      const allData = sheet.getRange(2, 1, lastRow - 1, 19).getValues();
      const rows    = allData
        .filter(function(r) { return String(r[0]) === auditId; })
        .map(function(r) { return r.map(function(v) { return v == null ? '' : String(v); }); });
      if (!rows.length) return jsonResponse({ success: false, error: 'AuditID no encontrado: ' + auditId });

      const first = rows[0];
      const emailDest = e.parameter.email || first[14] || '';
      if (!emailDest) return jsonResponse({ success: false, error: 'No hay email destino. Pasalo como ?email=xxx@yyy.com' });

      // Recalcular puntaje desde las filas actuales (refleja cambios manuales en el sheet)
      const puntajeRecalc = recalcularPuntaje(rows);

      const data = {
        auditId:      first[0],
        fecha:        first[1],
        hora:         first[2],
        auditor:      first[3],
        local:        first[4],
        marca:        first[5],
        acompanante:  first[18] ? first[18].split('|||')[0] : '',
        posicionAcompanante: first[18] && first[18].includes('|||') ? first[18].split('|||')[1] : '',
        auditorEmail: first[14] || '',
        emailsLocal:  emailDest,
        puntaje:      puntajeRecalc,
      };

      var pdfError = null;
      var pdf = null;
      try {
        pdf = generarPDF(data, rows, [], null);
      } catch(pdfErr) {
        pdfError = pdfErr.message;
        console.error('PDF error en reenviar:', pdfErr);
      }

      const desvios = detectarDesviosRepetidos(sheet, data.local, data.auditId, rows);
      const hist    = calcularHistorial(sheet, data.local, data.auditId, data.fecha, data.puntaje);
      enviarEmailAuditoria(data, rows, desvios, hist, pdf);
      return jsonResponse({ success: true, message: 'Email reenviado a ' + emailDest, auditId: auditId, rows: rows.length, puntaje: puntajeRecalc, pdfError: pdfError, pdfUrl: pdf ? pdf.url : null });
    } catch(err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  if (action === 'verAuditoria') {
    var auditIdVer = e.parameter.auditId;
    if (!auditIdVer) return HtmlService.createHtmlOutput('<h2>Falta auditId</h2>');
    try {
      var ssVer    = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheetVer = ssVer.getSheetByName(SHEET_NAME);
      if (!sheetVer) return HtmlService.createHtmlOutput('<h2>Hoja no encontrada</h2>');

      var lastRowVer = sheetVer.getLastRow();
      if (lastRowVer < 2) return HtmlService.createHtmlOutput('<h2>Sin datos</h2>');

      var allDataVer = sheetVer.getRange(2, 1, lastRowVer - 1, 19).getValues();
      var rowsVer = allDataVer.filter(function(r) { return String(r[0]) === auditIdVer; })
        .map(function(r) { return r.map(function(v) { return v == null ? '' : String(v); }); });
      if (!rowsVer.length) return HtmlService.createHtmlOutput('<h2>AuditID no encontrado: ' + auditIdVer + '</h2>');

      var firstVer = rowsVer[0];
      var puntajeVer = recalcularPuntaje(rowsVer);

      // Construir HTML completo con todos los puntos organizados por categoría
      var catMapVer = {};
      var catOrderVer = [];
      rowsVer.forEach(function(r) {
        var cat = r[6] || 'Sin categor&iacute;a';
        if (!catMapVer[cat]) { catMapVer[cat] = []; catOrderVer.push(cat); }
        catMapVer[cat].push(r);
      });

      function badgeRes(res) {
        var r = (res||'').toLowerCase();
        if (r === 'cumple') return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46">' + res + '</span>';
        if (r.includes('no cumple') || r === 'nocumple') return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fff1f2;color:#e4001b">' + res + '</span>';
        if (r.includes('parcial')) return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fffbeb;color:#d97706">' + res + '</span>';
        if (r.includes('aplica')) return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#f1f5f9;color:#64748b">' + res + '</span>';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#f1f5f9;color:#64748b">' + (res || 'Sin respuesta') + '</span>';
      }

      var seccionesHtml = '';
      catOrderVer.forEach(function(cat) {
        var filasHtml = '';
        catMapVer[cat].forEach(function(r) {
          var fotoUrls = driveImgUrls(r[13]);
          var fotoHtml = fotoUrls.length
            ? '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px">' + fotoUrls.map(function(fu) {
                return '<img src="' + fu + '" alt="Foto" onclick="openLightbox(this.src)" style="max-width:280px;width:100%;border-radius:6px;border:1px solid #e5e7eb;cursor:zoom-in">';
              }).join('') + '</div>'
            : '';
          var obsHtml2 = r[12] ? '<div style="font-size:12px;color:#666;font-style:italic;margin-top:4px">"' + r[12] + '"</div>' : '';
          var explHtml3 = r[10] ? '<div style="font-size:12px;color:#888;font-style:italic;margin-bottom:4px">' + r[10] + '</div>' : '';
          filasHtml +=
            '<div style="padding:12px 0;border-bottom:1px solid #f3f4f6">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">'
            + '<div style="flex:1;min-width:200px">'
            + '<div style="font-size:11px;color:#888;margin-bottom:2px">' + r[7] + '</div>'
            + '<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px">' + r[8] + '</div>'
            + explHtml3
            + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(r[9]) + ';color:' + getImpColor(r[9]) + ';margin-right:6px">' + r[9] + '</span>'
            + badgeRes(r[11])
            + obsHtml2
            + fotoHtml
            + '</div></div></div>';
        });
        seccionesHtml +=
          '<div style="margin-bottom:24px">'
          + '<h3 style="margin:0 0 12px;font-size:15px;color:#1a1a1a;padding:10px 16px;background:#f8fafc;border-radius:8px;border-left:4px solid #3b82f6">' + cat + '</h3>'
          + filasHtml
          + '</div>';
      });

      var pLabel = puntajeVer.reprobado ? 'REPROBADO' : puntajeVer.pct + '%';
      var headerColor = puntajeVer.reprobado ? '#e4001b' : '#16a34a';
      var htmlVer = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditor&iacute;a ' + firstVer[4] + ' &mdash; ' + formatFecha(firstVer[1]) + '</title>'
        + '<style>'
        + '#lightbox{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:9999;justify-content:center;align-items:center;cursor:zoom-out}'
        + '#lightbox.open{display:flex}'
        + '#lightbox img{max-width:95vw;max-height:95vh;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,0.5)}'
        + '</style></head>'
        + '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8f8f8;margin:0;padding:0">'
        + '<div id="lightbox" onclick="this.classList.remove(\'open\')"><img id="lb-img" src=""></div>'
        + '<script>function openLightbox(src){document.getElementById("lb-img").src=src;document.getElementById("lightbox").classList.add("open");}<\/script>'
        + '<div style="max-width:800px;margin:0 auto;background:#fff">'
        + '<div style="background:' + headerColor + ';padding:24px 32px;text-align:center">'
        + '<h1 style="color:#fff;margin:0 0 4px;font-size:20px">Auditoría Completa</h1>'
        + '<p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px">' + firstVer[4] + ' · ' + formatFecha(firstVer[1]) + ' · ' + firstVer[2] + '</p>'
        + '<div style="margin-top:12px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px">'
        + '<div style="font-size:36px;font-weight:900;color:#fff">' + pLabel + '</div>'
        + '<div style="font-size:13px;color:rgba(255,255,255,0.9)">' + puntajeVer.nivel + ' · ' + puntajeVer.obtenido + '/' + puntajeVer.posible + ' pts</div>'
        + '</div></div>'
        + '<div style="padding:16px 32px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#444">'
        + '<strong>Local:</strong> ' + firstVer[4] + ' &nbsp;|&nbsp; <strong>Auditor:</strong> ' + firstVer[3] + ' &nbsp;|&nbsp; <strong>Marca:</strong> ' + firstVer[5]
        + (firstVer[18] ? ' &nbsp;|&nbsp; <strong>Acompa&ntilde;ante:</strong> ' + firstVer[18] : '')
        + '</div>'
        + '<div style="padding:24px 32px">' + seccionesHtml + '</div>'
        + '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#999">'
        + 'Sistema de Auditorías · Sushi POP · ID: ' + auditIdVer
        + '</div>'
        + '</div></body></html>';

      return HtmlService.createHtmlOutput(htmlVer);
    } catch(errVer) {
      return HtmlService.createHtmlOutput('<h2>Error: ' + errVer.message + '</h2>');
    }
  }

  if (action === 'actualizarPuntaje') {
    var auditId2 = e.parameter.auditId;
    if (!auditId2) return jsonResponse({ success: false, error: 'Falta auditId' });
    try {
      var ss2    = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet2 = ss2.getSheetByName(SHEET_NAME);
      if (!sheet2) return jsonResponse({ success: false, error: 'Hoja no encontrada' });

      var lastRow2 = sheet2.getLastRow();
      if (lastRow2 < 2) return jsonResponse({ success: false, error: 'Sin datos' });

      var allData2 = sheet2.getRange(2, 1, lastRow2 - 1, 19).getValues();
      // Encontrar filas del auditId y sus números de fila en el sheet (base 1, +2 por encabezado)
      var rowIndexes = [];
      var rowsAudit  = [];
      allData2.forEach(function(r, i) {
        if (String(r[0]) === auditId2) {
          rowIndexes.push(i + 2); // fila real en sheet (1-based + encabezado)
          rowsAudit.push(r.map(function(v){ return v == null ? '' : String(v); }));
        }
      });
      if (!rowsAudit.length) return jsonResponse({ success: false, error: 'AuditID no encontrado' });

      var puntaje2 = recalcularPuntaje(rowsAudit);

      // Actualizar cols P(16), Q(17), R(18) para cada fila — índice sheet = columna 16,17,18
      rowIndexes.forEach(function(sheetRow) {
        sheet2.getRange(sheetRow, 16).setValue(puntaje2.pct);
        sheet2.getRange(sheetRow, 17).setValue(puntaje2.nivel);
        sheet2.getRange(sheetRow, 18).setValue(puntaje2.reprobado ? 'Sí' : 'No');
      });

      return jsonResponse({ success: true, auditId: auditId2, filasActualizadas: rowIndexes.length, puntaje: puntaje2 });
    } catch(err2) {
      return jsonResponse({ success: false, error: err2.message });
    }
  }

  if (action === 'borrarAuditoria') {
    var auditIdB = e.parameter.auditId;
    if (!auditIdB) return jsonResponse({ success: false, error: 'Falta auditId' });
    try {
      var ssB    = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheetB = ssB.getSheetByName(SHEET_NAME);
      if (!sheetB) return jsonResponse({ success: false, error: 'Hoja no encontrada' });

      var lastRowB = sheetB.getLastRow();
      if (lastRowB < 2) return jsonResponse({ success: false, error: 'Sin datos' });

      // Read cols A-E to identify matching rows and get local/fecha for Drive cleanup
      var allDataB = sheetB.getRange(2, 1, lastRowB - 1, 5).getValues();
      var toDelete = [];
      var localB = '', fechaB = '';
      allDataB.forEach(function(r, i) {
        if (String(r[0]).trim() === auditIdB) {
          toDelete.push(i + 2); // 1-indexed sheet row
          if (!localB) { localB = String(r[4] || ''); fechaB = r[1]; }
        }
      });
      if (!toDelete.length) return jsonResponse({ success: false, error: 'AuditID no encontrado: ' + auditIdB });

      // Batch delete: group consecutive rows into ranges and delete bottom-up
      // This reduces N deleteRow() calls to just a few deleteRows() calls
      var ranges = [];
      var start = toDelete[0], end = toDelete[0];
      for (var k = 1; k < toDelete.length; k++) {
        if (toDelete[k] === end + 1) {
          end = toDelete[k];
        } else {
          ranges.push([start, end - start + 1]);
          start = toDelete[k]; end = toDelete[k];
        }
      }
      ranges.push([start, end - start + 1]);
      // Delete from bottom to top so row indices stay valid
      for (var rk = ranges.length - 1; rk >= 0; rk--) {
        sheetB.deleteRows(ranges[rk][0], ranges[rk][1]);
      }

      // Invalidate auditorias + dashboard cache
      cacheRemoveKey('aud_all');
      // We don't know which auditor email to invalidate, so clear all aud_ keys is not possible.
      // The per-auditor cache will expire naturally (180s TTL).

      // Borrar carpeta de fotos en Drive: Fotos Auditorias/[Local]/[fecha]/
      var driveMsg = 'no encontrada';
      try {
        if (localB && fechaB) {
          var fechaStrB = fechaB instanceof Date ? fechaB.getFullYear()+'-'+('0'+(fechaB.getMonth()+1)).slice(-2)+'-'+('0'+fechaB.getDate()).slice(-2) : String(fechaB);
          var rootB        = DriveApp.getFolderById(DRIVE_FOLDER_ID);
          var fotosMainBIt = rootB.getFoldersByName('Fotos Auditorias');
          if (fotosMainBIt.hasNext()) {
            var fotosMainB = fotosMainBIt.next();
            var localBIt   = fotosMainB.getFoldersByName(localB);
            if (localBIt.hasNext()) {
              var localBFolder = localBIt.next();
              var fechaBIt     = localBFolder.getFoldersByName(fechaStrB);
              if (fechaBIt.hasNext()) {
                fechaBIt.next().setTrashed(true);
                driveMsg = 'eliminada';
              }
            }
          }
        }
      } catch(driveErrB) { driveMsg = 'error: ' + driveErrB.message; }

      return jsonResponse({ success: true, auditId: auditIdB, filasEliminadas: toDelete.length, carpetaDrive: driveMsg });
    } catch(errB) {
      return jsonResponse({ success: false, error: errB.message });
    }
  }

  if (action === 'getAuditorias') {
    var gaEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var gaToken = e.parameter.token || '';
    if (!gaEmail || !gaToken) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssAuthGA = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthGA = ensureUsuariosSheet(ssAuthGA);
      var rowAuthGA = encontrarUsuarioRow(shAuthGA, gaEmail);
      if (rowAuthGA < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthGA = shAuthGA.getRange(rowAuthGA, 1, 1, 8).getValues()[0];
      if (dAuthGA[4] !== gaToken) return jsonResponse({ success: false, error: 'Sin autorización' });
      if (dAuthGA[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var gaRol     = String(dAuthGA[2] || '');
      var gaLocales = String(dAuthGA[3] || '');

      var gaCacheKey = gaRol === 'Admin' ? 'aud_all' : ('aud_' + gaEmail);
      var cachedGA = cacheGetParsed(gaCacheKey);
      if (cachedGA) return jsonResponse(cachedGA);

      var ssGA = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shGA = ssGA.getSheetByName(SHEET_NAME);
      if (!shGA || shGA.getLastRow() < 2) return jsonResponse({ success: true, auditorias: [] });

      var lastGA = shGA.getLastRow();
      var dataGA = shGA.getRange(2, 1, lastGA - 1, 20).getValues();

      var seenGA = {};
      var listaGA = [];
      dataGA.forEach(function(r) {
        var id = String(r[0] || '').trim();
        if (!id || seenGA[id]) return;
        if (gaRol === 'Auditor') {
          if ((String(r[14] || '')).toLowerCase().trim() !== gaEmail) return;
        } else if (gaRol === 'Franquiciado' && gaLocales !== 'todos') {
          var gaAllowed = gaLocales.split(',').map(function(l){ return l.trim().toLowerCase(); });
          if (gaAllowed.indexOf((String(r[4] || '')).toLowerCase().trim()) === -1) return;
        }
        seenGA[id] = true;
        listaGA.push({
          auditId:  id,
          fecha:    formatFecha(r[1]),
          fechaISO: formatFechaISO(r[1]),
          hora:     r[2] ? String(r[2]) : '',
          auditor:  r[3] ? String(r[3]) : '',
          local:    r[4] ? String(r[4]) : '',
          pct:      r[15] !== '' ? Number(r[15]) : null,
          nivel:    r[16] ? String(r[16]) : '',
          reprobado: String(r[17]) === 'Sí',
          tipo:     r[19] ? String(r[19]) : 'Oficial',
        });
      });
      listaGA.reverse();
      var resGA = { success: true, auditorias: listaGA };
      cachePutObj(gaCacheKey, resGA, 180);
      return jsonResponse(resGA);
    } catch(gaErr) { return jsonResponse({ success: false, error: gaErr.message }); }
  }

  if (action === 'getAuditoria') {
    var gdEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var gdToken = e.parameter.token || '';
    var gdId    = e.parameter.auditId || '';
    if (!gdEmail || !gdToken || !gdId) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssAuthGD = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthGD = ensureUsuariosSheet(ssAuthGD);
      var rowAuthGD = encontrarUsuarioRow(shAuthGD, gdEmail);
      if (rowAuthGD < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthGD = shAuthGD.getRange(rowAuthGD, 1, 1, 8).getValues()[0];
      if (dAuthGD[4] !== gdToken) return jsonResponse({ success: false, error: 'Sin autorización' });
      if (dAuthGD[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var gdRol     = String(dAuthGD[2] || '');
      var gdLocales = String(dAuthGD[3] || '');

      var ssGD = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shGD = ssGD.getSheetByName(SHEET_NAME);
      if (!shGD || shGD.getLastRow() < 2) return jsonResponse({ success: false, error: 'Sin datos' });

      var lastGD = shGD.getLastRow();
      var allGD  = shGD.getRange(2, 1, lastGD - 1, 20).getValues();
      var dispGD = shGD.getRange(2, 1, lastGD - 1, 20).getDisplayValues();
      var rowsGD = allGD.map(function(r, rowIdx) {
        return r.map(function(v, colIdx) {
          if (v == null) return '';
          // For user-entered text columns (respuesta=11, observacion=12), use display value
          // to avoid Date-formatted cells returning JS Date objects.
          if ((colIdx === 11 || colIdx === 12) && v instanceof Date) {
            return String(dispGD[rowIdx][colIdx] || '');
          }
          return String(v);
        });
      }).filter(function(r){ return r[0].trim() === gdId; });
      if (!rowsGD.length) return jsonResponse({ success: false, error: 'Auditoría no encontrada' });

      var fGD = rowsGD[0];
      if (gdRol === 'Auditor' && (fGD[14]||'').toLowerCase() !== gdEmail)
        return jsonResponse({ success: false, error: 'Sin acceso' });
      if (gdRol === 'Franquiciado' && gdLocales !== 'todos') {
        var gdAllow = gdLocales.split(',').map(function(l){ return l.trim().toLowerCase(); });
        if (gdAllow.indexOf((fGD[4]||'').toLowerCase()) === -1) return jsonResponse({ success: false, error: 'Sin acceso' });
      }

      return jsonResponse({
        success: true,
        auditId: gdId,
        fecha:   formatFecha(fGD[1]),
        hora:    fGD[2],
        auditor: fGD[3],
        auditorEmail: fGD[14],
        local:   fGD[4],
        marca:   fGD[5],
        acompanante: fGD[18] ? fGD[18].split('|||')[0] : '',
        posicionAcompanante: fGD[18] && fGD[18].includes('|||') ? fGD[18].split('|||')[1] : '',
        tipo:    fGD[19] || 'Oficial',
        puntaje: recalcularPuntaje(rowsGD),
        respuestas: rowsGD.map(function(r){
          return {
            categoria:   r[6], subcategoria: r[7], control: r[8],
            importancia: r[9], explicacion:  r[10], respuesta: r[11],
            observacion: r[12],
            fotoUrls:    r[13] ? r[13].split(',').map(function(u){ return u.trim(); }).filter(Boolean) : [],
          };
        }),
      });
    } catch(gdErr) { return jsonResponse({ success: false, error: gdErr.message }); }
  }

  // ============================================================
  // getDashboard
  // ============================================================
  if (action === 'getDashboard') {
    var dbEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var dbToken = e.parameter.token || '';
    if (!dbEmail || !dbToken) return jsonResponse({ success: false, error: 'Faltan parámetros' });

    var cacheKeyDB = 'db_' + dbEmail;
    var cachedDB = cacheGetParsed(cacheKeyDB);
    if (cachedDB) return jsonResponse(cachedDB);

    try {
      // Auth
      var ssAuthDB = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthDB = ensureUsuariosSheet(ssAuthDB);
      var rowAuthDB = encontrarUsuarioRow(shAuthDB, dbEmail);
      if (rowAuthDB < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthDB = shAuthDB.getRange(rowAuthDB, 1, 1, 8).getValues()[0];
      if (dAuthDB[4] !== dbToken) return jsonResponse({ success: false, error: 'Sin autorización' });
      if (dAuthDB[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var dbRol     = String(dAuthDB[2] || '');
      var dbLocales = String(dAuthDB[3] || '');

      // Read all data
      var ssDB = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shDB = ssDB.getSheetByName(SHEET_NAME);
      if (!shDB || shDB.getLastRow() < 2) return jsonResponse({ success: true, locales: [], porLocal: {}, global: { promedio: null, rankingControles: [], rankingCategorias: [] } });

      var dataDB = shDB.getRange(2, 1, shDB.getLastRow() - 1, 20).getValues();

      // Filter rows by role
      var allowedLocalesDB = (dbRol === 'Franquiciado' && dbLocales !== 'todos')
        ? dbLocales.split(',').map(function(l){ return l.trim().toLowerCase(); })
        : null;
      var filtered = dataDB.filter(function(r) {
        if (!r[0]) return false;
        if (dbRol === 'Auditor') return (String(r[14]||'')).toLowerCase().trim() === dbEmail;
        if (dbRol === 'Franquiciado' && allowedLocalesDB) return allowedLocalesDB.indexOf((String(r[4]||'')).toLowerCase().trim()) !== -1;
        return true;
      });

      // Group rows by local -> auditId
      var localesMap = {};
      filtered.forEach(function(r) {
        var local   = String(r[4] || '').trim();
        var auditId = String(r[0] || '').trim();
        if (!local || !auditId) return;
        if (!localesMap[local]) localesMap[local] = {};
        if (!localesMap[local][auditId]) localesMap[local][auditId] = [];
        localesMap[local][auditId].push(r);
      });

      var sortedLocaleNames = Object.keys(localesMap).sort(function(a,b){ return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });

      // Helper: build sorted audit list for a local
      function buildAuditList(auditsObj) {
        return Object.keys(auditsObj).map(function(aid) {
          var rows = auditsObj[aid];
          var first = rows[0];
          var rawPct = first[15];
          var pct = (rawPct !== '' && rawPct !== null && rawPct !== undefined) ? parseFloat(String(rawPct).replace(',', '.')) : null;
          if (pct !== null && isNaN(pct)) pct = null;
          return {
            auditId:   aid,
            fecha:     formatFecha(first[1]),
            fechaISO:  formatFechaISO(first[1]),
            auditor:   String(first[3] || ''),
            pct:       pct,
            nivel:     String(first[16] || ''),
            reprobado: String(first[17]) === 'Sí',
            rows:      rows,
          };
        }).sort(function(a, b) {
          var da = a.fechaISO || '', db2 = b.fechaISO || '';
          return da < db2 ? 1 : da > db2 ? -1 : 0;
        });
      }

      // Helper: ranking of failing controls — count = audits where control failed, auditsTotal = audits evaluated
      function rankingControlesLocal(auditList3) {
        var ctrlMap = {};
        auditList3.forEach(function(audit) {
          var seenInAudit = {};
          audit.rows.forEach(function(r) {
            if ((String(r[11]||'')).trim().toLowerCase() !== 'no cumple') return;
            var key = String(r[8]||'').trim();
            if (!key || seenInAudit[key]) return;
            seenInAudit[key] = true;
            if (!ctrlMap[key]) ctrlMap[key] = { control: key, categoria: String(r[6]||''), subcategoria: String(r[7]||''), importancia: String(r[9]||''), failedAudits: 0 };
            ctrlMap[key].failedAudits++;
          });
        });
        return Object.keys(ctrlMap).map(function(k){ return ctrlMap[k]; })
          .sort(function(a,b){ return b.failedAudits - a.failedAudits; }).slice(0, 15);
      }

      // Helper: global ranking — localCount = how many locals failed this control in their last audit
      function rankingControlesGlobal(localLastRowsMap) {
        var ctrlMap = {};
        Object.keys(localLastRowsMap).forEach(function(localName) {
          var seenInLocal = {};
          localLastRowsMap[localName].forEach(function(r) {
            if ((String(r[11]||'')).trim().toLowerCase() !== 'no cumple') return;
            var key = String(r[8]||'').trim();
            if (!key || seenInLocal[key]) return;
            seenInLocal[key] = true;
            if (!ctrlMap[key]) ctrlMap[key] = { control: key, categoria: String(r[6]||''), subcategoria: String(r[7]||''), importancia: String(r[9]||''), localCount: 0 };
            ctrlMap[key].localCount++;
          });
        });
        return Object.keys(ctrlMap).map(function(k){ return ctrlMap[k]; })
          .sort(function(a,b){ return b.localCount - a.localCount; }).slice(0, 15);
      }

      // Helper: ranking of categories by compliance %
      function rankingCategorias(auditRows) {
        var catMap = {};
        auditRows.forEach(function(r) {
          var cat  = String(r[6]||'').trim();
          var resp = (String(r[11]||'')).trim().toLowerCase();
          if (!cat) return;
          if (!catMap[cat]) catMap[cat] = { categoria: cat, cumple: 0, total: 0, ncCount: 0 };
          catMap[cat].total++;
          if (resp === 'cumple' || resp === 'n/a') catMap[cat].cumple++;
          else if (resp === 'no cumple') catMap[cat].ncCount++;
        });
        return Object.keys(catMap).map(function(cat) {
          var d = catMap[cat];
          return { categoria: cat, pct: d.total > 0 ? Math.round(d.cumple / d.total * 100) : null, ncCount: d.ncCount };
        }).sort(function(a,b){ return (a.pct||100) - (b.pct||100); }); // worst first
      }

      // Global: ranking of categories with localCount (how many locals have this category below 80%)
      function rankingCategoriasGlobal(localLastRowsMap) {
        var catMap = {};
        Object.keys(localLastRowsMap).forEach(function(localName) {
          var localCatMap = {};
          localLastRowsMap[localName].forEach(function(r) {
            var cat  = String(r[6]||'').trim();
            var resp = (String(r[11]||'')).trim().toLowerCase();
            if (!cat) return;
            if (!localCatMap[cat]) localCatMap[cat] = { cumple: 0, total: 0 };
            localCatMap[cat].total++;
            if (resp === 'cumple' || resp === 'n/a') localCatMap[cat].cumple++;
          });
          Object.keys(localCatMap).forEach(function(cat) {
            var d = localCatMap[cat];
            var pct = d.total > 0 ? Math.round(d.cumple / d.total * 100) : null;
            if (!catMap[cat]) catMap[cat] = { categoria: cat, totalPct: 0, localCount: 0, localsBelowTarget: 0 };
            catMap[cat].localCount++;
            if (pct !== null) { catMap[cat].totalPct += pct; }
            if (pct !== null && pct < 80) catMap[cat].localsBelowTarget++;
          });
        });
        return Object.keys(catMap).map(function(cat) {
          var d = catMap[cat];
          return { categoria: cat, pct: d.localCount > 0 ? Math.round(d.totalPct / d.localCount) : null, localCount: d.localCount, localsBelowTarget: d.localsBelowTarget };
        }).sort(function(a,b){ return (a.pct||100) - (b.pct||100); }).slice(0, 15);
      }

      // Build per-local data
      var porLocal = {};
      var localLastRowsMap = {}; // localName -> last audit rows (for global ranking)
      var globalPcts = [];

      sortedLocaleNames.forEach(function(localName) {
        var auditList = buildAuditList(localesMap[localName]);
        if (!auditList.length) return;

        var last3 = auditList.slice(0, 3);
        var last3Rows = [];
        last3.forEach(function(a){ last3Rows = last3Rows.concat(a.rows); });

        var pcts3 = last3.map(function(a){ return a.pct; }).filter(function(p){ return p !== null; });
        var promedio3 = pcts3.length > 0 ? Math.round(pcts3.reduce(function(s,p){ return s+p; }, 0) / pcts3.length) : null;

        var ultimaRows = last3[0].rows;
        localLastRowsMap[localName] = ultimaRows;
        if (last3[0].pct !== null) globalPcts.push(last3[0].pct);

        // Tendencia: última vs anterior
        var tendencia = 'sin-datos', tendenciaDiff = null;
        if (last3.length >= 2 && last3[0].pct !== null && last3[1].pct !== null) {
          var td = Math.round(last3[0].pct - last3[1].pct);
          tendenciaDiff = td;
          tendencia = td > 1 ? 'sube' : td < -1 ? 'baja' : 'estable';
        }

        // Días desde última auditoría
        var diasSinAuditoria = null;
        if (last3[0].fechaISO) {
          var partsD = last3[0].fechaISO.split('-');
          if (partsD.length === 3) {
            var fechaAudit = new Date(parseInt(partsD[0]), parseInt(partsD[1])-1, parseInt(partsD[2]));
            var hoy = new Date(); hoy.setHours(0,0,0,0);
            diasSinAuditoria = Math.round((hoy - fechaAudit) / 86400000);
          }
        }

        // Tasa de reincidencia: % de NC en última que también falló en la anterior
        var reincidencia = null;
        if (last3.length >= 2) {
          var ncUltima = ultimaRows.filter(function(r){ return (String(r[11]||'')).trim().toLowerCase() === 'no cumple'; });
          if (ncUltima.length > 0) {
            var ncAntSet = {};
            last3[1].rows.forEach(function(r){ if ((String(r[11]||'')).trim().toLowerCase() === 'no cumple') ncAntSet[String(r[8]||'').trim()] = true; });
            var reincCount = ncUltima.filter(function(r){ return ncAntSet[String(r[8]||'').trim()]; }).length;
            reincidencia = Math.round(reincCount / ncUltima.length * 100);
          }
        }

        porLocal[localName] = {
          ultimasAuditorias: last3.map(function(a){ return { auditId: a.auditId, fecha: a.fecha, fechaISO: a.fechaISO, auditor: a.auditor, pct: a.pct, nivel: a.nivel, reprobado: a.reprobado }; }),
          auditsCount:       last3.length,
          promedio3:         promedio3,
          tendencia:         tendencia,
          tendenciaDiff:     tendenciaDiff,
          diasSinAuditoria:  diasSinAuditoria,
          reincidencia:      reincidencia,
          rankingControles:  rankingControlesLocal(last3),
          rankingCategorias: rankingCategorias(last3Rows),
        };
      });

      // Global averages and rankings (last audit of each local)
      var globalPromedio = globalPcts.length > 0 ? Math.round(globalPcts.reduce(function(s,p){ return s+p; }, 0) / globalPcts.length) : null;
      var totalLocales = sortedLocaleNames.length;

      var resDB = {
        success:   true,
        locales:   sortedLocaleNames,
        porLocal:  porLocal,
        global: {
          promedio:          globalPromedio,
          totalLocales:      totalLocales,
          rankingControles:  rankingControlesGlobal(localLastRowsMap),
          rankingCategorias: rankingCategoriasGlobal(localLastRowsMap),
        },
      };
      cachePutObj(cacheKeyDB, resDB, 180);
      return jsonResponse(resDB);
    } catch(dbErr) { return jsonResponse({ success: false, error: dbErr.message }); }
  }

  return jsonResponse({ version: '2026-06-16-v1' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Test manual
function test() {
  const mock = { postData: { contents: JSON.stringify({
    auditId:'TEST_001', fecha:'2026-06-09', hora:'10:00',
    auditor:'Test', auditorEmail:'test@test.com',
    local:'Local Test', marca:'Multimarca', emailsLocal:'',
    respuestas:[{ categoria:'BPM', subcategoria:'Limpieza', control:'Test',
      importancia:'Alta', explicacion:'Desc', respuesta:'Cumple',
      observacion:'', fotoBase64:'', fotoNombre:'' }]
  })}};
  console.log(doPost(mock).getContent());
}
