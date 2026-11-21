import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { env } from '../config/env.js'

const tooManyAttempts = (minutes) => ({
    success: false,
    message: `Demasiados intentos. Espera ${minutes} minutos e inténtalo de nuevo.`
})

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

/**
 * Login: cuenta solo los intentos FALLIDOS por combinación IP + correo.
 * Un inicio de sesión exitoso no consume intentos. Así un atacante no puede
 * probar contraseñas sin límite, y bloquear una cuenta desde otra IP no afecta
 * al docente legítimo.
 */
export const loginLimiter = rateLimit({
    windowMs: env.loginWindowMinutes * 60 * 1000,
    limit: env.loginMaxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${normalizeEmail(req.body?.email)}`,
    message: tooManyAttempts(env.loginWindowMinutes)
})

/** Registro: limita cuentas nuevas por IP. */
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: env.registerMaxPerHour,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: tooManyAttempts(60)
})
