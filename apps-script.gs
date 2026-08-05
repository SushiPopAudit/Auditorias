// ============================================================
// GOOGLE APPS SCRIPT â€” Sistema de AuditorÃ­as Sushi POP
// ============================================================

const SPREADSHEET_ID  = '1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI';
const SHEET_NAME      = 'Resultados';
const DRIVE_FOLDER_ID = '1SJe5kNlEXBpRlFPylSTbS4XedI0ZIC7P';
const USUARIOS_SHEET          = 'Usuarios';
const USUARIOS_SPREADSHEET_ID = '1TeeKe1eYsKIZ6-8uEPOY0UT-wrtrwl0FW4hAgBoIkzY';
const CALENDARIO_SHEET = 'Calendario';

// ============================================================
// CACHÃ‰ â€” CacheService (TTL en segundos)
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

    // â”€â”€ EdiciÃ³n en el lugar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (data.action === 'editarAuditoria') {
      // Verificar token
      if (data.auditorEmail && data.token) {
        var ssAuthE = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
        var shAuthE = ensureUsuariosSheet(ssAuthE);
        var rowAuthE = encontrarUsuarioRow(shAuthE, data.auditorEmail);
        if (rowAuthE < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
        var dAuthE = shAuthE.getRange(rowAuthE, 1, 1, 8).getValues()[0];
        if (dAuthE[4] !== data.token) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
        if (dAuthE[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      }
      if (!sheet || sheet.getLastRow() < 2) return jsonResponse({ success: false, error: 'Sin datos' });
      var origId = String(data.originalAuditId || '').trim();
      if (!origId) return jsonResponse({ success: false, error: 'originalAuditId requerido' });

      var allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 21).getValues();
      var idxMap  = {}; // control.toLowerCase() â†’ Ã­ndice en allRows
      allRows.forEach(function(r, i) {
        if (String(r[0]).trim() === origId) idxMap[String(r[8]).trim().toLowerCase()] = i;
      });
      if (!Object.keys(idxMap).length) return jsonResponse({ success: false, error: 'AuditorÃ­a no encontrada: ' + origId });

      // Actualizar respuesta / observacion / rawValor por control; no tocar fotos (col N)
      var respMap = {};
      (data.respuestas || []).forEach(function(r) { respMap[String(r.control || '').trim().toLowerCase()] = r; });

      Object.keys(idxMap).forEach(function(ctrl) {
        var shRow = idxMap[ctrl] + 2; // 1-indexed + header
        var r = respMap[ctrl];
        if (!r) return;
        sheet.getRange(shRow, 12).setValue(r.respuesta   || ''); // col L
        sheet.getRange(shRow, 13).setValue(r.observacion || ''); // col M
        var rawU = (r.rawValor != null && r.rawValor !== '') ? String(r.rawValor) : (r.fechaRaw || '');
        sheet.getRange(shRow, 21).setValue(rawU);                // col U
      });
      sheet.getRange(2, 21, sheet.getLastRow() - 1, 1).setNumberFormat('@');

      // Recalcular puntaje con las filas actualizadas
      var updRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 21).getValues()
        .filter(function(r) { return String(r[0]).trim() === origId; });
      var res = recalcularPuntaje(updRows);
      Object.keys(idxMap).forEach(function(ctrl) {
        var shRow = idxMap[ctrl] + 2;
        sheet.getRange(shRow, 16).setValue(res.pct);
        sheet.getRange(shRow, 17).setValue(res.nivel);
        sheet.getRange(shRow, 18).setValue(res.reprobado ? 'SÃ­' : 'No');
        sheet.getRange(shRow, 3).setValue(data.hora || ''); // hora de ediciÃ³n
      });

      // Invalidar cachÃ©s
      if (data.auditorEmail) { cacheRemoveKey('aud_' + data.auditorEmail.toLowerCase()); cacheRemoveKey('db_' + data.auditorEmail.toLowerCase()); }
      cacheRemoveKey('aud_all');
      return jsonResponse({ success: true, pct: res.pct, nivel: res.nivel, reprobado: res.reprobado });
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Crear hoja si no existe
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'AuditID','Fecha','Hora','Auditor','Local','Marca',
        'CategorÃ­a','SubcategorÃ­a','Control','Importancia',
        'ExplicaciÃ³n','Respuesta','ObservaciÃ³n','URL Foto','Email Auditor',
        'Puntaje %','Nivel','Reprobado','AcompaÃ±ante','Tipo'
      ]);
      sheet.getRange(1,1,1,20).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Carpeta de fotos para esta auditorÃ­a: Auditorias/Fotos Auditorias/[Local]/[fecha]/
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
        // Soporte para mÃºltiples fotos (fotosBase64) y compatibilidad con fotoBase64 Ãºnico
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
        r.explicacion, r.respuesta,
        r.headcount ? Object.entries(r.headcount).map(function(e){ return e[0].replace(/_/g,' ') + ': ' + e[1]; }).join(' | ') : (r.observacion || ''),
        fotoURL,
        data.auditorEmail || '',
        data.puntaje?.pct    ?? '',             // col P â€” Puntaje %
        data.puntaje?.nivel  || '',             // col Q â€” Nivel
        data.puntaje?.reprobado ? 'SÃ­' : 'No', // col R â€” Reprobado
        data.acompanante ? (data.acompanante + (data.posicionAcompanante ? '|||' + data.posicionAcompanante : '')) : '', // col S â€” AcompaÃ±ante|||PosiciÃ³n
        data.tipoAuditoria || 'Oficial',        // col T â€” Tipo
        (r.rawValor != null && r.rawValor !== '') ? String(r.rawValor) : (r.fechaRaw || ''), // col U â€” valor crudo (nÃºmero o fecha)
      ];
    });

    if (rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 21).setValues(rows);
      // Force text format on Respuesta (col 12), ObservaciÃ³n (col 13), y RawValor (col 21)
      sheet.getRange(startRow, 12, rows.length, 2).setNumberFormat('@');
      sheet.getRange(startRow, 21, rows.length, 1).setNumberFormat('@');
      colorearDesvios(sheet, rows);
      // Invalidar cachÃ© de auditorÃ­as y dashboard del auditor y del admin
      if (data.auditorEmail) {
        cacheRemoveKey('aud_' + data.auditorEmail.toLowerCase());
        cacheRemoveKey('db_'  + data.auditorEmail.toLowerCase());
      }
      cacheRemoveKey('aud_all');
      cacheRemoveKey('db_all'); // dashboard admin uses db_<adminEmail>, but we don't know it â€” TTL will expire
    }

    // Marcar visita del calendario como Realizada si existe una Pendiente para este local+fecha+auditor
    try {
      var shCal = ensureCalendarioSheet(ss);
      if (shCal.getLastRow() > 1) {
        var calData = shCal.getRange(2, 1, shCal.getLastRow() - 1, 7).getValues();
        var fechaAudit = String(data.fecha || '').substring(0, 10);
        calData.forEach(function(row, i) {
          if (String(row[3]) === String(data.local || '') &&
              String(row[1]).substring(0, 10) === fechaAudit &&
              String(row[4]).toLowerCase() === String(data.auditorEmail || '').toLowerCase() &&
              String(row[6]) === 'Pendiente') {
            shCal.getRange(i + 2, 7).setValue('Realizada');
          }
        });
      }
    } catch(calErr) { console.error('Error marcando visita realizada:', calErr); }

    // Detectar desvÃ­os repetidos (aparecen en Ãºltimas 2 auditorÃ­as del mismo local)
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
// DETECCIÃ“N DE DESVÃOS REPETIDOS
// ============================================================
function detectarDesviosRepetidos(sheet, local, auditIdActual, rowsActuales) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // Leer todas las filas del sheet (sin encabezado)
    const allData = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

    // Filtrar filas del mismo local, excluyendo la auditorÃ­a actual
    // Col A(0)=AuditID, Col E(4)=Local, Col I(8)=Control, Col G(6)=Categoria, Col H(7)=Subcategoria, Col L(11)=Respuesta
    const rowsLocal = allData.filter(function(r) {
      return r[4] === local && r[0] !== auditIdActual && r[0];
    });

    if (!rowsLocal.length) return [];

    // Obtener los Ãºltimos 2 AuditIDs distintos (en orden cronolÃ³gico)
    var auditIds = [];
    rowsLocal.forEach(function(r) {
      if (auditIds.indexOf(r[0]) === -1) auditIds.push(r[0]);
    });
    var last2 = auditIds.slice(-2);
    if (last2.length < 2) return []; // Necesitamos al menos 2 auditorÃ­as previas

    // Recolectar No Cumple por cada auditorÃ­a previa
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

    // No Cumple en la auditorÃ­a actual
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
// HELPER: FECHA â†’ YYYY-MM-DD (para nombres de archivo)
// ============================================================
function formatFechaISO(f) {
  if (!f) return '';
  // Si es Date (de getValues()), usar mÃ©todos locales directamente
  if (f instanceof Date) {
    var dd = ('0' + f.getDate()).slice(-2);
    var mm = ('0' + (f.getMonth() + 1)).slice(-2);
    return f.getFullYear() + '-' + mm + '-' + dd;
  }
  // Si es string, parsear manualmente para evitar desfase UTC
  var s = String(f);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Ãšltimo recurso: new Date (puede haber desfase en strings)
  var d = new Date(f);
  if (!isNaN(d.getTime())) {
    var dd2 = ('0' + d.getDate()).slice(-2);
    var mm2 = ('0' + (d.getMonth() + 1)).slice(-2);
    return d.getFullYear() + '-' + mm2 + '-' + dd2;
  }
  return s;
}

