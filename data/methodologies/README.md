# Metodologías predeterminadas

`mineduc-defaults.json` contiene las 4 estrategias de aprendizaje predeterminadas de edTech, tomadas de:

> Ministerio de Educación de Guatemala (MINEDUC), Dirección General de Gestión de Calidad Educativa (2010).
> *Metodología del Aprendizaje*, serie *El Currículo organizado en competencias*, sección 1.4, pp. 16–19.
> https://digecur.mineduc.gob.gt/wp-content/uploads/2025/03/Metodologia-del-Aprendizaje.pdf

| Estrategia | Sección | Página |
|---|---|---|
| Diálogo de saberes | 1.4.1 | 16 |
| Mundo letrado | 1.4.2 | 17 |
| Rincones de aprendizaje | 1.4.3 | 18 |
| Aprendizaje cooperativo | 1.4.4 | 19 |

## Qué viene de la fuente y qué no

Los textos son **paráfrasis** de la fuente, no citas textuales. Cada estrategia explica en
`sourceReference.notes` qué partes provienen del documento y cuáles son adaptación:

- **Definición, propósitos, actividades y materiales**: de la fuente.
- **Pasos**: la fuente solo describe un procedimiento para *Rincones de aprendizaje*. En las otras
  tres, los pasos fueron **redactados por edTech** a partir de la descripción y del rol docente.
- **Duración**: la fuente no la indica, por eso `estimatedDuration` es `null`.
- **Preferencias de aprendizaje**: orientación de edTech, no provienen de la fuente. Siempre son al
  menos dos, porque ninguna metodología es exclusiva de un estilo de aprendizaje.

`metadata.reviewedBy` está en `null`: conviene que una persona con formación pedagógica revise el
contenido contra el documento antes de usarlo en producción.

## Cargar o actualizar

```bash
npm run methodologies:seed               # usa este archivo
npm run methodologies:seed -- --dry-run  # solo valida
```

La carga usa `defaultKey` para actualizar sin duplicar. Las predeterminadas se cargan como
**generales** (sin materias ni grados específicos) y sin autor; los docentes no pueden editarlas.
Exige para cada una: título, institución, año, páginas y URL de la fuente.
