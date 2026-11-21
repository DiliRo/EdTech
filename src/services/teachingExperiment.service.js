import TeachingExperiment from '../models/teachingExperiment.model.js'
import Assessment from '../models/assessment.model.js'
import AssessmentResult from '../models/assessmentResult.model.js'
import Student from '../models/student.model.js'
import Subject from '../models/subject.model.js'
import TeachingMethod from '../models/teachingMethod.model.js'
import { findOwnedClassroom } from './classroom.service.js'
import { AppError } from '../utils/AppError.js'
import { buildComparativeReport } from '../utils/experimentStats.js'
import { DEFAULT_CLASSIFICATION, EXPERIMENT_PERIODS, categoryCodes, findCategory } from '../config/pedagogy.js'

export const EXPERIMENT_NOT_FOUND = 'Seguimiento no encontrado'
const LOCKED_STATUSES = ['completed', 'cancelled']

const validationError = (errors) => new AppError(400, 'Errores de validación', errors)
const sameId = (a, b) => a != null && b != null && a.toString() === b.toString()

// ── Fechas (UTC) ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Suma meses conservando el día cuando existe (31 ene + 1 mes → 28/29 feb). */
export const addMonthsUTC = (date, months) => {
    const y = date.getUTCFullYear()
    const m = date.getUTCMonth() + months
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)))
}

/** Cuatro períodos mensuales consecutivos a partir de la fecha de inicio. */
export const buildPeriodDates = (startDate) => {
    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
    return Array.from({ length: EXPERIMENT_PERIODS }, (_, i) => ({
        index: i + 1,
        startDate: addMonthsUTC(start, i),
        // Último instante del día anterior al inicio del período siguiente
        endDate: new Date(addMonthsUTC(start, i + 1).getTime() - 1)
    }))
}

// ── Validación de lo que se asocia a cada período ─────────────

/**
 * Comprueba categorías, metodologías y evaluaciones de los períodos que se actualizan:
 *  - la categoría pertenece a la clasificación del experimento (no se mezclan clasificaciones),
 *  - las metodologías son predeterminadas o del docente,
 *  - las evaluaciones son del docente, del mismo aula, con fecha dentro del período y
 *    no están ya asociadas a otro período.
 */
const validatePeriodUpdates = async (teacherId, experiment, updates) => {
    const errors = []
    const allowedCategories = categoryCodes(experiment.classification)

    const methodIds = [...new Set(updates.flatMap((u) => u.teachingMethodIds ?? []).map(String))]
    const assessmentIds = [...new Set(updates.flatMap((u) => u.assessmentIds ?? []).map(String))]

    const methods = methodIds.length
        ? await TeachingMethod.find({ $and: [{ _id: { $in: methodIds } }, { $or: [{ isDefault: true }, { createdBy: teacherId }] }] })
        : []
    const assessments = assessmentIds.length
        ? await Assessment.find({ _id: { $in: assessmentIds }, teacherId, classroomId: experiment.classroomId })
        : []
    const methodSet = new Set(methods.map((m) => m._id.toString()))
    const assessmentById = new Map(assessments.map((a) => [a._id.toString(), a]))

    // Evaluaciones que quedarán en cada período tras la actualización
    const finalAssessments = new Map(experiment.periods.map((p) => [p.index, p.assessmentIds.map(String)]))
    for (const u of updates) if (u.assessmentIds) finalAssessments.set(u.index, u.assessmentIds.map(String))
    const owner = new Map()
    for (const [index, ids] of finalAssessments) {
        for (const id of ids) {
            if (owner.has(id) && owner.get(id) !== index) {
                errors.push({ field: `periods[${index}].assessmentIds`, message: `La evaluación ${id} ya está en el período ${owner.get(id)}` })
            }
            owner.set(id, index)
        }
    }

    updates.forEach((u, i) => {
        const f = `periods[${i}]`
        const period = experiment.periods.find((p) => p.index === u.index)
        if (u.category && !allowedCategories.includes(u.category)) {
            errors.push({ field: `${f}.category`, message: `Categoría no válida para la clasificación ${experiment.classification}. Valores: ${allowedCategories.join(', ')}` })
        }
        ;(u.teachingMethodIds ?? []).forEach((id, j) => {
            if (!methodSet.has(String(id))) errors.push({ field: `${f}.teachingMethodIds[${j}]`, message: 'La metodología no existe' })
        })
        ;(u.assessmentIds ?? []).forEach((id, j) => {
            const a = assessmentById.get(String(id))
            // Mismo mensaje si no existe, es de otro docente o de otra aula
            if (!a) return errors.push({ field: `${f}.assessmentIds[${j}]`, message: 'La evaluación no existe en esta aula' })
            if (a.assessmentDate < period.startDate || a.assessmentDate > period.endDate) {
                errors.push({ field: `${f}.assessmentIds[${j}]`, message: `La fecha de la evaluación está fuera del período ${u.index}` })
            }
        })
    })

    if (errors.length) throw validationError(errors)
}

