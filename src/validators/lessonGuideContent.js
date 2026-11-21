/**
 * Validación del CONTENIDO de una guía (pura, sin base de datos).
 * Se usa con la respuesta de la IA y con las guías creadas o editadas por el docente.
 */

export const GUIDE_LIMITS = Object.freeze({
    title: 150,
    objectives: { min: 1, max: 6, length: 300 },
    activities: { min: 1, max: 8, length: 600 },
    materials: { max: 20, length: 150 },
    instructions: 300,
    items: { min: 1, max: 10, length: 300 },
    recommendations: { max: 8, length: 400 },
    gaps: { max: 10, length: 300 },
    competencies: { max: 20, length: 40 }
})

export const CONTENT_FIELDS = [
    'title', 'objectives', 'opening', 'development', 'closing', 'materials',
    'shortAssessment', 'teacherRecommendations', 'curriculumGaps'
]
const AI_ONLY_FIELDS = ['competenciesUsed']
const PHASES = ['opening', 'development', 'closing']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Extrae el objeto JSON de la respuesta de la IA, tolerando bloques ```json``` o texto
 * alrededor. Devuelve `null` si no hay JSON válido.
 */
export const extractJson = (text) => {
    if (typeof text !== 'string') return null
    const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
        const parsed = JSON.parse(unfenced.slice(start, end + 1))
        return isObject(parsed) ? parsed : null
    } catch {
        return null
    }
}

