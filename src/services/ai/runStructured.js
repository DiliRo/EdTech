import AIUsageLog from '../../models/aiUsageLog.model.js'
import { AppError } from '../../utils/AppError.js'
import { aiConfig } from '../../config/ai.js'
import { getAIProvider } from './index.js'
import { AIProviderError, toHttp } from './errors.js'
import { extractJson } from '../../validators/lessonGuideContent.js'

/**
 * Flujo común para pedir a la IA una respuesta JSON estructurada:
 * proveedor → extracción de JSON → validación → reintento con retroalimentación.
 * Cada llamada (exitosa, inválida o con error) se registra en AIUsageLog y cuenta para
 * el límite diario por docente, que es compartido por todas las funciones de IA.
 */

const startOfToday = (now) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
}

export const assertDailyQuota = async (teacherId, now = new Date()) => {
    const used = await AIUsageLog.countDocuments({ teacherId, createdAt: { $gte: startOfToday(now) } })
    if (used >= aiConfig.dailyLimitPerTeacher) {
        throw new AppError(429, `Alcanzaste el límite de ${aiConfig.dailyLimitPerTeacher} generaciones con IA por día. Intenta mañana.`)
    }
}

const resolveProvider = () => {
    try {
        return getAIProvider()
    } catch (err) {
        // Proveedor mal configurado (falta clave o modelo): se registra sin exponer detalles
        console.error('IA | proveedor no disponible:', err?.message)
        throw new AppError(503, toHttp(new AIProviderError('not_configured')).message)
    }
}

const logUsage = (data) => new AIUsageLog(data).save().catch(() => {})

/**
 * @param {object} p
 * @param {string} p.teacherId
 * @param {string} p.feature              p. ej. 'lesson-guide', 'experiment-report'
 * @param {string} p.system               instrucciones fijas del sistema
 * @param {(feedback: string|null) => string} p.buildUser  construye el mensaje del usuario
 * @param {object} p.context              contexto (solo lo usa el proveedor simulado)
 * @param {(content: object) => { valid: boolean, errors: object[] }} p.validate
 */
export const runStructuredGeneration = async ({ teacherId, feature, system, buildUser, context, validate }) => {
    const provider = resolveProvider()
    let feedback = null
    let lastErrors = []
    const usage = { inputTokens: 0, outputTokens: 0 }

    for (let attempt = 1; attempt <= aiConfig.maxAttempts; attempt += 1) {
        const user = buildUser(feedback)
        const started = Date.now()
        let response
        try {
            response = await provider.generate({ system, user, context })
        } catch (err) {
            const known = err instanceof AIProviderError
            await logUsage({ teacherId, feature, provider: provider.name, model: provider.model || 'desconocido', status: 'error', errorCode: known ? err.code : 'unavailable', latencyMs: Date.now() - started })
            if (!known) console.error('IA | error inesperado del proveedor:', err?.message)
            const { status, message } = toHttp(known ? err : new AIProviderError('unavailable'))
            throw new AppError(status, message)
        }

        usage.inputTokens += response.usage?.inputTokens ?? 0
        usage.outputTokens += response.usage?.outputTokens ?? 0

        const content = typeof response.text === 'string' && response.text.length <= aiConfig.maxOutputChars
            ? extractJson(response.text)
            : null
        const { valid, errors } = content
            ? validate(content)
            : { valid: false, errors: [{ field: 'respuesta', message: 'No es un objeto JSON válido o es demasiado larga' }] }

        await logUsage({
            teacherId,
            feature,
            provider: provider.name,
            model: response.model || provider.model || 'desconocido',
            status: valid ? 'success' : 'invalid_output',
            inputTokens: response.usage?.inputTokens ?? null,
            outputTokens: response.usage?.outputTokens ?? null,
            latencyMs: Date.now() - started
        })

        if (valid) return { content, attempts: attempt, usage, provider: provider.name, model: response.model || provider.model }

        lastErrors = errors
        feedback = errors.slice(0, 5).map((e) => `${e.field}: ${e.message}`).join('; ')
    }

    const err = new AppError(502, toHttp(new AIProviderError('invalid_response')).message)
    err.errors = lastErrors.slice(0, 10)
    throw err
}
