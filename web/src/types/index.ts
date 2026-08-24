// ============================================================
// TIPOS BASE — Ausitoria App
// Refleja el esquema real del prototipo analizado por CoWork
// ============================================================

export type Importancia = 'Crítico' | 'crítico' | 'Alta' | 'Media' | 'Baja';
export type TipoRespuesta = 'radio' | 'numero' | 'fecha' | 'text' | 'headcount';
export type Nivel = 'Excelente' | 'Satisfactorio' | 'Requiere mejora' | 'Deficiente' | 'Reprobado';
export type RolUsuario = 'Admin' | 'Auditor';

/** Local de la red de franquicias */
export interface Local {
  nombre: string;
  isCausa: boolean;   // true = marca Causa, false = SushiPop
  emails: string;     // emails de notificación separados por coma
}

/** Pregunta del checklist (basada en CSV cols [0..10]) */
export interface Pregunta {
  id: string;                    // generado: q_{index}
  marca: string;                 // 'Multimarca' | 'Causa'
  categoria: string;
  subcategoria: string;
  control: string;
  importancia: string;
  explicacion: string;
  pregunta: string;
  imagen: string;
  tipoRespuesta: string;         // raw del CSV, parsear con parseTipoRespuesta()
  explicacionDetallada: string;
  validacion: string;            // reglas: 'numero|C:0:100' | 'fecha|NA' | 'headcount'
}

/** Categoría de preguntas agrupadas */
export interface Categoria {
  name: string;
  questions: Pregunta[];
}

export interface FotoItem {
  dataURL: string;   // data:image/jpeg;base64,...
  nombre:  string;
}

/** Respuesta del auditor a una pregunta */
export interface RespuestaItem {
  preguntaId:  string;
  control:     string;
  respuesta:   string;
  observacion?: string;
  rawValor?:   string;
  fechaRaw?:   string;
  headcount?:  Record<string, string>;
  fotos?:      FotoItem[];
}

/** Sesión de usuario autenticado */
export interface Sesion {
  email: string;
  nombre: string;
  rol: RolUsuario;
  locales: string;               // locales asignados (separados por coma)
  token: string;
  savedAt: number;               // timestamp ms
  primerLogin?: boolean;
}

/** Auditoría lista para enviar al Apps Script */
export interface Auditoria {
  id:           string;     // auditId generado
  fecha:        string;
  auditor:      string;
  auditorEmail: string;
  localNombre:  string;
  marca:        string;
  tipo:         string;
  acompanante?: string;
  respuestas:   RespuestaItem[];
}

/** Resultado de scoring */
export interface Puntaje {
  obtenido:         number;
  posible:          number;
  pct:              number;
  reprobado:        boolean;
  nivel:            string;
  nivelClass:       string;
  nivelEmoji:       string;
  criticosTotal:    number;
  criticosFallidos: number;
}

/** Fila tal como se escribe en el Sheet Resultados */
export interface FilaResultado {
  AuditID: string;
  Fecha: string;
  Hora: string;
  Auditor: string;
  Local: string;
  Marca: string;
  Categoria: string;
  Subcategoria: string;
  Control: string;
  Importancia: string;
  Explicacion: string;
  Respuesta: string;
  Observacion: string;
  URLFoto: string;
  EmailAuditor: string;
  PuntajePct: number;
  Nivel: string;
  Reprobado: string;
  Acompanante: string;
  Tipo: string;
  RawValor: string;
}
