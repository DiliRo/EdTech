import { Schema, Types, model } from 'mongoose'
import { CODE_REGEX, TEXT_LIMITS } from '../config/curriculum.js'
import { sourceSchema, catalogToJSON } from './catalog.shared.js'

const competencySchema = new Schema(
    {
        code: { type: String, trim: true, maxLength: TEXT_LIMITS.code },
        description: { type: String, required: true, trim: true, maxLength: TEXT_LIMITS.item }
    },
    { _id: false }
)

const indicatorSchema = new Schema(
    {
        code: { type: String, trim: true, maxLength: TEXT_LIMITS.code },
        // Código de la competencia a la que corresponde el indicador, si el documento lo indica
        competencyCode: { type: String, trim: true, maxLength: TEXT_LIMITS.code },
        description: { type: String, required: true, trim: true, maxLength: TEXT_LIMITS.item }
    },
    { _id: false }
)

/** Ubicación exacta del contenido en el documento curricular. */
const curriculumReferenceSchema = new Schema(
    {
        document: { type: String, trim: true, maxLength: TEXT_LIMITS.reference },
        version: { type: String, trim: true, maxLength: TEXT_LIMITS.reference },
        area: { type: String, trim: true, maxLength: TEXT_LIMITS.reference },
        page: { type: String, trim: true, maxLength: 30 },
        url: { type: String, trim: true, maxLength: TEXT_LIMITS.reference }
    },
    { _id: false }
)

/**
 * Tema de una materia en un grado, con sus competencias e indicadores de logro.
 * Cada tema guarda su referencia curricular y si es dato de prueba, para que la
 * futura IA sepa qué contenido es oficial y cuál no.
 */
const topicSchema = new Schema(
    {
        code: {
            type: String,
            required: [true, 'El código del tema es obligatorio'],
            trim: true,
            lowercase: true,
            match: [CODE_REGEX, 'Código inválido'],
            maxLength: TEXT_LIMITS.code
        },
        name: {
            type: String,
            required: [true, 'El nombre del tema es obligatorio'],
            trim: true,
            maxLength: TEXT_LIMITS.name
        },
        description: { type: String, trim: true, maxLength: TEXT_LIMITS.description, default: '' },
        grade: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
        subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
        competencies: { type: [competencySchema], default: [] },
        achievementIndicators: { type: [indicatorSchema], default: [] },
        curriculumReference: { type: curriculumReferenceSchema, default: () => ({}) },
        isSample: { type: Boolean, required: true, default: false },
        source: { type: sourceSchema, required: true }
    },
    { timestamps: true }
)

// Un código de tema es único dentro de cada materia y grado.
topicSchema.index({ subject: 1, grade: 1, code: 1 }, { unique: true })
// Filtros de la API: por grado, o por grado y materia
topicSchema.index({ grade: 1, subject: 1, name: 1 })

topicSchema.set('toJSON', catalogToJSON)

// Solo devuelve datos si la referencia está poblada (es un documento, no un ObjectId).
const pickRef = (value, fields) => {
    if (!value || typeof value !== 'object' || value instanceof Types.ObjectId) return null
    return Object.fromEntries(fields.map((field) => [field, value[field]]))
}

/**
 * Resumen compacto y estable para dar contexto a la IA generadora de guías.
 * Requiere `grade` y `subject` poblados. Incluye siempre `dataStatus` para que
 * el contenido de prueba nunca se presente como oficial.
 */
topicSchema.methods.toAIContext = function toAIContext() {
    return {
        dataStatus: this.isSample ? 'sample' : 'official',
        disclaimer: this.isSample
            ? 'Datos de PRUEBA: no provienen del CNB y no deben presentarse como contenido oficial.'
            : null,
        topic: { id: this._id.toString(), code: this.code, name: this.name, description: this.description },
        grade: pickRef(this.grade, ['number', 'name', 'level']),
        subject: pickRef(this.subject, ['code', 'name']),
        competencies: this.competencies.map(({ code, description }) => ({ code, description })),
        achievementIndicators: this.achievementIndicators.map(({ code, competencyCode, description }) => ({
            code,
            competencyCode,
            description
        })),
        curriculumReference: this.curriculumReference?.toObject?.() ?? this.curriculumReference ?? {}
    }
}

export default model('Topic', topicSchema)
