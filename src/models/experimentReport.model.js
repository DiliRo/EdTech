import { Schema, model } from 'mongoose'

export const RECOMMENDATION_DECISIONS = Object.freeze(['pending', 'accepted', 'discarded'])

const recommendationSchema = new Schema(
    {
        teachingMethodId: { type: Schema.Types.ObjectId, ref: 'TeachingMethod', required: true },
        methodName: { type: String, required: true },
        rationale: { type: String, required: true },
        // Las recomendaciones son orientativas: el docente decide
        teacherDecision: { type: String, enum: RECOMMENDATION_DECISIONS, default: 'pending' },
        decidedAt: { type: Date, default: null }
    },
    { _id: false }
)

/**
 * Reporte comparativo guardado. Conserva una copia de las estadísticas calculadas por el
 * backend en ese momento y, si se pidió, la interpretación de la IA (validada).
 */
const experimentReportSchema = new Schema(
    {
        experimentId: { type: Schema.Types.ObjectId, ref: 'TeachingExperiment', required: true, immutable: true },
        teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
        // Copia del reporte comparativo calculado (no se recalcula al consultar)
        statistics: { type: Schema.Types.Mixed, required: true },
        aiInterpretation: {
            type: new Schema(
                {
                    summary: String,
                    periodInsights: [{ _id: false, period: Number, observation: String }],
                    limitations: [String],
                    nextSteps: [String],
                    dataSufficiencyNote: String
                },
                { _id: false }
            ),
            default: null
        },
        recommendations: { type: [recommendationSchema], default: [] },
        // Por qué no hay interpretación de IA (no se pidió, sin datos, etc.)
        aiSkippedReason: { type: String, default: null },
        ai: {
            provider: String,
            model: String,
            promptVersion: String,
            attempts: Number,
            inputTokens: Number,
            outputTokens: Number
        },
        teacherNotes: { type: String, trim: true, maxLength: 2000, default: '' }
    },
    { timestamps: true }
)

experimentReportSchema.index({ experimentId: 1, createdAt: -1 })

experimentReportSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('ExperimentReport', experimentReportSchema)
