/**
 * Error normalizado de cualquier proveedor de IA. `code` es estable y no depende del
 * proveedor; el mensaje para el cliente nunca incluye la clave, la URL ni la respuesta cruda.
 */
export const AI_ERROR_CODES = Object.freeze({
    NOT_CONFIGURED: 'not_configured',
    AUTH: 'auth',
    RATE_LIMITED: 'rate_limited',
    TIMEOUT: 'timeout',
    UNAVAILABLE: 'unavailable',
    INVALID_RESPONSE: 'invalid_response',
    OUTPUT_TOO_LONG: 'output_too_long',
    REFUSED: 'refused'
})

export class AIProviderError extends Error {
    constructor(code, detail = '') {
        super(detail || code)
        this.name = 'AIProviderError'
        this.code = code
        this.detail = detail
    }
}

/** Traduce un error de IA a la respuesta HTTP que verá el docente. */
export const toHttp = (err) => {
    switch (err.code) {
        case AI_ERROR_CODES.TIMEOUT:
            return { status: 504, message: 'El servicio de IA tardó demasiado en responder. Intenta de nuevo.' }
        case AI_ERROR_CODES.RATE_LIMITED:
            return { status: 503, message: 'El servicio de IA está ocupado. Intenta de nuevo en unos minutos.' }
        case AI_ERROR_CODES.INVALID_RESPONSE:
        case AI_ERROR_CODES.OUTPUT_TOO_LONG:
            return { status: 502, message: 'La IA no devolvió una guía válida. Intenta de nuevo o ajusta los datos.' }
        case AI_ERROR_CODES.REFUSED:
            return { status: 422, message: 'La IA no pudo generar una guía con estos datos.' }
        default:
            return { status: 503, message: 'El servicio de IA no está disponible en este momento.' }
    }
}

/** Clasifica un código HTTP del proveedor. */
export const errorFromStatus = (status) => {
    if (status === 401 || status === 403) return new AIProviderError(AI_ERROR_CODES.AUTH, `HTTP ${status}`)
    if (status === 429 || status === 529) return new AIProviderError(AI_ERROR_CODES.RATE_LIMITED, `HTTP ${status}`)
    return new AIProviderError(AI_ERROR_CODES.UNAVAILABLE, `HTTP ${status}`)
}

/** Ejecuta fetch con tiempo de espera; un aborto se convierte en TIMEOUT. */
export const fetchWithTimeout = async (fetchImpl, url, options, timeoutMs) => {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeoutMs)
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal })
    } catch {
        if (timedOut) throw new AIProviderError(AI_ERROR_CODES.TIMEOUT, `Sin respuesta en ${timeoutMs} ms`)
        throw new AIProviderError(AI_ERROR_CODES.UNAVAILABLE, 'Error de red')
    } finally {
        clearTimeout(timer)
    }
}
