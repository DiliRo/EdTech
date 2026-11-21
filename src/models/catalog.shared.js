import { Schema } from 'mongoose'
import { CATALOG_SOURCES } from '../config/curriculum.js'

/** Procedencia de un registro del catálogo: de qué documento y versión se importó. */
export const sourceSchema = new Schema(
    {
        type: { type: String, enum: CATALOG_SOURCES, required: true },
        document: { type: String, trim: true },
        version: { type: String, trim: true },
        url: { type: String, trim: true },
        importedAt: { type: Date, required: true }
    },
    { _id: false }
)

/** Oculta campos internos y expone `id` en lugar de `_id`. */
export const catalogToJSON = {
    virtuals: false,
    transform: (doc, ret) => {
        if (ret._id) {
            ret.id = ret._id.toString()
            delete ret._id
        }
        delete ret.__v
        return ret
    }
}
