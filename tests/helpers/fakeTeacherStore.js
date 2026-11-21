import { mock } from 'node:test'
import Teacher from '../../src/models/teacher.model.js'

/**
 * Reemplaza los accesos a MongoDB del modelo Teacher por un almacén en memoria.
 * Mantiene la validación real del esquema (enum, required, trim, lowercase),
 * el `toJSON` real y el comportamiento de `select: false` de passwordHash.
 * Llamar a `mock.restoreAll()` en afterEach.
 */
export const installFakeTeacherStore = () => {
    const rows = new Map()

    const hydrate = (row, { withPassword = false } = {}) => {
        if (!row) return null
        const data = { ...row }
        if (withPassword) return Teacher.hydrate(data)
        // Igual que Mongoose: el campo queda "no seleccionado" y no se valida ni se pierde al guardar.
        delete data.passwordHash
        return Teacher.hydrate(data, { passwordHash: 0 })
    }

    const findRowByEmail = (email) =>
        [...rows.values()].find((row) => row.email === String(email).toLowerCase()) || null

    mock.method(Teacher, 'exists', async ({ email }) => {
        const row = findRowByEmail(email)
        return row ? { _id: row._id } : null
    })

    mock.method(Teacher, 'findOne', ({ email }) => ({
        select: async (projection) =>
            hydrate(findRowByEmail(email), { withPassword: String(projection).includes('+passwordHash') })
    }))

    mock.method(Teacher, 'findById', async (id) => hydrate(rows.get(String(id))))

    mock.method(Teacher.prototype, 'save', async function save() {
        await this.validate()

        const id = this._id.toString()
        const duplicate = findRowByEmail(this.email)
        if (duplicate && duplicate._id.toString() !== id) {
            const err = new Error('E11000 duplicate key error')
            err.code = 11000
            err.keyPattern = { email: 1 }
            throw err
        }

        const now = new Date()
        const current = this.toObject({ transform: false, depopulate: true })
        const previous = rows.get(id) || {}
        rows.set(id, {
            ...previous,
            ...current,
            createdAt: previous.createdAt || now,
            updatedAt: now
        })
        return this
    })

    return {
        rows,
        getByEmail: (email) => findRowByEmail(email),
        remove: (id) => rows.delete(String(id))
    }
}