const applyPeriodUpdates = (experiment, updates) => {
    for (const u of updates) {
        const period = experiment.periods.find((p) => p.index === u.index)
        if (u.category !== undefined) period.category = u.category
        if (u.teachingMethodIds !== undefined) period.teachingMethodIds = u.teachingMethodIds
        if (u.assessmentIds !== undefined) period.assessmentIds = u.assessmentIds
        if (u.conditions !== undefined) period.conditions = { ...period.conditions?.toObject?.() ?? period.conditions ?? {}, ...u.conditions }
    }
}

const assertUniqueIndexes = (updates = []) => {
    const indexes = updates.map((u) => u.index)
    if (new Set(indexes).size !== indexes.length) {
        throw validationError([{ field: 'periods', message: 'Hay períodos repetidos' }])
    }
}

// ── Casos de uso ─────────────────────────────────────────────

export const findOwnedExperiment = async (teacherId, id) => {
    const experiment = await TeachingExperiment.findOne({ _id: id, teacherId })
    if (!experiment) throw new AppError(404, EXPERIMENT_NOT_FOUND)
    return experiment
}

export const createExperiment = async (teacherId, data) => {
    const classroom = await findOwnedClassroom(teacherId, data.classroomId)
    if (!classroom.isActive) throw new AppError(409, 'No se puede iniciar un seguimiento en un aula archivada')
    assertUniqueIndexes(data.periods)

    const periods = buildPeriodDates(data.startDate).map((p) => ({ ...p, teachingMethodIds: [], assessmentIds: [] }))
    const experiment = new TeachingExperiment({
        teacherId,
        classroomId: classroom._id,
        title: data.title,
        classification: data.classification ?? DEFAULT_CLASSIFICATION,
        startDate: periods[0].startDate,
        endDate: periods[EXPERIMENT_PERIODS - 1].endDate,
        status: data.status ?? 'active',
        periods
    })

    if (data.periods?.length) {
        await validatePeriodUpdates(teacherId, experiment, data.periods)
        applyPeriodUpdates(experiment, data.periods)
    }
    await experiment.save()
    return experiment
}

export const listExperiments = async (teacherId, { classroomId, status } = {}) => {
    const filter = { teacherId }
    if (classroomId) filter.classroomId = classroomId
    if (status) filter.status = status
    return TeachingExperiment.find(filter).sort({ startDate: -1 })
}

/** Un seguimiento completado o cancelado no se edita (salvo reabrir uno completado). */
export const updateExperiment = async (teacherId, id, changes) => {
    const experiment = await findOwnedExperiment(teacherId, id)
    const reopening = experiment.status === 'completed' && changes.status === 'active'

    if (experiment.status === 'cancelled' && (changes.status || changes.periods || changes.title)) {
        throw new AppError(409, 'El seguimiento está cancelado y no se puede modificar')
    }
    if (LOCKED_STATUSES.includes(experiment.status) && changes.periods && !reopening) {
        throw new AppError(409, 'El seguimiento está completado. Cámbialo a "active" para editar sus períodos.')
    }

    if (changes.periods) {
        assertUniqueIndexes(changes.periods)
        await validatePeriodUpdates(teacherId, experiment, changes.periods)
        applyPeriodUpdates(experiment, changes.periods)
    }
    if (changes.title !== undefined) experiment.title = changes.title
    if (changes.status !== undefined) experiment.status = changes.status

    await experiment.save()
    return experiment
}

