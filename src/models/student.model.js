import { Schema, model } from 'mongoose'
import { STUDENT_CODE_REGEX, STUDENT_CODE_MAX } from '../config/classroom.js'

/**
 * Estudiante: REGISTRO ACADÉMICO, no usuario del sistema.
 *
 * - No tiene nombre, apellido, correo, contraseña ni sesión.
 * - `studentCode` es la etiqueta visible que asigna el docente y se puede editar.
 * - `_id` es permanente: evaluaciones y estadísticas futuras se relacionan con él,
 *   nunca con el código. Por eso cambiar el código no afecta el historial.
 * - No se borra: `isActive: false` lo archiva y conserva sus resultados.
 */
const studentSchema = new Schema(
    {
        studentCode: {
            type: String,
            required: [true, 'El código del estudiante es obligatorio'],
            trim: true,
            uppercase: true,
            maxLength: STUDENT_CODE_MAX,
            match: [STUDENT_CODE_REGEX, 'Código inválido']
        },
        classroomId: {
            type: Schema.Types.ObjectId,
            ref: 'Classroom',
            required: true,
            immutable: true
        },
        isActive: { type: Boolean, default: true }
    },
    // strict: 'throw' hace que el modelo rechace cualquier dato personal que alguien intente guardar.
    { timestamps: true, strict: 'throw' }
)

// Código único dentro de cada aula (incluye archivados). Puede repetirse en otras aulas.
studentSchema.index({ classroomId: 1, studentCode: 1 }, { unique: true })
// Listado por aula y estado
studentSchema.index({ classroomId: 1, isActive: 1, studentCode: 1 })

studentSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

export default model('Student', studentSchema)
