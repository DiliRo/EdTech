import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    round, toPercentage, mean, median, summarize, trend, isBelowThreshold, completionRate
} from '../../src/utils/performance.js'

describe('Cálculos de rendimiento', () => {
    it('round redondea a 2 decimales y deja null si no hay valor', () => {
        assert.equal(round(71.66666), 71.67)
        assert.equal(round(1.005), 1.01)
        assert.equal(round(null), null)
        assert.equal(round(Number.NaN), null)
    })

    it('toPercentage calcula el porcentaje de logro', () => {
        assert.equal(toPercentage(15, 20), 75)
        assert.equal(toPercentage(0, 20), 0)
        assert.equal(toPercentage(20, 20), 100)
        assert.equal(toPercentage(2, 3), 66.67)
        assert.throws(() => toPercentage(5, 0))
    })

    it('mean ignora valores faltantes en lugar de contarlos como cero', () => {
        assert.equal(mean([50, 75, 90]), 71.67)
        assert.equal(mean([50, null, undefined, 90]), 70)
        assert.equal(mean([]), null)
        assert.equal(mean([null]), null)
    })

    it('median con cantidad par e impar', () => {
        assert.equal(median([90, 50, 75]), 75)
        assert.equal(median([40, 90, 50, 75]), 62.5)
        assert.equal(median([]), null)
    })

    it('summarize reúne conteo, promedio, mediana, mínimo y máximo', () => {
        assert.deepEqual(summarize([50, 75, 90]), { count: 3, average: 71.67, median: 75, min: 50, max: 90 })
        assert.deepEqual(summarize([]), { count: 0, average: null, median: null, min: null, max: null })
    })

    it('trend compara el último resultado con el primero', () => {
        assert.deepEqual(trend([50, 75, 90]), { change: 40, direction: 'up' })
        assert.deepEqual(trend([80, 60]), { change: -20, direction: 'down' })
        assert.deepEqual(trend([70, 90, 72]), { change: 2, direction: 'stable' })
        assert.deepEqual(trend([70, 75]), { change: 5, direction: 'up' })
        assert.deepEqual(trend([70, 65]), { change: -5, direction: 'down' })
    })

    it('trend necesita al menos dos resultados', () => {
        assert.deepEqual(trend([80]), { change: null, direction: null })
        assert.deepEqual(trend([]), { change: null, direction: null })
    })

    it('isBelowThreshold nunca señala la falta de datos', () => {
        assert.equal(isBelowThreshold(59.99, 60), true)
        assert.equal(isBelowThreshold(60, 60), false)
        assert.equal(isBelowThreshold(null, 60), false)
        assert.equal(isBelowThreshold(undefined, 60), false)
    })

    it('completionRate es null si no se esperaba ninguna calificación', () => {
        assert.equal(completionRate(5, 10), 50)
        assert.equal(completionRate(2, 3), 66.67)
        assert.equal(completionRate(0, 0), null)
    })
})
