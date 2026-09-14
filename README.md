# RosterHome v0.6.1 — Cloudflare + CrewLink Bridge

Esta versión cambia la arquitectura del importador de CrewLink.

## Solución

CrewLink ya no se consulta desde Cloudflare. El informe se genera en el Chrome local mediante la extensión `chrome-extension/`.

Esto elimina el punto que estaba fallando: CrewLink aceptaba login y navegación desde Cloudflare, pero su generador de Individual Duty Plan devolvía `Internal processing error`. En el navegador local, el mismo flujo sí genera el PDF.

## Despliegue de RosterHome

1. Sube el contenido de este paquete al repositorio GitHub.
2. Cloudflare compila con `npm run build` y despliega con `npx wrangler deploy`.
3. Comprueba `/api/crewlink/status`; debe devolver `version: 0.6.1` y `transport: local-chrome-bridge`.

## Instalar el Bridge una vez en Windows/Chrome

1. Conserva una copia descomprimida de este paquete en Windows.
2. Puedes hacer doble clic en `INSTALL-BRIDGE.cmd` para abrir la carpeta y `chrome://extensions`, o hacerlo manualmente.
3. Abre `chrome://extensions`.
4. Activa **Modo de desarrollador**.
5. Pulsa **Cargar descomprimida / Load unpacked**.
6. Selecciona la carpeta `chrome-extension`.
7. Recarga RosterHome.

En **Importar roster** debe aparecer `Bridge local detectado`.

## Privacidad

La contraseña de CrewLink se usa dentro del Chrome local para completar la sesión y se borra de la interfaz al terminar. No se envía a Cloudflare.

## Limitación actual

La importación directa requiere Chrome de escritorio con la extensión instalada. En otros dispositivos sigue disponible la importación manual PDF/TXT.


## v0.6.1 — sectores con sufijo separado

CrewLink puede imprimir números de vuelo como `CXI 22 P`. El parser anterior solo
aceptaba el sufijo pegado (`22P`) y omitía ese sector. Esta versión acepta ambos
formatos y normaliza el número a `22P`.

Esto corrige el conteo de sectores, la ruta y los cálculos FTL dependientes del
número de sectores. FT/DT/FDP continúan tomándose de los totales oficiales de CrewLink.
