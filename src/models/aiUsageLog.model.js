import { Schema, model } from 'mongoose'

/**
 * Registro de cada llamada al proveedor de IA (también las fallidas).
 * Sirve para aplicar el límite diario por docente y para auditar el consumo.
 * No guarda el prompt ni la respuesta.
 */
const aiUsageLogSchema = new Schema(
    {
        teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
        feature: { type: String, required: true, default: 'lesson-guide' },
        provider: { type: String, required: true },
        model: { type: String, required: true },
        status: { type: String, enum: ['success', 'invalid_output', 'error'], required: true },
        errorCode: { type: String, default: null },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        latencyMs: { type: Number, default: null }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

aiUsageLogSchema.index({ teacherId: 1, createdAt: -1 })

export default model('AIUsageLog', aiUsageLogSchema)
