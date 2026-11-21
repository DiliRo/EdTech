import Assessment from '../models/assessment.model.js'
import AssessmentResult from '../models/assessmentResult.model.js'
import Student from '../models/student.model.js'
import Subject from '../models/subject.model.js'
import { findOwnedStudent } from './student.service.js'
import { findOwnedClassroom } from './classroom.service.js'
import { presentResult } from './assessment.service.js'
import { summarize, mean, trend, isBelowThreshold, completionRate } from '../utils/performance.js'
import { env } from '../config/env.js'

const byDate = (a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate) || a.title.localeCompare(b.title)

const dateFilter = ({ from, to }) => {
    if (!from && !to) return {}
    const range = {}
    if (from) range.$gte = from
    if (to) range.$lte = to
    return { assessmentDate: range }
}

const describeAssessment = (a) => ({
    id: a._id.toString(),
    title: a.title,
    assessmentDate: a.assessmentDate,
    assessmentType: a.assessmentType,
    subjectId: a.subjectId.toString(),
    maxScore: a.maxScore
})

/**
 * Evaluaciones del aula del estudiante y sus calificaciones, en orden cronológico.
 * Todo se busca por `studentId`: el código visible solo se usa para mostrar.
 */
const loadStudentData = async (teacherId, studentId, filters) => {
    const { student } = await findOwnedStudent(teacherId, studentId)
    const assessments = await Assessment.find({
        classroomId: student.classroomId,
        teacherId,
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...dateFilter(filters)
    })
    const results = await AssessmentResult.find({
        studentId: student._id,
        assessmentId: { $in: assessments.map((a) => a._id) }
    })
    const resultByAssessment = new Map(results.map((r) => [r.assessmentId.toString(), r]))
    return { student, assessments: [...assessments].sort(byDate), resultByAssessment }
}

const presentStudent = (student) => ({
    id: student._id.toString(),
    studentCode: student.studentCode,
    classroomId: student.classroomId.toString(),
    isActive: student.isActive
})

/** Historial de calificaciones de un estudiante (incluye correcciones). */
export const getStudentResults = async (teacherId, studentId, filters = {}) => {
    const { student, assessments, resultByAssessment } = await loadStudentData(teacherId, studentId, filters)

    const history = assessments
        .filter((a) => resultByAssessment.has(a._id.toString()))
        .map((a) => ({
            assessment: describeAssessment(a),
            result: presentResult(resultByAssessment.get(a._id.toString()), student)
        }))

    return {
        student: presentStudent(student),
        results: history,
        assessmentsWithoutResult: assessments.length - history.length
    }
}

/**
 * Progreso del estudiante: promedio de porcentaje de logro, evolución en el tiempo y
 * resumen por materia. Las evaluaciones sin calificación no cuentan como cero.
 */
export const getStudentProgress = async (teacherId, studentId, { threshold = env.performanceThreshold, ...filters } = {}) => {
    const { student, assessments, resultByAssessment } = await loadStudentData(teacherId, studentId, filters)

    const evolution = assessments
        .filter((a) => resultByAssessment.has(a._id.toString()))
        .map((a) => {
            const r = resultByAssessment.get(a._id.toString())
            const { id, ...info } = describeAssessment(a)
            return { assessmentId: id, ...info, score: r.score, percentage: r.percentage }
        })
    const percentages = evolution.map((e) => e.percentage)
    const stats = summarize(percentages)

    const subjectIds = [...new Set(assessments.map((a) => a.subjectId.toString()))]
    const subjects = new Map((await Subject.find({ _id: { $in: subjectIds } })).map((s) => [s._id.toString(), s]))
    const bySubject = subjectIds.map((id) => {
        const items = evolution.filter((e) => e.subjectId === id)
        const values = items.map((e) => e.percentage)
        return {
            subjectId: id,
            subjectName: subjects.get(id)?.name ?? null,
            resultsCount: values.length,
            assessmentsWithoutResult: assessments.filter((a) => a.subjectId.toString() === id).length - values.length,
            averagePercentage: mean(values),
            trend: trend(values)
        }
    })

    return {
        student: presentStudent(student),
        threshold,
        summary: {
            resultsCount: stats.count,
            assessmentsWithoutResult: assessments.length - stats.count,
            averagePercentage: stats.average,
            medianPercentage: stats.median,
            minPercentage: stats.min,
            maxPercentage: stats.max,
            latestPercentage: percentages.length ? percentages[percentages.length - 1] : null,
            belowThreshold: isBelowThreshold(stats.average, threshold)
        },
        trend: trend(percentages),
        evolution,
        bySubject
    }
}

