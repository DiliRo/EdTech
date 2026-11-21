import mongoose from 'mongoose'

const READY_STATES = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
}

const PING_TIMEOUT_MS = 2000

const withTimeout = (promise, ms) => {
    let timer
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Revisa el estado de la base de datos. Además de mirar `readyState`, hace un
 * `ping` real para confirmar que el servidor de MongoDB responde.
 * Nunca devuelve la URI, el host ni el mensaje de error interno.
 */
export const checkDatabase = async (connection = mongoose.connection) => {
    const state = READY_STATES[connection.readyState] || 'unknown'

    if (state !== 'connected') {
        return { status: state, healthy: false }
    }

    try {
        await withTimeout(connection.db.admin().ping(), PING_TIMEOUT_MS)
        return { status: 'connected', healthy: true }
    } catch {
        return { status: 'unreachable', healthy: false }
    }
}

export const getHealth = async (connection) => {
    const database = await checkDatabase(connection)
    return {
        healthy: database.healthy,
        server: 'ok',
        database: database.status,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    }
}