/**
 * @param {object} content
 * @param {object} options
 * @param {'ai'|'manual'} options.source
 * @param {number} [options.durationMinutes]  si se indica, la suma de fases no puede superarlo
 * @param {string[]} [options.allowedCompetencyCodes]  códigos de competencias que existen en el tema
 * @param {boolean} [options.partial]  edición parcial: solo se validan los campos presentes
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export const validateGuideContent = (content, { source = 'manual', durationMinutes, allowedCompetencyCodes = [], partial = false } = {}) => {
    const errors = []
    const add = (field, message) => errors.push({ field, message })

    if (!isObject(content)) return { valid: false, errors: [{ field: 'body', message: 'La guía debe ser un objeto' }] }

    const allowed = source === 'ai' ? [...CONTENT_FIELDS, ...AI_ONLY_FIELDS] : CONTENT_FIELDS
    for (const key of Object.keys(content)) {
        if (!allowed.includes(key)) add(key, 'Campo no permitido')
    }

    const present = (field) => content[field] !== undefined
    const required = (field) => {
        if (partial) return present(field)
        if (!present(field)) add(field, 'Campo obligatorio')
        return present(field)
    }

    const text = (value, field, max, { optional = false } = {}) => {
        if (optional && (value === undefined || value === '')) return
        if (typeof value !== 'string' || !value.trim()) return add(field, 'Debe ser texto no vacío')
        if (value.length > max) add(field, `Máximo ${max} caracteres`)
    }

    const textList = (value, field, { min = 0, max, length }) => {
        if (!Array.isArray(value)) return add(field, 'Debe ser una lista')
        if (value.length < min) add(field, `Debe tener al menos ${min} elemento(s)`)
        if (value.length > max) add(field, `Máximo ${max} elementos`)
        value.slice(0, max).forEach((item, i) => text(item, `${field}[${i}]`, length))
    }

    if (required('title')) text(content.title, 'title', GUIDE_LIMITS.title)
    if (required('objectives')) textList(content.objectives, 'objectives', GUIDE_LIMITS.objectives)

    let totalMinutes = 0
    for (const phase of PHASES) {
        if (!required(phase)) continue
        const value = content[phase]
        if (!isObject(value)) {
            add(phase, 'Debe ser un objeto con durationMinutes y activities')
            continue
        }
        for (const key of Object.keys(value)) {
            if (!['durationMinutes', 'activities'].includes(key)) add(`${phase}.${key}`, 'Campo no permitido')
        }
        if (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 0 || value.durationMinutes > 600) {
            add(`${phase}.durationMinutes`, 'Debe ser un entero entre 0 y 600')
        } else {
            totalMinutes += value.durationMinutes
        }
        if (!Array.isArray(value.activities)) {
            add(`${phase}.activities`, 'Debe ser una lista')
        } else {
            const { min, max, length } = GUIDE_LIMITS.activities
            if (value.activities.length < min || value.activities.length > max) {
                add(`${phase}.activities`, `Debe tener entre ${min} y ${max} actividades`)
            }
            value.activities.slice(0, max).forEach((a, i) => {
                const f = `${phase}.activities[${i}]`
                if (!isObject(a)) return add(f, 'Debe ser un objeto con description')
                for (const key of Object.keys(a)) if (key !== 'description') add(`${f}.${key}`, 'Campo no permitido')
                text(a.description, `${f}.description`, length)
            })
        }
    }
    const allPhases = PHASES.every((p) => isObject(content[p]))
    if (durationMinutes && allPhases && totalMinutes > durationMinutes) {
        add('durationMinutes', `Inicio, desarrollo y cierre suman ${totalMinutes} minutos y superan los ${durationMinutes} de la clase`)
    }

    if (required('materials')) textList(content.materials, 'materials', GUIDE_LIMITS.materials)

    if (required('shortAssessment')) {
        const sa = content.shortAssessment
        if (!isObject(sa)) {
            add('shortAssessment', 'Debe ser un objeto con instructions e items')
        } else {
            for (const key of Object.keys(sa)) {
                if (!['instructions', 'items'].includes(key)) add(`shortAssessment.${key}`, 'Campo no permitido')
            }
            text(sa.instructions, 'shortAssessment.instructions', GUIDE_LIMITS.instructions)
            // Los objetivos de referencia: los del mismo cuerpo (o, en edición parcial, se validan en el servicio)
            const objectivesCount = Array.isArray(content.objectives) ? content.objectives.length : null
            const { min, max, length } = GUIDE_LIMITS.items
            if (!Array.isArray(sa.items) || sa.items.length < min || sa.items.length > max) {
                add('shortAssessment.items', `Debe tener entre ${min} y ${max} preguntas`)
            } else {
                sa.items.forEach((item, i) => {
                    const f = `shortAssessment.items[${i}]`
                    if (!isObject(item)) return add(f, 'Debe ser un objeto')
                    for (const key of Object.keys(item)) {
                        if (!['question', 'objectiveIndex', 'expectedAnswer'].includes(key)) add(`${f}.${key}`, 'Campo no permitido')
                    }
                    text(item.question, `${f}.question`, length)
                    text(item.expectedAnswer, `${f}.expectedAnswer`, length, { optional: true })
                    // Alineación: cada pregunta evalúa un objetivo existente de la guía
                    const valid = Number.isInteger(item.objectiveIndex) && item.objectiveIndex >= 1 &&
                        (objectivesCount === null || item.objectiveIndex <= objectivesCount)
                    if (!valid) add(`${f}.objectiveIndex`, 'Debe indicar un objetivo existente de la guía (1, 2, …)')
                })
            }
        }
    }

    if (present('teacherRecommendations') || (!partial && source === 'ai')) {
        if (required('teacherRecommendations')) textList(content.teacherRecommendations, 'teacherRecommendations', GUIDE_LIMITS.recommendations)
    }
    if (present('curriculumGaps')) textList(content.curriculumGaps, 'curriculumGaps', GUIDE_LIMITS.gaps)

    if (source === 'ai') {
        // La IA no puede citar competencias que no estén en el tema: sería inventarlas.
        const used = content.competenciesUsed ?? []
        if (!Array.isArray(used) || used.length > GUIDE_LIMITS.competencies.max) {
            add('competenciesUsed', 'Debe ser una lista de códigos')
        } else {
            used.forEach((code, i) => {
                if (typeof code !== 'string' || !allowedCompetencyCodes.includes(code)) {
                    add(`competenciesUsed[${i}]`, 'Competencia que no existe en el tema (no se permiten competencias inventadas)')
                }
            })
        }
    }

    return { valid: errors.length === 0, errors }
}
