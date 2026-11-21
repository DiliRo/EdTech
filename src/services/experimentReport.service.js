import ExperimentReport from '../models/experimentReport.model.js'
import TeachingMethod from '../models/teachingMethod.model.js'
import { AppError } from '../utils/AppError.js'
import { aiConfig } from '../config/ai.js'
import { getStatistics, findOwnedExperiment } from './teachingExperiment.service.js'
import { runStructuredGeneration, assertDailyQuota } from './ai/runStructured.js'
import {
    buildReportContext,
    buildReportUserPrompt,
    REPORT_SYSTEM_PROMPT,
    REPORT_PROMPT_VERSION
} from './ai/experimentReportPrompt.js'
import { validateReportInterpretation } from '../validators/experimentReportContent.js'

export const REPORT_NOT_FOUND = 'Reporte no encontrado'
const MAX_METHODS_FOR_AI = 30

/** Metodologías que la IA puede recomendar: predeterminadas y propias, activas. */
const availableMethods = async (teacherId) =>
    (await TeachingMethod.find({ $and: [{ isActive: true }, { $or: [{ isDefault: true }, { createdBy: teacherId }] }] })
        .sort({ isDefault: -1, name: 1 }))
        .slice(0, MAX_METHODS_FOR_AI)

/**
 * Genera y GUARDA un reporte comparativo. Las estadísticas siempre las calcula el backend;
 * la IA (opcional) solo recibe esas estadísticas agregadas y propone cómo continuar.
 */
export const generateReport = async (teacherId, experimentId, { useAI = true, teacherNotes = '' } = {}) => {
    const { experiment, report } = await getStatistics(teacherId, experimentId)

    const doc = new ExperimentReport({ experimentId: experiment._id, teacherId, statistics: report, teacherNotes })

    if (!useAI) {
        doc.aiSkippedReason = 'No se solicitó interpretación con IA.'
    } else if (report.overall.resultsCount === 0) {
        // Sin calificaciones no hay nada que interpretar: no se gasta una llamada a la IA
        doc.aiSkippedReason = 'Datos insuficientes: no hay calificaciones registradas en las evaluaciones del seguimiento.'
    } else {
        await assertDailyQuota(teacherId)
        const methods = await availableMethods(teacherId)
        const context = buildReportContext(report, methods)
        const methodById = new Map(methods.map((m) => [m._id.toString(), m]))

        const ai = await runStructuredGeneration({
            teacherId,
            feature: 'experiment-report',
            system: REPORT_SYSTEM_PROMPT,
            buildUser: (feedback) => buildReportUserPrompt(context, { maxInputChars: aiConfig.maxInputChars, retryFeedback: feedback }),
            context,
            validate: (content) =>
                validateReportInterpretation(content, {
                    allowedMethodIds: [...methodById.keys()],
                    insufficientData: !report.dataSufficiency.sufficient
                })
        })

        const { recommendations = [], ...interpretation } = ai.content
        doc.aiInterpretation = {
            summary: interpretation.summary,
            periodInsights: interpretation.periodInsights ?? [],
            limitations: interpretation.limitations,
            nextSteps: interpretation.nextSteps ?? [],
            dataSufficiencyNote: interpretation.dataSufficiencyNote ?? ''
        }
        doc.recommendations = recommendations.map((r) => ({
            teachingMethodId: r.teachingMethodId,
            methodName: methodById.get(r.teachingMethodId).name,
            rationale: r.rationale,
            teacherDecision: 'pending'
        }))
        doc.ai = {
            provider: ai.provider,
            model: ai.model,
            promptVersion: REPORT_PROMPT_VERSION,
            attempts: ai.attempts,
            inputTokens: ai.usage.inputTokens || null,
            outputTokens: ai.usage.outputTokens || null
        }
    }

    await doc.save()
    return doc
}

export const listReports = async (teacherId, experimentId) => {
    await findOwnedExperiment(teacherId, experimentId)
    return ExperimentReport.find({ experimentId, teacherId }).sort({ createdAt: -1 })
}

export const findOwnedReport = async (teacherId, experimentId, reportId) => {
    const report = await ExperimentReport.findOne({ _id: reportId, experimentId, teacherId })
    if (!report) throw new AppError(404, REPORT_NOT_FOUND)
    return report
}

/** El docente registra sus notas y decide si acepta o descarta cada recomendación. */
export const updateReport = async (teacherId, experimentId, reportId, { teacherNotes, recommendations }, { now = new Date() } = {}) => {
    const report = await findOwnedReport(teacherId, experimentId, reportId)

    if (recommendations) {
        const errors = []
        recommendations.forEach((change, i) => {
            const rec = report.recommendations.find((r) => r.teachingMethodId.toString() === change.teachingMethodId)
            if (!rec) return errors.push({ field: `recommendations[${i}].teachingMethodId`, message: 'No es una recomendación de este reporte' })
            rec.teacherDecision = change.teacherDecision
            rec.decidedAt = change.teacherDecision === 'pending' ? null : now
        })
        if (errors.length) throw new AppError(400, 'Errores de validación', errors)
        report.markModified('recommendations')
    }
    if (teacherNotes !== undefined) report.teacherNotes = teacherNotes

    await report.save()
    return report
}
