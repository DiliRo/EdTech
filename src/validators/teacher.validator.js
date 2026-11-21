import { checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { nameRule, languageRule } from './teacher.rules.js'
import { UPDATABLE_PROFILE_FIELDS } from '../models/teacher.model.js'

/** Exige que el cuerpo traiga al menos uno de los campos editables. */
const requireAtLeastOneField = (req, res, next) => {
    const body = req.body
    const isObject = body && typeof body === 'object' && !Array.isArray(body)
    if (isObject && UPDATABLE_PROFILE_FIELDS.some((field) => field in body)) return next()

    return res.status(400).json({
        success: false,
        message: 'Errores de validación',
        errors: [{ field: 'body', message: `Envía al menos un campo: ${UPDATABLE_PROFILE_FIELDS.join(', ')}` }]
    })
}

/**
 * PATCH /api/teachers/me: solo nombre, apellido e idioma.
 * El correo y la contraseña no se cambian aquí (checkExact los rechaza).
 */
export const updateProfileValidator = [
    checkExact([
        nameRule('firstName', 'El nombre', { optional: true }),
        nameRule('lastName', 'El apellido', { optional: true }),
        languageRule({ optional: true })
    ]),
    validate,
    requireAtLeastOneField
]
