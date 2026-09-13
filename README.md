# RosterHome v0.5.0 — Cloudflare + GitHub

Actualización manual desde CrewLink, para usar desde navegador e iPhone sin mantener encendido el ordenador. Esta entrega está preparada para desplegar; todavía no está publicada ni se ha verificado la conexión desde la red de Cloudflare.

## Subir a GitHub

Descomprime el ZIP. Sube su **contenido a la raíz del repositorio** de RosterHome: `wrangler.jsonc` y `package.json` deben aparecer junto a `index.html`, no dentro de otra carpeta. Conserva las carpetas `cloudflare`, `scripts` y `tests`. No subas el ZIP sin descomprimir. El código no contiene credenciales ni el HAR.

Puedes conservar GitHub Pages: seguirá mostrando la app y el importador manual de PDF/TXT. Para conectar con CrewLink utiliza la nueva URL de Cloudflare.

## Conectar Cloudflare

1. Workers & Pages → Create application → **Connect GitHub**.
2. Autoriza únicamente el repositorio correspondiente y selecciónalo.
3. Nombre del Worker: **rosterhome-crewlink** (debe coincidir con `wrangler.jsonc`). Selecciona la rama que utilizas; no se presupone que se llame `main`.
4. Directorio raíz: el directorio que contiene `package.json` y `wrangler.jsonc` (raíz del repositorio si seguiste el paso anterior).
5. Build command: `npm run build`.
6. Deploy command: `npx wrangler deploy`.
7. Mantén Workers Free. No se configura dominio comprado, base de datos, cron ni almacenamiento de contraseñas.

Workers Builds instala la dependencia Wrangler declarada en `package.json`; no debes instalar Node, Python o PowerShell en el iPhone. En un equipo de desarrollo, los comandos equivalentes son `npm install`, `npm test` y `npm run deploy`.

## Proteger el conector

Después del primer despliegue, en el Worker → Settings → Variables and Secrets, añade un **Secret**:

Nombre: `ROSTERHOME_ACCESS_KEY`

Valor: una clave aleatoria de entre 32 y 256 caracteres, generada por tu gestor de contraseñas. Debe ser distinta de tu contraseña de CrewLink. Conserva esa clave en tu gestor; no la pongas en archivos del repositorio, capturas o mensajes. Guarda y despliega la nueva configuración. Si falta este secreto, las descargas y la prueba de conexión permanecen bloqueadas.

Esta clave protege el conector para vuestro uso privado. La página estática de la app es pública, pero no contiene vuestros rosters ni puede consultar CrewLink sin la clave. No es un servicio multiusuario con cuentas individuales. Quien tenga la clave podrá usar el conector con sus propias credenciales; cámbiala si necesitas revocar el acceso. No se ha añadido una cuota por usuario; el límite de Workers Free sigue aplicando.

## Primera prueba

1. Abre la URL `workers.dev` que muestre Cloudflare.
2. En Importar roster, introduce **solo la clave de acceso a RosterHome**.
3. Pulsa **Comprobar conexión sin iniciar sesión**. No envía usuario, contraseña ni confirmaciones a CrewLink.
4. Si aparece que alcanza el portal y reconoce el formulario, vuelve a introducir la clave, el usuario/contraseña CrewLink, el perfil y las fechas publicadas. Acepta el aviso HTTP y pulsa **Actualizar desde CrewLink**.

Las claves se vacían del formulario tras enviarlas. Usuario/contraseña CrewLink y cookies se usan en memoria durante esa solicitud y no se guardan en Cloudflare. La clave privada de acceso a RosterHome sí existe como secreto de configuración en Cloudflare. Los logs de aplicación no registran cuerpos, cookies ni credenciales; observabilidad del Worker desactivada en la configuración.

El dispositivo se conecta por HTTPS a Cloudflare. El tramo de Cloudflare a Corendon conserva el HTTP del portal actual, sin cifrar. No se ha comprobado un acceso HTTPS alternativo.

## Datos y comportamiento

- Solo descarga al pulsar el botón. No hay actualizaciones periódicas, tareas programadas ni consultas al abrir automáticamente.
- Reutiliza el parser, totales y unión de periodos de la app existente. Comprueba usuario, periodo y totales antes de importar. No cambia el motor FTL heredado.
- Los rosters permanecen en el navegador/dispositivo. La nueva URL tiene un almacenamiento distinto al de GitHub Pages y al de localhost. Exporta una copia desde la app anterior y restáurala en la nueva si quieres trasladar datos; esa restauración sustituye el estado del destino.
- No sincroniza datos automáticamente entre vuestro ordenador y los dos teléfonos. Cada dispositivo puede importar manualmente los perfiles que necesite.
- No marca como leídas ni confirma notificaciones operativas de CrewLink.

## Verificación

Pruebas locales con respuestas simuladas: flujo completo, cookies, UTC, prueba sin login, credenciales incorrectas, PDF inválido, destinos/redirecciones externos, límites de tamaño, fechas, aviso HTTP, clave y origen. Se valida la interfaz manual en un DOM simulado y se genera la carpeta de archivos públicos mediante una lista explícita.

Pendiente: despliegue real con Wrangler, prueba de acceso Cloudflare → CrewLink:8090, consumo de CPU del plan Free y uso real en Safari/iPhone. El funcionamiento de v0.4.2 en Windows no confirma por sí solo el de Cloudflare.

## Referencias consultadas

- [Workers Builds y Git](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Archivos estáticos y binding ASSETS](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Puertos personalizados](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#allow-specifying-a-custom-port-when-making-a-subrequest-with-the-fetch-api)
- [Límites del plan Free](https://developers.cloudflare.com/workers/platform/limits/)
