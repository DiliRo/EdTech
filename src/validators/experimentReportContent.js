/**
 * Validación de la interpretación de la IA para el reporte de seguimiento.
 * Además del formato, aplica las reglas pedagógicas: sin afirmaciones causales, sin estilos
 * de aprendizaje fijos, recomendaciones solo del catálogo y aviso de datos insuficientes.
 */

export const REPORT_LIMITS = Object.freeze({
    summary: 1500,
    insight: 600,
    limitation: 400,
    rationale: 600,
    nextStep: 300,
    sufficiencyNote: 600,
    maxInsights: 4,
    maxLimitations: 8,
    maxRecommendations: 4,
    maxNextSteps: 6
})

/**
 * Expresiones que contradicen las reglas: causalidad, superioridad o estilos fijos.
 * Es una red de seguridad (el prompt ya lo prohíbe); si aparecen, se pide otra respuesta.
 */
export const FORBIDDEN_CLAIMS = Object.freeze([
    { pattern: /\b(demuestra|demostr[óo]|prueba|comprueba)\s+que\b/i, reason: 'afirmación causal' },
    { pattern: /\b(caus[óo]|provoc[óo]|gener[óo])\s+(la|el|una|un)?\s*(mejora|aumento|incremento|descenso|disminuci[óo]n)/i, reason: 'afirmación causal' },
    { pattern: /\bes\s+(claramente\s+|definitivamente\s+)?(superior|mejor que|la mejor|el mejor)\b/i, reason: 'afirmación de superioridad' },
    { pattern: /\bestilo\s+(de\s+aprendizaje\s+)?(predominante|dominante|fijo)\b/i, reason: 'estilo de aprendizaje fijo o predominante' },
    { pattern: /\b(los estudiantes|el grupo|la clase)\s+(son|es)\s+(visuales|auditivos|kinest[ée]sicos|activos|reflexivos|te[óo]ricos|pragm[áa]ticos)\b/i, reason: 'etiqueta al grupo con un estilo' }
])

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * @param {object} content
 * @param {{ allowedMethodIds: string[], insufficientData: boolean }} options
 */
export const validateReportInterpretation = (content, { allowedMethodIds = [], insufficientData = false } = {}) => {
    const errors = []
    const add = (field, message) => errors.push({ field, message })
    const L = REPORT_LIMITS

    if (!isObject(content)) return { valid: false, errors: [{ field: 'respuesta', message: 'Debe ser un objeto' }] }

    const allowed = ['summary', 'periodInsights', 'limitations', 'recommendations', 'nextSteps', 'dataSufficiencyNote']
    for (const key of Object.keys(content)) if (!allowed.includes(key)) add(key, 'Campo no permitido')

    const text = (value, field, max, { optional = false } = {}) => {
        if (optional && (value === undefined || value === '')) return
        if (typeof value !== 'string' || !value.trim()) return add(field, 'Debe ser texto no vacío')
        if (value.length > max) add(field, `Máximo ${max} caracteres`)
        // Un solo error por campo, con la primera regla que se incumple
        const hit = FORBIDDEN_CLAIMS.find(({ pattern }) => pattern.test(value))
        if (hit) add(field, `Contiene una ${hit.reason}; las estadísticas son descriptivas`)
    }
    const list = (value, field, { min = 0, max }, each) => {
        if (!Array.isArray(value)) return add(field, 'Debe ser una lista')
        if (value.length < min) add(field, `Debe tener al menos ${min} elemento(s)`)
        if (value.length > max) add(field, `Máximo ${max} elementos`)
        value.slice(0, max).forEach((item, i) => each(item, `${field}[${i}]`))
    }

    text(content.summary, 'summary', L.summary)

    list(content.periodInsights ?? [], 'periodInsights', { max: L.maxInsights }, (item, f) => {
        if (!isObject(item)) return add(f, 'Debe ser un objeto')
        for (const key of Object.keys(item)) if (!['period', 'observation'].includes(key)) add(`${f}.${key}`, 'Campo no permitido')
        if (!Number.isInteger(item.period) || item.period < 1 || item.period > 4) add(`${f}.period`, 'Debe ser 1, 2, 3 o 4')
        text(item.observation, `${f}.observation`, L.insight)
    })

    // Siempre debe reconocer al menos una limitación del análisis
    list(content.limitations, 'limitations', { min: 1, max: L.maxLimitations }, (item, f) => text(item, f, L.limitation))

    const seen = new Set()
    list(content.recommendations ?? [], 'recommendations', { max: L.maxRecommendations }, (item, f) => {
        if (!isObject(item)) return add(f, 'Debe ser un objeto')
        for (const key of Object.keys(item)) if (!['teachingMethodId', 'rationale'].includes(key)) add(`${f}.${key}`, 'Campo no permitido')
        if (!allowedMethodIds.includes(item.teachingMethodId)) {
            add(`${f}.teachingMethodId`, 'La metodología recomendada no está en el catálogo disponible')
        } else if (seen.has(item.teachingMethodId)) {
            add(`${f}.teachingMethodId`, 'Metodología repetida')
        }
        seen.add(item.teachingMethodId)
        text(item.rationale, `${f}.rationale`, L.rationale)
    })

    list(content.nextSteps ?? [], 'nextSteps', { max: L.maxNextSteps }, (item, f) => text(item, f, L.nextStep))

    // Con datos insuficientes la IA debe decirlo explícitamente
    text(content.dataSufficiencyNote, 'dataSufficiencyNote', L.sufficiencyNote, { optional: !insufficientData })

    return { valid: errors.length === 0, errors }
}
