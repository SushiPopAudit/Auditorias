// ============================================================
// CONFIGURACIÓN — completar antes de publicar
// ============================================================
const CONFIG = {
  // Google Sign-In Client ID (ver README para obtenerlo)
  // Si no está configurado, el login es libre (sin Google)
  googleClientId: 'REEMPLAZAR_CON_GOOGLE_CLIENT_ID',

  // URL del CSV de preguntas (hoja MM!) — ya está publicada
  questionsURL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?output=csv',

  // URL del CSV de locales (hoja Locales!)
  // Para obtenerla: Archivo → Compartir → Publicar en la web → elegí hoja "Locales" → CSV → Publicar → copiar URL
  localesURL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?gid=233622265&single=true&output=csv',

  // URL del Google Apps Script desplegado (completar después de desplegar)
  appsScriptURL: 'https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec',

  // ID de la carpeta de Google Drive donde se guardarán las fotos
  driveFolderID: '1SJe5kNlEXBpRlFPylSTbS4XedI0ZIC7P',
};
