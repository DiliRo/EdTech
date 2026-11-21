/**
 * Idiomas de la interfaz. Fuente única de verdad para el backend:
 * modelos, validadores y cualquier módulo futuro deben importar de aquí.
 *
 * Códigos (estándar ISO 639; los idiomas mayas no tienen código de 2 letras):
 *  - `es`  Español   (ISO 639-1)
 *  - `kek` Q'eqchi'  (ISO 639-3)
 *  - `quc` K'iche'   (ISO 639-3)
 *  - `mam` Mam       (ISO 639-3)
 *  - `cak` Kaqchikel (ISO 639-3)
 *
 * `name` es el nombre con que se conoce cada idioma; las traducciones de la
 * interfaz NO se definen aquí.
 */
export const LANGUAGES = Object.freeze([
    Object.freeze({ code: 'es', name: 'Español' }),
    Object.freeze({ code: 'kek', name: "Q'eqchi'" }),
    Object.freeze({ code: 'quc', name: "K'iche'" }),
    Object.freeze({ code: 'mam', name: 'Mam' }),
    Object.freeze({ code: 'cak', name: 'Kaqchikel' })
])

export const LANGUAGE_CODES = Object.freeze(LANGUAGES.map((language) => language.code))

export const DEFAULT_LANGUAGE = 'es'

export const isSupportedLanguage = (code) => LANGUAGE_CODES.includes(code)
