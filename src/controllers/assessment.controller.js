import { matchedData } from 'express-validator'
import {
    createAssessment,
    listAssessments,
    getAssessmentDetail,
    recordResults
} from '../services/assessment.service.js'
import { getStudentResults, getStudentProgress, getClassroomPerformance } from '../services/progress.service.js'
import { SUPPORT_NOTE } from '../config/assessment.js'

const validQuery = (req) => matchedData(req, { locations: ['query'] })

export const postAssessment = async (req, res) => {
    const assessment = await createAssessment(req.user.id, matchedData(req, { locations: ['body'] }))
    res.status(201).json({ success: true, message: 'Evaluación creada', data: { assessment } })
}

export const getAssessments = async (req, res) => {
    const assessments = await listAssessments(req.user.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Evaluaciones', data: { assessments } })
}

export const getAssessment = async (req, res) => {
    const detail = await getAssessmentDetail(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Evaluación', data: detail, meta: { note: SUPPORT_NOTE } })
}

export const postResults = async (req, res) => {
    const { results } = matchedData(req, { locations: ['body'] })
    const outcome = await recordResults(req.user.id, req.params.id, results)
    res.status(200).json({ success: true, message: 'Calificaciones registradas', data: outcome })
}

export const getResultsOfStudent = async (req, res) => {
    const data = await getStudentResults(req.user.id, req.params.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Historial de calificaciones', data })
}

export const getProgressOfStudent = async (req, res) => {
    const data = await getStudentProgress(req.user.id, req.params.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Progreso del estudiante', data, meta: { note: SUPPORT_NOTE } })
}

export const getPerformanceOfClassroom = async (req, res) => {
    const data = await getClassroomPerformance(req.user.id, req.params.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Rendimiento del aula', data, meta: { note: SUPPORT_NOTE } })
}