/**
 * Estadísticas del aula. Considera a los estudiantes activos y a los archivados que
 * tengan calificaciones. Señala (no diagnostica) a quienes tienen un promedio bajo el umbral.
 */
export const getClassroomPerformance = async (teacherId, classroomId, { threshold = env.performanceThreshold, ...filters } = {}) => {
    const classroom = await findOwnedClassroom(teacherId, classroomId)

    const assessments = [...await Assessment.find({
        classroomId: classroom._id,
        teacherId,
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...dateFilter(filters)
    })].sort(byDate)
    const results = await AssessmentResult.find({ assessmentId: { $in: assessments.map((a) => a._id) } })
    const allStudents = await Student.find({ classroomId: classroom._id })

    const withResults = new Set(results.map((r) => r.studentId.toString()))
    const students = allStudents
        .filter((s) => s.isActive || withResults.has(s._id.toString()))
        .sort((a, b) => a.studentCode.localeCompare(b.studentCode))
    const activeIds = new Set(allStudents.filter((s) => s.isActive).map((s) => s._id.toString()))

    const perAssessment = assessments.map((a) => {
        const own = results.filter((r) => r.assessmentId.toString() === a._id.toString())
        const graded = new Set(own.map((r) => r.studentId.toString()))
        const stats = summarize(own.map((r) => r.percentage))
        return {
            ...describeAssessment(a),
            resultsCount: stats.count,
            pendingCount: [...activeIds].filter((id) => !graded.has(id)).length,
            averagePercentage: stats.average,
            medianPercentage: stats.median,
            minPercentage: stats.min,
            maxPercentage: stats.max,
            belowThresholdCount: own.filter((r) => isBelowThreshold(r.percentage, threshold)).length
        }
    })

    const assessmentOrder = new Map(assessments.map((a, i) => [a._id.toString(), i]))
    const perStudent = students.map((s) => {
        const own = results
            .filter((r) => r.studentId.toString() === s._id.toString())
            .sort((x, y) => assessmentOrder.get(x.assessmentId.toString()) - assessmentOrder.get(y.assessmentId.toString()))
        const values = own.map((r) => r.percentage)
        const average = mean(values)
        return {
            studentId: s._id.toString(),
            studentCode: s.studentCode,
            isActive: s.isActive,
            resultsCount: values.length,
            assessmentsWithoutResult: assessments.length - values.length,
            averagePercentage: average,
            trend: trend(values),
            belowThreshold: isBelowThreshold(average, threshold)
        }
    })

    const overall = summarize(results.map((r) => r.percentage))
    const activeResults = results.filter((r) => activeIds.has(r.studentId.toString())).length

    return {
        classroom: { id: classroom._id.toString(), name: classroom.name, isActive: classroom.isActive },
        threshold,
        summary: {
            assessmentsCount: assessments.length,
            studentsCount: activeIds.size,
            resultsCount: overall.count,
            completionRate: completionRate(activeResults, assessments.length * activeIds.size),
            averagePercentage: overall.average,
            medianPercentage: overall.median,
            minPercentage: overall.min,
            maxPercentage: overall.max,
            // Promedio de los promedios de cada estudiante (todos pesan igual)
            averageOfStudentAverages: mean(perStudent.map((p) => p.averagePercentage))
        },
        belowThreshold: {
            threshold,
            resultsCount: results.filter((r) => isBelowThreshold(r.percentage, threshold)).length,
            students: perStudent
                .filter((p) => p.belowThreshold)
                .map(({ studentId, studentCode, averagePercentage, resultsCount }) => ({ studentId, studentCode, averagePercentage, resultsCount }))
        },
        perAssessment,
        perStudent
    }
}
