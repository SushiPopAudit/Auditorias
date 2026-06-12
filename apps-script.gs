// ============================================================
// GOOGLE APPS SCRIPT — Sistema de Auditorías Sushi POP
// ============================================================

const SPREADSHEET_ID  = '1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI';
const SHEET_NAME      = 'Resultados';
const DRIVE_FOLDER_ID = '1a6RWhFsza7AhNl_HHSTh59c4xWUXMUZk';

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
        'Puntaje %','Nivel','Reprobado','Acompañante'
      ]);
      sheet.getRange(1,1,1,19).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Carpeta de fotos para esta auditoría
    let auditFolder = null;
    if (DRIVE_FOLDER_ID) {
      try {
        auditFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFolder(data.auditId);
      } catch(e) { console.error('Drive folder error:', e); }
    }

    // Construir filas
    const rows = data.respuestas.map(r => {
      let fotoURL = '';
      if (r.fotoBase64 && auditFolder) {
        try {
          const blob = Utilities.newBlob(Utilities.base64Decode(r.fotoBase64), 'image/jpeg', r.fotoNombre || 'foto.jpg');
          const file = auditFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fotoURL = file.getUrl();
        } catch(imgErr) { console.error('Foto error:', imgErr); }
      }
      return [
        data.auditId, data.fecha, data.hora,
        data.auditor,
        data.local,
        data.marca,
        r.categoria, r.subcategoria, r.control, r.importancia,
        r.explicacion, r.respuesta, r.observacion, fotoURL,
        data.auditorEmail || '',
        data.puntaje?.pct    ?? '',             // col P — Puntaje %
        data.puntaje?.nivel  || '',             // col Q — Nivel
        data.puntaje?.reprobado ? 'Sí' : 'No', // col R — Reprobado
        data.acompanante || '',                 // col S — Acompañante
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 19).setValues(rows);
      colorearDesvios(sheet, rows);
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
// HELPER: FORMATEAR FECHA YYYY-MM-DD → DD/MM/AAAA
// ============================================================
function formatFecha(f) {
  if (!f) return '';
  // Si es un objeto Date (viene de getValues() del sheet)
  var d = (f instanceof Date) ? f : new Date(f);
  if (!isNaN(d.getTime())) {
    var dd   = ('0' + d.getDate()).slice(-2);
    var mm   = ('0' + (d.getMonth() + 1)).slice(-2);
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }
  // Fallback: string YYYY-MM-DD
  var s = String(f);
  var p = s.split('-');
  return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0] : s;
}

// ============================================================
// HISTORIAL DEL LOCAL
// ============================================================
function calcularHistorial(sheet, local, auditIdActual, fechaActual, puntajeActual) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    var allData = sheet.getRange(2, 1, lastRow - 1, 17).getValues();

    // Filas del mismo local, excluyendo la auditoría actual
    var rowsLocal = allData.filter(function(col) {
      return col[4] === local && col[0] !== auditIdActual && col[0];
    });

    var prevAudit = null;
    if (rowsLocal.length > 0) {
      var last = rowsLocal[rowsLocal.length - 1];
      prevAudit = {
        pct:       last[15],
        nivel:     last[16],
        fecha:     last[1],
        reprobado: last[17] === 'Sí',
      };
    }

    // Promedio del mes (incluye la auditoría actual)
    var yearMonth = String(fechaActual).substring(0, 7);
    var rowsMes = rowsLocal.filter(function(col) {
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

  var htmlBlob = Utilities.newBlob(htmlContent, 'text/html', docTitle + '.html');
  var tempFile = DriveApp.createFile(htmlBlob);
  var pdfBlob = tempFile.getAs('application/pdf');
  pdfBlob.setName(docTitle + '.pdf');
  tempFile.setTrashed(true);

  var parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var pdfFolders = parentFolder.getFoldersByName('Informes PDF');
  var pdfFolder = pdfFolders.hasNext() ? pdfFolders.next() : parentFolder.createFolder('Informes PDF');

  var pdfFile = pdfFolder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = pdfFile.getUrl();

  var attachBlob = pdfFile.getBlob();
  attachBlob.setName(docTitle + '.pdf');

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
  var chartUrl = 'https://quickchart.io/chart?c=' + encodeURIComponent(chartData) + '&width=420&height=220&backgroundColor=white';

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
    + '<h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Informe de Auditoría</h1>'
    + '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">' + data.local + ' · ' + fechaHora + '</p>'
    + puntajeHtml + '</div>';

  // ---- 2. DATOS ----
  var acompananteRow = data.acompanante
    ? '<tr><td style="padding:3px 0;color:#666;font-size:13px;width:110px">Acompañante</td><td style="padding:3px 0;font-weight:600;font-size:13px" colspan="3">' + data.acompanante + '</td></tr>'
    : '';

  var datosHtml = '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><td style="padding:3px 0;color:#666;font-size:13px;width:110px">Local</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.local + '</td>'
    + '<td style="padding:3px 0;color:#666;font-size:13px;width:110px">Auditor</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.auditor + '</td></tr>'
    + acompananteRow
    + '<tr><td style="padding:3px 0;color:#666;font-size:13px">Fecha</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + formatFecha(data.fecha) + ' ' + (data.hora || '') + '</td>'
    + '<td style="padding:3px 0;color:#666;font-size:13px">Marca</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.marca + '</td></tr>'
    + '</table></div>';

  // ---- 3. REPROBADO POR NOTA DE ORO ----
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
      var fotoTd = fotoDirecta
        ? '<td style="vertical-align:top;padding-left:12px;width:45%"><img src="' + fotoDirecta + '" alt="Foto" style="width:100%;max-width:200px;border-radius:6px;border:1px solid #fca5a5"></td>'
        : '';
      filasCrit +=
        '<div style="background:#fff1f2;border-radius:8px;padding:16px;margin-bottom:12px;border-left:4px solid #e4001b">'
        + '<table style="width:100%;border-collapse:collapse"><tr>'
        + '<td style="vertical-align:top;width:' + tdWidth + '">'
        + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' › ' + r[7] + '</div>'
        + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:6px">' + r[8] + '</div>'
        + '<div style="font-size:13px;font-weight:700;color:#e4001b;margin-bottom:4px">● No Cumple (Crítico)</div>'
        + obsHtml
        + '</td>' + fotoTd + '</tr></table></div>';
    });
    seccionReprobado =
      '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;background:#fff1f2">'
      + '<h2 style="margin:0 0 8px;font-size:16px;color:#991b1b">⛔ REPROBADO por Nota de Oro</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;color:#7f1d1d">La auditoría fue reprobada por incumplimiento de puntos críticos (Nota de Oro):</p>'
      + filasCrit + '</div>';
  }

  // ---- 4+5. GRÁFICO Y % POR CATEGORÍA ----
  var maxPts     = { 'critico':4,'crítico':4,'alta':3,'media':2,'baja':1 };
  var parcialPts = { 'critico':2,'crítico':2,'alta':1,'media':1,'baja':0 };
  var catMap = {};
  rows.forEach(function(r) {
    var cat = r[6] || 'Sin categoría';
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
    + '<h2 style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Distribución de Resultados</h2>'
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
    + '<h3 style="margin:20px 0 12px;font-size:14px;color:#1a1a1a">% por Categoría</h3>'
    + '<table style="width:100%;border-collapse:collapse">' + filasCatHtml + '</table>'
    + '</div>';

  // ---- 6. PUNTOS A CORREGIR ----
  // Si hay reprobado, excluir los críticos que no cumplen (ya mostrados arriba)
  var noOkRows = rows.filter(function(r){
    var v = (r[11]||'').toLowerCase();
    var esCriticoNC = (r[9]||'').toLowerCase().replace(/í/g,'i') === 'critico' && (v.includes('no cumple') || v === 'nocumple');
    if (data.puntaje && data.puntaje.reprobado && esCriticoNC) return false;
    return v.includes('no cumple') || v === 'nocumple' || v.includes('parcial');
  });

  var filasNoOkHtml = '';
  noOkRows.forEach(function(r) {
    var res        = (r[11]||'').toLowerCase();
    var esCritico  = (r[9]||'').toLowerCase().replace(/í/g,'i') === 'critico';
    var esNoCumple = res.includes('no cumple') || res === 'nocumple';
    var bgRow      = (esCritico && esNoCumple) ? '#fff1f2' : esNoCumple ? '#fef9f9' : '#fffbeb';
    var resColor   = esNoCumple ? '#e4001b' : '#d97706';
    var fotoDirecta = driveImgUrl(r[13]);
    var tdWidth    = fotoDirecta ? '55%' : '100%';
    var obsHtml    = r[12] ? '<div style="font-size:12px;color:#666;font-style:italic">"' + r[12] + '"</div>' : '';
    var fotoTd     = fotoDirecta
      ? '<td style="vertical-align:top;padding-left:12px;width:45%"><img src="' + fotoDirecta + '" alt="Foto" style="width:100%;max-width:200px;border-radius:6px;border:1px solid #e5e7eb"></td>'
      : '';
    filasNoOkHtml +=
      '<div style="background:' + bgRow + ';border-radius:8px;padding:16px;margin-bottom:12px;border-left:4px solid ' + resColor + '">'
      + '<table style="width:100%;border-collapse:collapse"><tr>'
      + '<td style="vertical-align:top;width:' + tdWidth + '">'
      + '<div style="font-size:11px;color:#888;text-transform:uppercase;font-weight:600;margin-bottom:2px">' + r[6] + ' › ' + r[7] + '</div>'
      + '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:6px">' + r[8] + '</div>'
      + '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:' + getImpBg(r[9]) + ';color:' + getImpColor(r[9]) + ';margin-bottom:8px">' + r[9] + '</span>'
      + '<div style="font-size:13px;font-weight:700;color:' + resColor + ';margin-bottom:4px">● ' + r[11] + '</div>'
      + obsHtml
      + '</td>' + fotoTd + '</tr></table></div>';
  });

  var seccionNoOk = '';
  if (noOkRows.length) {
    seccionNoOk = '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">'
      + '<h2 style="margin:0 0 16px;font-size:15px;color:#e4001b">⚠ Puntos a Corregir (' + noOkRows.length + ')</h2>'
      + filasNoOkHtml + '</div>';
  }

  // ---- 7. DESVÍOS REITERADOS ----
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
      + '<h2 style="margin:0 0 8px;font-size:15px;color:#c2410c">🔁 Desvíos Reiterados (' + rep.length + ')</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;color:#92400e">Puntos que no cumplieron en auditorías anteriores y continúan sin corregirse.</p>'
      + '<table style="width:100%;border-collapse:collapse">'
      + '<tr style="background:#c2410c">'
      + '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Control</th>'
      + '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Categoría</th>'
      + '<th style="padding:8px 12px;text-align:center;color:#fff;font-size:12px">Importancia</th>'
      + '<th style="padding:8px 12px;text-align:right;color:#fff;font-size:12px">Reincidencia</th></tr>'
      + filasRep
      + '</table></div>';
  }

  // ---- 8. HISTORIAL ----
  var seccionHistorial = '';
  if (historial) {
    var histHtml = '';
    if (historial.prevAudit) {
      var pa = historial.prevAudit;
      var paLabel = pa.reprobado ? 'REPROBADO' : pa.pct + '% (' + pa.nivel + ')';
      histHtml += '<p style="margin:0 0 8px;font-size:13px;color:#1a1a1a">'
        + '<strong>Auditoría anterior:</strong> ' + formatFecha(pa.fecha) + ' — ' + paLabel + '</p>';
    }
    if (historial.promedioMes !== null) {
      histHtml += '<p style="margin:0;font-size:13px;color:#1a1a1a">'
        + '<strong>Promedio del mes (' + historial.auditsMes + ' auditoría' + (historial.auditsMes !== 1 ? 's' : '') + '):</strong> '
        + historial.promedioMes + '%</p>';
    }
    if (histHtml) {
      seccionHistorial = '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb;background:#f8fafc">'
        + '<h2 style="margin:0 0 12px;font-size:15px;color:#1a1a1a">Historial</h2>'
        + histHtml + '</div>';
    }
  }

  // ---- 9. SISTEMA DE PUNTOS ----
  var seccionSistema =
    '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb;background:#f1f5f9">'
    + '<h2 style="margin:0 0 12px;font-size:14px;color:#475569">Sistema de puntuación</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<tr style="background:#e2e8f0">'
    + '<th style="padding:6px 10px;text-align:left;color:#334155">Importancia</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#16a34a">Cumple</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#d97706">Parcial</th>'
    + '<th style="padding:6px 10px;text-align:center;color:#e4001b">No Cumple</th>'
    + '</tr>'
    + '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">Crítico</td>'
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
    + '<p style="margin:12px 0 0;font-size:11px;color:#64748b;font-style:italic">Los puntos Críticos (Nota de Oro) reprueban la auditoría automáticamente si no se cumplen, independientemente del puntaje total.</p>'
    + '</div>';

  // ---- 10. FOOTER ----
  var pdfBtnHtml = '';
  if (pdfUrl) {
    pdfBtnHtml = '<p style="margin:8px 0 0"><a href="' + pdfUrl + '" style="display:inline-block;padding:8px 18px;background:#e4001b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700">Descargar PDF</a></p>';
  }

  var footerHtml = '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center">'
    + '<p style="margin:0;font-size:12px;color:#999">Sistema de Auditorías · Sushi POP · ' + formatFecha(data.fecha) + '</p>'
    + pdfBtnHtml
    + '</div>';

  // ---- ARMAR HTML COMPLETO ----
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8f8f8;margin:0;padding:0">'
    + '<div style="max-width:700px;margin:0 auto;background:#fff">'
    + headerHtml
    + datosHtml
    + seccionReprobado
    + seccionGraficoYCat
    + seccionNoOk
    + seccionRepetidos
    + seccionHistorial
    + seccionSistema
    + footerHtml
    + '</div></body></html>';
}

