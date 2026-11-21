import {
    EDUCATION_LEVELS,
    DEFAULT_LEVEL,
    GRADE_RANGE,
    CATALOG_SOURCES,
    SAMPLE_PREFIX,
    CODE_REGEX,
    TEXT_LIMITS
} from '../config/curriculum.js'

/**
 * Valida la ESTRUCTURA de un archivo de catálogo curricular, sin tocar la base de datos.
 * Las referencias contra datos ya existentes las revisa el servicio de importación.
 *
 * Formato esperado:
 * {
 *   "metadata": { "source": "cnb" | "sample", "level": "primaria", "document": "...", "version": "...", "url": "..." },
 *   "grades":   [{ "number": 1, "name": "Primer grado" }],
 *   "subjects": [{ "code": "matematicas", "name": "...", "description": "...", "grades": [1, 2] }],
 *   "topics":   [{ "code": "...", "name": "...", "description": "...", "grade": 1, "subject": "matematicas",
 *                 "competencies": [{ "code": "1", "description": "..." }],
 *                 "achievementIndicators": [{ "code": "1.1", "competencyCode": "1", "description": "..." }],
 *                 "curriculumReference": { "document": "...", "area": "...", "page": "...", "url": "..." } }]
 * }
 *
 * Reglas de procedencia:
 *  - `source: "cnb"`: exige documento y versión del CNB y una referencia (página o URL) en cada tema.
 *    Prohíbe la marca de prueba, para que nadie disfrace ejemplos como datos oficiales.
 *  - `source: "sample"`: todo nombre, competencia e indicador debe empezar con "[PRUEBA]".
 *
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export const validateCatalogFile = (data) => {
    const errors = []
    const add = (path, message) => errors.push({ path, message })

    if (!isPlainObject(data)) {
        add('', 'El archivo debe contener un objeto JSON')
        return { valid: false, errors }
    }

    const allowedRoot = ['metadata', 'grades', 'subjects', 'topics']
    for (const key of Object.keys(data)) {
        if (!allowedRoot.includes(key)) add(key, 'Campo no permitido')
    }

    // ── metadata ─────────────────────────────────────────────
    const metadata = data.metadata
    if (!isPlainObject(metadata)) {
        add('metadata', 'metadata es obligatorio')
        return { valid: false, errors }
    }
    const source = metadata.source
    if (!CATALOG_SOURCES.includes(source)) {
        add('metadata.source', `Debe ser uno de: ${CATALOG_SOURCES.join(', ')}`)
    }
    const level = metadata.level ?? DEFAULT_LEVEL
    if (!EDUCATION_LEVELS.includes(level)) {
        add('metadata.level', `Nivel no soportado. Valores: ${EDUCATION_LEVELS.join(', ')}`)
    }
    if (source === 'cnb') {
        requireText(metadata.document, 'metadata.document', 'Indica el documento oficial del CNB', add)
        requireText(metadata.version, 'metadata.version', 'Indica la versión o año del documento', add)
    }
    if (metadata.url !== undefined && !isHttpUrl(metadata.url)) add('metadata.url', 'URL inválida')

    const isSample = source === 'sample'
    const isOfficial = source === 'cnb'

    // Verifica la marca de prueba según el origen.
    const checkMarking = (value, path) => {
        if (typeof value !== 'string') return
        const marked = value.trim().startsWith(SAMPLE_PREFIX)
        if (isSample && !marked) add(path, `En un catálogo de prueba debe empezar con "${SAMPLE_PREFIX}"`)
        if (isOfficial && value.includes(SAMPLE_PREFIX)) {
            add(path, `Un catálogo oficial no puede contener "${SAMPLE_PREFIX}"`)
        }
    }

    const grades = optionalArray(data.grades, 'grades', add)
    const subjects = optionalArray(data.subjects, 'subjects', add)
    const topics = optionalArray(data.topics, 'topics', add)

    if (!grades.length && !subjects.length && !topics.length) {
        add('', 'El archivo no contiene grados, materias ni temas')
    }

    const range = GRADE_RANGE[level]
    const isGradeNumber = (value) => Number.isInteger(value) && !!range && value >= range.min && value <= range.max

    // ── grades ───────────────────────────────────────────────
    const gradeNumbers = new Set()
    grades.forEach((grade, i) => {
        const path = `grades[${i}]`
        if (!isPlainObject(grade)) return add(path, 'Debe ser un objeto')
        onlyKeys(grade, ['number', 'name'], path, add)
        if (!isGradeNumber(grade.number)) {
            add(`${path}.number`, `Debe ser un entero entre ${range?.min} y ${range?.max}`)
        } else if (gradeNumbers.has(grade.number)) {
            add(`${path}.number`, `Grado ${grade.number} repetido`)
        } else {
            gradeNumbers.add(grade.number)
        }
        requireText(grade.name, `${path}.name`, 'El nombre es obligatorio', add, 60)
    })

    // ── subjects ─────────────────────────────────────────────
    const subjectGrades = new Map()
    subjects.forEach((subject, i) => {
        const path = `subjects[${i}]`
        if (!isPlainObject(subject)) return add(path, 'Debe ser un objeto')
        onlyKeys(subject, ['code', 'name', 'description', 'grades'], path, add)

        const codeOk = checkCode(subject.code, `${path}.code`, add)
        if (codeOk && subjectGrades.has(subject.code)) add(`${path}.code`, `Materia "${subject.code}" repetida`)

        requireText(subject.name, `${path}.name`, 'El nombre es obligatorio', add, TEXT_LIMITS.name)
        checkMarking(subject.name, `${path}.name`)
        optionalText(subject.description, `${path}.description`, add, TEXT_LIMITS.description)
        checkMarking(subject.description, `${path}.description`)

        if (!Array.isArray(subject.grades) || !subject.grades.length) {
            add(`${path}.grades`, 'Debe ser una lista con al menos un número de grado')
        } else {
            subject.grades.forEach((number, j) => {
                if (!isGradeNumber(number)) add(`${path}.grades[${j}]`, 'Número de grado inválido')
            })
            if (new Set(subject.grades).size !== subject.grades.length) {
                add(`${path}.grades`, 'Hay grados repetidos')
            }
        }
        if (codeOk) subjectGrades.set(subject.code, new Set(Array.isArray(subject.grades) ? subject.grades : []))
    })

    // ── topics ───────────────────────────────────────────────
    const topicKeys = new Set()
    topics.forEach((topic, i) => {
        const path = `topics[${i}]`
        if (!isPlainObject(topic)) return add(path, 'Debe ser un objeto')
        onlyKeys(
            topic,
            ['code', 'name', 'description', 'grade', 'subject', 'competencies', 'achievementIndicators', 'curriculumReference'],
            path,
            add
        )

        const codeOk = checkCode(topic.code, `${path}.code`, add)
        requireText(topic.name, `${path}.name`, 'El nombre es obligatorio', add, TEXT_LIMITS.name)
        checkMarking(topic.name, `${path}.name`)
        optionalText(topic.description, `${path}.description`, add, TEXT_LIMITS.description)
        checkMarking(topic.description, `${path}.description`)

        const gradeOk = isGradeNumber(topic.grade)
        if (!gradeOk) add(`${path}.grade`, 'Número de grado inválido')
        const subjectOk = checkCode(topic.subject, `${path}.subject`, add)

        // Si la materia viene en el mismo archivo, el grado del tema debe estar entre sus grados.
        if (gradeOk && subjectOk && subjectGrades.has(topic.subject) && !subjectGrades.get(topic.subject).has(topic.grade)) {
            add(`${path}.grade`, `La materia "${topic.subject}" no incluye el grado ${topic.grade}`)
        }

        if (codeOk && gradeOk && subjectOk) {
            const key = `${topic.subject}|${topic.grade}|${topic.code}`
            if (topicKeys.has(key)) add(`${path}.code`, 'Tema repetido para la misma materia y grado')
            topicKeys.add(key)
        }

        validateItems(topic.competencies, `${path}.competencies`, ['code', 'description'], add, checkMarking)
        validateItems(
            topic.achievementIndicators,
            `${path}.achievementIndicators`,
            ['code', 'competencyCode', 'description'],
            add,
            checkMarking
        )

        validateReference(topic.curriculumReference, `${path}.curriculumReference`, isOfficial, add)
    })

    return { valid: errors.length === 0, errors }
}

// ── auxiliares ───────────────────────────────────────────────

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const isHttpUrl = (value) => {
    if (typeof value !== 'string') return false
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

const optionalArray = (value, path, add) => {
    if (value === undefined) return []
    if (!Array.isArray(value)) {
        add(path, 'Debe ser una lista')
        return []
    }
    return value
}

const onlyKeys = (obj, allowed, path, add) => {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) add(`${path}.${key}`, 'Campo no permitido')
    }
}

const requireText = (value, path, message, add, max = TEXT_LIMITS.reference) => {
    if (typeof value !== 'string' || !value.trim()) return add(path, message)
    if (value.length > max) add(path, `No puede superar ${max} caracteres`)
}

const optionalText = (value, path, add, max) => {
    if (value === undefined) return
    if (typeof value !== 'string') return add(path, 'Debe ser texto')
    if (value.length > max) add(path, `No puede superar ${max} caracteres`)
}

const checkCode = (value, path, add) => {
    if (typeof value !== 'string' || !CODE_REGEX.test(value) || value.length > TEXT_LIMITS.code) {
        add(path, 'Código inválido: usa minúsculas, números y guiones (p. ej. "matematicas")')
        return false
    }
    return true
}

const validateItems = (items, path, allowed, add, checkMarking) => {
    if (items === undefined) return
    if (!Array.isArray(items)) return add(path, 'Debe ser una lista')
    items.forEach((item, i) => {
        const itemPath = `${path}[${i}]`
        if (!isPlainObject(item)) return add(itemPath, 'Debe ser un objeto')
        onlyKeys(item, allowed, itemPath, add)
        requireText(item.description, `${itemPath}.description`, 'La descripción es obligatoria', add, TEXT_LIMITS.item)
        checkMarking(item.description, `${itemPath}.description`)
        for (const field of ['code', 'competencyCode']) {
            if (item[field] !== undefined) optionalText(item[field], `${itemPath}.${field}`, add, TEXT_LIMITS.code)
        }
    })
}

const validateReference = (reference, path, isOfficial, add) => {
    if (reference === undefined) {
        if (isOfficial) add(path, 'Los temas oficiales deben indicar su referencia en el CNB')
        return
    }
    if (!isPlainObject(reference)) return add(path, 'Debe ser un objeto')
    onlyKeys(reference, ['document', 'version', 'area', 'page', 'url'], path, add)
    for (const field of ['document', 'version', 'area']) {
        optionalText(reference[field], `${path}.${field}`, add, TEXT_LIMITS.reference)
    }
    if (reference.page !== undefined && typeof reference.page !== 'string' && !Number.isInteger(reference.page)) {
        add(`${path}.page`, 'Debe ser texto o número')
    }
    if (reference.url !== undefined && !isHttpUrl(reference.url)) add(`${path}.url`, 'URL inválida')
    if (isOfficial && reference.page === undefined && reference.url === undefined) {
        add(path, 'Indica la página o la URL del CNB donde está el contenido')
    }
}
