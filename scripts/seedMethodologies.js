#!/usr/bin/env node
/**
 * Carga o actualiza las metodologías predeterminadas.
 *
 * Uso:
 *   npm run methodologies:seed                       # usa data/methodologies/mineduc-defaults.json
 *   npm run methodologies:seed -- <archivo.json> [--dry-run]
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../src/config/env.js'
import { connectDB, disconnectDB } from '../src/config/db.js'
import TeachingMethod from '../src/models/teachingMethod.model.js'
import { seedDefaultMethods, MethodologySeedError } from '../src/services/methodologySeed.service.js'

const DEFAULT_FILE = 'data/methodologies/mineduc-defaults.json'

const fail = (message, errors = []) => {
    console.error(`\n✖ ${message}`)
    for (const e of errors.slice(0, 50)) console.error(`  - ${e.path}: ${e.message}`)
    process.exitCode = 1
}

const main = async () => {
    const args = process.argv.slice(2)
    const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? DEFAULT_FILE)
    const dryRun = args.includes('--dry-run')

    if (!env.mongodbUri) return fail('Falta MONGODB_URI en el archivo .env')

    let data
    try {
        data = JSON.parse(await readFile(file, 'utf8'))
    } catch (err) {
        return fail(err instanceof SyntaxError ? `JSON inválido: ${err.message}` : `No se pudo leer el archivo: ${err.message}`)
    }

    try {
        await connectDB(env.mongodbUri)
        await TeachingMethod.syncIndexes()
        const summary = await seedDefaultMethods(data, { dryRun })
        console.log(`\n✔ ${dryRun ? 'Validación correcta (no se escribió nada)' : 'Metodologías predeterminadas cargadas'}`)
        console.log(`  recibidas: ${summary.received}${dryRun ? '' : `  creadas: ${summary.created}  actualizadas: ${summary.updated}`}`)
    } catch (err) {
        if (err instanceof MethodologySeedError) fail(err.message, err.errors)
        else fail(`Error al cargar: ${err.message}`)
    } finally {
        await disconnectDB().catch(() => {})
    }
}

main()
