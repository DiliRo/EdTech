import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { createApp } from '../../src/app.js'
import { LANGUAGE_CODES } from '../../src/config/languages.js'
import { installFakeTeacherStore } from '../helpers/fakeTeacherStore.js'
import { teacherData, registerTeacher, bearer } from '../helpers/factories.js'

const app = createApp()
const SECRET = process.env.JWT_SECRET

const assertNoPasswordData = (body) => {
    const text = JSON.stringify(body)
    assert.ok(!text.includes('passwordHash'), 'la respuesta no debe contener passwordHash')
    assert.ok(!text.includes('$2'), 'la respuesta no debe contener un hash de bcrypt')
}

describe('POST /api/auth/register', () => {
    let store
    beforeEach(() => { store = installFakeTeacherStore() })
    afterEach(() => mock.restoreAll())

    it('crea el docente y devuelve token y perfil sin passwordHash', async () => {
        const data = teacherData({ email: 'Maria.Tzoc@Escuela.EDU.gt' })
        const res = await request(app).post('/api/auth/register').send(data)

        assert.equal(res.status, 201)
        assert.equal(res.body.success, true)
        assert.equal(typeof res.body.data.token, 'string')

        const { teacher } = res.body.data
        assert.equal(teacher.firstName, 'Ana')
        assert.equal(teacher.lastName, "Q'uq")
        assert.equal(teacher.email, 'maria.tzoc@escuela.edu.gt')
        assert.equal(teacher.preferredLanguage, 'es')
        assert.ok(teacher.id)
        assert.equal(teacher.password, undefined)
        assertNoPasswordData(res.body)
    })

    it('guarda la contraseña solo como hash de bcrypt', async () => {
        const { data } = await registerTeacher(app)
        const row = store.getByEmail(data.email)

        assert.notEqual(row.passwordHash, data.password)
        assert.match(row.passwordHash, /^\$2[aby]\$/)
        assert.equal(await bcrypt.compare(data.password, row.passwordHash), true)
        assert.equal(row.password, undefined)
    })

    it('el token identifica al docente creado', async () => {
        const { token, teacher } = await registerTeacher(app)
        const payload = jwt.verify(token, SECRET)
        assert.equal(payload.sub, teacher.id)
    })

    for (const code of LANGUAGE_CODES) {
        it(`acepta el idioma "${code}"`, async () => {
            const { res } = await registerTeacher(app, { preferredLanguage: code })
            assert.equal(res.status, 201)
            assert.equal(res.body.data.teacher.preferredLanguage, code)
        })
    }

    it('rechaza un idioma no soportado', async () => {
        const { res } = await registerTeacher(app, { preferredLanguage: 'en' })
        assert.equal(res.status, 400)
        assert.equal(res.body.errors[0].field, 'preferredLanguage')
    })

    it('responde 409 si el correo ya existe, sin importar mayúsculas', async () => {
        const { data } = await registerTeacher(app)
        const { res } = await registerTeacher(app, { email: data.email.toUpperCase() })

        assert.equal(res.status, 409)
        assert.equal(res.body.errors[0].field, 'email')
        assert.equal(store.rows.size, 1)
    })

    it('responde 409 si el índice único detecta un duplicado (registro simultáneo)', async () => {
        mock.method(
            (await import('../../src/models/teacher.model.js')).default,
            'exists',
            async () => null
        )
        const { data } = await registerTeacher(app)
        const { res } = await registerTeacher(app, { email: data.email })
        assert.equal(res.status, 409)
    })

    const invalidCases = [
        ['correo inválido', { email: 'no-es-correo' }, 'email'],
        ['correo vacío', { email: '' }, 'email'],
        ['contraseña corta', { password: 'Ab1' }, 'password'],
        ['contraseña sin número', { password: 'ClaveSegura' }, 'password'],
        ['contraseña sin mayúscula', { password: 'clave2026' }, 'password'],
        ['contraseña sin minúscula', { password: 'CLAVE2026' }, 'password'],
        ['contraseña de más de 72 bytes', { password: `Aa1${'x'.repeat(70)}` }, 'password'],
        ['nombre vacío', { firstName: '   ' }, 'firstName'],
        ['nombre con números', { firstName: 'Ana123' }, 'firstName'],
        ['apellido muy largo', { lastName: 'a'.repeat(61) }, 'lastName'],
        ['nombre que no es texto', { firstName: { $gt: '' } }, 'firstName']
    ]

    for (const [label, override, field] of invalidCases) {
        it(`responde 400 con ${label}`, async () => {
            const { res } = await registerTeacher(app, override)
            assert.equal(res.status, 400)
            assert.equal(res.body.success, false)
            assert.ok(res.body.errors.some((e) => e.field === field), JSON.stringify(res.body.errors))
            assert.equal(store.rows.size, 0)
        })
    }

    it('rechaza campos no permitidos como passwordHash o _id', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...teacherData(), passwordHash: 'x', _id: '507f1f77bcf86cd799439011', role: 'ADMIN' })

        assert.equal(res.status, 400)
        const fields = res.body.errors.map((e) => e.field)
        assert.ok(fields.includes('passwordHash'))
        assert.ok(fields.includes('_id'))
        assert.ok(fields.includes('role'))
        assert.equal(store.rows.size, 0)
    })

    it('responde 400 si no se envía cuerpo', async () => {
        const res = await request(app).post('/api/auth/register')
        assert.equal(res.status, 400)
    })
})

