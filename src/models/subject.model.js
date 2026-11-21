import { Schema, model } from 'mongoose'
import { CODE_REGEX, TEXT_LIMITS } from '../config/curriculum.js'
import { sourceSchema, catalogToJSON } from './catalog.shared.js'

/** Materia (área curricular) y los grados en que se imparte. */
const subjectSchema = new Schema(
    {
        code: {
            type: String,
            required: [true, 'El código de la materia es obligatorio'],
            trim: true,
            lowercase: true,
            match: [CODE_REGEX, 'Código inválido'],
            maxLength: TEXT_LIMITS.code
        },
        name: {
            type: String,
            required: [true, 'El nombre de la materia es obligatorio'],
            trim: true,
            maxLength: TEXT_LIMITS.name
        },
        description: {
            type: String,
            trim: true,
            maxLength: TEXT_LIMITS.description,
            default: ''
        },
        grades: {
            type: [{ type: Schema.Types.ObjectId, ref: 'Grade' }],
            validate: {
                validator: (value) => Array.isArray(value) && value.length > 0,
                message: 'La materia debe tener al menos un grado'
            }
        },
        // true = dato de prueba, NO oficial del CNB
        isSample: { type: Boolean, required: true, default: false },
        source: { type: sourceSchema, required: true }
    },
    { timestamps: true }
)

subjectSchema.index({ code: 1 }, { unique: true })
// Filtrar materias por grado
subjectSchema.index({ grades: 1, name: 1 })

subjectSchema.set('toJSON', catalogToJSON)

export default model('Subject', subjectSchema)
