# RosterHome — MVP v0.1

Una web app local para parejas con rosters de tripulación. Importa dos rosters CrewLink/NetLine y genera un calendario conjunto con duties, 8 h de sueño protegido, recovery y mejores ventanas para estar juntos.

## Qué hace ya

- Dos perfiles independientes.
- Importación de PDF CrewLink/NetLine (mediante PDF.js) y `.txt`.
- Detecta `C/I`, vuelos, `C/O`, `DT`, `FDP`, `FT`, `TYPE EARLY/LATE/NIGHT`, OFF/ROFF/RES cuando aparecen en el texto.
- Convierte el roster (asumido UTC) a la zona horaria de casa.
- Calcula sueño protegido hacia atrás desde el report.
- Calcula recovery parcial/completo con una puntuación simple basada en duración, EARLY/LATE/NIGHT y horas locales de C/I/C/O.
- Muestra calendario mensual conjunto y mejor ventana libre diaria ≥ 2 h.
- Señala posibles choques con la cena preferida.
- Exporta un calendario `HOME.ics` con sueño, quiet hours, recovery y ventanas juntos.
- Guarda todo en `localStorage`; no hay backend ni cuenta.

## Cómo probarlo

La forma más fiable es servir la carpeta por HTTP (abrir `index.html` directamente también puede funcionar, pero algunos navegadores bloquean workers/PDFs desde `file://`).

### Opción fácil en Mac/PC si tienes Python

```bash
cd couple-roster-planner
python3 -m http.server 8080
```

Después abre `http://localhost:8080` en el navegador.

## iPhone / PWA

Cuando esté publicado en HTTPS (por ejemplo en Vercel, Netlify o GitHub Pages), Safari permite **Compartir → Añadir a pantalla de inicio** y se comporta como una app.

## Privacidad

Los rosters se procesan en el navegador. El MVP no envía nombres, horarios ni PDF a un servidor. El lector PDF.js se carga desde CDN en la primera carga; el contenido del PDF se procesa localmente.

## Limitaciones del MVP

- CrewLink puede generar PDFs con variaciones de layout. El parser está preparado para el patrón NetLine/Crew observado, pero conviene probarlo con rosters de ambos perfiles.
- No calcula cumplimiento EASA FTL ni declara si un duty es legal/ilegal.
- El algoritmo de recovery es una regla doméstica, no una evaluación médica ni operacional de fatiga.
- No sincroniza todavía directamente con CrewLink, Apple Calendar ni Google Calendar; exporta `.ics`.

## Próximas mejoras recomendadas

1. Ajustar el parser con 2–3 ejemplos adicionales de cada formato CrewLink que uséis.
2. Añadir calendario por suscripción para que el `HOME` se actualice automáticamente.
3. Importación ICS directa además de PDF.
4. Login compartido y sincronización cifrada entre ambos móviles.
5. Reglas personales diferentes para cada perfil.
