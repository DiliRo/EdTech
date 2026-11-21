import Assessment from '../models/assessment.model.js'
import AssessmentResult from '../models/assessmentResult.model.js'
import Student from '../models/student.model.js'
import Subject from '../models/subject.model.js'
import Topic from '../models/topic.model.js'
import TeachingMethod from '../models/teachingMethod.model.js'
import { findOwnedClassroom } from './classroom.service.js'
import { AppError } from '../utils/AppError.js'
import { toPercentage, summarize, completionRate } from '../utils/performance.js'

export const ASSESSMENT_NOT_FOUND = 'Evaluación no encontrada'

const validationError = (errors) => new AppError(400, 'Errores de validación', errors)
const sameId = (a, b) => a != null && b != null && a.toString() === b.toString()

/**
 * La materia debe ser del aula (o, si el aula no tiene materias asignadas, impartirse en su grado);
 * el tema debe ser de esa materia y del grado del aula; la metodología debe ser visible para el docente.
 */
const assertReferences = async (teacherId, classroom, { subjectId, topicId, teachingMethodId }) => {
    const errors = []

    const subject = await Subject.findById(subjectId)
    if (!subject) {
        errors.push({ field: 'subjectId', message: 'La materia no existe' })
    } else if (classroom.subjectIds.length ? !classroom.subjectIds.some((id) => sameId(id, subjectId))
        : !subject.grades.some((g) => sameId(g, classroom.gradeId))) {
        errors.push({ field: 'subjectId', message: 'La materia no corresponde al aula' })
    }

    if (topicId) {
        const topic = await Topic.findById(topicId)
        if (!topic) errors.push({ field: 'topicId', message: 'El tema no existe' })
        else if (!sameId(topic.subject, subjectId) || !sameId(topic.grade, classroom.gradeId)) {
            errors.push({ field: 'topicId', message: 'El tema no corresponde a la materia y grado del aula' })
        }
    }

    if (teachingMethodId) {
        const method = await TeachingMethod.findOne({
            $and: [{ _id: teachingMethodId }, { $or: [{ isDefault: true }, { createdBy: teacherId }] }]
        })
        if (!method) errors.push({ field: 'teachingMethodId', message: 'La metodología no existe' })
    }

    if (errors.length) throw validationError(errors)
}

export const createAssessment = async (teacherId, data) => {
    const classroom = await findOwnedClassroom(teacherId, data.classroomId)
    if (!classroom.isActive) throw new AppError(409, 'No se pueden crear evaluaciones en un aula archivada')
    await assertReferences(teacherId, classroom, data)

    const assessment = new Assessment({
        title: data.title,
        classroomId: classroom._id,
        subjectId: data.subjectId,
        topicId: data.topicId ?? null,
        teachingMethodId: data.teachingMethodId ?? null,
        assessmentDate: data.assessmentDate,
        maxScore: data.maxScore,
        assessmentType: data.assessmentType,
        teacherId
    })
    await assessment.save()
    return findOwnedAssessment(teacherId, assessment._id, { populate: true })
}

const withRelations = (query) =>
    query
        .populate('subject', 'code name isSample')
        .populate('topic', 'code name isSample')
        .populate('teachingMethod', 'name isDefault')
        .populate('classroom', 'name section schoolYear')

/** Solo el docente que la creó puede ver u operar una evaluación; los demás reciben 404. */
export const findOwnedAssessment = async (teacherId, id, { populate = false } = {}) => {
    const query = Assessment.findOne({ _id: id, teacherId })
    const assessment = await (populate ? withRelations(query) : query)
    if (!assessment) throw new AppError(404, ASSESSMENT_NOT_FOUND)
    return assessment
}

export const listAssessments = async (teacherId, { classroomId, subjectId, assessmentType, from, to } = {}) => {
    const filter = { teacherId }
    if (classroomId) filter.classroomId = classroomId
    if (subjectId) filter.subjectId = subjectId
    if (assessmentType) filter.assessmentType = assessmentType
    if (from || to) {
        filter.assessmentDate = {}
        if (from) filter.assessmentDate.$gte = from
        if (to) filter.assessmentDate.$lte = to
    }
    return withRelations(Assessment.find(filter)).sort({ assessmentDate: -1, title: 1 })
}

/** Da forma a un resultado para la API: incluye el código visible actual del estudiante. */
export const presentResult = (result, student) => ({
    id: result._id.toString(),
    assessmentId: result.assessmentId.toString(),
    studentId: result.studentId.toString(),
    studentCode: student?.studentCode ?? null,
    studentIsActive: student?.isActive ?? null,
    score: result.score,
    percentage: result.percentage,
    observations: result.observations,
    recordedBy: result.recordedBy.toString(),
    corrections: result.corrections.map((c) => ({
        previousScore: c.previousScore,
        previousPercentage: c.previousPercentage,
        previousObservations: c.previousObservations,
        changedAt: c.changedAt,
        changedBy: c.changedBy.toString(),
        reason: c.reason
    })),
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
})

