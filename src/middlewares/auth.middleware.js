import jwt from 'jsonwebtoken'
import { isValidObjectId } from 'mongoose'

import Teacher from '../models/teacher.model.js'
import { verifyToken } from '../utils/jwt.js'
import { AppError } from '../utils/AppError.js'

const INVALID_SESSION = 'Sesión inválida. Inicia sesión de nuevo.'

/**
 * Protege rutas privadas. Exige `Authorization: Bearer <token>`, verifica el JWT
 * y comprueba que el docente siga existiendo.
 *
 * Deja disponible:
 *  - `req.teacher`  documento del docente (sin passwordHash)
 *  - `req.user.id`  id como texto; los módulos siguientes filtran sus consultas con él
 */
export const requireAuth = async (req, res, next) => {
    const header = req.get('authorization') || ''
    const [scheme, token, extra] = header.split(' ')

    if (scheme !== 'Bearer' || !token || extra) {
        return next(new AppError(401, 'Debes iniciar sesión'))
    }

    let payload
    try {
        payload = verifyToken(token)
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return next(new AppError(401, 'Tu sesión expiró. Inicia sesión de nuevo.'))
        }
        return next(new AppError(401, INVALID_SESSION))
    }

    if (!isValidObjectId(payload.sub)) {
        return next(new AppError(401, INVALID_SESSION))
    }

    const teacher = await Teacher.findById(payload.sub)
    if (!teacher) {
        return next(new AppError(401, INVALID_SESSION))
    }

    req.teacher = teacher
    req.user = { id: teacher._id.toString() }
    return next()
}
