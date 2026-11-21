import TeachingMethod from '../models/teachingMethod.model.js'
import { DEFAULT_KEY_REGEX } from '../config/methodology.js'

export class MethodologySeedError extends Error {
    constructor(message, errors = []) {
        super(message)
        this.name = 'MethodologySeedError'
        this.errors = errors
    }
}

const METHOD_FIELDS = [
    'defaultKey', 'name', 'description', 'objectives', 'steps', 'suggestedActivities',
    'materials', 'estimatedDuration', 'learningPreferences', 'sourceReference'
]

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Valida el archivo de metodologías predeterminadas. Usa la validación real del
 * modelo (enum, límites, fuente obligatoria) más reglas propias del archivo.
 * Las predeterminadas se cargan como generales: sin materias ni grados específicos.
 */
export const validateDefaultsFile = async (data) => {
    const errors = []
    const add = (path, message) => errors.push({ path, message })

    if (!isPlainObject(data) || !Array.isArray(data.methods)) {
        add('methods', 'El archivo debe tener una lista "methods"')
        return errors
    }
    for (const key of Object.keys(data)) {
        if (!['metadata', 'methods'].includes(key)) add(key, 'Campo no permitido')
    }
    if (!data.methods.length) add('methods', 'La lista está vacía')

    const keys = new Set()
    for (const [i, method] of data.methods.entries()) {
        const path = `methods[${i}]`
        if (!isPlainObject(method)) {
            add(path, 'Debe ser un objeto')
            continue
        }
        for (const key of Object.keys(method)) {
            if (!METHOD_FIELDS.includes(key)) add(`${path}.${key}`, 'Campo no permitido')
        }
        if (typeof method.defaultKey !== 'string' || !DEFAULT_KEY_REGEX.test(method.defaultKey)) {
            add(`${path}.defaultKey`, 'Clave inválida (minúsculas, números y guiones)')
        } else if (keys.has(method.defaultKey)) {
            add(`${path}.defaultKey`, `Clave "${method.defaultKey}" repetida`)
        } else {
            keys.add(method.defaultKey)
        }

        const ref = method.sourceReference
        if (!isPlainObject(ref) || !ref.title || !ref.institution || !ref.year || !ref.pages || !ref.url) {
            add(`${path}.sourceReference`, 'Indica título, institución, año, páginas y URL de la fuente')
        }

        try {
            await new TeachingMethod(toDocument(method)).validate()
        } catch (err) {
            for (const [field, e] of Object.entries(err.errors ?? {})) add(`${path}.${field}`, e.message)
        }
    }
    return errors
}

const toDocument = (method) => ({
    ...Object.fromEntries(METHOD_FIELDS.filter((f) => f in method).map((f) => [f, method[f]])),
    isDefault: true,
    createdBy: null,
    compatibleSubjects: [],
    compatibleGrades: [],
    isActive: true
})

/**
 * Carga o actualiza las metodologías predeterminadas por `defaultKey`.
 * Es repetible: volver a cargar el mismo archivo no crea duplicados.
 * No toca metodologías personalizadas.
 */
export const seedDefaultMethods = async (data, { dryRun = false } = {}) => {
    const errors = await validateDefaultsFile(data)
    if (errors.length) throw new MethodologySeedError('El archivo de metodologías no es válido', errors)

    const summary = { dryRun, received: data.methods.length, created: 0, updated: 0 }
    if (dryRun) return summary

    for (const method of data.methods) {
        const doc = toDocument(method)
        const existing = await TeachingMethod.findOne({ isDefault: true, defaultKey: method.defaultKey })
        if (existing) {
            for (const field of METHOD_FIELDS) {
                if (field !== 'defaultKey') existing[field] = doc[field] ?? (field === 'estimatedDuration' || field === 'sourceReference' ? null : [])
            }
            existing.isActive = true
            await existing.save()
            summary.updated += 1
        } else {
            await new TeachingMethod(doc).save()
            summary.created += 1
        }
    }
    return summary
}
