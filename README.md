# RosterHome — MVP v0.2.1

Web app local para parejas con rosters de tripulación. Importa dos rosters CrewLink/NetLine y genera un calendario conjunto con duties, sueño protegido, recovery y mejores ventanas para estar juntos.

## Novedades v0.2.1

- Corregida la acumulación de eventos duplicados al reimportar un roster del mismo periodo.
- Cada importación reemplaza el periodo completo de ese perfil en vez de añadirlo encima.
- Dedupe defensivo de duties y eventos derivados (sueño, quiet hours y recovery).
- Corregida la inferencia de fecha de los `C/I` sin fecha explícita: prioriza `[RT DD/HHMM]` y evita confundirlos con el calendario repetido de cada página CrewLink.
- Para limpiar datos antiguos incorrectos, basta con volver a importar una vez el PDF después de actualizar.

## Novedades v0.2

- Vista de calendario **Mes / Semana / Día**.
- Navegación anterior/siguiente adaptada a la vista seleccionada y botón **Hoy**.
- Los eventos del calendario ahora son pulsables.
- Ficha de detalle para duty, OFF/ROFF/RES, sueño protegido, quiet hours, recovery y ventana juntos.
- En un duty se muestran ruta, C/I, C/O, horario local, horario UTC del roster, DT/FDP/FT y sectores detectados.
- En recovery se explica por qué se ha activado según las reglas configuradas.
- En vista Día se muestran todos los eventos en formato agenda.
- En vista Semana se muestran todos los eventos de cada día; en móvil los días se apilan para mejorar la lectura.
- En vista Mes se muestran hasta 6 eventos por día; el botón `+N más` abre automáticamente la vista Día.
- Service worker actualizado para que las nuevas versiones sustituyan mejor la caché anterior en GitHub Pages/PWA.

## Qué sigue haciendo

- Dos perfiles independientes.
- Importación de PDF CrewLink/NetLine mediante PDF.js y `.txt`.
- Detecta `C/I`, vuelos, `C/O`, `DT`, `FDP`, `FT`, `TYPE EARLY/LATE/NIGHT`, OFF/ROFF/RES cuando aparecen en el texto.
- Convierte el roster, asumido UTC, a la zona horaria de casa.
- Calcula sueño protegido hacia atrás desde el report.
- Calcula recovery parcial/completo con reglas domésticas configurables.
- Calcula mejor ventana libre diaria ≥ 2 h.
- Señala posibles choques con la cena preferida.
- Exporta un calendario `HOME.ics` con sueño, quiet hours, recovery y ventanas juntos.
- Guarda todo en `localStorage`; no hay backend ni cuenta.

## Actualizar una instalación publicada en GitHub Pages

Sustituye estos archivos del repositorio por los de esta versión y haz commit:

- `index.html`
- `app.js`
- `roster-parser.js`
- `service-worker.js`

`roster-parser.js` y `manifest.webmanifest` se incluyen también en el ZIP completo, aunque no cambian respecto a v0.1.

Después de que GitHub Pages termine el deploy, recarga la web. Si la tienes añadida a la pantalla de inicio, ciérrala por completo y ábrela de nuevo para que el nuevo service worker tome el control.

## Privacidad y límites

Los rosters se procesan en el navegador. El MVP no envía nombres, horarios ni PDF a un servidor. PDF.js se carga desde CDN en la primera carga. El recovery es una regla doméstica y la app no calcula cumplimiento EASA FTL ni determina si un duty es legal o seguro operacionalmente.


## Novedades v0.2.1
- Calendario rediseñado con bloques de color rellenos, inspirado en Apple Calendar.
- Vista Mes compacta con bloques pulsables.
- Vista Semana con tarjetas de evento rellenas y resumen básico.
- Vista Día con línea temporal de 24 h y eventos posicionados según la hora real.
- Los eventos simultáneos se colocan en columnas para mantener la legibilidad.
- Al pulsar cualquier evento se abre una hoja inferior con el detalle completo.


## Build actualizado de v0.2.1

- Calendario con bloques rellenos tipo Apple Calendar.
- Vistas Mes / Semana / Día y detalle desplegable al tocar cada evento.
- Leyenda desplegable con tipos de bloque, estados y campos CrewLink.
- Nueva pestaña FTL preparada como estructura, sin cálculo de legalidad todavía.

La pestaña FTL es deliberadamente informativa en este build: no aplica límites EASA/OM-A ni debe utilizarse para decidir si un duty es legal.

## Revisión de claridad de la interfaz (v0.2.1)

La vista de calendario dispone ahora de dos niveles de detalle:

- **Esencial** (predeterminado): prioriza roster, sueño y recovery. En la vista mensual el sueño y la mejor ventana juntos se resumen con indicadores pequeños para evitar saturar cada día.
- **Completo**: muestra también Quiet hours y las ventanas juntos como eventos del calendario.

Al abrir un duty, primero aparece un resumen en lenguaje simple. Los campos técnicos de CrewLink quedan dentro de **Datos CrewLink / técnicos** para consultarlos solo cuando hagan falta.
