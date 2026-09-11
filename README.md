# RosterHome v0.3.2.2

Hotfix de interacción iOS/PWA.

- El calendario ya no desactiva `pointer-events` durante cambios de vista.
- Mes/Semana/Día renderizan de forma síncrona y segura.
- El cableado de botones es tolerante a elementos/feature modules que fallen.
- La navegación principal tiene un listener delegado independiente.
- IndexedDB sigue siendo una mejora: nunca puede bloquear la interfaz.
- Se mantiene localStorage + IndexedDB + backup JSON.

## Persistencia de rosters

Esta versión refuerza el guardado local para evitar tener que reimportar los rosters después de periodos largos sin abrir la app.

### Cómo se guarda ahora

1. **IndexedDB** es la copia durable principal del estado de RosterHome.
2. **localStorage** se mantiene como copia rápida y para migrar automáticamente datos de versiones anteriores.
3. Al arrancar, RosterHome solicita `navigator.storage.persist()` cuando el navegador lo soporta.
4. Si Safari/iOS eliminó `localStorage` pero IndexedDB sigue disponible, RosterHome restaura automáticamente el estado durable.
5. Los cambios se escriben en IndexedDB de forma diferida y se fuerzan al ocultar/cerrar la app.

La app sigue siendo local: ningún roster se envía a un servidor.

## Copia de seguridad

En **Reglas → Datos y persistencia** se muestran:
- si hay roster guardado;
- si Safari/iOS ha concedido almacenamiento persistente;
- el último guardado.

También están disponibles:
- **Exportar copia**: descarga un JSON con ambos rosters, reglas, configuración y estado de la app.
- **Restaurar copia**: reemplaza el estado local por una copia previamente exportada.

Aunque Safari conceda persistencia, se recomienda exportar una copia antes de borrar datos web, desinstalar la PWA o cambiar de dispositivo.

## Migración desde v0.3.1

No hace falta reimportar los rosters. Al abrir v0.3.2.2 por primera vez, el estado existente en `localStorage` se migra automáticamente a IndexedDB.

## Actualización en GitHub

Sustituye:
- `index.html`
- `app.js`
- `enhancements.js`
- `styles.css`
- `service-worker.js`
- `README.md`

Añade el archivo nuevo:
- `storage.js`

No hace falta modificar `roster-parser.js` ni reimportar ningún roster.


## Hotfix v0.3.2.2
- El almacenamiento durable ya no puede bloquear el arranque.
- IndexedDB tiene timeout y cae automáticamente a localStorage.
- El service worker usa actualización network-first y una instalación no falla si un archivo tarda en publicarse en GitHub Pages.
- Todos los assets llevan cache-busting 0.3.2.2 para evitar mezclar builds.