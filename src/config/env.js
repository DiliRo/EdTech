import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const REQUIRED = ['MONGODB_URI']

const toPort = (value, fallback) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback
}

export const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: toPort(process.env.PORT, 3000),
    mongodbUri: process.env.MONGODB_URI,
    corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
}

export const isTest = () => env.nodeEnv === 'test'
export const isProduction = () => env.nodeEnv === 'production'

/**
 * Verifica que existan las variables obligatorias.
 * Lanza un error que nombra las variables faltantes, nunca sus valores.
 */
export const validateEnv = (source = process.env) => {
    const missing = REQUIRED.filter((key) => !source[key] || !String(source[key]).trim())
    if (missing.length) {
        throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`)
    }
}
