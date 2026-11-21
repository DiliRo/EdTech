import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'
import Teacher from '../../src/models/teacher.model.js'
import { teacherData, bearer } from '../helpers/factories.js'

// Flujo completo contra un MongoDB real en memoria.
describe('Integración: autenticación y perfil de docentes', () => {
    let mongo
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-auth-test'))
        await Teacher.syncIndexes()
    })

    after(async () => {
        await disconnectDB()
        await mongo?.stop()
    })

    it('registro → login → me → actualizar perfil', async () => {
        const data = teacherData()

        const register = await request(app).post('/api/auth/register').send(data)
        assert.equal(register.status, 201)

        const login = await request(app).post('/api/auth/login').send({ email: data.email, password: data.password })
        assert.equal(login.status, 200)
        const { token } = login.body.data

        const me = await request(app).get('/api/auth/me').set(bearer(token))
        assert.equal(me.status, 200)
        assert.equal(me.body.data.teacher.email, data.email)

        const patch = await request(app)
            .patch('/api/teachers/me')
            .set(bearer(token))
            .send({ preferredLanguage: 'mam', lastName: 'Pérez' })
        assert.equal(patch.status, 200)
        assert.equal(patch.body.data.teacher.preferredLanguage, 'mam')

        // La contraseña sigue funcionando después de actualizar el perfil
        const relogin = await request(app).post('/api/auth/login').send({ email: data.email, password: data.password })
        assert.equal(relogin.status, 200)
    })

    it('en la base de datos solo se guarda el hash de la contraseña', async () => {
        const data = teacherData()
        await request(app).post('/api/auth/register').send(data)

        const raw = await Teacher.collection.findOne({ email: data.email })
        assert.match(raw.passwordHash, /^\$2[aby]\$/)
        assert.equal(raw.password, undefined)
        assert.ok(!Object.values(raw).includes(data.password))
    })

    it('las consultas normales no traen passwordHash', async () => {
        const data = teacherData()
        await request(app).post('/api/auth/register').send(data)

        const teacher = await Teacher.findOne({ email: data.email }).lean()
        assert.equal(teacher.passwordHash, undefined)
    })

    it('el índice único impide correos duplicados aunque se salte el servicio', async () => {
        const data = teacherData()
        await request(app).post('/api/auth/register').send(data)

        await assert.rejects(
            Teacher.create({ firstName: 'X', lastName: 'Y', email: data.email, passwordHash: 'hash' }),
            (err) => err.code === 11000
        )
    })

    it('registros simultáneos con el mismo correo crean una sola cuenta', async () => {
        const data = teacherData()
        const results = await Promise.all([
            request(app).post('/api/auth/register').send(data),
            request(app).post('/api/auth/register').send(data)
        ])

        const statuses = results.map((r) => r.status).sort()
        assert.deepEqual(statuses, [201, 409])
        assert.equal(await Teacher.countDocuments({ email: data.email }), 1)
    })
})
