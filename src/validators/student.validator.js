import { body, checkExact } from 'express-validator'
import { validate } from '../middlewares/validate.middleware.js'
import { idParam, statusQuery, requireAtLeastOne } from './classroom.validator.js'
import { STUDENT_CODE_REGEX, STUDENT_CODE_MAX } from '../config/classroom.js'

/**
 * Campos de datos personales que NUNCA se aceptan para estudiantes.
 * Se rechazan con un mensaje explícito antes que cualquier otra validación.
 */
export const PERSONAL_DATA_FIELDS = Object.freeze([
    'name', 'firstName', 'lastName', 'surname', 'fullName',
    'email', 'password', 'passwordHash', 'phone',
    'dpi', 'cui', 'birthDate', 'dateOfBirth', 'age', 'gender', 'address'
])

const rejectPersonalData = (req, res, next) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const found = PERSONAL_DATA_FIELDS.filter((field) => field in body)
    if (!found.length) return next()
    return res.status(400).json({
        success: false,
        message: 'Los estudiantes no son usuarios: regístralos solo con un código (studentCode), sin datos personales.',
        errors: found.map((field) => ({ field, message: 'Dato personal no permitido' }))
    })
}

const studentCodeRule = (optional) => {
    const chain = optional ? body('studentCode').optional() : body('studentCode')
    return chain
        .isString().withMessage('El código del estudiante es obligatorio').bail()
        .trim()
        .notEmpty().withMessage('El código del estudiante es obligatorio').bail()
        .isLength({ max: STUDENT_CODE_MAX }).withMessage(`El código no puede superar ${STUDENT_CODE_MAX} caracteres`).bail()
        .toUpperCase()
        .matches(STUDENT_CODE_REGEX)
        .withMessage('Usa letras sin tilde, números, guion o guion bajo, sin espacios (p. ej. A01, MAT-03)')
}

export const listStudentsValidator = [
    idParam('id', 'aula'),
    checkExact([idParam('id', 'aula'), statusQuery()], { locations: ['params', 'query'] }),
    validate
]

export const createStudentValidator = [
    rejectPersonalData,
    checkExact([idParam('id', 'aula'), studentCodeRule(false)]),
    validate
]

export const updateStudentValidator = [
    rejectPersonalData,
    checkExact([
        idParam('id', 'estudiante'),
        studentCodeRule(true),
        body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive debe ser true o false')
    ]),
    validate,
    requireAtLeastOne(['studentCode', 'isActive'])
]

export const studentIdValidator = [idParam('id', 'estudiante'), validate]
