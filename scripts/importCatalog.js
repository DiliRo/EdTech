#!/usr/bin/env node
/**
 * Importa un catálogo curricular desde un archivo JSON.
 *
 * Uso:
 *   npm run catalog:import -- <archivo.json> [--dry-run] [--allow-sample]
 *
 *   --dry-run       valida el archivo y las referencias sin escribir nada
 *   --allow-sample  necesario para importar datos de prueba cuando NODE_ENV=production
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { env, isProduction } from '../src/config/env.js'
import { connectDB, disconnectDB } from '../src/config/db.js'
import { importCatalog, CatalogImportError } from '../src/services/catalogImport.service.js'
import Grade from '../src/models/grade.model.js'
import Subject from '../src/models/subject.model.js'
import Topic from '../src/models/topic.model.js'

const MAX_FILE_BYTES = 5 * 1024 * 1024

const fail = (message, errors = []) => {
    console.error(`\n✖ ${message}`)
    for (const e of errors.slice(0, 50)) console.error(`  - ${e.path || '(raíz)'}: ${e.message}`)
    if (errors.length > 50) console.error(`  ... y ${errors.length - 50} errores más`)
    process.exitCode = 1
}

const main = async () => {
    const args = process.argv.slice(2)
    const file = args.find((a) => !a.startsWith('--'))
    const dryRun = args.includes('--dry-run')
    const allowSample = args.includes('--allow-sample')

    if (!file) return fail('Indica el archivo: npm run catalog:import -- <archivo.json> [--dry-run]')
    if (!env.mongodbUri) return fail('Falta MONGODB_URI en el archivo .env')

    const filePath = path.resolve(file)
    let data
    try {
        const info = await stat(filePath)
        if (info.size > MAX_FILE_BYTES) return fail('El archivo supera 5 MB')
        data = JSON.parse(await readFile(filePath, 'utf8'))
    } catch (err) {
        return fail(err instanceof SyntaxError ? `JSON inválido: ${err.message}` : `No se pudo leer el archivo: ${err.message}`)
    }

    if (data?.metadata?.source === 'sample' && isProduction() && !allowSample) {
        return fail('Estás en producción e intentas importar datos de PRUEBA. Usa --allow-sample si es intencional.')
    }

    try {
        await connectDB(env.mongodbUri)
        await Promise.all([Grade.syncIndexes(), Subject.syncIndexes(), Topic.syncIndexes()])

        const summary = await importCatalog(data, { dryRun })

        console.log(`\n✔ ${dryRun ? 'Validación correcta (no se escribió nada)' : 'Catálogo importado'}`)
        console.log(`  Origen: ${summary.source === 'sample' ? 'DATOS DE PRUEBA (no oficiales)' : 'CNB'}`)
        for (const key of ['grades', 'subjects', 'topics']) {
            const { received, created = 0, updated = 0 } = summary[key]
            console.log(`  ${key.padEnd(8)} recibidos: ${received}${dryRun ? '' : `  creados: ${created}  actualizados: ${updated}`}`)
        }
    } catch (err) {
        if (err instanceof CatalogImportError) fail(err.message, err.errors)
        else fail(`Error al importar: ${err.message}`)
    } finally {
        await disconnectDB().catch(() => {})
    }
}

main()
