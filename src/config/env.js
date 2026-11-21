import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const REQUIRED = ['MONGODB_URI', 'JWT_SECRET']
export const MIN_JWT_SECRET_LENGTH = 32

const toInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: toInt(process.env.PORT, 3000, { max: 65535 }),
    mongodbUri: process.env.MONGODB_URI,
    corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),

    // Autenticación
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12, { min: 4, max: 15 }),

    // Protección contra intentos repetidos
    loginMaxAttempts: toInt(process.env.LOGIN_MAX_ATTEMPTS, 5),
    loginWindowMinutes: toInt(process.env.LOGIN_WINDOW_MINUTES, 15),
    registerMaxPerHour: toInt(process.env.REGISTER_MAX_PER_HOUR, 10),

    // Umbral (porcentaje de logro) para señalar resultados que pueden requerir acompañamiento
    performanceThreshold: toInt(process.env.PERFORMANCE_THRESHOLD, 60, { min: 0, max: 100 })
}

export const isTest = () => env.nodeEnv === 'test'
export const isProduction = () => env.nodeEnv === 'production'

/**
 * Verifica que existan las variables obligatorias.
 * Los mensajes nombran las variables con problema, nunca sus valores.
 */
export const validateEnv = (source = process.env) => {
    const missing = REQUIRED.filter((key) => !source[key] || !String(source[key]).trim())
    if (missing.length) {
        throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`)
    }
    if (String(source.JWT_SECRET).trim().length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres`)
    }
}