// ============================================================
// HELPER: FORMATEAR FECHA YYYY-MM-DD â†’ DD/MM/AAAA
// ============================================================
function formatFecha(f) {
  if (!f) return '';
  // Si es Date (de getValues()), usar mÃ©todos locales directamente
  if (f instanceof Date) {
    var dd = ('0' + f.getDate()).slice(-2);
    var mm = ('0' + (f.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + f.getFullYear();
  }
  // Si es string YYYY-MM-DD, parsear manualmente para evitar desfase UTC
  var s = String(f);
  var p = s.split('-');
  if (p.length === 3 && p[0].length === 4) return p[2] + '/' + p[1] + '/' + p[0];
  // Ãšltimo recurso: new Date
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

    // Filas del mismo local, excluyendo la auditorÃ­a actual
    var rowsLocal = allData.filter(function(col) {
      return col[4] === local && col[0] !== auditIdActual && col[0];
    });

    // Solo auditorÃ­as Oficiales para historial y promedio
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
        reprobado: last[17] === 'SÃ­',
      };
    }

    // Promedio del mes â€” solo Oficial (incluye la auditorÃ­a actual si tambiÃ©n es Oficial)
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
// CONSTRUIR HTML DE AUDITORÃA (usado por email y PDF)
// ============================================================
function buildAuditHtml(data, rows, desviosRepetidos, historial, pdfUrl) {
  // EstadÃ­sticas
  var cumple   = rows.filter(function(r){ return (r[11]||'').toLowerCase() === 'cumple'; }).length;
  var noCumple = rows.filter(function(r){ var v=(r[11]||'').toLowerCase(); return v.includes('no cumple')||v==='nocumple'; }).length;
  var parcial  = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('parcial'); }).length;
  var noAplica = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('aplica'); }).length;
  var total    = rows.filter(function(r){ return r[11]; }).length;
  var pct      = total ? Math.round(cumple / total * 100) : 0;

  // GrÃ¡fico torta
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
    var pSub   = data.puntaje.nivel + (!data.puntaje.reprobado ? ' Â· ' + data.puntaje.obtenido + '/' + data.puntaje.posible + ' pts' : '');
    puntajeHtml = '<div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:12px 24px">'
      + '<div style="font-size:40px;font-weight:900;color:#fff">' + pLabel + '</div>'
      + '<div style="font-size:14px;color:rgba(255,255,255,0.9);font-weight:600;margin-top:2px">' + pSub + '</div>'
      + '</div>';
  }

  var headerBg = (data.puntaje && data.puntaje.reprobado) ? '#e4001b' : '#16a34a';
  var headerHtml = '<div style="background:' + headerBg + ';padding:24px 32px;text-align:center">'
    + '<h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Informe de Auditor&iacute;a</h1>'
    + '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">' + data.local + ' Â· ' + fechaHora + '</p>'
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
        + '<strong>Auditor&iacute;a anterior:</strong> ' + formatFecha(pa.fecha) + ' â€” ' + paLabel + '</p>';
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
      var imp = (r[9]||'').toLowerCase().replace(/Ã­/g,'i');
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
        + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' â€º ' + r[7] + '</div>'
        + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px">' + r[8] + '</div>'
        + explHtmlCrit
        + '<div style="font-size:13px;font-weight:700;color:#e4001b;margin-bottom:4px">â— No Cumple (Cr&iacute;tico)</div>'
        + obsHtml
        + '</td>' + fotoTd + '</tr></table></div>';
    });
    seccionReprobado =
      '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;background:#fff1f2">'
      + '<h2 style="margin:0 0 8px;font-size:16px;color:#991b1b">â›” REPROBADO por Nota de Oro</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;color:#7f1d1d">La auditor&iacute;a fue reprobada por incumplimiento de puntos cr&iacute;ticos (Nota de Oro):</p>'
      + filasCrit + '</div>';
  }

  // ---- 5+6. GRÃFICO Y % POR CATEGORÃA ----
  var maxPts     = { 'critico':4,'crÃ­tico':4,'alta':3,'media':2,'baja':1 };
  var parcialPts = { 'critico':2,'crÃ­tico':2,'alta':1,'media':1,'baja':0 };
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
  // Si hay reprobado, excluir los crÃ­ticos que no cumplen (ya mostrados arriba)
  var noOkRows = rows.filter(function(r){
    var v = (r[11]||'').toLowerCase();
    var esCriticoNC = (r[9]||'').toLowerCase().replace(/Ã­/g,'i') === 'critico' && (v.includes('no cumple') || v === 'nocumple');
    if (data.puntaje && data.puntaje.reprobado && esCriticoNC) return false;
    return v.includes('no cumple') || v === 'nocumple' || v.includes('parcial');
  });

  function buildNoOkFila(r) {
    var res        = (r[11]||'').toLowerCase();
    var esCritico  = (r[9]||'').toLowerCase().replace(/Ã­/g,'i') === 'critico';
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
      + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' â€º ' + r[7] + '</div>'
      + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px">' + r[8] + '</div>'
      + explHtml2
      + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(r[9]) + ';color:' + getImpColor(r[9]) + ';margin-bottom:8px">' + r[9] + '</span>'
      + '<div style="font-size:13px;font-weight:700;color:' + resColor + ';margin-bottom:4px">â— ' + r[11] + '</div>'
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
      + '<h2 style="margin:0 0 16px;font-size:15px;color:#e4001b">âš  Puntos a Corregir (' + noOkRows.length + ')</h2>'
      + filasNoOkHtml + '</div>';
  }

  // ---- 8. DESVÃOS REITERADOS ----
  var seccionRepetidos = '';
  var rep = desviosRepetidos || [];
  if (rep.length) {
    var filasRep = '';
    rep.forEach(function(d) {
      var rep2 = d.repeticiones >= 2;
      var repBg        = rep2 ? '#fff1f2' : '#fff7ed';
      var repBorder    = rep2 ? '#fca5a5' : '#fed7aa';
      var repBadgeBg   = rep2 ? '#e4001b' : '#ea580c';
      var repLabel     = rep2 ? 'ðŸ” Repite en las Ãºltimas 3' : 'âš  Repite en auditorÃ­a anterior';
      filasRep +=
        '<tr style="background:' + repBg + '">'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-weight:600;font-size:13px">' + d.control + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:12px;color:#666">' + d.categoria + ' â€º ' + d.subcategoria + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:12px;text-align:center">'
        + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(d.importancia) + ';color:' + getImpColor(d.importancia) + '">' + d.importancia + '</span>'
        + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid ' + repBorder + ';font-size:11px;text-align:right;white-space:nowrap">'
        + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + repBadgeBg + ';color:#fff">' + repLabel + '</span>'
        + '</td></tr>';
    });
    seccionRepetidos =
      '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;background:#fffbeb">'
      + '<h2 style="margin:0 0 8px;font-size:15px;color:#c2410c">ðŸ” Desv&iacute;os Reiterados (' + rep.length + ')</h2>'
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

  // ---- 10. FOOTER ----  (renumbered â€” was 10)
  var pdfBtnHtml = '';
  if (pdfUrl) {
    pdfBtnHtml = '<a href="' + pdfUrl + '" style="display:inline-block;padding:8px 18px;background:#e4001b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;margin:4px">Descargar PDF</a>';
  }
  var verAuditoriaUrl = 'https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec?action=verAuditoria&auditId=' + data.auditId;
  var verAuditoriaBtnHtml = '<a href="' + verAuditoriaUrl + '" style="display:inline-block;padding:8px 18px;background:#1e40af;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;margin:4px">Ver auditorÃ­a completa</a>';

  var footerHtml = '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center">'
    + '<p style="margin:0;font-size:12px;color:#999">Sistema de AuditorÃ­as Â· Sushi POP Â· ' + formatFecha(data.fecha) + '</p>'
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

// Embebe imÃ¡genes de Drive como base64 en el HTML (necesario para PDF)
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
  if (i==='critico'||i==='crÃ­tico') return '#fff1f2';
  if (i==='alta')  return '#fff7ed';
  if (i==='media') return '#fffbeb';
  return '#f0fdf4';
}
function getImpColor(imp) {
  const i = (imp||'').toLowerCase();
  if (i==='critico'||i==='crÃ­tico') return '#e4001b';
  if (i==='alta')  return '#ea580c';
  if (i==='media') return '#d97706';
  return '#16a34a';
}

