# RosterHome v0.9.0 — iPhone Direct + Windows Bridge

Esta versión permite actualizar CrewLink directamente desde iPhone/Safari sin depender del PC.

## Cómo funciona

- **iPhone / Safari:** RosterHome crea un navegador Chromium temporal y headless en Cloudflare Browser Run. Ese navegador entra en CrewLink, genera el Individual Duty Plan, descarga el PDF y lo devuelve a RosterHome. No se abre ninguna pestaña de CrewLink en el iPhone.
- **Windows / Chrome:** si está instalada la extensión `RosterHome CrewLink Bridge`, RosterHome sigue prefiriendo el Bridge local que ya funciona.
- La importación muestra una **barra de progreso con fases reales**: navegador, login, Duty Plan, generación, descarga, parsing y actualización.

## Despliegue

1. Sube **todo el contenido** de este paquete a la raíz del repositorio GitHub.
2. Cloudflare ejecuta `npm run build` y `npx wrangler deploy`.
3. `wrangler.jsonc` ya incluye el binding de Browser Run (`BROWSER`), por lo que no hay que editar código ni añadirlo a mano.
4. Mantén el secret de runtime existente `ROSTERHOME_ACCESS_KEY` (mínimo 32 caracteres). Es la clave privada que protege el uso del navegador remoto.
5. Comprueba `/api/crewlink/status`. Debe mostrar `version: 0.7.0`, `cloudBrowser: true` y `transport: cloud-browser+local-bridge`.

## Uso en iPhone

1. Abre la URL `workers.dev` de RosterHome en Safari.
2. En **Importar roster** debe aparecer `Importación directa disponible`.
3. Introduce una vez la `ROSTERHOME_ACCESS_KEY` (puedes marcar “Recordar esta clave”).
4. Introduce usuario y contraseña de CrewLink, periodo y pulsa **Actualizar desde CrewLink**.
5. La contraseña de CrewLink se vacía al terminar. No se guarda en RosterHome.
6. Opcional: Safari → Compartir → **Añadir a pantalla de inicio** para usar RosterHome como PWA.

## Privacidad

Los rosters permanecen almacenados en el dispositivo, como hasta ahora. En el modo iPhone, las credenciales de CrewLink viajan por HTTPS desde RosterHome al Worker únicamente para esa importación y se usan dentro de una sesión temporal de Browser Run; RosterHome no las persiste. La `ROSTERHOME_ACCESS_KEY` puede guardarse localmente en el dispositivo si el usuario lo elige.

## Correcciones conservadas

- `CXI 22 P` se interpreta correctamente como `22P`, evitando perder sectores.
- El 29 SEP se reconstruye como HER–GRZ–DRS–HER (3 sectores) y conserva los totales oficiales de CrewLink.
- El detalle de sueño muestra explícitamente la primera obligación que determina el despertar.

## Offline

La instalación como PWA y el service worker están preparados, pero **v0.7.0 no promete todavía modo offline completo**. Esa parte queda para una versión posterior, tal como se acordó.


## v0.8.0 — Together

`Resumen` pasa a llamarse `Juntos` y está pensado para que cualquiera de los dos
pueda organizarse sin interpretar un roster: noches de cita, tiempo de calidad,
horas juntos, mañanas y cenas, dormir juntos, días completos, escapadas y días
que conviene coordinar.

Cada tarjeta abre un panel superpuesto (bottom sheet en iPhone), con fechas
deduplicadas y un lenguaje deliberadamente cotidiano. Los días con recovery
pueden seguir contando como tiempo potencial juntos, pero se señalan.

Noche de cita:
- podéis empezar como tarde a las 21:00 (configurable);
- ninguno tiene una obligación antes de las 12:00 locales del día siguiente
  (configurable);
- exige cobertura de roster para ambos en los dos días.

Pulido iPhone:
- safe area superior real;
- fondo de la barra de estado integrado con la app;
- cabecera separada de la hora/Dynamic Island;
- pestañas móviles más limpias;
- theme/background PWA coherentes.

## v0.8.1 — Mobile polish

- selector de mes directamente en `Juntos`;
- corrección de desbordes de inputs/date/select en iPhone;
- calendario mensual móvil compacto: `Juntos / Un rato / Ocupado`;
- recovery como insignia discreta `↻`;
- toque en un día abre un bottom sheet con resumen y acceso al día completo;
- footer oculto en móvil;
- pestañas y anchos alineados de forma consistente.


## v0.8.2 — navegación móvil, calendario y huso horario

- las pestañas superiores dejan de comprimirse/solaparse en iPhone y pasan a scroll horizontal real;
- el calendario mensual simple deja de intentar mostrar horas dentro de celdas estrechas;
- la celda muestra únicamente emoji + `Juntos`, `Un rato` u `Ocupado` (+ `↻` si hay recovery);
- las horas y el detalle siguen disponibles al tocar el día;
- `Reglas → Zona horaria de casa` pasa a ser un selector con Atenas, Madrid, Canarias,
  Lisboa, Berlín/Hannover, Malta, Londres, París, Roma, Estambul, Dubái, India y UTC.


## v0.9.0 — Offline

RosterHome puede abrirse y consultarse sin conexión después de haber cargado esta
versión al menos una vez con internet. El Service Worker precarga la interfaz
principal y los módulos locales, mientras que los rosters, reglas y preferencias
siguen persistiendo en IndexedDB.

Disponible offline:
- calendario y detalles ya importados;
- Juntos y estadísticas;
- FTL de los rosters guardados;
- reglas, sueño y recovery;
- selección de meses ya presentes en los datos.

Requiere internet:
- importar/actualizar desde CrewLink;
- cualquier recurso o acción que dependa de Cloudflare.

La UI muestra `📴 Sin conexión · datos guardados` y cambia automáticamente al
recuperar internet.

También corrige el spacing del selector de mes en FTL en iPhone vertical para
que su borde inferior no se superponga con la tarjeta FTL.
