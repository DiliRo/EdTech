import { validationResult } from 'express-validator'

/** Responde 400 con un mensaje por campo si alguna validación falló. */
export const validate = (req, res, next) => {
    const result = validationResult(req)
    if (result.isEmpty()) return next()

    const errors = []
    const seen = new Set()
    for (const error of result.array()) {
        // `checkExact` reporta campos no permitidos con type 'unknown_fields'
        if (error.type === 'unknown_fields') {
            for (const field of error.fields) {
                errors.push({ field: field.path, message: 'Campo no permitido' })
            }
            continue
        }
        // Un solo mensaje por campo: el primero que falló
        if (seen.has(error.path)) continue
        seen.add(error.path)
        errors.push({ field: error.path, message: error.msg })
    }

    return res.status(400).json({ success: false, message: 'Errores de validación', errors })
}
