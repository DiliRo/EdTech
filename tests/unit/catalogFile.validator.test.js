import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { validateCatalogFile } from '../../src/validators/catalogFile.validator.js'

const sampleFile = JSON.parse(await readFile(new URL('../../data/catalog/sample.catalog.json', import.meta.url), 'utf8'))
const clone = (value) => structuredClone(value)

const hasError = (result, path, pattern) =>
    result.errors.some((e) => e.path === path && (!pattern || pattern.test(e.message)))

/** Catálogo oficial mínimo y válido. Los textos son marcadores de la prueba, no contenido del CNB. */
const officialCatalog = () => ({
    metadata: { source: 'cnb', document: 'Documento X', version: '2026' },
    grades: [{ number: 1, name: 'Primer grado' }],
    subjects: [{ code: 'materia-a', name: 'Materia A', grades: [1] }],
    topics: [
        {
            code: 'tema-a',
            name: 'Tema A',
            grade: 1,
            subject: 'materia-a',
            competencies: [{ code: '1', description: 'Texto A' }],
            achievementIndicators: [{ code: '1.1', competencyCode: '1', description: 'Texto B' }],
            curriculumReference: { document: 'Documento X', page: 10 }
        }
    ]
})

describe('validateCatalogFile', () => {
    it('acepta el catálogo de prueba incluido en el repositorio', () => {
        const result = validateCatalogFile(sampleFile)
        assert.deepEqual(result.errors, [])
        assert.equal(result.valid, true)
    })

    it('acepta un catálogo oficial completo', () => {
        assert.deepEqual(validateCatalogFile(officialCatalog()).errors, [])
    })

    it('rechaza algo que no es un objeto', () => {
        for (const value of [null, [], 'texto', 5]) {
            assert.equal(validateCatalogFile(value).valid, false)
        }
    })

    it('exige metadata y un origen válido', () => {
        assert.ok(hasError(validateCatalogFile({ grades: [] }), 'metadata'))
        const data = officialCatalog()
        data.metadata.source = 'internet'
        assert.ok(hasError(validateCatalogFile(data), 'metadata.source'))
    })

    it('rechaza un archivo vacío', () => {
        const result = validateCatalogFile({ metadata: { source: 'sample' } })
        assert.ok(hasError(result, '', /no contiene/))
    })

    it('rechaza campos no permitidos en cualquier nivel', () => {
        const data = officialCatalog()
        data.extra = 1
        data.topics[0].isSample = false
        data.topics[0].competencies[0].nivel = 'x'
        const result = validateCatalogFile(data)
        assert.ok(hasError(result, 'extra'))
        assert.ok(hasError(result, 'topics[0].isSample'))
        assert.ok(hasError(result, 'topics[0].competencies[0].nivel'))
    })

    describe('catálogo oficial (cnb)', () => {
        it('exige documento y versión', () => {
            const data = officialCatalog()
            delete data.metadata.document
            delete data.metadata.version
            const result = validateCatalogFile(data)
            assert.ok(hasError(result, 'metadata.document'))
            assert.ok(hasError(result, 'metadata.version'))
        })

        it('exige referencia curricular con página o URL en cada tema', () => {
            const sinReferencia = officialCatalog()
            delete sinReferencia.topics[0].curriculumReference
            assert.ok(hasError(validateCatalogFile(sinReferencia), 'topics[0].curriculumReference'))

            const sinPagina = officialCatalog()
            sinPagina.topics[0].curriculumReference = { document: 'Documento X' }
            assert.ok(hasError(validateCatalogFile(sinPagina), 'topics[0].curriculumReference', /página o la URL/))
        })

        it('no permite datos marcados como prueba', () => {
            const data = officialCatalog()
            data.topics[0].competencies[0].description = '[PRUEBA] algo'
            assert.ok(hasError(validateCatalogFile(data), 'topics[0].competencies[0].description', /no puede contener/))
        })

        it('valida URLs', () => {
            const data = officialCatalog()
            data.topics[0].curriculumReference.url = 'javascript:alert(1)'
            assert.ok(hasError(validateCatalogFile(data), 'topics[0].curriculumReference.url'))
        })
    })

    describe('catálogo de prueba (sample)', () => {
        it('exige la marca [PRUEBA] en nombres, competencias e indicadores', () => {
            const data = clone(sampleFile)
            data.subjects[0].name = 'Matemáticas'
            data.topics[0].name = 'Tema sin marca'
            data.topics[0].competencies[0].description = 'Competencia sin marca'
            data.topics[0].achievementIndicators[0].description = 'Indicador sin marca'
            const result = validateCatalogFile(data)

            assert.ok(hasError(result, 'subjects[0].name', /\[PRUEBA\]/))
            assert.ok(hasError(result, 'topics[0].name', /\[PRUEBA\]/))
            assert.ok(hasError(result, 'topics[0].competencies[0].description', /\[PRUEBA\]/))
            assert.ok(hasError(result, 'topics[0].achievementIndicators[0].description', /\[PRUEBA\]/))
        })

        it('no exige referencia curricular', () => {
            const data = clone(sampleFile)
            delete data.topics[0].curriculumReference
            assert.equal(validateCatalogFile(data).valid, true)
        })
    })

    describe('grados, materias y temas', () => {
        it('solo acepta grados de primaria del 1 al 6', () => {
            const data = officialCatalog()
            data.grades.push({ number: 7, name: 'Séptimo' }, { number: 0, name: 'Cero' }, { number: 2.5, name: 'x' })
            const result = validateCatalogFile(data)
            assert.ok(hasError(result, 'grades[1].number'))
            assert.ok(hasError(result, 'grades[2].number'))
            assert.ok(hasError(result, 'grades[3].number'))
        })

        it('detecta grados, materias y temas repetidos', () => {
            const data = officialCatalog()
            data.grades.push({ number: 1, name: 'Otro' })
            data.subjects.push({ ...data.subjects[0] })
            data.topics.push(clone(data.topics[0]))
            const result = validateCatalogFile(data)
            assert.ok(hasError(result, 'grades[1].number', /repetido/))
            assert.ok(hasError(result, 'subjects[1].code', /repetida/))
            assert.ok(hasError(result, 'topics[1].code', /repetido/))
        })

        it('rechaza un tema en un grado que su materia no incluye', () => {
            const data = officialCatalog()
            data.grades.push({ number: 2, name: 'Segundo grado' })
            data.topics[0].grade = 2
            assert.ok(hasError(validateCatalogFile(data), 'topics[0].grade', /no incluye el grado 2/))
        })

        it('valida el formato de los códigos', () => {
            const data = officialCatalog()
            data.subjects[0].code = 'Matemáticas 1'
            data.topics[0].code = '$where'
            const result = validateCatalogFile(data)
            assert.ok(hasError(result, 'subjects[0].code'))
            assert.ok(hasError(result, 'topics[0].code'))
        })

        it('exige descripción en competencias e indicadores', () => {
            const data = officialCatalog()
            data.topics[0].competencies = [{ code: '1' }]
            data.topics[0].achievementIndicators = [{ code: '1.1', description: '  ' }]
            const result = validateCatalogFile(data)
            assert.ok(hasError(result, 'topics[0].competencies[0].description'))
            assert.ok(hasError(result, 'topics[0].achievementIndicators[0].description'))
        })

        it('limita la longitud de los textos', () => {
            const data = officialCatalog()
            data.topics[0].name = 'a'.repeat(151)
            assert.ok(hasError(validateCatalogFile(data), 'topics[0].name', /150/))
        })
    })
})
