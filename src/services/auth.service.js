import Teacher from '../models/teacher.model.js'
import { hashPassword, comparePassword, consumeComparisonTime } from '../utils/password.js'
import { signToken } from '../utils/jwt.js'
import { AppError } from '../utils/AppError.js'
import { DEFAULT_LANGUAGE } from '../config/languages.js'

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos'

export const EMAIL_TAKEN = 'Ya existe una cuenta con ese correo'

/**
 * Registra un docente. Recibe datos ya validados y solo usa los campos
 * permitidos; la contraseña se guarda únicamente como hash de bcrypt.
 */
export const registerTeacher = async ({ firstName, lastName, email, password, preferredLanguage }) => {
    if (await Teacher.exists({ email })) {
        throw new AppError(409, EMAIL_TAKEN, [{ field: 'email', message: EMAIL_TAKEN }])
    }

    const teacher = new Teacher({
        firstName,
        lastName,
        email,
        passwordHash: await hashPassword(password),
        preferredLanguage: preferredLanguage || DEFAULT_LANGUAGE
    })

    try {
        await teacher.save()
    } catch (err) {
        // Dos registros simultáneos con el mismo correo: lo detecta el índice único.
        if (err?.code === 11000) {
            throw new AppError(409, EMAIL_TAKEN, [{ field: 'email', message: EMAIL_TAKEN }])
        }
        throw err
    }

    return { teacher, token: signToken(teacher._id) }
}

/**
 * Inicia sesión. Responde el mismo error si el correo no existe o si la
 * contraseña es incorrecta, y tarda lo mismo en ambos casos.
 */
export const loginTeacher = async ({ email, password }) => {
    const teacher = await Teacher.findOne({ email }).select('+passwordHash')

    if (!teacher) {
        await consumeComparisonTime(password)
        throw new AppError(401, INVALID_CREDENTIALS)
    }

    const valid = await comparePassword(password, teacher.passwordHash)
    if (!valid) throw new AppError(401, INVALID_CREDENTIALS)

    return { teacher, token: signToken(teacher._id) }
}
