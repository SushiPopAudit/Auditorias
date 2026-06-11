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
        'Puntaje %','Nivel','Reprobado'
      ]);
      sheet.getRange(1,1,1,18).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
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
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 18).setValues(rows);
      colorearDesvios(sheet, rows);
    }

    // Enviar email al local
    let emailStatus = 'no configurado';
    if (data.emailsLocal && data.emailsLocal.trim()) {
      try {
        enviarEmailAuditoria(data, rows);
        emailStatus = 'enviado a ' + data.emailsLocal;
      } catch(mailErr) {
        console.error('Email error:', mailErr);
        emailStatus = 'ERROR: ' + mailErr.message;
      }
    }

    return jsonResponse({ success: true, auditId: data.auditId, rows: rows.length, email: emailStatus });
  } catch(err) {
    console.error('Error doPost:', err);
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// EMAIL HTML AL LOCAL
// ============================================================
function driveImgUrl(url) {
  if (!url) return '';
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? 'https://drive.google.com/uc?export=view&id=' + m[1] : url;
}

function enviarEmailAuditoria(data, rows) {
  const emails = data.emailsLocal.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return;

  // Estadísticas
  const cumple   = rows.filter(function(r){ return (r[11]||'').toLowerCase() === 'cumple'; }).length;
  const noCumple = rows.filter(function(r){ var v=(r[11]||'').toLowerCase(); return v.includes('no cumple')||v==='nocumple'; }).length;
  const parcial  = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('parcial'); }).length;
  const noAplica = rows.filter(function(r){ return (r[11]||'').toLowerCase().includes('aplica'); }).length;
  const total    = rows.filter(function(r){ return r[11]; }).length;
  const pct      = total ? Math.round(cumple / total * 100) : 0;

  // Gráfico torta
  const chartData = JSON.stringify({
    type:'pie',
    data:{labels:['Cumple','No Cumple','Parcial'],datasets:[{data:[cumple,noCumple,parcial],backgroundColor:['#16a34a','#e4001b','#d97706'],borderWidth:2,borderColor:'#fff'}]},
    options:{plugins:{legend:{position:'right',labels:{font:{size:13},padding:16}}}}
  });
  const chartUrl = 'https://quickchart.io/chart?c=' + encodeURIComponent(chartData) + '&width=420&height=220&backgroundColor=white';

  // Puntaje header
  var puntajeHtml = '';
  if (data.puntaje) {
    var pLabel = data.puntaje.reprobado ? 'REPROBADO' : data.puntaje.pct + '%';
    var pSub   = data.puntaje.nivel + (!data.puntaje.reprobado ? ' · ' + data.puntaje.obtenido + '/' + data.puntaje.posible + ' pts' : '');
    puntajeHtml = '<div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:12px 24px">'
      + '<div style="font-size:40px;font-weight:900;color:#fff">' + pLabel + '</div>'
      + '<div style="font-size:14px;color:rgba(255,255,255,0.9);font-weight:600;margin-top:2px">' + pSub + '</div>'
      + '</div>';
  }

  // Puntos a corregir (No Cumple + Parcial)
  const noOkRows = rows.filter(function(r){
    var v = (r[11]||'').toLowerCase();
    return v.includes('no cumple') || v === 'nocumple' || v.includes('parcial');
  });

  var filasNoOkHtml = '';
  noOkRows.forEach(function(r) {
    var res        = (r[11]||'').toLowerCase();
    var esCritico  = (r[9]||'').toLowerCase().replace('í','i') === 'critico';
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

  // Cumplimiento por categoría
  const maxPts     = { 'critico':4,'crítico':4,'alta':3,'media':2,'baja':1 };
  const parcialPts = { 'critico':2,'crítico':2,'alta':1,'media':1,'baja':0 };
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

  // Construir HTML completo
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8f8f8;margin:0;padding:0">'
    + '<div style="max-width:700px;margin:0 auto;background:#fff">'

    + '<div style="background:#e4001b;padding:24px 32px;text-align:center">'
    + '<h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Informe de Auditoría</h1>'
    + '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">' + data.local + ' · ' + data.fecha + '</p>'
    + puntajeHtml + '</div>'

    + '<div style="padding:20px 32px;border-bottom:1px solid #e5e7eb">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><td style="padding:3px 0;color:#666;font-size:13px;width:110px">Local</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.local + '</td>'
    + '<td style="padding:3px 0;color:#666;font-size:13px;width:110px">Auditor</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.auditor + '</td></tr>'
    + '<tr><td style="padding:3px 0;color:#666;font-size:13px">Fecha</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.fecha + ' ' + data.hora + '</td>'
    + '<td style="padding:3px 0;color:#666;font-size:13px">Marca</td><td style="padding:3px 0;font-weight:600;font-size:13px">' + data.marca + '</td></tr>'
    + '</table></div>'

    + '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">'
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
    + '</tr></table></div>'

    + seccionNoOk

    + '<div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">'
    + '<h2 style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Cumplimiento por Categoría</h2>'
    + '<table style="width:100%;border-collapse:collapse">' + filasCatHtml + '</table></div>'

    + '<div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center">'
    + '<p style="margin:0;font-size:12px;color:#999">Sistema de Auditorías · Sushi POP · ' + data.fecha + '</p>'
    + '</div></div></body></html>';

  GmailApp.sendEmail(emails.join(','), 'Auditoría ' + data.local + ' — ' + data.fecha + ' (' + pct + '% cumplimiento)', '', {
    htmlBody: html,
    name:     'Franquicias POP',
    from:     'franquicias@sushi-pop.com.ar',
  });
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
