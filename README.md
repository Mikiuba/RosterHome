# RosterHome — v0.3.1

## Cambio de esta revisión

La hora de **Briefing** queda anclada exclusivamente a la salida (chocks/off-block) del **primer vuelo del duty**.

**Fórmula:**

`Briefing = salida del primer vuelo − antelación configurada`

Ejemplo: si el primer vuelo sale a **20:45 UTC** y la antelación configurada es **105 min**, el briefing es a **19:00 UTC**, aunque CrewLink muestre un C/I/duty a las **19:45 UTC**.

El C/I se conserva como dato del duty, pero ya no es la referencia para calcular el briefing.

En el detalle del evento se muestran por separado:
- Hora de briefing.
- Salida/chocks del primer vuelo.
- C/I de CrewLink.
- Antelación configurada.

El bloque visual de briefing termina en el C/I cuando el briefing comienza antes del report, evitando solaparlo visualmente con todo el duty. La hora de briefing sigue siendo exactamente `chocks − X`.

## Actualización desde v0.3

Sustituye en GitHub:
- `index.html`
- `enhancements.js`
- `service-worker.js`

No hace falta reimportar los rosters.


## Recovery y tiempo juntos — revisión v0.3.1

- **Recovery parcial y recovery completo cuentan ambos como tiempo potencial juntos en casa.**
- Recovery ya no bloquea las ventanas compartidas, ni por sí solo impide considerar compatible una comida o una cena.
- En la vista completa, la **Ventana juntos** se dibuja como capa base y el **Recovery** se superpone con tramado ámbar/rojo. Así se ve simultáneamente que podéis estar juntos y que ese periodo debe mantenerse tranquilo.
- En la vista Simple y en Resumen se indica cuando la mejor ventana incluye recovery.
- Duty, briefing y sueño protegido siguen bloqueando la disponibilidad compartida.

Esto es lógica doméstica de RosterHome, no una evaluación FTL.
