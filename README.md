# RosterHome v0.4.0

## FTL completo — Corendon Airlines Europe OM-A Chapter 7

Esta versión estrena el motor FTL de RosterHome. La lógica está basada en el OM-A de Corendon Airlines Europe proporcionado para el proyecto. El manual completo es Rev. 20.0 (20-04-2026); las páginas principales del Chapter 7 están en Rev. 15.0 (15-07-2024), con páginas posteriores revisadas según el LEP.

### Qué calcula
- FDP máximo básico, Table 2, según reporting/reference time y número de sectores.
- Table 3 cuando la aclimatación no puede determinarse.
- Table 4 como referencia para planned extension sin in-flight rest.
- Auditoría del `max` de CrewLink contra el máximo calculado por RosterHome.
- EARLY / LATE / NIGHT con el esquema `Early Type` de TM-CAD.
- Descanso mínimo en base y fuera de base.
- Transición LATE/NIGHT → EARLY con requisito de local night.
- Límites acumulados de duty 7/14/28 días y flight time 28 días.
- OFF/ROFF mensuales.
- Reserve consecutivo y standby cuando CrewLink aporta horas.
- Recurrent extended recovery inferido desde los gaps de roster.
- Regla de 4+ disruptive duties → siguiente extended recovery ≥60 h.
- Referencia visual completa de Tables 1–5 y principales reglas del Chapter 7.

### Estados
- `COMPLIANT`: las reglas evaluables con los datos disponibles cumplen.
- `NON-COMPLIANT`: existe un incumplimiento determinable.
- `INDETERMINATE`: falta un dato necesario o una condición no puede demostrarse desde el PDF.

RosterHome no inventa SAFE, delayed reporting, commander discretion, split duty, airport-vs-home standby ni planned extension cuando el roster no contiene los datos necesarios.

### Configuración FTL por perfil
En la pestaña FTL se configura el rol (flight/cabin), Home/Operating Base y, para cabin crew, cuántos minutos reporta antes que flight crew. OM-A 7.1.7.3 establece que el valor de la tabla se obtiene con el report de flight crew, mientras el FDP de cabin empieza en su propio report; RosterHome añade esa diferencia (máximo 60 min) al límite efectivo de duración de cabin crew.

### Persistencia
La configuración FTL se guarda dentro del mismo estado persistente de RosterHome. No es necesario volver a importar los rosters al actualizar desde v0.3.2.3.

### Archivos
`index.html`, `styles.css`, `app.js`, `enhancements.js`, `storage.js`, `roster-parser.js`, `ftl.js`, `service-worker.js`, `manifest.webmanifest`.

> Herramienta de comprobación/planificación. El OM-A entregado está marcado como `Uncontrolled document`; para una decisión operacional prevalecen el manual controlado, el roster oficial y las instrucciones de Crew Planning/OCC.
