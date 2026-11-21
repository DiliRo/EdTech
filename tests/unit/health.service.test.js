import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { checkDatabase, getHealth } from '../../src/services/health.service.js'

// Conexiones falsas: permiten probar cada estado sin un servidor de MongoDB.
const fakeConnection = (readyState, ping) => ({
    readyState,
    db: { admin: () => ({ ping }) }
})

describe('checkDatabase', () => {
    it('reporta connected cuando el ping responde', async () => {
        const result = await checkDatabase(fakeConnection(1, async () => ({ ok: 1 })))
        assert.deepEqual(result, { status: 'connected', healthy: true })
    })

    it('reporta unreachable si el ping falla aunque readyState diga conectado', async () => {
        const result = await checkDatabase(fakeConnection(1, async () => {
            throw new Error('mongodb://usuario:clave@host')
        }))
        assert.deepEqual(result, { status: 'unreachable', healthy: false })
    })

    it('reporta unreachable si el ping no responde a tiempo', async () => {
        const result = await checkDatabase(fakeConnection(1, () => new Promise(() => {})))
        assert.deepEqual(result, { status: 'unreachable', healthy: false })
    })

    for (const [state, label] of [[0, 'disconnected'], [2, 'connecting'], [3, 'disconnecting']]) {
        it(`reporta ${label} sin intentar ping`, async () => {
            let pinged = false
            const result = await checkDatabase(fakeConnection(state, async () => { pinged = true }))
            assert.deepEqual(result, { status: label, healthy: false })
            assert.equal(pinged, false)
        })
    }
})

describe('getHealth', () => {
    it('incluye servidor, base de datos, uptime y fecha', async () => {
        const health = await getHealth(fakeConnection(1, async () => ({ ok: 1 })))

        assert.equal(health.healthy, true)
        assert.equal(health.server, 'ok')
        assert.equal(health.database, 'connected')
        assert.equal(typeof health.uptimeSeconds, 'number')
        assert.ok(!Number.isNaN(Date.parse(health.timestamp)))
    })
})
