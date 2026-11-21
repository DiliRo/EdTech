import { Schema, model } from 'mongoose'
import { OBSERVATIONS_MAX, CORRECTION_REASON_MAX } from '../config/assessment.js'

/** Registro de una corrección: valores anteriores, cuándo y quién la hizo. */
const correctionSchema = new Schema(
    {
        previousScore: { type: Number, required: true },
        previousPercentage: { type: Number, required: true },
        previousObservations: { type: String, default: '' },
        changedAt: { type: Date, required: true },
        changedBy: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
        reason: { type: String, trim: true, maxLength: CORRECTION_REASON_MAX, default: '' }
    },
    { _id: false }
)

/**
 * Calificación de un estudiante en una evaluación.
 *
 * - Se relaciona con el estudiante por `studentId` (su `_id` permanente). Si el
 *   docente cambia el código del estudiante, sus resultados no se pierden.
 * - Una calificación que no existe NO equivale a cero: simplemente no hay documento.
 * - Las correcciones guardan el valor anterior en `corrections` (fecha y responsable).
 */
const assessmentResultSchema = new Schema(
    {
        assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, immutable: true },
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
        score: { type: Number, required: true, min: 0 },
        percentage: { type: Number, required: true, min: 0, max: 100 },
        observations: { type: String, trim: true, maxLength: OBSERVATIONS_MAX, default: '' },
        recordedBy: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
        corrections: { type: [correctionSchema], default: [] }
    },
    { timestamps: true }
)

// Un solo resultado por evaluación y estudiante
assessmentResultSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true })
// Historial del estudiante
assessmentResultSchema.index({ studentId: 1, createdAt: 1 })

assessmentResultSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('AssessmentResult', assessmentResultSchema)
