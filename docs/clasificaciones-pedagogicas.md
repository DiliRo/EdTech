# Clasificaciones pedagógicas del seguimiento de estrategias

El módulo de seguimiento (`/api/teaching-experiments`) permite etiquetar cada uno de los cuatro
períodos mensuales con una **categoría pedagógica** que describe el énfasis de la enseñanza en ese
mes. Este documento explica qué significan esas categorías y qué no significan.

## Una sola clasificación por experimento

Hay dos clasificaciones disponibles, definidas en `src/config/pedagogy.js`:

| Clave | Nombre | Categorías | Fuente |
|---|---|---|---|
| `vark` | VARK | visual, auditivo, lectoescritura, kinestésico | Fleming y Mills (1992) |
| `honey-alonso` | Honey-Alonso (CHAEA) | activo, reflexivo, teórico, pragmático | Alonso, Gallego y Honey (1994) |

- La clasificación se elige al **crear** el experimento (campo `classification`) y **no se puede
  cambiar** después. Por defecto se usa `PEDAGOGICAL_CLASSIFICATION` (`vark` si no se configura).
- Todas las categorías de un experimento pertenecen a esa clasificación: la API rechaza, por
  ejemplo, un período `visual` en un experimento `honey-alonso`. **Nunca se mezclan VARK y Honey-Alonso.**
- Para agregar otra clasificación, añádela en `CLASSIFICATIONS` con su fuente bibliográfica.

## Qué describe una categoría

La categoría describe **cómo planificó el docente la enseñanza del período** (por ejemplo, "en
marzo se priorizaron actividades con material concreto"). **No** describe a los estudiantes.

- Los resultados del experimento **no identifican** un estilo de aprendizaje fijo ni predominante
  del grupo ni de ningún estudiante.
- La evidencia de investigación no respalda que adaptar la enseñanza al "estilo" de cada estudiante
  mejore el aprendizaje (ver la revisión de Pashler, McDaniel, Rohrer y Bjork, 2008, *Learning Styles:
  Concepts and Evidence*, Psychological Science in the Public Interest, 9(3)). Por eso edTech usa las
  categorías solo como etiqueta descriptiva de la planificación.

## Cómo leer las comparaciones

Las estadísticas por mes son **descriptivas**. Un promedio mensual más alto **no prueba** que la
metodología de ese mes sea mejor, porque entre meses cambian:

- los temas y su dificultad,
- la cantidad y el tipo de evaluaciones,
- los estudiantes que participaron,
- condiciones del período (asistencia, eventos, interrupciones).

El reporte comparativo calcula estas diferencias y las presenta como **advertencias de
comparabilidad**. Si un período tiene menos de 2 evaluaciones, menos de 10 calificaciones o una
participación menor al 60 %, se marca con **datos insuficientes** (umbrales en `SUFFICIENCY`).

## Interpretación con IA

La IA recibe **solo estadísticas agregadas** (promedios, distribución, participación, advertencias,
nombres de metodologías y categorías). No recibe códigos de estudiantes, calificaciones
individuales ni el texto libre de las observaciones del docente. Sus respuestas se rechazan si:

- recomiendan metodologías que no existen en el catálogo del docente,
- afirman causalidad ("demuestra que", "es superior") o estilos de aprendizaje fijos o predominantes,
- omiten la advertencia de datos insuficientes cuando corresponde.

Las recomendaciones son **orientativas**. El docente marca cada una como aceptada o descartada.
