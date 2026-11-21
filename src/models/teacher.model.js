import { Schema, model } from 'mongoose'
import { LANGUAGE_CODES, DEFAULT_LANGUAGE } from '../config/languages.js'

/**
 * Docente: ÚNICO tipo de usuario con cuenta en edTech.
 * Los estudiantes no tienen cuenta, correo ni contraseña.
 */
/** Campos que el docente puede cambiar en su propio perfil. */
export const UPDATABLE_PROFILE_FIELDS = Object.freeze(['firstName', 'lastName', 'preferredLanguage'])

const teacherSchema = new Schema(
    {
        firstName: {
            type: String,
            required: [true, 'El nombre es obligatorio'],
            trim: true,
            maxLength: [60, 'El nombre no puede superar 60 caracteres']
        },
        lastName: {
            type: String,
            required: [true, 'El apellido es obligatorio'],
            trim: true,
            maxLength: [60, 'El apellido no puede superar 60 caracteres']
        },
        email: {
            type: String,
            required: [true, 'El correo es obligatorio'],
            unique: true,
            lowercase: true,
            trim: true,
            maxLength: [254, 'El correo es demasiado largo']
        },
        passwordHash: {
            type: String,
            required: true,
            // No se incluye en las consultas salvo que se pida con .select('+passwordHash')
            select: false
        },
        preferredLanguage: {
            type: String,
            enum: {
                values: LANGUAGE_CODES,
                message: 'Idioma no soportado'
            },
            default: DEFAULT_LANGUAGE
        }
    },
    { timestamps: true }
)

// Doble seguro: aunque se haya pedido passwordHash, nunca sale en JSON.
const hideSensitive = (doc, ret) => {
    ret.id = ret._id.toString()
    delete ret._id
    delete ret.__v
    delete ret.passwordHash
    return ret
}

teacherSchema.set('toJSON', { transform: hideSensitive })
teacherSchema.set('toObject', { transform: hideSensitive })

export default model('Teacher', teacherSchema)
