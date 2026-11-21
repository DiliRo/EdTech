import { Schema, model } from 'mongoose'
import { EDUCATION_LEVELS, DEFAULT_LEVEL, GRADE_RANGE } from '../config/curriculum.js'
import { catalogToJSON } from './catalog.shared.js'

/**
 * Grado escolar (p. ej. 3.º primaria). Es estructura, no contenido curricular,
 * por eso no tiene marca de prueba.
 */
const gradeSchema = new Schema(
    {
        number: {
            type: Number,
            required: [true, 'El número de grado es obligatorio'],
            validate: {
                validator(value) {
                    const range = GRADE_RANGE[this.level]
                    return Number.isInteger(value) && !!range && value >= range.min && value <= range.max
                },
                message: 'Número de grado fuera del rango del nivel'
            }
        },
        name: {
            type: String,
            required: [true, 'El nombre del grado es obligatorio'],
            trim: true,
            maxLength: 60
        },
        level: {
            type: String,
            enum: { values: EDUCATION_LEVELS, message: 'Nivel educativo no soportado' },
            default: DEFAULT_LEVEL,
            required: true
        }
    },
    { timestamps: true }
)

// Un grado por número dentro de cada nivel.
gradeSchema.index({ level: 1, number: 1 }, { unique: true })

gradeSchema.set('toJSON', catalogToJSON)

export default model('Grade', gradeSchema)
