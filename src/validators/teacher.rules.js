import { body } from 'express-validator'
import { LANGUAGE_CODES } from '../config/languages.js'
import { BCRYPT_MAX_BYTES } from '../utils/password.js'

// Letras de cualquier alfabeto (incluye tildes, ñ y el apóstrofo de los nombres mayas), espacios y guiones.
const NAME_REGEX = /^[\p{L}\p{M}'’ -]+$/u
const NAME_MAX = 60

/** Reglas reutilizables para los campos del docente. */
export const nameRule = (field, label, { optional = false } = {}) => {
    let chain = body(field)
    if (optional) chain = chain.optional()
    return chain
        .isString().withMessage(`${label} debe ser texto`)
        .bail()
        .trim()
        .notEmpty().withMessage(`${label} es obligatorio`)
        .bail()
        .isLength({ max: NAME_MAX }).withMessage(`${label} no puede superar ${NAME_MAX} caracteres`)
        .bail()
        .matches(NAME_REGEX).withMessage(`${label} solo puede contener letras, espacios, apóstrofos o guiones`)
}

export const emailRule = () =>
    body('email')
        .isString().withMessage('El correo es obligatorio')
        .bail()
        .trim()
        .notEmpty().withMessage('El correo es obligatorio')
        .bail()
        .isLength({ max: 254 }).withMessage('El correo es demasiado largo')
        .bail()
        .isEmail().withMessage('El correo no es válido')
        .bail()
        .toLowerCase()

export const newPasswordRule = () =>
    body('password')
        .isString().withMessage('La contraseña es obligatoria')
        .bail()
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
        .bail()
        .custom((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES)
        .withMessage('La contraseña es demasiado larga')
        .bail()
        .matches(/[a-zà-ÿñ]/).withMessage('La contraseña debe incluir una letra minúscula')
        .bail()
        .matches(/[A-ZÀ-ÝÑ]/).withMessage('La contraseña debe incluir una letra mayúscula')
        .bail()
        .matches(/\d/).withMessage('La contraseña debe incluir un número')

export const languageRule = ({ optional = false } = {}) => {
    let chain = body('preferredLanguage')
    if (optional) chain = chain.optional()
    return chain
        .isIn(LANGUAGE_CODES)
        .withMessage(`Idioma no soportado. Valores permitidos: ${LANGUAGE_CODES.join(', ')}`)
}
