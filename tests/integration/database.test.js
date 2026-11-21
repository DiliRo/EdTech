import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'

// Prueba con un MongoDB real en memoria (la primera vez descarga el binario de mongod).
describe('Integración con MongoDB', () => {
    let mongo
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-test'))
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    it('GET /api/health responde 200 con la base de datos conectada', async () => {
        const res = await request(app).get('/api/health')

        assert.equal(res.status, 200)
        assert.equal(res.body.success, true)
        assert.equal(res.body.data.server, 'ok')
        assert.equal(res.body.data.database, 'connected')
    })

    it('GET /api/health responde 503 después de desconectar', async () => {
        await disconnectDB()
        const res = await request(app).get('/api/health')

        assert.equal(res.status, 503)
        assert.equal(res.body.data.database, 'disconnected')
    })
})
