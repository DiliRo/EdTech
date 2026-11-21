import { Schema, model } from 'mongoose'
import { ASSESSMENT_TYPES, MAX_SCORE_LIMIT, TITLE_MAX } from '../config/assessment.js'

/**
 * Evaluación aplicada por un docente a un aula. Las calificaciones se guardan en
 * AssessmentResult, relacionadas por `studentId` (nunca por el código visible).
 */
const assessmentSchema = new Schema(
    {
        title: { type: String, required: [true, 'El título es obligatorio'], trim: true, maxLength: TITLE_MAX },
        classroomId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, immutable: true },
        subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
        topicId: { type: Schema.Types.ObjectId, ref: 'Topic', default: null },
        teachingMethodId: { type: Schema.Types.ObjectId, ref: 'TeachingMethod', default: null },
        assessmentDate: { type: Date, required: [true, 'La fecha es obligatoria'] },
        // No se puede cambiar después de crear: los porcentajes guardados dependen de él.
        maxScore: {
            type: Number,
            required: [true, 'La nota máxima es obligatoria'],
            min: [0.01, 'La nota máxima debe ser mayor que 0'],
            max: MAX_SCORE_LIMIT,
            immutable: true
        },
        assessmentType: {
            type: String,
            required: true,
            enum: { values: ASSESSMENT_TYPES, message: 'Tipo de evaluación no soportado' }
        },
        teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, immutable: true }
    },
    { timestamps: true }
)

// Listado del docente por aula y fecha; estadísticas por aula
assessmentSchema.index({ teacherId: 1, classroomId: 1, assessmentDate: -1 })
assessmentSchema.index({ classroomId: 1, subjectId: 1, assessmentDate: 1 })

assessmentSchema.virtual('classroom', { ref: 'Classroom', localField: 'classroomId', foreignField: '_id', justOne: true })
assessmentSchema.virtual('subject', { ref: 'Subject', localField: 'subjectId', foreignField: '_id', justOne: true })
assessmentSchema.virtual('topic', { ref: 'Topic', localField: 'topicId', foreignField: '_id', justOne: true })
assessmentSchema.virtual('teachingMethod', { ref: 'TeachingMethod', localField: 'teachingMethodId', foreignField: '_id', justOne: true })

assessmentSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('Assessment', assessmentSchema)