const studentMap = async (ids) => {
    const students = await Student.find({ _id: { $in: ids } })
    return new Map(students.map((s) => [s._id.toString(), s]))
}

/**
 * Detalle de una evaluación con sus calificaciones y un resumen.
 * `pendingCount` cuenta a los estudiantes activos sin calificación (no son ceros).
 */
export const getAssessmentDetail = async (teacherId, id) => {
    const assessment = await findOwnedAssessment(teacherId, id, { populate: true })
    const results = await AssessmentResult.find({ assessmentId: assessment._id })
    const students = await studentMap(results.map((r) => r.studentId))
    const activeStudents = await Student.find({ classroomId: assessment.classroomId, isActive: true })

    const graded = new Set(results.map((r) => r.studentId.toString()))
    const pendingStudents = activeStudents
        .filter((s) => !graded.has(s._id.toString()))
        .map((s) => ({ studentId: s._id.toString(), studentCode: s.studentCode }))
        .sort((a, b) => a.studentCode.localeCompare(b.studentCode))

    const presented = results
        .map((r) => presentResult(r, students.get(r.studentId.toString())))
        .sort((a, b) => (a.studentCode ?? '').localeCompare(b.studentCode ?? ''))

    return {
        assessment,
        results: presented,
        pendingStudents,
        summary: {
            ...summarize(results.map((r) => r.percentage)),
            pendingCount: pendingStudents.length,
            completionRate: completionRate(
                results.filter((r) => students.get(r.studentId.toString())?.isActive).length,
                activeStudents.length
            )
        }
    }
}

/**
 * Registro masivo de calificaciones.
 *
 * - Primero valida TODO (pertenencia al aula, rango de nota, duplicados en la petición);
 *   si algo falla no se escribe nada.
 * - Si el estudiante ya tiene calificación, es una CORRECCIÓN: se guarda el valor anterior,
 *   la fecha y el docente responsable en `corrections`.
 * - Los estudiantes que no aparecen en la lista quedan sin calificación (no se asume cero).
 */
export const recordResults = async (teacherId, assessmentId, entries, { now = new Date() } = {}) => {
    const assessment = await findOwnedAssessment(teacherId, assessmentId)
    const errors = []

    const seen = new Set()
    entries.forEach((entry, i) => {
        const key = String(entry.studentId)
        if (seen.has(key)) errors.push({ field: `results[${i}].studentId`, message: 'Estudiante repetido en la lista' })
        seen.add(key)
        if (entry.score > assessment.maxScore) {
            errors.push({ field: `results[${i}].score`, message: `La nota no puede superar ${assessment.maxScore}` })
        }
    })

    const ids = [...seen]
    const students = await studentMap(ids)
    const existing = new Map(
        (await AssessmentResult.find({ assessmentId: assessment._id, studentId: { $in: ids } }))
            .map((r) => [r.studentId.toString(), r])
    )

    entries.forEach((entry, i) => {
        const student = students.get(String(entry.studentId))
        // Mismo mensaje si no existe o es de otra aula: no revela estudiantes ajenos.
        if (!student || !sameId(student.classroomId, assessment.classroomId)) {
            errors.push({ field: `results[${i}].studentId`, message: 'El estudiante no pertenece al aula evaluada' })
        } else if (!student.isActive && !existing.has(student._id.toString())) {
            errors.push({ field: `results[${i}].studentId`, message: 'El estudiante está archivado' })
        }
    })

    if (errors.length) throw validationError(errors)

    const summary = { created: 0, updated: 0, unchanged: 0 }
    const saved = []

    for (const entry of entries) {
        const key = String(entry.studentId)
        const percentage = toPercentage(entry.score, assessment.maxScore)
        const current = existing.get(key)

        if (!current) {
            const result = new AssessmentResult({
                assessmentId: assessment._id,
                studentId: entry.studentId,
                score: entry.score,
                percentage,
                observations: entry.observations ?? '',
                recordedBy: teacherId
            })
            try {
                await result.save()
            } catch (err) {
                if (err?.code === 11000) {
                    throw new AppError(409, 'Otra petición registró la calificación al mismo tiempo. Vuelve a intentarlo.')
                }
                throw err
            }
            summary.created += 1
            saved.push(result)
            continue
        }

        const observations = entry.observations ?? current.observations
        if (current.score === entry.score && current.observations === observations) {
            summary.unchanged += 1
            saved.push(current)
            continue
        }

        current.corrections.push({
            previousScore: current.score,
            previousPercentage: current.percentage,
            previousObservations: current.observations,
            changedAt: now,
            changedBy: teacherId,
            reason: entry.correctionReason ?? ''
        })
        current.score = entry.score
        current.percentage = percentage
        current.observations = observations
        await current.save()
        summary.updated += 1
        saved.push(current)
    }

    return {
        summary,
        results: saved.map((r) => presentResult(r, students.get(r.studentId.toString())))
    }
}
