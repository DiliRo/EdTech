import { Schema, model } from 'mongoose'
import {
    LEARNING_PREFERENCE_CODES,
    MIN_PREFERENCES_WHEN_SET,
    DURATION_RANGE,
    METHOD_LIMITS as L
} from '../config/methodology.js'

const stepSchema = new Schema(
    {
        title: { type: String, trim: true, maxLength: L.title },
        description: { type: String, required: true, trim: true, maxLength: L.item }
    },
    { _id: false }
)

const activitySchema = new Schema(
    {
        title: { type: String, required: true, trim: true, maxLength: L.title },
        description: { type: String, trim: true, maxLength: L.item }
    },
    { _id: false }
)

const durationSchema = new Schema(
    {
        minMinutes: { type: Number, required: true, min: DURATION_RANGE.min, max: DURATION_RANGE.max },
        maxMinutes: { type: Number, required: true, min: DURATION_RANGE.min, max: DURATION_RANGE.max }
    },
    { _id: false }
)

/** Fuente pedagógica de la metodología (documento, sección, páginas, URL). */
const sourceReferenceSchema = new Schema(
    {
        title: { type: String, trim: true, maxLength: L.referenceText },
        institution: { type: String, trim: true, maxLength: L.referenceText },
        year: { type: Number, min: 1900, max: 2100 },
        section: { type: String, trim: true, maxLength: L.referenceText },
        pages: { type: String, trim: true, maxLength: 30 },
        url: { type: String, trim: true, maxLength: L.referenceText },
        // Aclara qué partes son de la fuente y cuáles son adaptación (p. ej. pasos redactados por edTech)
        notes: { type: String, trim: true, maxLength: L.notes }
    },
    { _id: false }
)

const listOf = (schema, label) => ({
    type: [schema],
    default: [],
    validate: { validator: (v) => v.length <= L.listMax, message: `Máximo ${L.listMax} ${label}` }
})

/**
 * Metodología o estrategia de enseñanza.
 *  - Predeterminada (`isDefault: true`): cargada por el sistema desde material del MINEDUC,
 *    sin `createdBy`, con `defaultKey` estable y fuente obligatoria. Solo lectura para docentes.
 *  - Personalizada: creada por un docente (`createdBy`), visible y editable solo por él.
 */
const teachingMethodSchema = new Schema(
    {
        name: { type: String, required: [true, 'El nombre es obligatorio'], trim: true, maxLength: L.name },
        description: { type: String, required: [true, 'La descripción es obligatoria'], trim: true, maxLength: L.description },
        objectives: listOf({ type: String, trim: true, maxLength: L.item }, 'objetivos'),
        steps: listOf(stepSchema, 'pasos'),
        suggestedActivities: listOf(activitySchema, 'actividades'),
        materials: listOf({ type: String, trim: true, maxLength: L.title }, 'materiales'),
        // null = la fuente no indica duración
        estimatedDuration: { type: durationSchema, default: null },
        // Listas vacías = aplicable a cualquier materia / grado
        compatibleSubjects: {
            type: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
            default: [],
            validate: { validator: (v) => v.length <= L.compatibleMax, message: 'Demasiadas materias' }
        },
        compatibleGrades: {
            type: [{ type: Schema.Types.ObjectId, ref: 'Grade' }],
            default: [],
            validate: { validator: (v) => v.length <= L.compatibleMax, message: 'Demasiados grados' }
        },
        learningPreferences: {
            type: [{ type: String, enum: { values: LEARNING_PREFERENCE_CODES, message: 'Preferencia no soportada' } }],
            default: [],
            validate: {
                validator: (v) => v.length === 0 || (v.length >= MIN_PREFERENCES_WHEN_SET && new Set(v).size === v.length),
                message: 'Indica al menos dos preferencias distintas: ninguna metodología es exclusiva de un estilo de aprendizaje'
            }
        },
        isDefault: { type: Boolean, required: true, default: false, immutable: true },
        defaultKey: { type: String, trim: true, immutable: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, immutable: true },
        sourceReference: { type: sourceReferenceSchema, default: null },
        // Archivado lógico: las guías futuras podrán seguir apuntando a la metodología.
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
)

// Coherencia entre tipo de metodología, autor y fuente.
teachingMethodSchema.pre('validate', function checkOwnership() {
    if (this.isDefault) {
        if (this.createdBy) this.invalidate('createdBy', 'Una metodología predeterminada no tiene autor docente')
        if (!this.defaultKey) this.invalidate('defaultKey', 'Las predeterminadas necesitan una clave estable')
        if (!this.sourceReference?.title || !this.sourceReference?.url) {
            this.invalidate('sourceReference', 'Las predeterminadas deben citar su fuente (título y URL)')
        }
    } else {
        if (!this.createdBy) this.invalidate('createdBy', 'Una metodología personalizada debe tener autor')
        if (this.defaultKey) this.invalidate('defaultKey', 'Solo las predeterminadas tienen clave')
    }
    const d = this.estimatedDuration
    if (d && d.minMinutes > d.maxMinutes) {
        this.invalidate('estimatedDuration', 'La duración mínima no puede ser mayor que la máxima')
    }
})

// Clave única solo entre predeterminadas (las personalizadas no la tienen).
teachingMethodSchema.index(
    { defaultKey: 1 },
    { unique: true, partialFilterExpression: { isDefault: true } }
)
// Listados: predeterminadas activas y metodologías activas de cada docente
teachingMethodSchema.index({ isDefault: 1, isActive: 1, name: 1 })
teachingMethodSchema.index({ createdBy: 1, isActive: 1, name: 1 })
// Filtros
teachingMethodSchema.index({ compatibleSubjects: 1 })
teachingMethodSchema.index({ compatibleGrades: 1 })
teachingMethodSchema.index({ learningPreferences: 1 })
teachingMethodSchema.index({ 'estimatedDuration.minMinutes': 1 })

teachingMethodSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('TeachingMethod', teachingMethodSchema)
