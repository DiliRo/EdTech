import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'

import { createApp } from '../../src/app.js'
import { installFakeTeacherStore } from '../helpers/fakeTeacherStore.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const app = createApp()
const patchMe = (token, body) => request(app).patch('/api/teachers/me').set(bearer(token)).send(body)

describe('PATCH /api/teachers/me', () => {
    let store
    beforeEach(() => { store = installFakeTeacherStore() })
    afterEach(() => mock.restoreAll())

    it('responde 401 sin token', async () => {
        const res = await request(app).patch('/api/teachers/me').send({ firstName: 'Luis' })
        assert.equal(res.status, 401)
    })

    it('actualiza nombre, apellido e idioma y lo persiste', async () => {
        const { token } = await registerTeacher(app)
        const res = await patchMe(token, { firstName: 'Luis', lastName: 'Cac Pop', preferredLanguage: 'kek' })

        assert.equal(res.status, 200)
        assert.equal(res.body.success, true)
        assert.equal(res.body.data.teacher.firstName, 'Luis')
        assert.equal(res.body.data.teacher.lastName, 'Cac Pop')
        assert.equal(res.body.data.teacher.preferredLanguage, 'kek')
        assert.ok(!JSON.stringify(res.body).includes('passwordHash'))

        const me = await request(app).get('/api/auth/me').set(bearer(token))
        assert.equal(me.body.data.teacher.firstName, 'Luis')
        assert.equal(me.body.data.teacher.preferredLanguage, 'kek')
    })

    it('permite actualizar un solo campo', async () => {
        const { token, teacher } = await registerTeacher(app)
        const res = await patchMe(token, { preferredLanguage: 'cak' })

        assert.equal(res.status, 200)
        assert.equal(res.body.data.teacher.preferredLanguage, 'cak')
        assert.equal(res.body.data.teacher.firstName, teacher.firstName)
    })

    it('conserva el hash de la contraseña después de actualizar', async () => {
        const { token, data } = await registerTeacher(app)
        await patchMe(token, { firstName: 'Luis' })

        const login = await request(app).post('/api/auth/login').send({ email: data.email, password: data.password })
        assert.equal(login.status, 200)
    })

    it('solo modifica al docente autenticado', async () => {
        const a = await registerTeacher(app)
        const b = await registerTeacher(app)

        await patchMe(a.token, { firstName: 'Cambiado' })

        assert.equal(store.rows.get(a.teacher.id).firstName, 'Cambiado')
        assert.equal(store.rows.get(b.teacher.id).firstName, b.teacher.firstName)
    })

    it('responde 400 si el cuerpo está vacío', async () => {
        const { token } = await registerTeacher(app)
        const res = await patchMe(token, {})
        assert.equal(res.status, 400)
    })

    for (const field of ['email', 'password', 'passwordHash', '_id', 'createdAt']) {
        it(`no permite cambiar "${field}"`, async () => {
            const { token, teacher } = await registerTeacher(app)
            const res = await patchMe(token, { firstName: 'Luis', [field]: 'valor' })

            assert.equal(res.status, 400)
            assert.ok(res.body.errors.some((e) => e.field === field && e.message === 'Campo no permitido'))
            assert.equal(store.rows.get(teacher.id).firstName, teacher.firstName)
        })
    }

    it('rechaza un idioma no soportado', async () => {
        const { token } = await registerTeacher(app)
        const res = await patchMe(token, { preferredLanguage: 'fr' })
        assert.equal(res.status, 400)
        assert.equal(res.body.errors[0].field, 'preferredLanguage')
    })

    it('rechaza un nombre vacío', async () => {
        const { token } = await registerTeacher(app)
        const res = await patchMe(token, { firstName: '  ' })
        assert.equal(res.status, 400)
        assert.equal(res.body.errors[0].field, 'firstName')
    })
})
