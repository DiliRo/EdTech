/**
 * Reglas de evaluaciones y seguimiento. Fuente única para modelos, validadores y cálculos.
 */

/** Tipos de evaluación según su función (diagnóstica, formativa, sumativa). */
export const ASSESSMENT_TYPES = Object.freeze(['diagnostica', 'formativa', 'sumativa'])

export const MAX_SCORE_LIMIT = 1000
export const TITLE_MAX = 150
export const OBSERVATIONS_MAX = 500
export const CORRECTION_REASON_MAX = 300
export const MAX_RESULTS_PER_REQUEST = 200

/** Decimales con que se guardan porcentajes y promedios. */
export const DECIMALS = 2

/**
 * Diferencia mínima (en puntos porcentuales) entre el primer y el último resultado
 * para considerar que la tendencia sube o baja; por debajo se considera estable.
 */
export const TREND_TOLERANCE = 5

/**
 * Umbral por defecto (porcentaje de logro) para señalar resultados que pueden requerir
 * acompañamiento. Se configura con PERFORMANCE_THRESHOLD y se puede cambiar por consulta.
 * Es un indicador de apoyo al docente, NO un diagnóstico.
 */
export const DEFAULT_THRESHOLD = 60

export const SUPPORT_NOTE =
    'Indicadores de apoyo para el docente. Un resultado bajo no es un diagnóstico del estudiante; ' +
    'las evaluaciones sin calificación registrada no cuentan como cero.'
