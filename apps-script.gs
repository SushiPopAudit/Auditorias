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
        'AuditID','Fecha','Hora','Auditor','Email Auditor','Local','Marca',
        'Categoría','Subcategoría','Control','Importancia',
        'Explicación','Respuesta','Observación','URL Foto'
      ]);
      sheet.getRange(1,1,1,15).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
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
        data.auditor, data.auditorEmail || '',
        data.local, data.marca,
        r.categoria, r.subcategoria, r.control, r.importancia,
        r.explicacion, r.respuesta, r.observacion, fotoURL
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 15).setValues(rows);
      colorearDesvios(sheet, rows);
    }

    // Enviar email al local
    if (data.emailsLocal && data.emailsLocal.trim()) {
      try {
        enviarEmailAuditoria(data, rows);
      } catch(mailErr) { console.error('Email error:', mailErr); }
    }

    return jsonResponse({ success: true, auditId: data.auditId, rows: rows.length });
  } catch(err) {
    console.error('Error doPost:', err);
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// EMAIL HTML AL LOCAL
// ============================================================
function enviarEmailAuditoria(data, rows) {
  const emails = data.emailsLocal.split(',').map(e => e.trim()).filter(Boolean);
  if (!emails.length) return;

  // Estadísticas
  const respuestas = rows.map(r => r[12]); // columna Respuesta
  const cumple     = respuestas.filter(r => r === 'Cumple').length;
  const noCumple   = respuestas.filter(r => (r||'').toLowerCase().includes('no cumple') || r === 'NoCumple').length;
  const parcial    = respuestas.filter(r => (r||'').toLowerCase().includes('parcial')).length;
  const total      = respuestas.filter(r => r).length;
  const pct        = total ? Math.round((cumple / total) * 100) : 0;

  // Desvíos críticos
  const criticos = rows.filter(r => {
    const imp = (r[10]||'').toLowerCase();
    const res = (r[12]||'').toLowerCase();
    return (imp === 'critico' || imp === 'crítico') && (res.includes('no cumple') || res === 'nocumple');
  });

  const filasCriticas = criticos.map(r => `
    <tr style="background:#fff1f2">
      <td style="padding:8px 12px;border-bottom:1px solid #fecdd3;font-weight:600;color:#e4001b">${r[8]}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fecdd3">${r[9]}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fecdd3;color:#e4001b;font-weight:700">No Cumple</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fecdd3;color:#666">${r[13]||'-'}</td>
    </tr>`).join('');

  // Tabla completa de respuestas
  const filasCompletas = rows.map(r => {
    const res = (r[12]||'').toLowerCase();
    const isCritico = ((r[10]||'').toLowerCase() === 'critico' || (r[10]||'').toLowerCase() === 'crítico') && (res.includes('no cumple') || res === 'nocumple');
    const bgColor = isCritico ? '#fff1f2' : res === 'cumple' ? '#f0fdf4' : '#fff';
    const resColor = isCritico ? '#e4001b' : res === 'cumple' ? '#16a34a' : '#1a1a1a';
    return `
      <tr style="background:${bgColor}">
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#666">${r[7]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#666">${r[8]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${r[9]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">
          <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${getImpBg(r[10])};color:${getImpColor(r[10])}">${r[10]}</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:${resColor}">${r[12]||'-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#888">${r[13]||'-'}</td>
      </tr>`;
  }).join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f8f8;margin:0;padding:0">
  <div style="max-width:700px;margin:0 auto;background:#fff">

    <!-- Header -->
    <div style="background:#e4001b;padding:24px 32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Informe de Auditoría</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">${data.local} · ${data.fecha}</p>
    </div>

    <!-- Datos -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;color:#666;font-size:14px;width:120px">Local</td>
          <td style="padding:4px 0;font-weight:600;font-size:14px">${data.local}</td>
          <td style="padding:4px 0;color:#666;font-size:14px;width:120px">Auditor</td>
          <td style="padding:4px 0;font-weight:600;font-size:14px">${data.auditor}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;font-size:14px">Fecha</td>
          <td style="padding:4px 0;font-weight:600;font-size:14px">${data.fecha} ${data.hora}</td>
          <td style="padding:4px 0;color:#666;font-size:14px">Marca</td>
          <td style="padding:4px 0;font-weight:600;font-size:14px">${data.marca}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;font-size:14px">ID</td>
          <td colspan="3" style="padding:4px 0;font-size:12px;color:#999;font-family:monospace">${data.auditId}</td>
        </tr>
      </table>
    </div>

    <!-- Estadísticas -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
      <h2 style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Resultados</h2>
      <table style="width:100%;border-collapse:collapse;text-align:center">
        <tr>
          <td style="padding:16px;background:#f0fdf4;border-radius:8px">
            <div style="font-size:28px;font-weight:800;color:#16a34a">${cumple}</div>
            <div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">Cumple</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:16px;background:#fff1f2;border-radius:8px">
            <div style="font-size:28px;font-weight:800;color:#e4001b">${noCumple}</div>
            <div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">No Cumple</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:16px;background:#fffbeb;border-radius:8px">
            <div style="font-size:28px;font-weight:800;color:#d97706">${parcial}</div>
            <div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">Parcial</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:16px;background:#f1f5f9;border-radius:8px">
            <div style="font-size:28px;font-weight:800;color:#64748b">${pct}%</div>
            <div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:600;margin-top:2px">Cumplimiento</div>
          </td>
        </tr>
      </table>
    </div>

    ${criticos.length ? `
    <!-- Desvíos críticos -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
      <h2 style="margin:0 0 12px;font-size:15px;color:#e4001b">⚠ Desvíos Críticos (${criticos.length})</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#1a1a1a">
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Subcategoría</th>
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Control</th>
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Resultado</th>
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:12px">Observación</th>
        </tr>
        ${filasCriticas}
      </table>
    </div>` : ''}

    <!-- Tabla completa -->
    <div style="padding:24px 32px">
      <h2 style="margin:0 0 12px;font-size:15px;color:#1a1a1a">Detalle completo</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#1a1a1a">
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Categoría</th>
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Subcategoría</th>
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Control</th>
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Importancia</th>
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Resultado</th>
          <th style="padding:6px 10px;text-align:left;color:#fff;font-size:11px">Observación</th>
        </tr>
        ${filasCompletas}
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#999">Sistema de Auditorías · Sushi POP · ${data.fecha}</p>
    </div>

  </div>
</body>
</html>`;

  MailApp.sendEmail({
    to:      emails.join(','),
    subject: `Auditoría ${data.local} — ${data.fecha} (${pct}% cumplimiento)`,
    htmlBody: htmlBody,
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
    const imp = (row[10]||'').toLowerCase();
    const res = (row[12]||'').toLowerCase();
    const isCrit = imp==='critico'||imp==='crítico';
    const isNC   = res.includes('no cumple')||res==='nocumple';
    if (isCrit && isNC) sheet.getRange(firstRow+i,1,1,15).setBackground('#fff1f2');
    else if (isNC)      sheet.getRange(firstRow+i,1,1,15).setBackground('#fff7ed');
    else if (res==='cumple') sheet.getRange(firstRow+i,13,1,1).setBackground('#f0fdf4');
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
