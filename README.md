# RosterHome v0.3.3

Actualización FTL sobre la base estable v0.3.2.3.

## FTL activado

La pestaña **FTL** deja de ser un placeholder e incorpora un motor local basado en Corendon Airlines Europe OM-A Ch. 7 para las reglas que pueden determinarse de forma fiable a partir de un CrewLink individual duty plan:

- FDP máximo básico, **Tabla 2**, por reporting time y sectores (OM-A 7.1.7.2.1).
- Descanso mínimo en Home/Operating Base y fuera de base (OM-A 7.1.17.1/2).
- Límites acumulados de duty: 60 h / 7 días, 110 h / 14 días, 190 h / 28 días (OM-A 7.1.11.1).
- Flight time 100 h / 28 días (OM-A 7.1.11.2(a)).
- Disruptive schedules **Early Type** y Local Night (OM-A definitions + 7.1.17.5).

### Corrección crítica 10/09

La clasificación ya no usa `report < 06:00 = EARLY`.

- `NIGHT`: duty que invade cualquier parte de **02:00–04:59**.
- `EARLY`: duty que **empieza 05:00–05:59**.
- `LATE`: duty que **termina 23:00–01:59**.
- La exigencia de 1 Local Night solo se activa para **LATE/NIGHT → EARLY** en Home/Operating Base.

Por tanto, la secuencia real del 08/09 al 10/09 (`LATE → NIGHT`, report 03:00) no dispara falsamente la regla de transición.

## Estados

- **COMPLIANT**: las comprobaciones automáticas completas del duty pasan.
- **NON-COMPLIANT**: existe una infracción cuantificable con los datos importados.
- **REVIEW**: falta historial suficiente o el caso depende de una regla especial que no debe inferirse (por ejemplo una extensión planificada).

La aplicación no inventa legalidad cuando faltan datos. Casos como standby, split duty, posicionamiento especial, extensión planificada o aclimatación no inferible se dejan para revisión.

## UI

La pestaña FTL muestra:

- resultado global;
- resultado desplegable por duty;
- clasificación EARLY/LATE/NIGHT;
- FDP real vs máximo;
- descanso anterior;
- transición disruptive;
- límites acumulados;
- la **Tabla 2 completa enfrentada al reporting time** en una leyenda desplegable.

## Persistencia y PWA

Se conservan íntegros los arreglos de v0.3.2.3:

- localStorage + IndexedDB;
- solicitud de almacenamiento persistente;
- backup/restauración JSON;
- service worker network-first;
- hotfixes de interacción iOS/PWA.

## Archivos nuevos / modificados

Nuevo:
- `ftl-engine.js`

Modificados:
- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`
- `README.md`

`roster-parser.js`, `storage.js`, `enhancements.js` y `manifest.webmanifest` conservan la base estable salvo el cache-busting de carga desde `index.html`.
