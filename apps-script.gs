// ============================================================
// GOOGLE APPS SCRIPT — pegar esto en script.google.com
// Vinculado al spreadsheet de resultados
// ============================================================

const SPREADSHEET_ID  = '1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI';
const SHEET_NAME      = 'Resultados';
const DRIVE_FOLDER_ID = '1a6RWhFsza7AhNl_HHSTh59c4xWUXMUZk';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet   = ss.getSheetByName(SHEET_NAME);

    // Crear hoja si no existe
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'AuditID', 'Fecha', 'Hora', 'Auditor', 'Local', 'Marca',
        'Categoría', 'Subcategoría', 'Control', 'Importancia',
        'Explicación', 'Respuesta', 'Observación', 'URL Foto'
      ]);
      sheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Obtener o crear carpeta de fotos para esta auditoría
    let auditFolderUrl = '';
    let auditFolder = null;
    if (DRIVE_FOLDER_ID !== 'REEMPLAZAR_CON_ID_CARPETA_DRIVE') {
      const parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      auditFolder = parentFolder.createFolder(data.auditId);
      auditFolderUrl = auditFolder.getUrl();
    }

    // Escribir cada respuesta como una fila
    const rows = data.respuestas.map(r => {
      let fotoURL = '';

      // Subir foto si existe
      if (r.fotoBase64 && auditFolder) {
        try {
          const decoded = Utilities.base64Decode(r.fotoBase64);
          const blob    = Utilities.newBlob(decoded, 'image/jpeg', r.fotoNombre || 'foto.jpg');
          const file    = auditFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fotoURL = file.getUrl();
        } catch (imgErr) {
          console.error('Error subiendo foto:', imgErr);
        }
      }

      return [
        data.auditId,
        data.fecha,
        data.hora,
        data.auditor,
        data.local,
        data.marca,
        r.categoria,
        r.subcategoria,
        r.control,
        r.importancia,
        r.explicacion,
        r.respuesta,
        r.observacion,
        fotoURL,
      ];
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 14).setValues(rows);
    }

    // Colorear filas críticas con No Cumple
    colorearDesvios(sheet, data.auditId, rows);

    return jsonResponse({ success: true, auditId: data.auditId, rows: rows.length });

  } catch (err) {
    console.error('Error en doPost:', err);
    return jsonResponse({ success: false, error: err.message });
  }
}

function colorearDesvios(sheet, auditId, rows) {
  const lastRow  = sheet.getLastRow();
  const firstRow = lastRow - rows.length + 1;
  const dataRange = sheet.getRange(firstRow, 1, rows.length, 14);
  const values   = dataRange.getValues();

  values.forEach((row, i) => {
    const importancia = (row[9] || '').toLowerCase();
    const respuesta   = (row[11] || '').toLowerCase();
    const isCritico   = importancia === 'critico' || importancia === 'crítico';
    const isNoCumple  = respuesta.includes('no cumple') || respuesta === 'nocumple';

    if (isCritico && isNoCumple) {
      sheet.getRange(firstRow + i, 1, 1, 14).setBackground('#fef2f2');
    } else if (isNoCumple) {
      sheet.getRange(firstRow + i, 1, 1, 14).setBackground('#fff7ed');
    } else if (respuesta === 'cumple') {
      sheet.getRange(firstRow + i, 12, 1, 1).setBackground('#f0fdf4');
    }
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Para probar manualmente desde el editor
function test() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        auditId: 'AUD_TEST_001',
        fecha: '2025-01-01',
        hora: '10:00',
        auditor: 'Test Auditor',
        local: 'Local Test',
        marca: 'Multimarca',
        respuestas: [
          {
            categoria: 'BPM',
            subcategoria: 'Limpieza',
            control: 'Mesada limpia',
            importancia: 'Crítico',
            explicacion: 'Mesada sin suciedad',
            respuesta: 'Cumple',
            observacion: '',
            fotoBase64: '',
            fotoNombre: '',
          }
        ]
      })
    }
  };
  const result = doPost(mockEvent);
  console.log(result.getContent());
}
