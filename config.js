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
  appsScriptURL: 'https://script.google.com/macros/s/AKfycbwOo89RDAI3SaL-gbpUEDSo3bxJ6gMJiTp7O6KOCBsbM06c3XAKNsqk1EHsLsTw52hDIA/exec',

  // ID de la carpeta de Google Drive donde se guardarán las fotos
  driveFolderID: '1a6RWhFsza7AhNl_HHSTh59c4xWUXMUZk',
};
