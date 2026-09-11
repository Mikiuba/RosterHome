# RosterHome — v0.3

RosterHome es una web app local para comparar dos rosters CrewLink/NetLine y convertirlos en un calendario de convivencia: trabajo, sueño protegido, recovery, briefings, tiempo juntos y estadísticas compartidas.

## Ajustes de esta revisión v0.3

### Cambio de vistas más rápido y estable

- **Mes / Semana / Día** ya no recalculan también todo el Resumen cada vez que cambias de vista.
- Los eventos derivados (sueño, recovery, briefing, etc.) se **cachean** mientras roster y reglas no cambien.
- Los resultados diarios de la vista Simple, comidas/cenas y ventanas juntos se reutilizan en vez de recalcularse en cada toque.
- Los formateadores de fecha/hora se reutilizan, reduciendo trabajo de `Intl.DateTimeFormat` en iPhone.
- Si se pulsan varias vistas rápidamente, RosterHome cancela renderizados intermedios y dibuja solo la última seleccionada.
- La vista seleccionada se marca inmediatamente y el calendario mantiene el contenido anterior hasta el siguiente frame, evitando flashes y estados visuales a medias.
- El auto-scroll de la vista Día se cancela si ya has cambiado a otra vista, evitando saltos tardíos.

### Resumen: comida y cena por separado

En **Resumen del mes** hay ahora tarjetas independientes para:

- 🥗 **Comidas compatibles**
- 🍽️ **Cenas compatibles**

Al tocar cualquiera de las dos aparece la lista exacta de días y la ventana de una hora que RosterHome considera compatible dentro del horario preferido y margen configurados en **Reglas**. Cada fila abre directamente ese día en el calendario.

La vista **Día → Simple** muestra también comida y cena por separado.

## Funciones principales de v0.3

- Dos perfiles, con Perfil 1 siempre a la izquierda y Perfil 2 siempre a la derecha.
- Importador CrewLink reforzado con validación de coherencia.
- Soporte para roster en UTC y para `Local times at event airport` con `!` y `+1`.
- Calendario Mes / Semana / Día con bloques pulsables y detalle desplegable.
- Vista **Simple** orientada a convivencia y vista **Completo** con detalle operacional.
- Sueño protegido, quiet hours, recovery y briefings configurables.
- Tiempo de preparación personal independiente para cada miembro de la pareja.
- Resumen interactivo con días juntos, días ocupados, horas potenciales juntos, comidas, cenas, trabajo simultáneo y comparación de carga.
- Pestaña FTL preparada, todavía sin cálculo de legalidad.
- Exportación `.ics` de eventos HOME.
- Datos guardados en `localStorage`; no hay backend.

## Actualizar la instalación de GitHub Pages

Sustituye estos archivos por los de `RosterHome-v0.3-update.zip` y haz commit:

- `index.html`
- `app.js`
- `enhancements.js`
- `styles.css`
- `service-worker.js`

No hace falta volver a importar los rosters para esta revisión.

Tras el deploy, cierra por completo la PWA/Safari y vuelve a abrirla para que el nuevo service worker (`build-b`) tome el control.

## Privacidad y límites

Los rosters se procesan en el navegador. El recovery y la planificación de convivencia son reglas domésticas. La pestaña FTL aún **no** aplica EASA/OM-A ni determina si un duty es legal o seguro operacionalmente.