// ============================================================
// EMAIL HTML AL LOCAL
// ============================================================
function driveImgUrl(url) {
  if (!url) return '';
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? 'https://drive.google.com/uc?export=view&id=' + m[1] : url;
}

function enviarEmailAuditoria(data, rows, desviosRepetidos, historial, pdfResult) {
  const emails = data.emailsLocal.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return;

  var cumple = rows.filter(function(r){ return (r[11]||'').toLowerCase() === 'cumple'; }).length;
  var total  = rows.filter(function(r){ return r[11]; }).length;
  var pct    = total ? Math.round(cumple / total * 100) : 0;

  var html = buildAuditHtml(data, rows, desviosRepetidos, historial, pdfResult ? pdfResult.url : '');

  var emailOpts = {
    htmlBody: html,
    name:     'Franquicias POP',
    from:     'franquicias@sushi-pop.com.ar',
  };
  if (pdfResult && pdfResult.blob) {
    emailOpts.attachments = [pdfResult.blob];
  }

  GmailApp.sendEmail(emails.join(','), 'Auditoría ' + data.local + ' — ' + formatFecha(data.fecha) + ' (' + (data.puntaje && data.puntaje.reprobado ? 'REPROBADO' : pct + '% cumplimiento') + ')', '', emailOpts);
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
// REENVÍO DE EMAIL POR AUDIT ID
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

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
        acompanante:  first[18] || '',
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

  return jsonResponse({ version: '2026-06-11-v2' });
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
