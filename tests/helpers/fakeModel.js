import { mock } from 'node:test'
import { Types } from 'mongoose'

const toKey = (value) => (value === null || value === undefined ? value : String(value))

/** Lee un campo, admitiendo rutas con punto (p. ej. "estimatedDuration.minMinutes"). */
const getPath = (row, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), row)

/** Compara un valor guardado con una condición de filtro (igualdad, $in, $ne, $size, $lte, $gte, arrays). */
const matchesValue = (stored, condition) => {
    const isOperator =
        condition && typeof condition === 'object' && !(condition instanceof Types.ObjectId) && !Array.isArray(condition)

    if (isOperator) {
        return Object.entries(condition).every(([op, arg]) => {
            switch (op) {
                case '$in': {
                    const wanted = arg.map(toKey)
                    return Array.isArray(stored) ? stored.some((v) => wanted.includes(toKey(v))) : wanted.includes(toKey(stored))
                }
                case '$ne': return toKey(stored) !== toKey(arg)
                case '$size': return Array.isArray(stored) && stored.length === arg
                case '$lte': return stored !== undefined && stored !== null && stored <= arg
                case '$gte': return stored !== undefined && stored !== null && stored >= arg
                default: throw new Error(`Operador no soportado por el fake: ${op}`)
            }
        })
    }
    if (Array.isArray(stored)) return stored.some((v) => toKey(v) === toKey(condition))
    return toKey(stored) === toKey(condition)
}

const matches = (row, filter = {}) =>
    Object.entries(filter).every(([field, cond]) => {
        if (field === '$or') return cond.some((sub) => matches(row, sub))
        if (field === '$and') return cond.every((sub) => matches(row, sub))
        return matchesValue(getPath(row, field), cond)
    })

const compareBy = (sort) => (a, b) => {
    for (const [field, direction] of Object.entries(sort)) {
        if (a[field] < b[field]) return -direction
        if (a[field] > b[field]) return direction
    }
    return 0
}

/**
 * Reemplaza el acceso a MongoDB de un modelo por un almacén en memoria.
 * Conserva la validación real del esquema, `toJSON`, timestamps e índices únicos declarados.
 *
 * @param {import('mongoose').Model} Model
 * @param {{ unique?: string[][] }} [options] combinaciones de campos con índice único
 */
export const installFakeModel = (Model, { unique = [] } = {}) => {
    const rows = new Map()
    const copy = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]))
    const hydrate = (row) => (row ? Model.hydrate(copy(row)) : null)

    const query = (resolveRows, { single = false } = {}) => {
        let sort = null
        const chain = {
            populate: () => chain,
            select: () => chain,
            lean: () => chain,
            skip: () => chain,
            limit: () => chain,
            sort: (value) => {
                sort = value
                return chain
            },
            then: (resolve, reject) => {
                try {
                    let result = resolveRows()
                    if (sort) result = [...result].sort(compareBy(sort))
                    const docs = result.map(hydrate)
                    resolve(single ? docs[0] ?? null : docs)
                } catch (err) {
                    reject(err)
                }
            }
        }
        return chain
    }

    const filterRows = (filter) => [...rows.values()].filter((row) => matches(row, filter))

    mock.method(Model, 'find', (filter = {}) => query(() => filterRows(filter)))
    mock.method(Model, 'findOne', (filter = {}) => query(() => filterRows(filter), { single: true }))
    mock.method(Model, 'findById', (id) =>
        query(() => (Types.ObjectId.isValid(id) && rows.has(String(id)) ? [rows.get(String(id))] : []), { single: true }))
    mock.method(Model, 'exists', async (filter = {}) => {
        const row = filterRows(filter)[0]
        return row ? { _id: row._id } : null
    })
    mock.method(Model, 'countDocuments', async (filter = {}) => filterRows(filter).length)

    mock.method(Model.prototype, 'save', async function save() {
        await this.validate()
        const id = this._id.toString()
        const data = this.toObject({ transform: false, virtuals: false, depopulate: true })

        for (const fields of unique) {
            const clash = [...rows.values()].find(
                (row) => row._id.toString() !== id && fields.every((f) => toKey(row[f]) === toKey(data[f]))
            )
            if (clash) {
                const err = new Error('E11000 duplicate key error')
                err.code = 11000
                err.keyPattern = Object.fromEntries(fields.map((f) => [f, 1]))
                throw err
            }
        }

        const now = new Date()
        const previous = rows.get(id)
        const stored = { ...data }
        if (Model.schema.options.timestamps) {
            stored.createdAt = previous?.createdAt ?? now
            stored.updatedAt = now
        }
        rows.set(id, stored)
        // createdAt es inmutable en Mongoose: se asigna antes de marcar el documento como guardado.
        if (Model.schema.options.timestamps) {
            this.createdAt = stored.createdAt
            this.updatedAt = stored.updatedAt
        }
        this.isNew = false
        return this
    })

    return {
        rows,
        /** Inserta documentos directamente (validados) para preparar escenarios. */
        seed: async (...docs) => {
            const saved = []
            for (const data of docs) {
                const doc = new Model(data)
                await doc.save()
                saved.push(doc)
            }
            return saved
        },
        get: (id) => rows.get(String(id))
    }
}
