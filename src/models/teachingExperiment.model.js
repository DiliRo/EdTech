import { Schema, model } from 'mongoose'
import {
    CLASSIFICATION_KEYS,
    EXPERIMENT_PERIODS,
    EXPERIMENT_STATUSES,
    DIFFICULTY_LEVELS,
    categoryCodes
} from '../config/pedagogy.js'

export const OBSERVATION_MAX = 1000
export const MAX_OBSERVATIONS_PER_PERIOD = 50

/** Observación del docente sobre el período (texto libre; NUNCA se envía a la IA). */
const observationSchema = new Schema(
    {
        date: { type: Date, required: true },
        text: { type: String, required: true, trim: true, maxLength: OBSERVATION_MAX }
    },
    { _id: true, timestamps: { createdAt: true, updatedAt: false } }
)

/** Condiciones del período que ayudan a interpretar los resultados. */
const conditionsSchema = new Schema(
    {
        // Dificultad percibida de los temas del mes (dato estructurado, se usa en comparaciones)
        difficulty: { type: String, enum: [...DIFFICULTY_LEVELS, null], default: null },
        topicsCovered: { type: String, trim: true, maxLength: 500, default: '' },
        attendanceNotes: { type: String, trim: true, maxLength: 500, default: '' },
        externalFactors: { type: String, trim: true, maxLength: 500, default: '' }
    },
    { _id: false }
)

const periodSchema = new Schema(
    {
        index: { type: Number, required: true, min: 1, max: EXPERIMENT_PERIODS },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        category: { type: String, default: null },
        teachingMethodIds: { type: [{ type: Schema.Types.ObjectId, ref: 'TeachingMethod' }], default: [] },
        assessmentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Assessment' }], default: [] },
        conditions: { type: conditionsSchema, default: () => ({}) },
        observations: {
            type: [observationSchema],
            default: [],
            validate: { validator: (v) => v.length <= MAX_OBSERVATIONS_PER_PERIOD, message: 'Demasiadas observaciones' }
        }
    },
    { _id: false }
)

/**
 * Seguimiento de estrategias pedagógicas de un aula durante cuatro períodos mensuales.
 * La clasificación pedagógica se fija al crear y todas las categorías deben pertenecer a ella.
 */
const teachingExperimentSchema = new Schema(
    {
        teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
        classroomId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, immutable: true },
        title: { type: String, required: true, trim: true, maxLength: 150 },
        classification: { type: String, enum: CLASSIFICATION_KEYS, required: true, immutable: true },
        startDate: { type: Date, required: true, immutable: true },
        endDate: { type: Date, required: true, immutable: true },
        status: { type: String, enum: EXPERIMENT_STATUSES, default: 'active' },
        periods: {
            type: [periodSchema],
            validate: {
                validator: (v) => v.length === EXPERIMENT_PERIODS && v.every((p, i) => p.index === i + 1),
                message: `Debe tener exactamente ${EXPERIMENT_PERIODS} períodos`
            }
        }
    },
    { timestamps: true }
)

// Las categorías deben ser de la clasificación del experimento (no se mezclan clasificaciones).
teachingExperimentSchema.pre('validate', function checkCategories() {
    const allowed = categoryCodes(this.classification)
    this.periods?.forEach((p, i) => {
        if (p.category && !allowed.includes(p.category)) {
            this.invalidate(`periods.${i}.category`, `La categoría no pertenece a la clasificación ${this.classification}`)
        }
    })
    if (this.startDate && this.endDate && this.endDate <= this.startDate) {
        this.invalidate('endDate', 'La fecha de finalización debe ser posterior al inicio')
    }
})

teachingExperimentSchema.index({ teacherId: 1, classroomId: 1, startDate: -1 })

teachingExperimentSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        for (const p of ret.periods ?? []) {
            for (const o of p.observations ?? []) {
                o.id = o._id?.toString()
                delete o._id
            }
        }
        return ret
    }
})

export default model('TeachingExperiment', teachingExperimentSchema)
