import { body, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { nameRule, emailRule, newPasswordRule, languageRule } from './teacher.rules.js'

// checkExact rechaza cualquier campo extra (p. ej. "passwordHash" o "_id").
export const registerValidator = [
    checkExact([
        nameRule('firstName', 'El nombre'),
        nameRule('lastName', 'El apellido'),
        emailRule(),
        newPasswordRule(),
        languageRule({ optional: true })
    ]),
    validate
]

export const loginValidator = [
    checkExact([
        emailRule(),
        body('password')
            .isString().withMessage('La contraseña es obligatoria')
            .bail()
            .notEmpty().withMessage('La contraseña es obligatoria')
            .bail()
            .isLength({ max: 256 }).withMessage('Correo o contraseña incorrectos')
    ]),
    validate
]
