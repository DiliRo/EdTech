import { Schema, model } from 'mongoose'
import { GUIDE_LIMITS } from '../validators/lessonGuideContent.js'

export const GUIDE_STATUSES = Object.freeze(['draft', 'approved'])
export const MAX_GENERATIONS_KEPT = 20

const L = GUIDE_LIMITS

const activitySchema = new Schema(
    { description: { type: String, required: true, trim: true, maxLength: L.activities.length } },
    { _id: false }
)

const phaseSchema = new Schema(
    {
        durationMinutes: { type: Number, required: true, min: 0, max: 600 },
        activities: { type: [activitySchema], default: [] }
    },
    { _id: false }
)

const assessmentItemSchema = new Schema(
    {
        question: { type: String, required: true, trim: true, maxLength: L.items.length },
        // 1 = primer objetivo de la guía: asegura que la evaluación esté alineada con un objetivo
        objectiveIndex: { type: Number, required: true, min: 1 },
        expectedAnswer: { type: String, trim: true, maxLength: L.items.length, default: '' }
    },
    { _id: false }
)

/**
 * Registro de una generación con IA: qué metodología y qué referencias curriculares
 * se usaron (copias en ese momento), proveedor, modelo y consumo.
 */
const generationSchema = new Schema(
    {
        generatedAt: { type: Date, required: true },
        provider: { type: String, required: true },
        model: { type: String, required: true },
        promptVersion: { type: String, required: true },
        attempts: { type: Number, required: true },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        durationMinutes: { type: Number, required: true },
        additionalInstructions: { type: String, default: '' },
        methodology: {
            id: { type: Schema.Types.ObjectId, ref: 'TeachingMethod' },
            name: String,
            isDefault: Boolean,
            sourceReference: { title: String, section: String, pages: String, url: String }
        },
        curriculum: {
            grade: { id: Schema.Types.ObjectId, number: Number, name: String },
            subject: { id: Schema.Types.ObjectId, code: String, name: String },
            topic: { id: Schema.Types.ObjectId, code: String, name: String, isSample: Boolean },
            competencies: [{ _id: false, code: String, description: String }],
            achievementIndicators: [{ _id: false, code: String, competencyCode: String, description: String }],
            curriculumReference: { document: String, version: String, area: String, page: String, url: String },
            dataStatus: { type: String, enum: ['official', 'sample', 'missing'] }
        },
        competenciesUsed: { type: [String], default: [] },
        curriculumGaps: { type: [String], default: [] }
    },
    { _id: false }
)

/**
 * Guía de clase. Es una PROPUESTA editable del docente: puede venir de la IA
 * (`origin: 'ai'`) o escribirse a mano (`origin: 'manual'`).
 */
const lessonGuideSchema = new Schema(
    {
        teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true },
        gradeId: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
        subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
        topicId: { type: Schema.Types.ObjectId, ref: 'Topic', default: null },
        teachingMethodId: { type: Schema.Types.ObjectId, ref: 'TeachingMethod', required: true },
        durationMinutes: { type: Number, required: true, min: 10, max: 600 },

        title: { type: String, required: true, trim: true, maxLength: L.title },
        objectives: { type: [{ type: String, trim: true, maxLength: L.objectives.length }], default: [] },
        opening: { type: phaseSchema, required: true },
        development: { type: phaseSchema, required: true },
        closing: { type: phaseSchema, required: true },
        materials: { type: [{ type: String, trim: true, maxLength: L.materials.length }], default: [] },
        shortAssessment: {
            instructions: { type: String, trim: true, maxLength: L.instructions, default: '' },
            items: { type: [assessmentItemSchema], default: [] }
        },
        teacherRecommendations: { type: [{ type: String, trim: true, maxLength: L.recommendations.length }], default: [] },
        // Información curricular que faltaba al generar (la guía no la inventa)
        curriculumGaps: { type: [{ type: String, trim: true, maxLength: L.gaps.length }], default: [] },

        status: { type: String, enum: GUIDE_STATUSES, default: 'draft' },
        origin: { type: String, enum: ['ai', 'manual'], required: true, immutable: true },
        editedByTeacher: { type: Boolean, default: false },
        generations: {
            type: [generationSchema],
            default: [],
            validate: { validator: (v) => v.length <= MAX_GENERATIONS_KEPT, message: 'Demasiadas generaciones guardadas' }
        }
    },
    { timestamps: true }
)

lessonGuideSchema.index({ teacherId: 1, status: 1, updatedAt: -1 })
lessonGuideSchema.index({ teacherId: 1, gradeId: 1, subjectId: 1 })

lessonGuideSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('LessonGuide', lessonGuideSchema)
