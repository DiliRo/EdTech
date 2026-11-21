import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const ALGORITHM = 'HS256'

/** El token solo lleva el id del docente; los demás datos se leen de la BD en cada petición. */
export const signToken = (teacherId) =>
    jwt.sign({}, env.jwtSecret, {
        subject: String(teacherId),
        expiresIn: env.jwtExpiresIn,
        algorithm: ALGORITHM
    })

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] })
