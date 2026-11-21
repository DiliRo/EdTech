import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import Teacher from '../../src/models/teacher.model.js'
import { LANGUAGES, LANGUAGE_CODES, DEFAULT_LANGUAGE, isSupportedLanguage } from '../../src/config/languages.js'

const valid = () => ({
    firstName: ' Ana ',
    lastName: 'Ixcot',
    email: ' ANA@Escuela.edu.gt ',
    passwordHash: '$2b$12$hashdepruebahashdepruebahashdepruebahashdeprueba1234'
})

describe('Modelo Teacher', () => {
    it('normaliza correo y nombres y usa español por defecto', async () => {
        const teacher = new Teacher(valid())
        await teacher.validate()

        assert.equal(teacher.email, 'ana@escuela.edu.gt')
        assert.equal(teacher.firstName, 'Ana')
        assert.equal(teacher.preferredLanguage, DEFAULT_LANGUAGE)
    })

    it('nunca incluye passwordHash en toJSON ni toObject', () => {
        const teacher = new Teacher(valid())
        const json = teacher.toJSON()
        const obj = teacher.toObject()

        assert.equal(json.passwordHash, undefined)
        assert.equal(obj.passwordHash, undefined)
        assert.ok(!JSON.stringify(teacher).includes('passwordHash'))
        assert.equal(typeof json.id, 'string')
        assert.equal(json._id, undefined)
    })

    it('excluye passwordHash de las consultas por defecto', () => {
        assert.equal(Teacher.schema.path('passwordHash').options.select, false)
    })

    it('rechaza idiomas fuera de la lista central', async () => {
        const teacher = new Teacher({ ...valid(), preferredLanguage: 'en' })
        await assert.rejects(teacher.validate(), /Idioma no soportado/)
    })

    it('exige los campos obligatorios', async () => {
        await assert.rejects(new Teacher({}).validate(), (err) => {
            for (const field of ['firstName', 'lastName', 'email', 'passwordHash']) {
                assert.ok(err.errors[field], `falta error para ${field}`)
            }
            return true
        })
    })

    it('el correo tiene índice único', () => {
        assert.equal(Teacher.schema.path('email').options.unique, true)
    })
})

describe('Idiomas centralizados', () => {
    it('incluye exactamente los 5 idiomas de la plataforma', () => {
        assert.deepEqual(LANGUAGE_CODES, ['es', 'kek', 'quc', 'mam', 'cak'])
        assert.equal(LANGUAGES.length, 5)
    })

    it('valida códigos', () => {
        assert.equal(isSupportedLanguage('mam'), true)
        assert.equal(isSupportedLanguage('en'), false)
        assert.equal(isSupportedLanguage(undefined), false)
    })

    it('la lista no se puede modificar en tiempo de ejecución', () => {
        assert.throws(() => { LANGUAGE_CODES.push('en') })
    })
})