/** Agrega una observación docente al período. La fecha debe estar dentro del período. */
export const addObservation = async (teacherId, id, index, { text, date }) => {
    const experiment = await findOwnedExperiment(teacherId, id)
    if (experiment.status === 'cancelled') throw new AppError(409, 'El seguimiento está cancelado')
    const period = experiment.periods.find((p) => p.index === index)
    const when = date ?? new Date()
    if (when < period.startDate || when > period.endDate) {
        throw validationError([{ field: 'date', message: `La fecha debe estar dentro del período ${index}` }])
    }
    period.observations.push({ date: when, text })
    await experiment.save()
    return experiment
}

/**
 * Reúne los datos del experimento y calcula el reporte comparativo.
 * La cohorte son los estudiantes activos del aula más los que tienen calificaciones
 * en las evaluaciones del experimento (aunque hoy estén archivados).
 */
export const getStatistics = async (teacherId, id) => {
    const experiment = await findOwnedExperiment(teacherId, id)

    const assessmentIds = experiment.periods.flatMap((p) => p.assessmentIds)
    const methodIds = experiment.periods.flatMap((p) => p.teachingMethodIds)
    const [assessments, results, students, methods] = await Promise.all([
        assessmentIds.length ? Assessment.find({ _id: { $in: assessmentIds }, teacherId }) : [],
        assessmentIds.length ? AssessmentResult.find({ assessmentId: { $in: assessmentIds } }) : [],
        Student.find({ classroomId: experiment.classroomId }),
        methodIds.length ? TeachingMethod.find({ _id: { $in: methodIds } }) : []
    ])
    const subjects = assessments.length
        ? await Subject.find({ _id: { $in: [...new Set(assessments.map((a) => a.subjectId.toString()))] } })
        : []

    const assessmentById = new Map(assessments.map((a) => [a._id.toString(), a]))
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]))
    const methodById = new Map(methods.map((m) => [m._id.toString(), m]))

    const withResults = new Set(results.map((r) => r.studentId.toString()))
    const cohortSize = students.filter((s) => s.isActive || withResults.has(s._id.toString())).length

    const periods = experiment.periods.map((p) => {
        const category = p.category ? findCategory(experiment.classification, p.category) : null
        return {
            index: p.index,
            startDate: p.startDate,
            endDate: p.endDate,
            category: category ? { code: category.code, label: category.label } : null,
            methods: p.teachingMethodIds
                .map((mid) => methodById.get(mid.toString()))
                .filter(Boolean)
                .map((m) => ({ id: m._id.toString(), name: m.name, isDefault: m.isDefault })),
            difficulty: p.conditions?.difficulty ?? null,
            assessments: p.assessmentIds
                .map((aid) => assessmentById.get(aid.toString()))
                .filter(Boolean)
                .map((a) => ({
                    id: a._id.toString(),
                    title: a.title,
                    assessmentDate: a.assessmentDate,
                    assessmentType: a.assessmentType,
                    subjectId: a.subjectId.toString(),
                    subjectName: subjectName.get(a.subjectId.toString()) ?? null,
                    topicId: a.topicId ? a.topicId.toString() : null,
                    maxScore: a.maxScore
                }))
        }
    })

    return {
        experiment,
        report: buildComparativeReport({
            periods,
            results: results.map((r) => ({ assessmentId: r.assessmentId.toString(), studentId: r.studentId.toString(), percentage: r.percentage })),
            cohortSize,
            classification: experiment.classification
        })
    }
}
