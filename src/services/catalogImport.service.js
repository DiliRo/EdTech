import Grade from '../models/grade.model.js'
import Subject from '../models/subject.model.js'
import Topic from '../models/topic.model.js'
import { validateCatalogFile } from '../validators/catalogFile.validator.js'
import { DEFAULT_LEVEL } from '../config/curriculum.js'

export class CatalogImportError extends Error {
    constructor(message, errors = []) {
        super(message)
        this.name = 'CatalogImportError'
        this.errors = errors
    }
}

const topicKey = (subjectCode, gradeNumber, code) => `${subjectCode}|${gradeNumber}|${code}`

/**
 * Importa un catálogo curricular ya leído como objeto.
 *
 * 1. Valida la estructura del archivo.
 * 2. Revisa las referencias contra la BD (materias o grados que no vienen en el archivo)
 *    y que un catálogo de prueba no sobrescriba datos oficiales.
 * 3. Si no hay errores y no es `dryRun`, hace upsert de grados → materias → temas.
 *
 * No escribe nada si encuentra cualquier error.
 *
 * @param {object} data Contenido del JSON
 * @param {{ dryRun?: boolean, now?: Date }} [options]
 */
export const importCatalog = async (data, { dryRun = false, now = new Date() } = {}) => {
    const { valid, errors } = validateCatalogFile(data)
    if (!valid) throw new CatalogImportError('El archivo de catálogo no es válido', errors)

    const { metadata } = data
    const level = metadata.level ?? DEFAULT_LEVEL
    const isSample = metadata.source === 'sample'
    const grades = data.grades ?? []
    const subjects = data.subjects ?? []
    const topics = data.topics ?? []

    const source = {
        type: metadata.source,
        document: metadata.document,
        version: metadata.version,
        url: metadata.url,
        importedAt: now
    }

    // ── Estado actual en la BD ───────────────────────────────
    const referencedGradeNumbers = new Set([
        ...grades.map((g) => g.number),
        ...subjects.flatMap((s) => s.grades),
        ...topics.map((t) => t.grade)
    ])
    const referencedSubjectCodes = new Set([...subjects.map((s) => s.code), ...topics.map((t) => t.subject)])

    const [existingGrades, existingSubjects] = await Promise.all([
        Grade.find({ level, number: { $in: [...referencedGradeNumbers] } }),
        Subject.find({ code: { $in: [...referencedSubjectCodes] } })
    ])

    const existingGradeByNumber = new Map(existingGrades.map((g) => [g.number, g]))
    const existingSubjectByCode = new Map(existingSubjects.map((s) => [s.code, s]))
    const gradeNumberById = new Map(existingGrades.map((g) => [g._id.toString(), g.number]))

    const problems = []

    // Grados disponibles = existentes + los del archivo
    const availableGrades = new Set([...existingGradeByNumber.keys(), ...grades.map((g) => g.number)])

    subjects.forEach((subject, i) => {
        subject.grades.forEach((number, j) => {
            if (!availableGrades.has(number)) {
                problems.push({ path: `subjects[${i}].grades[${j}]`, message: `El grado ${number} no existe` })
            }
        })
        const existing = existingSubjectByCode.get(subject.code)
        if (existing && isSample && !existing.isSample) {
            problems.push({
                path: `subjects[${i}].code`,
                message: `"${subject.code}" es oficial y no puede reemplazarse con datos de prueba`
            })
        }
    })

    // Grados de cada materia: los del archivo reemplazan a los guardados
    const subjectGradeNumbers = new Map()
    for (const existing of existingSubjects) {
        subjectGradeNumbers.set(
            existing.code,
            new Set(existing.grades.map((id) => gradeNumberById.get(id.toString())).filter(Boolean))
        )
    }
    for (const subject of subjects) subjectGradeNumbers.set(subject.code, new Set(subject.grades))

    const subjectIsSample = new Map(existingSubjects.map((s) => [s.code, s.isSample]))
    for (const subject of subjects) subjectIsSample.set(subject.code, isSample)

    topics.forEach((topic, i) => {
        const path = `topics[${i}]`
        if (!availableGrades.has(topic.grade)) {
            problems.push({ path: `${path}.grade`, message: `El grado ${topic.grade} no existe` })
        }
        if (!subjectGradeNumbers.has(topic.subject)) {
            problems.push({ path: `${path}.subject`, message: `La materia "${topic.subject}" no existe` })
        } else if (!subjectGradeNumbers.get(topic.subject).has(topic.grade)) {
            problems.push({ path: `${path}.grade`, message: `La materia "${topic.subject}" no incluye el grado ${topic.grade}` })
        }
        // Un tema oficial no puede colgar de una materia de prueba
        if (!isSample && subjectIsSample.get(topic.subject) === true) {
            problems.push({ path: `${path}.subject`, message: `La materia "${topic.subject}" es de prueba` })
        }
    })

    // Temas oficiales existentes que un catálogo de prueba intentaría pisar
    if (isSample && topics.length && !problems.length) {
        const officialTopics = await Topic.find({ isSample: false, code: { $in: topics.map((t) => t.code) } })
            .populate('subject', 'code')
            .populate('grade', 'number level')
        const officialKeys = new Set(
            officialTopics
                .filter((t) => t.grade?.level === level)
                .map((t) => topicKey(t.subject?.code, t.grade?.number, t.code))
        )
        topics.forEach((topic, i) => {
            if (officialKeys.has(topicKey(topic.subject, topic.grade, topic.code))) {
                problems.push({ path: `topics[${i}].code`, message: 'Tema oficial: no puede reemplazarse con datos de prueba' })
            }
        })
    }

    if (problems.length) throw new CatalogImportError('El catálogo tiene referencias inválidas', problems)

    const summary = {
        dryRun,
        source: metadata.source,
        grades: { received: grades.length },
        subjects: { received: subjects.length },
        topics: { received: topics.length }
    }
    if (dryRun) return summary

    // ── Escritura: grados → materias → temas ─────────────────
    if (grades.length) {
        const result = await Grade.bulkWrite(
            grades.map((g) => ({
                updateOne: {
                    filter: { level, number: g.number },
                    update: { $set: { name: g.name.trim() }, $setOnInsert: { level, number: g.number } },
                    upsert: true
                }
            })),
            { ordered: true }
        )
        summary.grades.created = result.upsertedCount
        summary.grades.updated = result.modifiedCount
    }

    const allGrades = await Grade.find({ level, number: { $in: [...referencedGradeNumbers] } })
    const gradeIdByNumber = new Map(allGrades.map((g) => [g.number, g._id]))

    if (subjects.length) {
        const result = await Subject.bulkWrite(
            subjects.map((s) => ({
                updateOne: {
                    filter: { code: s.code },
                    update: {
                        $set: {
                            name: s.name.trim(),
                            description: (s.description ?? '').trim(),
                            grades: s.grades.map((n) => gradeIdByNumber.get(n)),
                            isSample,
                            source
                        },
                        $setOnInsert: { code: s.code }
                    },
                    upsert: true
                }
            })),
            { ordered: true }
        )
        summary.subjects.created = result.upsertedCount
        summary.subjects.updated = result.modifiedCount
    }

    if (topics.length) {
        const allSubjects = await Subject.find({ code: { $in: [...referencedSubjectCodes] } })
        const subjectIdByCode = new Map(allSubjects.map((s) => [s.code, s._id]))

        const result = await Topic.bulkWrite(
            topics.map((t) => {
                const subject = subjectIdByCode.get(t.subject)
                const grade = gradeIdByNumber.get(t.grade)
                return {
                    updateOne: {
                        filter: { subject, grade, code: t.code },
                        update: {
                            $set: {
                                name: t.name.trim(),
                                description: (t.description ?? '').trim(),
                                competencies: t.competencies ?? [],
                                achievementIndicators: t.achievementIndicators ?? [],
                                curriculumReference: normalizeReference(t.curriculumReference),
                                isSample,
                                source
                            },
                            $setOnInsert: { subject, grade, code: t.code }
                        },
                        upsert: true
                    }
                }
            }),
            { ordered: true }
        )
        summary.topics.created = result.upsertedCount
        summary.topics.updated = result.modifiedCount
    }

    return summary
}

const normalizeReference = (reference = {}) => ({
    ...reference,
    ...(reference.page !== undefined ? { page: String(reference.page) } : {})
})