// ============================================================
// COLOREAR DESVÃOS EN SHEET
// ============================================================
function colorearDesvios(sheet, rows) {
  const firstRow = sheet.getLastRow() - rows.length + 1;
  rows.forEach((row, i) => {
    const imp = (row[9]||'').toLowerCase();   // importancia = Ã­ndice 9
    const res = (row[11]||'').toLowerCase();  // respuesta   = Ã­ndice 11
    const isCrit = imp==='critico'||imp==='crÃ­tico';
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
  var maxPts     = { 'critico':4, 'crÃ­tico':4, 'alta':3, 'media':2, 'baja':1 };
  var parcialPts = { 'critico':2, 'crÃ­tico':2, 'alta':1, 'media':1, 'baja':0 };
  var obtenido = 0, posible = 0, reprobado = false;

  rows.forEach(function(r) {
    var imp = String(r[9]||'').toLowerCase().trim();
    var res = String(r[11]||'').toLowerCase().trim();
    var max = maxPts[imp];
    if (!max) return;
    if (!res || res.includes('aplica')) return;
    // Solo puntÃºan preguntas de tipo radio (tienen cumple/no cumple/parcial)
    if (!res.includes('cumple') && !res.includes('parcial')) return;
    posible += max;
    if (res === 'cumple') {
      obtenido += max;
    } else if (res.includes('parcial')) {
      obtenido += parcialPts[imp] || 0;
    } else if (res.includes('no cumple') || res === 'nocumple') {
      if (imp === 'critico' || imp === 'crÃ­tico') reprobado = true;
    }
  });

  var pct = posible > 0 ? Math.round(obtenido / posible * 100) : 0;
  var nivel, nivelEmoji;
  if (reprobado)      { nivel = 'Reprobado';     nivelEmoji = 'â›”'; }
  else if (pct >= 90) { nivel = 'Excelente';     nivelEmoji = 'ðŸŸ¢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio'; nivelEmoji = 'ðŸŸ¡'; }
  else if (pct >= 60) { nivel = 'A mejorar';     nivelEmoji = 'ðŸŸ '; }
  else                { nivel = 'Deficiente';    nivelEmoji = 'ðŸ”´'; }

  return { pct: pct, nivel: nivel, obtenido: obtenido, posible: posible, reprobado: reprobado, nivelEmoji: nivelEmoji };
}

// ============================================================
// ============================================================
// AUTH â€” HELPERS
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

function ensureCalendarioSheet(ss) {
  var sheet = ss.getSheetByName(CALENDARIO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CALENDARIO_SHEET);
    sheet.appendRow(['VisitaID','Fecha','Turno','Local','AuditorEmail','AuditorNombre','Estado']);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
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
// REENVÃO DE EMAIL POR AUDIT ID
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'login') {
    var emailLog = ((e.parameter.email) || '').toLowerCase().trim();
    var hashLog  = e.parameter.hash || '';
    if (!emailLog || !hashLog) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssLog    = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var sheetLog = ensureUsuariosSheet(ssLog);
      var rowLog   = encontrarUsuarioRow(sheetLog, emailLog);
      if (rowLog < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dLog = sheetLog.getRange(rowLog, 1, 1, 8).getValues()[0];
      if (dLog[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      if (dLog[4] !== hashLog)  return jsonResponse({ success: false, error: 'ContraseÃ±a incorrecta' });
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
    if (!emailCP || !oldHash || !newHash) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssCP    = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var sheetCP = ensureUsuariosSheet(ssCP);
      var rowCP   = encontrarUsuarioRow(sheetCP, emailCP);
      if (rowCP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dCP = sheetCP.getRange(rowCP, 1, 1, 8).getValues()[0];
      if (dCP[4] !== oldHash) return jsonResponse({ success: false, error: 'ContraseÃ±a actual incorrecta' });
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
    if (!adminEm || !adminTok || !nombre || !newEmail) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssCU = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssCU, adminEm, adminTok)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var sheetCU = ensureUsuariosSheet(ssCU);
      if (encontrarUsuarioRow(sheetCU, newEmail) > 0) return jsonResponse({ success: false, error: 'El email ya estÃ¡ registrado' });
      var tempPwd = generarPasswordTemp();
      var pwdHash = hashPassword(tempPwd);
      sheetCU.appendRow([newEmail, nombre, rol, locales, pwdHash, 'true', 'Activo', new Date()]);
      cacheRemoveKey('usuarios');
      var bodyEmail = 'Hola ' + nombre + ',\n\nTu cuenta fue creada en el Sistema de AuditorÃ­as Sushi POP.\n\nUsuario: ' + newEmail + '\nContraseÃ±a temporal: ' + tempPwd + '\n\nAl ingresar por primera vez se te pedirÃ¡ que cambies tu contraseÃ±a.\n\nIngresÃ¡ en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(newEmail, 'Acceso al Sistema de AuditorÃ­as Sushi POP', bodyEmail, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP AuditorÃ­as' });
      return jsonResponse({ success: true, message: 'Usuario creado y email enviado a ' + newEmail });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'resetPassword') {
    var adminEmR  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokR = e.parameter.adminToken || '';
    var targetEmR = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    if (!adminEmR || !adminTokR || !targetEmR) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
      var bodyRP = 'Hola ' + nombreRP + ',\n\nTu contraseÃ±a fue restablecida.\n\nNueva contraseÃ±a temporal: ' + tempPwdR + '\n\nAl ingresar se te pedirÃ¡ que elijas una nueva contraseÃ±a.\n\nIngresÃ¡ en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(targetEmR, 'Restablecimiento de contraseÃ±a - AuditorÃ­as Sushi POP', bodyRP, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP AuditorÃ­as' });
      return jsonResponse({ success: true, message: 'ContraseÃ±a restablecida y email enviado' });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'darDeBaja') {
    var adminEmB  = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var adminTokB = e.parameter.adminToken || '';
    var targetEmB = ((e.parameter.targetEmail) || '').toLowerCase().trim();
    if (!adminEmB || !adminTokB || !targetEmB) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmA || !adminTokA || !targetEmA) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmG || !adminTokG) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmE || !adminTokE || !targetEmE) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmL || !adminTokL) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmCL || !adminTokCL || !lNombre) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmUL || !adminTokUL || !ulIdx || !ulNombre) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
    if (!adminEmDL || !adminTokDL || !dlIdx) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
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
      var bodyFP = 'Hola ' + nombreFP + ',\n\nRecibimos una solicitud para restablecer tu contraseÃ±a.\n\nContraseÃ±a temporal: ' + tempFP + '\n\nAl ingresar se te pedirÃ¡ que elijas una nueva contraseÃ±a.\n\nIngresÃ¡ en: https://sushipopaudit.github.io/Auditorias/\n\nSushi POP';
      GmailApp.sendEmail(fpEmail, 'RecuperaciÃ³n de contraseÃ±a - AuditorÃ­as Sushi POP', bodyFP, { from: 'franquicias@sushi-pop.com.ar', name: 'Sushi POP AuditorÃ­as' });
      return jsonResponse({ success: true, message: 'Email enviado con contraseÃ±a temporal' });
    } catch(err) { return jsonResponse({ success: false, error: err.message }); }
  }

  if (action === 'bootstrapAdmin') {
    var bNombre = e.parameter.nombre || '';
    var bEmail  = ((e.parameter.email) || '').toLowerCase().trim();
    var bPwd    = e.parameter.pwd || '';
    if (!bNombre || !bEmail || !bPwd) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros: nombre, email, pwd' });
    try {
      var ssBoot  = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shBoot  = ensureUsuariosSheet(ssBoot);
      if (shBoot.getLastRow() >= 2) return jsonResponse({ success: false, error: 'Ya existen usuarios. Por seguridad este endpoint solo funciona con la hoja vacÃ­a.' });
      shBoot.appendRow([bEmail, bNombre, 'Admin', 'todos', hashPassword(bPwd), 'false', 'Activo', new Date()]);
      return jsonResponse({ success: true, message: 'Admin creado: ' + bEmail + '. Ya podÃ©s ingresar con esa contraseÃ±a.' });
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

      const allData = sheet.getRange(2, 1, lastRow - 1, 21).getValues();
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

      var allDataVer = sheetVer.getRange(2, 1, lastRowVer - 1, 21).getValues();
      var rowsVer = allDataVer.filter(function(r) { return String(r[0]) === auditIdVer; })
        .map(function(r) { return r.map(function(v) { return v == null ? '' : String(v); }); });
      if (!rowsVer.length) return HtmlService.createHtmlOutput('<h2>AuditID no encontrado: ' + auditIdVer + '</h2>');

      var firstVer = rowsVer[0];
      var puntajeVer = recalcularPuntaje(rowsVer);

      // Construir HTML completo con todos los puntos organizados por categorÃ­a
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
        + '<h1 style="color:#fff;margin:0 0 4px;font-size:20px">AuditorÃ­a Completa</h1>'
        + '<p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px">' + firstVer[4] + ' Â· ' + formatFecha(firstVer[1]) + ' Â· ' + firstVer[2] + '</p>'
        + '<div style="margin-top:12px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px">'
        + '<div style="font-size:36px;font-weight:900;color:#fff">' + pLabel + '</div>'
        + '<div style="font-size:13px;color:rgba(255,255,255,0.9)">' + puntajeVer.nivel + ' Â· ' + puntajeVer.obtenido + '/' + puntajeVer.posible + ' pts</div>'
        + '</div></div>'
        + '<div style="padding:16px 32px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#444">'
        + '<strong>Local:</strong> ' + firstVer[4] + ' &nbsp;|&nbsp; <strong>Auditor:</strong> ' + firstVer[3] + ' &nbsp;|&nbsp; <strong>Marca:</strong> ' + firstVer[5]
        + (firstVer[18] ? ' &nbsp;|&nbsp; <strong>Acompa&ntilde;ante:</strong> ' + firstVer[18] : '')
        + '</div>'
        + '<div style="padding:24px 32px">' + seccionesHtml + '</div>'
        + '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#999">'
        + 'Sistema de AuditorÃ­as Â· Sushi POP Â· ID: ' + auditIdVer
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
      // Encontrar filas del auditId y sus nÃºmeros de fila en el sheet (base 1, +2 por encabezado)
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

      // Actualizar cols P(16), Q(17), R(18) para cada fila â€” Ã­ndice sheet = columna 16,17,18
      rowIndexes.forEach(function(sheetRow) {
        sheet2.getRange(sheetRow, 16).setValue(puntaje2.pct);
        sheet2.getRange(sheetRow, 17).setValue(puntaje2.nivel);
        sheet2.getRange(sheetRow, 18).setValue(puntaje2.reprobado ? 'SÃ­' : 'No');
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
    if (!gaEmail || !gaToken) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAuthGA = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthGA = ensureUsuariosSheet(ssAuthGA);
      var rowAuthGA = encontrarUsuarioRow(shAuthGA, gaEmail);
      if (rowAuthGA < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthGA = shAuthGA.getRange(rowAuthGA, 1, 1, 8).getValues()[0];
      if (dAuthGA[4] !== gaToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
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
        if ((gaRol === 'Auditor' || gaRol === 'Franquiciado') && gaLocales && gaLocales !== 'todos') {
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
          reprobado: String(r[17]) === 'SÃ­',
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
    if (!gdEmail || !gdToken || !gdId) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAuthGD = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthGD = ensureUsuariosSheet(ssAuthGD);
      var rowAuthGD = encontrarUsuarioRow(shAuthGD, gdEmail);
      if (rowAuthGD < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthGD = shAuthGD.getRange(rowAuthGD, 1, 1, 8).getValues()[0];
      if (dAuthGD[4] !== gdToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dAuthGD[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var gdRol     = String(dAuthGD[2] || '');
      var gdLocales = String(dAuthGD[3] || '');

      var ssGD = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shGD = ssGD.getSheetByName(SHEET_NAME);
      if (!shGD || shGD.getLastRow() < 2) return jsonResponse({ success: false, error: 'Sin datos' });

      var lastGD = shGD.getLastRow();
      var allGD  = shGD.getRange(2, 1, lastGD - 1, 21).getValues();
      var dispGD = shGD.getRange(2, 1, lastGD - 1, 21).getDisplayValues();
      var rowsGD = allGD.map(function(r, rowIdx) {
        return r.map(function(v, colIdx) {
          if (v == null) return '';
          // For user-entered text columns (respuesta=11, observacion=12), use display value
          // to avoid Date-formatted cells returning JS Date objects.
          if ((colIdx === 11 || colIdx === 12 || colIdx === 20) && v instanceof Date) {
            return String(dispGD[rowIdx][colIdx] || '');
          }
          return String(v);
        });
      }).filter(function(r){ return r[0].trim() === gdId; });
      if (!rowsGD.length) return jsonResponse({ success: false, error: 'AuditorÃ­a no encontrada' });

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
            rawValor:    r[20] || '',
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
    if (!dbEmail || !dbToken) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    var dbTipo = (e.parameter.tipo || '').trim();

    var cacheKeyDB = 'db_' + dbEmail + '_' + (dbTipo || 'all');
    var cachedDB = cacheGetParsed(cacheKeyDB);
    if (cachedDB) return jsonResponse(cachedDB);

    try {
      // Auth
      var ssAuthDB = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthDB = ensureUsuariosSheet(ssAuthDB);
      var rowAuthDB = encontrarUsuarioRow(shAuthDB, dbEmail);
      if (rowAuthDB < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthDB = shAuthDB.getRange(rowAuthDB, 1, 1, 8).getValues()[0];
      if (dAuthDB[4] !== dbToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dAuthDB[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var dbRol     = String(dAuthDB[2] || '');
      var dbLocales = String(dAuthDB[3] || '');

      // Read all data
      var ssDB = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shDB = ssDB.getSheetByName(SHEET_NAME);
      if (!shDB || shDB.getLastRow() < 2) return jsonResponse({ success: true, locales: [], porLocal: {}, global: { promedio: null, rankingControles: [], rankingCategorias: [] }, ranking: { mesActual: [], mesAnterior: [], ult3Meses: [] } });

      var dataDB = shDB.getRange(2, 1, shDB.getLastRow() - 1, 20).getValues();

      // Filter rows by role + tipo for porLocal/global
      var allowedLocalesDB = ((dbRol === 'Franquiciado' || dbRol === 'Auditor') && dbLocales && dbLocales !== 'todos')
        ? dbLocales.split(',').map(function(l){ return l.trim().toLowerCase(); })
        : null;
      var filtered = dataDB.filter(function(r) {
        if (!r[0]) return false;
        var rowTipo = (String(r[19]||'').trim()) || 'Oficial';
        if (dbTipo && rowTipo !== dbTipo) return false;
        if (allowedLocalesDB) return allowedLocalesDB.indexOf((String(r[4]||'')).toLowerCase().trim()) !== -1;
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
            reprobado: String(first[17]) === 'SÃ­',
            rows:      rows,
          };
        }).sort(function(a, b) {
          var da = a.fechaISO || '', db2 = b.fechaISO || '';
          return da < db2 ? 1 : da > db2 ? -1 : 0;
        });
      }

      // Helper: ranking of failing controls â€” count = audits where control failed, auditsTotal = audits evaluated
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

      // Helper: global ranking â€” localCount = how many locals failed this control in their last audit
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

      // Helper: ranking of categories by compliance % (same weights as recalcularPuntaje)
      var catMaxPts     = { 'critico':4, 'crÃ­tico':4, 'alta':3, 'media':2, 'baja':1 };
      var catParcialPts = { 'critico':2, 'crÃ­tico':2, 'alta':1, 'media':1, 'baja':0 };
      function rankingCategorias(auditRows) {
        var catMap = {};
        auditRows.forEach(function(r) {
          var cat  = String(r[6]||'').trim();
          var imp  = (String(r[9]||'')).toLowerCase().trim();
          var resp = (String(r[11]||'')).trim().toLowerCase();
          if (!cat || !imp) return;
          var max = catMaxPts[imp];
          if (!max) return;
          if (!resp || resp.includes('aplica')) return;
          if (!resp.includes('cumple') && !resp.includes('parcial')) return;
          if (!catMap[cat]) catMap[cat] = { categoria: cat, obtenido: 0, posible: 0, ncCount: 0 };
          catMap[cat].posible += max;
          if (resp === 'cumple') {
            catMap[cat].obtenido += max;
          } else if (resp.includes('parcial')) {
            catMap[cat].obtenido += (catParcialPts[imp] || 0);
          } else if (resp.includes('no cumple')) {
            catMap[cat].ncCount++;
          }
        });
        return Object.keys(catMap).map(function(cat) {
          var d = catMap[cat];
          return { categoria: cat, pct: d.posible > 0 ? Math.round(d.obtenido / d.posible * 100) : null, ncCount: d.ncCount };
        }).sort(function(a,b){ return (a.pct||100) - (b.pct||100); });
      }

      // Global: ranking of categories with localCount (how many locals have this category below 80%)
      function rankingCategoriasGlobal(localLastRowsMap) {
        var catMap = {};
        Object.keys(localLastRowsMap).forEach(function(localName) {
          var localCatMap = {};
          localLastRowsMap[localName].forEach(function(r) {
            var cat  = String(r[6]||'').trim();
            var imp  = (String(r[9]||'')).toLowerCase().trim();
            var resp = (String(r[11]||'')).trim().toLowerCase();
            if (!cat || !imp) return;
            var max = catMaxPts[imp];
            if (!max) return;
            if (!resp || resp.includes('aplica')) return;
            if (!resp.includes('cumple') && !resp.includes('parcial')) return;
            if (!localCatMap[cat]) localCatMap[cat] = { obtenido: 0, posible: 0 };
            localCatMap[cat].posible += max;
            if (resp === 'cumple') {
              localCatMap[cat].obtenido += max;
            } else if (resp.includes('parcial')) {
              localCatMap[cat].obtenido += (catParcialPts[imp] || 0);
            }
          });
          Object.keys(localCatMap).forEach(function(cat) {
            var d = localCatMap[cat];
            var pct = d.posible > 0 ? Math.round(d.obtenido / d.posible * 100) : null;
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

        // Tendencia: Ãºltima vs anterior
        var tendencia = 'sin-datos', tendenciaDiff = null;
        if (last3.length >= 2 && last3[0].pct !== null && last3[1].pct !== null) {
          var td = Math.round(last3[0].pct - last3[1].pct);
          tendenciaDiff = td;
          tendencia = td > 1 ? 'sube' : td < -1 ? 'baja' : 'estable';
        }

        // DÃ­as desde Ãºltima auditorÃ­a
        var diasSinAuditoria = null;
        if (last3[0].fechaISO) {
          var partsD = last3[0].fechaISO.split('-');
          if (partsD.length === 3) {
            var fechaAudit = new Date(parseInt(partsD[0]), parseInt(partsD[1])-1, parseInt(partsD[2]));
            var hoy = new Date(); hoy.setHours(0,0,0,0);
            diasSinAuditoria = Math.round((hoy - fechaAudit) / 86400000);
          }
        }

        // Tasa de reincidencia: % de NC en Ãºltima que tambiÃ©n fallÃ³ en la anterior
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

      // â”€â”€ Ranking: ALL locals (tipo-filtered, not role-filtered) â”€â”€
      var rankingAuditsByLocal = {};
      dataDB.forEach(function(r) {
        if (!r[0]) return;
        var rowTipo2 = (String(r[19]||'').trim()) || 'Oficial';
        if (dbTipo && rowTipo2 !== dbTipo) return;
        var local2 = String(r[4]||'').trim();
        var aid2   = String(r[0]||'').trim();
        if (!local2 || !aid2) return;
        if (!rankingAuditsByLocal[local2]) rankingAuditsByLocal[local2] = {};
        if (!rankingAuditsByLocal[local2][aid2]) {
          var rawP2 = r[15];
          var pct2  = (rawP2 !== '' && rawP2 !== null && rawP2 !== undefined) ? parseFloat(String(rawP2).replace(',', '.')) : null;
          if (pct2 !== null && isNaN(pct2)) pct2 = null;
          rankingAuditsByLocal[local2][aid2] = { pct: pct2, fechaISO: formatFechaISO(r[1]) };
        }
      });
      var todayR = new Date();
      var thisYearR = todayR.getFullYear(), thisMonthR = todayR.getMonth() + 1;
      var prevMonthR = thisMonthR === 1 ? 12 : thisMonthR - 1;
      var prevYearR  = thisMonthR === 1 ? thisYearR - 1 : thisYearR;
      var months3Keys = [];
      for (var ri = 0; ri < 3; ri++) {
        var rmo = thisMonthR - ri; var rye = thisYearR;
        if (rmo <= 0) { rmo += 12; rye--; }
        months3Keys.push(rye * 100 + rmo);
      }
      function computeRankingPeriod(periodCheck) {
        var scores = {};
        Object.keys(rankingAuditsByLocal).forEach(function(ln) {
          Object.keys(rankingAuditsByLocal[ln]).forEach(function(aid) {
            var a = rankingAuditsByLocal[ln][aid];
            if (!a.fechaISO) return;
            var pts = a.fechaISO.split('-');
            if (pts.length !== 3) return;
            var ay = parseInt(pts[0]), am = parseInt(pts[1]);
            if (!periodCheck(ay, am)) return;
            if (a.pct === null) return;
            if (!scores[ln]) scores[ln] = { local: ln, sum: 0, count: 0 };
            scores[ln].sum += a.pct; scores[ln].count++;
          });
        });
        return Object.keys(scores).map(function(ln) {
          var s = scores[ln];
          return { local: ln, promedio: Math.round(s.sum / s.count), auditCount: s.count };
        }).sort(function(a,b){ return b.promedio - a.promedio; });
      }
      var ranking = {
        mesActual:   computeRankingPeriod(function(y,m){ return y===thisYearR && m===thisMonthR; }),
        mesAnterior: computeRankingPeriod(function(y,m){ return y===prevYearR && m===prevMonthR; }),
        ult3Meses:   computeRankingPeriod(function(y,m){ return months3Keys.indexOf(y*100+m) !== -1; }),
      };

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
        ranking: ranking,
      };
      cachePutObj(cacheKeyDB, resDB, 180);
      return jsonResponse(resDB);
    } catch(dbErr) { return jsonResponse({ success: false, error: dbErr.message }); }
  }

  // ============================================================
  // getCalendario
  // ============================================================
  if (action === 'getCalendario') {
    var gcEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var gcToken = e.parameter.token || '';
    if (!gcEmail || !gcToken) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAuthGC = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthGC = ensureUsuariosSheet(ssAuthGC);
      var rowAuthGC = encontrarUsuarioRow(shAuthGC, gcEmail);
      if (rowAuthGC < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthGC = shAuthGC.getRange(rowAuthGC, 1, 1, 8).getValues()[0];
      if (dAuthGC[4] !== gcToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dAuthGC[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });
      var gcRol = String(dAuthGC[2] || '');

      var ssGC = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shGC = ensureCalendarioSheet(ssGC);
      if (shGC.getLastRow() < 2) return jsonResponse({ success: true, visitas: [] });
      var dataGC = shGC.getRange(2, 1, shGC.getLastRow() - 1, 7).getValues();
      var visitas = dataGC.filter(function(r){ return r[0]; }).map(function(r){
        return {
          visitaId:      String(r[0] || ''),
          fecha:         formatFechaISO(r[1]),
          turno:         String(r[2] || ''),
          local:         String(r[3] || ''),
          auditorEmail:  String(r[4] || ''),
          auditorNombre: String(r[5] || ''),
          estado:        String(r[6] || ''),
        };
      });
      // Deduplicar: si hay Pendiente Y Realizada para mismo local+fecha+turno+auditor, quedarse solo con Realizada
      var dedupMap = {};
      visitas.forEach(function(v) {
        var key = v.fecha + '|' + v.local + '|' + v.turno + '|' + v.auditorEmail.toLowerCase();
        if (!dedupMap[key] || v.estado === 'Realizada') dedupMap[key] = v;
      });
      visitas = Object.values(dedupMap);

      // Auditor solo ve sus visitas; Admin ve todas
      if (gcRol !== 'Admin') {
        visitas = visitas.filter(function(v){ return v.auditorEmail.toLowerCase() === gcEmail; });
      }
      return jsonResponse({ success: true, visitas: visitas });
    } catch(gcErr) { return jsonResponse({ success: false, error: gcErr.message }); }
  }

  // ============================================================
  // agregarVisita
  // ============================================================
  if (action === 'agregarVisita') {
    var avAdminEmail = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var avAdminToken = e.parameter.adminToken || '';
    var avFecha      = e.parameter.fecha || '';
    var avTurno      = e.parameter.turno || 'DÃ­a';
    var avLocal      = e.parameter.local || '';
    var avAuditorEmail = ((e.parameter.auditorEmail) || '').toLowerCase().trim();
    if (!avAdminEmail || !avAdminToken || !avFecha || !avLocal || !avAuditorEmail)
      return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAV = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssAV, avAdminEmail, avAdminToken)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });

      // Obtener nombre del auditor
      var shUsersAV = ensureUsuariosSheet(ssAV);
      var rowAV = encontrarUsuarioRow(shUsersAV, avAuditorEmail);
      var avAuditorNombre = rowAV > 0 ? String(shUsersAV.getRange(rowAV, 2).getValue()) : avAuditorEmail;

      var ssDataAV = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shCalAV  = ensureCalendarioSheet(ssDataAV);
      var visitaId = 'VIS_' + new Date().getTime();
      shCalAV.appendRow([visitaId, avFecha, avTurno, avLocal, avAuditorEmail, avAuditorNombre, 'Pendiente']);

      return jsonResponse({ success: true, visitaId: visitaId });
    } catch(avErr) { return jsonResponse({ success: false, error: avErr.message }); }
  }

  // ============================================================
  // borrarVisita
  // ============================================================
  if (action === 'borrarVisita') {
    var bvAdminEmail = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var bvAdminToken = e.parameter.adminToken || '';
    var bvVisitaId   = e.parameter.visitaId || '';
    if (!bvAdminEmail || !bvAdminToken || !bvVisitaId) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssBV = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssBV, bvAdminEmail, bvAdminToken)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var ssDataBV = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shCalBV  = ensureCalendarioSheet(ssDataBV);
      if (shCalBV.getLastRow() < 2) return jsonResponse({ success: false, error: 'Visita no encontrada' });
      var dataBV = shCalBV.getRange(2, 1, shCalBV.getLastRow() - 1, 1).getValues();
      var rowBV = -1;
      for (var bi = 0; bi < dataBV.length; bi++) {
        if (String(dataBV[bi][0]) === bvVisitaId) { rowBV = bi + 2; break; }
      }
      if (rowBV < 0) return jsonResponse({ success: false, error: 'Visita no encontrada' });
      shCalBV.deleteRow(rowBV);
      return jsonResponse({ success: true });
    } catch(bvErr) { return jsonResponse({ success: false, error: bvErr.message }); }
  }

  // ============================================================
  // marcarVisitaRealizada
  // ============================================================
  if (action === 'marcarVisitaRealizada') {
    var mvAdminEmail = ((e.parameter.adminEmail) || '').toLowerCase().trim();
    var mvAdminToken = e.parameter.adminToken || '';
    var mvVisitaId   = e.parameter.visitaId || '';
    if (!mvAdminEmail || !mvAdminToken || !mvVisitaId) return jsonResponse({ success: false, error: 'Faltan parámetros' });
    try {
      var ssMV = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      if (!verificarAdmin(ssMV, mvAdminEmail, mvAdminToken)) return jsonResponse({ success: false, error: 'Sin permisos de administrador' });
      var ssDataMV = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shCalMV  = ensureCalendarioSheet(ssDataMV);
      if (shCalMV.getLastRow() < 2) return jsonResponse({ success: false, error: 'Visita no encontrada' });
      var dataMV = shCalMV.getRange(2, 1, shCalMV.getLastRow() - 1, 1).getValues();
      var rowMV = -1;
      for (var mi = 0; mi < dataMV.length; mi++) {
        if (String(dataMV[mi][0]) === mvVisitaId) { rowMV = mi + 2; break; }
      }
      if (rowMV < 0) return jsonResponse({ success: false, error: 'Visita no encontrada' });
      shCalMV.getRange(rowMV, 7).setValue('Realizada');
      return jsonResponse({ success: true });
    } catch(mvErr) { return jsonResponse({ success: false, error: mvErr.message }); }
  }

  // ============================================================
  // getLocalFallas â€” Ãºltimas 2 auditorÃ­as de un local: No Cumple + CrÃ­tico Parcial
  // ============================================================
  if (action === 'getLocalFallas') {
    var lfEmail = ((e.parameter.email) || '').toLowerCase().trim();
    var lfToken = e.parameter.token || '';
    var lfLocal = e.parameter.local || '';
    if (!lfEmail || !lfToken || !lfLocal) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAuthLF = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAuthLF = ensureUsuariosSheet(ssAuthLF);
      var rowAuthLF = encontrarUsuarioRow(shAuthLF, lfEmail);
      if (rowAuthLF < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAuthLF = shAuthLF.getRange(rowAuthLF, 1, 1, 8).getValues()[0];
      if (dAuthLF[4] !== lfToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dAuthLF[6] !== 'Activo') return jsonResponse({ success: false, error: 'Usuario inactivo' });

      var ssLF = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shLF = ssLF.getSheetByName(SHEET_NAME);
      if (!shLF || shLF.getLastRow() < 2) return jsonResponse({ success: true, auditorias: [] });

      var allLF = shLF.getRange(2, 1, shLF.getLastRow() - 1, 17).getValues();
      // Filtrar filas del local (col E = Ã­ndice 4)
      var rowsLocal = allLF.filter(function(r){ return String(r[4] || '').trim() === lfLocal && r[0]; });
      if (!rowsLocal.length) return jsonResponse({ success: true, auditorias: [] });

      // Obtener los Ãºltimos 2 AuditIDs distintos por orden de apariciÃ³n
      var auditIds = [];
      rowsLocal.forEach(function(r){
        var id = String(r[0]);
        if (auditIds.indexOf(id) === -1) auditIds.push(id);
      });
      var last2 = auditIds.slice(-2);

      var result = last2.map(function(id) {
        var rows = rowsLocal.filter(function(r){ return String(r[0]) === id; });
        var first = rows[0];
        var fallas = rows.filter(function(r){
          var res = String(r[11]||'').toLowerCase();
          var imp = String(r[9]||'').toLowerCase();
          var isNoCumple   = res.includes('no cumple') || res === 'nocumple';
          var isCritParcial= res.includes('parcial') && (imp === 'critico' || imp === 'crÃ­tico');
          return isNoCumple || isCritParcial;
        }).map(function(r){
          return {
            categoria:   String(r[6]||''),
            subcategoria:String(r[7]||''),
            control:     String(r[8]||''),
            importancia: String(r[9]||''),
            respuesta:   String(r[11]||''),
          };
        });
        return {
          auditId: id,
          fecha:   formatFechaISO(first[1]),
          fallas:  fallas,
        };
      });

      return jsonResponse({ success: true, auditorias: result });
    } catch(lfErr) { return jsonResponse({ success: false, error: lfErr.message }); }
  }

  // ============================================================
  // getPreguntas â€” lee hoja MM completa (solo Admin)
  // ============================================================
  if (action === 'getPreguntas') {
    var gpEmail = ((e.parameter.email)||'').toLowerCase().trim();
    var gpToken = e.parameter.token || '';
    if (!gpEmail || !gpToken) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssGP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shGP = ensureUsuariosSheet(ssGP);
      var rowGP = encontrarUsuarioRow(shGP, gpEmail);
      if (rowGP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dGP = shGP.getRange(rowGP, 1, 1, 8).getValues()[0];
      if (dGP[4] !== gpToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dGP[2] !== 'Admin') return jsonResponse({ success: false, error: 'Solo Admin' });

      var ssMM = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shMM = ssMM.getSheetByName('MM');
      if (!shMM) return jsonResponse({ success: false, error: 'Hoja MM no encontrada' });
      var lastMM = shMM.getLastRow();
      if (lastMM < 2) return jsonResponse({ success: true, preguntas: [] });
      var dataMM = shMM.getRange(2, 1, lastMM - 1, 11).getValues();
      var preguntas = dataMM.map(function(r, i) {
        return {
          rowIndex:    i + 2,
          marca:       String(r[0]||'').trim(),
          categoria:   String(r[1]||'').trim(),
          subcategoria:String(r[2]||'').trim(),
          control:     String(r[3]||'').trim(),
          importancia: String(r[4]||'').trim(),
          explicacion: String(r[5]||'').trim(),
          pregunta:    String(r[6]||'').trim(),
          imagen:      String(r[7]||'').trim(),
          tipoRespuesta: String(r[8]||'').trim(),
          explicacionDetallada: String(r[9]||'').trim(),
          validacion:  String(r[10]||'').trim(),
        };
      }).filter(function(p) { return p.marca; });
      return jsonResponse({ success: true, preguntas: preguntas });
    } catch(gpErr) { return jsonResponse({ success: false, error: gpErr.message }); }
  }

  // ============================================================
  // addPregunta â€” agrega fila a MM (solo Admin)
  // ============================================================
  if (action === 'addPregunta') {
    var apEmail = ((e.parameter.email)||'').toLowerCase().trim();
    var apToken = e.parameter.token || '';
    if (!apEmail || !apToken) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssAP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shAP = ensureUsuariosSheet(ssAP);
      var rowAP = encontrarUsuarioRow(shAP, apEmail);
      if (rowAP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dAP = shAP.getRange(rowAP, 1, 1, 8).getValues()[0];
      if (dAP[4] !== apToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dAP[2] !== 'Admin') return jsonResponse({ success: false, error: 'Solo Admin' });

      var ssMMAP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shMMAP = ssMMAP.getSheetByName('MM');
      if (!shMMAP) return jsonResponse({ success: false, error: 'Hoja MM no encontrada' });
      shMMAP.appendRow([
        e.parameter.marca        || '',
        e.parameter.categoria    || '',
        e.parameter.subcategoria || '',
        e.parameter.control      || '',
        e.parameter.importancia  || '',
        e.parameter.explicacion  || '',
        e.parameter.pregunta     || '',
        e.parameter.imagen       || '',
        e.parameter.tipoRespuesta || '',
        e.parameter.explicacionDetallada || '',
        e.parameter.validacion   || '',
      ]);
      cacheRemoveKey('preguntas_mm');
      return jsonResponse({ success: true });
    } catch(apErr) { return jsonResponse({ success: false, error: apErr.message }); }
  }

  // ============================================================
  // editPregunta â€” edita fila por rowIndex en MM (solo Admin)
  // ============================================================
  if (action === 'editPregunta') {
    var epEmail = ((e.parameter.email)||'').toLowerCase().trim();
    var epToken = e.parameter.token || '';
    var epRow   = parseInt(e.parameter.rowIndex || '0', 10);
    if (!epEmail || !epToken || !epRow) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssEP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shEP = ensureUsuariosSheet(ssEP);
      var rowEP = encontrarUsuarioRow(shEP, epEmail);
      if (rowEP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dEP = shEP.getRange(rowEP, 1, 1, 8).getValues()[0];
      if (dEP[4] !== epToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dEP[2] !== 'Admin') return jsonResponse({ success: false, error: 'Solo Admin' });

      var ssMMEP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shMMEP = ssMMEP.getSheetByName('MM');
      if (!shMMEP || epRow < 2 || epRow > shMMEP.getLastRow()) return jsonResponse({ success: false, error: 'Fila invÃ¡lida' });
      shMMEP.getRange(epRow, 1, 1, 11).setValues([[
        e.parameter.marca        || '',
        e.parameter.categoria    || '',
        e.parameter.subcategoria || '',
        e.parameter.control      || '',
        e.parameter.importancia  || '',
        e.parameter.explicacion  || '',
        e.parameter.pregunta     || '',
        e.parameter.imagen       || '',
        e.parameter.tipoRespuesta || '',
        e.parameter.explicacionDetallada || '',
        e.parameter.validacion   || '',
      ]]);
      cacheRemoveKey('preguntas_mm');
      return jsonResponse({ success: true });
    } catch(epErr) { return jsonResponse({ success: false, error: epErr.message }); }
  }

  // ============================================================
  // deletePregunta â€” borra fila por rowIndex en MM (solo Admin)
  // ============================================================
  if (action === 'deletePregunta') {
    var dpEmail = ((e.parameter.email)||'').toLowerCase().trim();
    var dpToken = e.parameter.token || '';
    var dpRow   = parseInt(e.parameter.rowIndex || '0', 10);
    if (!dpEmail || !dpToken || !dpRow) return jsonResponse({ success: false, error: 'Faltan parÃ¡metros' });
    try {
      var ssDP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shDP = ensureUsuariosSheet(ssDP);
      var rowDP = encontrarUsuarioRow(shDP, dpEmail);
      if (rowDP < 0) return jsonResponse({ success: false, error: 'Usuario no encontrado' });
      var dDP = shDP.getRange(rowDP, 1, 1, 8).getValues()[0];
      if (dDP[4] !== dpToken) return jsonResponse({ success: false, error: 'Sin autorizaciÃ³n' });
      if (dDP[2] !== 'Admin') return jsonResponse({ success: false, error: 'Solo Admin' });

      var ssMMDP = SpreadsheetApp.openById(USUARIOS_SPREADSHEET_ID);
      var shMMDP = ssMMDP.getSheetByName('MM');
      if (!shMMDP || dpRow < 2 || dpRow > shMMDP.getLastRow()) return jsonResponse({ success: false, error: 'Fila invÃ¡lida' });
      shMMDP.deleteRow(dpRow);
      cacheRemoveKey('preguntas_mm');
      return jsonResponse({ success: true });
    } catch(dpErr) { return jsonResponse({ success: false, error: dpErr.message }); }
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

// ============================================================
// MIGRACIÃ“N: evaluar respuestas numÃ©ricas viejas con rangos
// Ejecutar UNA VEZ desde el editor de Apps Script
// ============================================================
function migrarRespuestasNumericas() {
  // Reglas: { control (lowercase) -> funciÃ³n evaluadora }
  var REGLAS = {
    'temperatura del salmon':    function(n) { return n>=-2&&n<=2?'Cumple':n>2&&n<=6?'Cumple parcialmente':'No Cumple'; },
    'heladera de salmon':        function(n) { return n>=-2&&n<=2?'Cumple':'No Cumple'; },
    'freezer':                   function(n) { return n>=-18&&n<=-15?'Cumple':'No Cumple'; },
    'heladeras cocina':          function(n) { return n>=2&&n<=7?'Cumple':'No Cumple'; },
    'ambiente cocina sushi':     function(n) { return n<=22?'Cumple':'No Cumple'; },
    'temperatura camara':        function(n) { return n>=2&&n<=7?'Cumple':'No Cumple'; },
    'heladera combos':           function(n) { return n>=10&&n<=14?'Cumple':'No Cumple'; },
  };

  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh   = ss.getSheetByName(SHEET_NAME);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();

  // Paso 1: actualizar respuestas en memoria y en el sheet
  var updates = 0;
  data.forEach(function(row, i) {
    var control  = String(row[8]  || '').trim().toLowerCase();
    var respuesta = String(row[11] || '').trim();
    var evaluador = REGLAS[control];
    if (!evaluador) return;

    var num = parseFloat(respuesta.replace(',', '.'));
    if (isNaN(num)) return;

    var resultado = evaluador(num);
    row[11] = resultado;                        // actualizar en memoria
    sh.getRange(i + 2, 12).setValue(resultado); // col L en el sheet
    updates++;
  });

  // Paso 2: recalcular puntaje por auditId y actualizar cols P/Q/R
  var byAudit = {};
  data.forEach(function(row, i) {
    var id = String(row[0] || '').trim();
    if (!id) return;
    if (!byAudit[id]) byAudit[id] = [];
    byAudit[id].push({ row: row, rowIndex: i });
  });

  var auditUpdates = 0;
  Object.keys(byAudit).forEach(function(id) {
    var entries = byAudit[id];
    var rows    = entries.map(function(e) { return e.row; });
    var res     = recalcularPuntaje(rows);
    entries.forEach(function(e) {
      var shRow = e.rowIndex + 2;
      sh.getRange(shRow, 16).setValue(res.pct);                // col P â€” Puntaje%
      sh.getRange(shRow, 17).setValue(res.nivel);              // col Q â€” Nivel
      sh.getRange(shRow, 18).setValue(res.reprobado ? 'SÃ­' : 'No'); // col R â€” Reprobado
    });
    auditUpdates++;
  });

  Logger.log('MigraciÃ³n completa. Filas de respuesta actualizadas: ' + updates + '. AuditorÃ­as recalculadas: ' + auditUpdates);
  CacheService.getScriptCache().removeAll(['aud_all']);
}

// ============================================================
// Ejecutar UNA VEZ: copia los valores numÃ©ricos originales desde
// _backup_pre_migracion â†’ col U de Resultados
// ============================================================
function restaurarRawValor() {
  var CONTROLES_NUMERICOS = [
    'temperatura del salmon', 'heladera de salmon', 'freezer',
    'heladeras cocina', 'ambiente cocina sushi', 'temperatura camara', 'heladera combos',
  ];

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var shMain  = ss.getSheetByName(SHEET_NAME);
  var shBack  = ss.getSheetByName('_backup_pre_migracion');
  if (!shBack) { Logger.log('No se encontrÃ³ la hoja _backup_pre_migracion'); return; }

  // Leer backup: col A=auditId, col I=control, col L=respuesta original (el nÃºmero)
  var backData = shBack.getRange(2, 1, shBack.getLastRow() - 1, 12).getValues();

  // Construir mapa: "auditId|control" â†’ valor numÃ©rico original
  var mapa = {};
  backData.forEach(function(r) {
    var control = String(r[8] || '').trim().toLowerCase();
    if (CONTROLES_NUMERICOS.indexOf(control) === -1) return;
    var val = String(r[11] || '').trim();
    var num = parseFloat(val.replace(',', '.'));
    if (isNaN(num)) return; // ya fue migrado en esa versiÃ³n (no deberÃ­a pasar)
    var key = String(r[0] || '').trim() + '|' + control;
    mapa[key] = num;
  });

  // Leer hoja actual y escribir col U donde estÃ© vacÃ­a
  var mainData = shMain.getRange(2, 1, shMain.getLastRow() - 1, 21).getValues();
  var restored = 0;
  mainData.forEach(function(r, i) {
    var colU = String(r[20] || '').trim();
    if (colU) return; // ya tiene valor, no pisar
    var control = String(r[8] || '').trim().toLowerCase();
    var key = String(r[0] || '').trim() + '|' + control;
    if (!(key in mapa)) return;
    shMain.getRange(i + 2, 21).setValue(mapa[key]); // col U
    restored++;
  });

  Logger.log('rawValor restaurado en ' + restored + ' filas.');
  CacheService.getScriptCache().removeAll(['aud_all']);
}

// ============================================================
// Ejecutar UNA VEZ: para filas donde col U sigue vacÃ­a y la
// respuesta es Cumple/No Cumple, anota el rango de referencia
// ============================================================
function agregarRangoReferencia() {
  var RANGOS = {
    'temperatura del salmon': 'rango Cumple: -2Â°C a 2Â°C | Parcial: 2Â°C a 6Â°C',
    'heladera de salmon':     'rango Cumple: -2Â°C a 2Â°C',
    'freezer':                'rango Cumple: -18Â°C a -15Â°C',
    'heladeras cocina':       'rango Cumple: 2Â°C a 7Â°C',
    'ambiente cocina sushi':  'rango Cumple: â‰¤22Â°C',
    'temperatura camara':     'rango Cumple: 2Â°C a 7Â°C',
    'heladera combos':        'rango Cumple: 10Â°C a 14Â°C',
  };

  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var shMain = ss.getSheetByName(SHEET_NAME);
  var data   = shMain.getRange(2, 1, shMain.getLastRow() - 1, 21).getValues();
  var tagged = 0;

  data.forEach(function(r, i) {
    var colU = String(r[20] || '').trim();
    if (colU) return; // ya tiene valor real, no pisar
    var control = String(r[8] || '').trim().toLowerCase();
    var rango = RANGOS[control];
    if (!rango) return;
    var respuesta = String(r[11] || '').toLowerCase();
    if (!respuesta.includes('cumple')) return; // solo filas evaluadas
    shMain.getRange(i + 2, 21).setValue(rango); // col U
    tagged++;
  });

  Logger.log('Rango de referencia agregado en ' + tagged + ' filas.');
  CacheService.getScriptCache().removeAll(['aud_all']);
}
