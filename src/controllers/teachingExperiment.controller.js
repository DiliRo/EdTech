import { matchedData } from 'express-validator'
import {
    createExperiment,
    listExperiments,
    findOwnedExperiment,
    updateExperiment,
    addObservation,
    getStatistics
} from '../services/teachingExperiment.service.js'
import { generateReport, listReports, findOwnedReport, updateReport } from '../services/experimentReport.service.js'
import { CLASSIFICATIONS, EXPERIMENT_DISCLAIMER } from '../config/pedagogy.js'

const meta = { disclaimer: EXPERIMENT_DISCLAIMER }
const validBody = (req) => matchedData(req, { locations: ['body'] })

const withClassification = (experiment) => ({
    ...experiment.toJSON(),
    // Clasificación usada (nombre, fuente y categorías) para mostrarla en la interfaz
    classificationInfo: CLASSIFICATIONS[experiment.classification]
})

export const postExperiment = async (req, res) => {
    const experiment = await createExperiment(req.user.id, validBody(req))
    res.status(201).json({ success: true, message: 'Seguimiento creado', data: { experiment: withClassification(experiment) }, meta })
}

export const getExperiments = async (req, res) => {
    const experiments = await listExperiments(req.user.id, matchedData(req, { locations: ['query'] }))
    res.status(200).json({ success: true, message: 'Seguimientos', data: { experiments } })
}

export const getExperiment = async (req, res) => {
    const experiment = await findOwnedExperiment(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Seguimiento', data: { experiment: withClassification(experiment) }, meta })
}

export const patchExperiment = async (req, res) => {
    const experiment = await updateExperiment(req.user.id, req.params.id, validBody(req))
    res.status(200).json({ success: true, message: 'Seguimiento actualizado', data: { experiment: withClassification(experiment) }, meta })
}

export const postObservation = async (req, res) => {
    const { text, date } = validBody(req)
    const experiment = await addObservation(req.user.id, req.params.id, Number(req.params.index), { text, date })
    res.status(201).json({ success: true, message: 'Observación registrada', data: { experiment: withClassification(experiment) } })
}

export const getExperimentStatistics = async (req, res) => {
    const { report } = await getStatistics(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Estadísticas del seguimiento', data: { statistics: report }, meta })
}

export const postReport = async (req, res) => {
    const report = await generateReport(req.user.id, req.params.id, validBody(req))
    res.status(201).json({ success: true, message: 'Reporte generado y guardado', data: { report }, meta })
}

export const getReports = async (req, res) => {
    const reports = await listReports(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Reportes', data: { reports }, meta })
}

export const getReport = async (req, res) => {
    const report = await findOwnedReport(req.user.id, req.params.id, req.params.reportId)
    res.status(200).json({ success: true, message: 'Reporte', data: { report }, meta })
}

export const patchReport = async (req, res) => {
    const report = await updateReport(req.user.id, req.params.id, req.params.reportId, validBody(req))
    res.status(200).json({ success: true, message: 'Reporte actualizado', data: { report }, meta })
}
