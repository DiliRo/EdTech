import dotenv from 'dotenv'

dotenv.config({ quiet: true })

/**
 * Configuración del servicio de IA. Todo se controla con variables de entorno
 * para poder cambiar de proveedor sin tocar el código.
 */
export const AI_PROVIDERS = Object.freeze(['mock', 'anthropic', 'openai-compatible'])

const int = (value, fallback, min, max) => {
    const n = Number.parseInt(value, 10)
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

const num = (value, fallback, min, max) => {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

export const loadAIConfig = (source = process.env) => ({
    // `mock` genera guías de ejemplo sin llamar a ningún proveedor (desarrollo y pruebas)
    provider: AI_PROVIDERS.includes(source.AI_PROVIDER) ? source.AI_PROVIDER : 'mock',
    apiKey: source.AI_API_KEY || '',
    model: source.AI_MODEL || '',
    // Solo para openai-compatible (p. ej. https://api.openai.com/v1)
    baseUrl: (source.AI_BASE_URL || '').replace(/\/+$/, ''),
    anthropicVersion: source.AI_ANTHROPIC_VERSION || '2023-06-01',
    temperature: num(source.AI_TEMPERATURE, 0.4, 0, 1),
    // Solo openai-compatible: se envía como `reasoning_effort` si se define (p. ej. "low" en Gemini)
    reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high'].includes(source.AI_REASONING_EFFORT) ? source.AI_REASONING_EFFORT : null,

    // Límites de tiempo y consumo
    timeoutMs: int(source.AI_TIMEOUT_MS, 30000, 1000, 120000),
    maxOutputTokens: int(source.AI_MAX_OUTPUT_TOKENS, 2500, 256, 8000),
    maxInputChars: int(source.AI_MAX_INPUT_CHARS, 12000, 2000, 60000),
    maxOutputChars: int(source.AI_MAX_OUTPUT_CHARS, 20000, 2000, 100000),
    // Intentos por generación (el segundo solo si la respuesta no es JSON válido)
    maxAttempts: int(source.AI_MAX_ATTEMPTS, 2, 1, 3),
    // Generaciones por docente por día (cada intento cuenta)
    dailyLimitPerTeacher: int(source.AI_DAILY_LIMIT_PER_TEACHER, 20, 1, 1000),
    // Peticiones de generación por docente por minuto
    perMinuteLimit: int(source.AI_RATE_LIMIT_PER_MINUTE, 5, 1, 60)
})

export const aiConfig = loadAIConfig()

/** Errores de configuración que impiden usar un proveedor real (se informan sin mostrar la clave). */
export const validateAIConfig = (config = aiConfig) => {
    if (config.provider === 'mock') return []
    const problems = []
    if (!config.apiKey) problems.push('AI_API_KEY')
    if (!config.model) problems.push('AI_MODEL')
    if (config.provider === 'openai-compatible' && !config.baseUrl) problems.push('AI_BASE_URL')
    return problems
}
