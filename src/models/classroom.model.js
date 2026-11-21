import { Schema, model } from 'mongoose'
import {
    CLASSROOM_NAME_MAX,
    SECTION_MAX,
    SCHOOL_YEAR_RANGE,
    MAX_SUBJECTS_PER_CLASSROOM
} from '../config/classroom.js'

/**
 * Aula de un docente. Siempre se consulta filtrando por `teacherId`.
 * No se borra: `isActive: false` la archiva.
 */
const classroomSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, 'El nombre del aula es obligatorio'],
            trim: true,
            maxLength: [CLASSROOM_NAME_MAX, `El nombre no puede superar ${CLASSROOM_NAME_MAX} caracteres`]
        },
        gradeId: {
            type: Schema.Types.ObjectId,
            ref: 'Grade',
            required: [true, 'El grado es obligatorio']
        },
        section: {
            type: String,
            required: [true, 'La sección es obligatoria'],
            trim: true,
            uppercase: true,
            maxLength: [SECTION_MAX, `La sección no puede superar ${SECTION_MAX} caracteres`]
        },
        schoolYear: {
            type: Number,
            required: [true, 'El ciclo escolar es obligatorio'],
            min: SCHOOL_YEAR_RANGE.min,
            max: SCHOOL_YEAR_RANGE.max,
            validate: { validator: Number.isInteger, message: 'El ciclo escolar debe ser un año' }
        },
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true,
            immutable: true
        },
        subjectIds: {
            type: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
            default: [],
            validate: {
                validator: (value) => value.length <= MAX_SUBJECTS_PER_CLASSROOM,
                message: `Máximo ${MAX_SUBJECTS_PER_CLASSROOM} materias por aula`
            }
        },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
)

// Listado de aulas del docente: activas/archivadas, por ciclo y nombre.
classroomSchema.index({ teacherId: 1, isActive: 1, schoolYear: -1, name: 1 })

// Datos relacionados para las respuestas (se cargan con populate).
classroomSchema.virtual('grade', { ref: 'Grade', localField: 'gradeId', foreignField: '_id', justOne: true })
classroomSchema.virtual('subjects', { ref: 'Subject', localField: 'subjectIds', foreignField: '_id' })
classroomSchema.virtual('activeStudentCount', {
    ref: 'Student',
    localField: '_id',
    foreignField: 'classroomId',
    count: true,
    match: { isActive: true }
})

classroomSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('Classroom', classroomSchema)
