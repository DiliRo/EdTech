import { DECIMALS, TREND_TOLERANCE } from '../config/assessment.js'

/**
 * Cálculos puros de rendimiento (sin base de datos). Reglas comunes:
 *  - Solo se calculan sobre calificaciones REGISTRADAS: una calificación faltante
 *    no es cero, simplemente no participa del cálculo.
 *  - Sin datos, los resultados son `null` (no 0).
 */

export const round = (value, decimals = DECIMALS) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null
    const factor = 10 ** decimals
    return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Porcentaje de logro de una calificación. */
export const toPercentage = (score, maxScore) => {
    if (!(maxScore > 0)) throw new Error('maxScore debe ser mayor que 0')
    return round((score / maxScore) * 100)
}

const valid = (values) => values.filter((v) => typeof v === 'number' && Number.isFinite(v))

export const mean = (values) => {
    const nums = valid(values)
    if (!nums.length) return null
    return round(nums.reduce((sum, v) => sum + v, 0) / nums.length)
}

export const median = (values) => {
    const nums = valid(values).sort((a, b) => a - b)
    if (!nums.length) return null
    const mid = Math.floor(nums.length / 2)
    return round(nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2)
}

/** Resumen estadístico de una lista de porcentajes. */
export const summarize = (percentages) => {
    const nums = valid(percentages)
    return {
        count: nums.length,
        average: mean(nums),
        median: median(nums),
        min: nums.length ? round(Math.min(...nums)) : null,
        max: nums.length ? round(Math.max(...nums)) : null
    }
}

/**
 * Evolución de una serie ordenada por fecha.
 * `change` = último − primero (en puntos porcentuales).
 * `direction`: up / down / stable según TREND_TOLERANCE; `null` si hay menos de dos resultados.
 */
export const trend = (series) => {
    const nums = valid(series)
    if (nums.length < 2) return { change: null, direction: null }
    const change = round(nums[nums.length - 1] - nums[0])
    let direction = 'stable'
    if (change >= TREND_TOLERANCE) direction = 'up'
    else if (change <= -TREND_TOLERANCE) direction = 'down'
    return { change, direction }
}

/** true si el valor existe y está por debajo del umbral. `null` (sin datos) nunca se señala. */
export const isBelowThreshold = (value, threshold) =>
    typeof value === 'number' && Number.isFinite(value) && value < threshold

/** Porcentaje de calificaciones registradas sobre las esperadas. */
export const completionRate = (recorded, expected) => (expected > 0 ? round((recorded / expected) * 100) : null)