describe('POST /api/auth/login', () => {
    beforeEach(() => { installFakeTeacherStore() })
    afterEach(() => mock.restoreAll())

    it('inicia sesión con credenciales correctas', async () => {
        const { data } = await registerTeacher(app)
        const res = await request(app).post('/api/auth/login').send({ email: data.email, password: data.password })

        assert.equal(res.status, 200)
        assert.equal(res.body.success, true)
        assert.equal(typeof res.body.data.token, 'string')
        assert.equal(res.body.data.teacher.email, data.email)
        assertNoPasswordData(res.body)
    })

    it('ignora mayúsculas y espacios en el correo', async () => {
        const { data } = await registerTeacher(app)
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: `  ${data.email.toUpperCase()} `, password: data.password })
        assert.equal(res.status, 200)
    })

    it('responde el mismo 401 para contraseña incorrecta y correo inexistente', async () => {
        const { data } = await registerTeacher(app)

        const wrongPassword = await request(app)
            .post('/api/auth/login')
            .send({ email: data.email, password: 'Incorrecta1' })
        const unknownEmail = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nadie@escuela.edu.gt', password: 'Incorrecta1' })

        assert.equal(wrongPassword.status, 401)
        assert.equal(unknownEmail.status, 401)
        assert.deepEqual(wrongPassword.body, unknownEmail.body)
        assert.equal(wrongPassword.body.message, 'Correo o contraseña incorrectos')
    })

    it('responde 400 si faltan datos', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'a@b.gt' })
        assert.equal(res.status, 400)
        assert.equal(res.body.errors[0].field, 'password')
    })

    it('rechaza operadores de consulta en lugar de texto', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $ne: null }, password: { $ne: null } })
        assert.equal(res.status, 400)
    })
})

describe('Protección contra intentos repetidos de login', () => {
    beforeEach(() => { installFakeTeacherStore() })
    afterEach(() => mock.restoreAll())

    it('bloquea con 429 tras 5 intentos fallidos, incluso con la contraseña correcta', async () => {
        const { data } = await registerTeacher(app)
        const attempt = (password) => request(app).post('/api/auth/login').send({ email: data.email, password })

        for (let i = 0; i < 5; i += 1) {
            assert.equal((await attempt('Incorrecta1')).status, 401)
        }

        const blocked = await attempt(data.password)
        assert.equal(blocked.status, 429)
        assert.equal(blocked.body.success, false)
        assert.match(blocked.body.message, /Demasiados intentos/)
    })

    it('el bloqueo de un correo no afecta a otro docente', async () => {
        const victim = await registerTeacher(app)
        const other = await registerTeacher(app)

        for (let i = 0; i < 6; i += 1) {
            await request(app).post('/api/auth/login').send({ email: victim.data.email, password: 'Incorrecta1' })
        }

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: other.data.email, password: other.data.password })
        assert.equal(res.status, 200)
    })

    it('los inicios de sesión exitosos no consumen intentos', async () => {
        const { data } = await registerTeacher(app)
        for (let i = 0; i < 8; i += 1) {
            const res = await request(app).post('/api/auth/login').send({ email: data.email, password: data.password })
            assert.equal(res.status, 200)
        }
    })
})

describe('GET /api/auth/me', () => {
    let store
    beforeEach(() => { store = installFakeTeacherStore() })
    afterEach(() => mock.restoreAll())

    it('devuelve el docente autenticado sin passwordHash', async () => {
        const { token, teacher } = await registerTeacher(app)
        const res = await request(app).get('/api/auth/me').set(bearer(token))

        assert.equal(res.status, 200)
        assert.equal(res.body.data.teacher.id, teacher.id)
        assert.equal(res.body.data.teacher.email, teacher.email)
        assertNoPasswordData(res.body)
    })

    it('responde 401 sin cabecera Authorization', async () => {
        const res = await request(app).get('/api/auth/me')
        assert.equal(res.status, 401)
        assert.equal(res.body.success, false)
    })

    it('responde 401 si el esquema no es Bearer', async () => {
        const { token } = await registerTeacher(app)
        const res = await request(app).get('/api/auth/me').set('Authorization', token)
        assert.equal(res.status, 401)
    })

    it('responde 401 con un token alterado', async () => {
        const { token } = await registerTeacher(app)
        const tampered = `${token.slice(0, -2)}xx`
        const res = await request(app).get('/api/auth/me').set(bearer(tampered))
        assert.equal(res.status, 401)
    })

    it('responde 401 con un token firmado con otro secreto', async () => {
        const { teacher } = await registerTeacher(app)
        const forged = jwt.sign({}, 'otro-secreto-cualquiera-de-32-caracteres', { subject: teacher.id })
        const res = await request(app).get('/api/auth/me').set(bearer(forged))
        assert.equal(res.status, 401)
    })

    it('responde 401 con un token sin firma (alg none)', async () => {
        const { teacher } = await registerTeacher(app)
        const unsigned = jwt.sign({ sub: teacher.id }, null, { algorithm: 'none' })
        const res = await request(app).get('/api/auth/me').set(bearer(unsigned))
        assert.equal(res.status, 401)
    })

    it('responde 401 con mensaje de sesión expirada', async () => {
        const { teacher } = await registerTeacher(app)
        const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, { subject: teacher.id })
        const res = await request(app).get('/api/auth/me').set(bearer(expired))
        assert.equal(res.status, 401)
        assert.match(res.body.message, /expiró/)
    })

    it('responde 401 si el docente del token ya no existe', async () => {
        const { token, teacher } = await registerTeacher(app)
        store.remove(teacher.id)
        const res = await request(app).get('/api/auth/me').set(bearer(token))
        assert.equal(res.status, 401)
    })

    it('responde 401 si el token tiene un id inválido', async () => {
        const token = jwt.sign({}, SECRET, { subject: 'no-es-un-id' })
        const res = await request(app).get('/api/auth/me').set(bearer(token))
        assert.equal(res.status, 401)
    })
})
