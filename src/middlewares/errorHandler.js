import { AppError } from '../utils/AppError.js'
import { isTest } from '../config/env.js'

/**
 * Middleware central de errores. Responde siempre con
 * `{ success: false, message, errors? }` y nunca envía stack traces,
 * mensajes internos, consultas ni datos de conexión al cliente.
 */
// Express identifica los middlewares de error por sus 4 parámetros.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err)

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...(err.errors ? { errors: err.errors } : {})
        })
    }

    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'El cuerpo de la petición no es JSON válido' })
    }

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'El cuerpo de la petición es demasiado grande' })
    }

    // Error inesperado: se registra en el servidor y el cliente solo recibe un mensaje genérico.
    if (!isTest()) {
        console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err)
    }
    return res.status(500).json({ success: false, message: 'Error interno del servidor' })
}
