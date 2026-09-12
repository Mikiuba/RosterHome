# RosterHome v0.3.7

## Instalación

1. Sustituye los archivos de la app en la misma dirección de GitHub Pages por el contenido de esta carpeta.
2. Comprueba que el pie muestra v0.3.7.
3. Reimporta los PDF originales de agosto y septiembre en cada perfil: MTR en Miguel, ENJ en Nicole. Puedes seleccionar ambos meses juntos.
4. Selecciona septiembre en FTL.

No borres los datos de Safari. Se mantienen preferencias, el otro perfil y los meses fuera del periodo importado. La reimportación es necesaria para recuperar servicios omitidos y verificar la cobertura del historial. El ZIP no contiene los PDF personales.

## Correcciones

- Conserva el encabezado horario completo de CrewLink antes de separar columnas: MTR exporta UTC; ENJ, horas locales del aeropuerto.
- Normaliza instantes con zonas IANA, incluida Atlantic/Canary para LPA. No utiliza un desfase fijo anual.
- Calcula disruptive y Tabla 2 desde las horas corregidas, sin sustituir el cálculo por TYPE.
- Incluye briefing, simulador, debriefing y posicionamientos; separa servicios no operados del tiempo de vuelo.
- Separa duración de standby y crédito acumulable SDT. La categoría inferida por el crédito se identifica en pantalla; si es desconocida, requiere revisión.
- Mantiene RES como reserva, no como OFF, con crédito cero y advertencia de información no verificable sobre aviso y sueño protegido.
- Verifica cada periodo contra los totales FT, DT y SDT del PDF y el número de servicios temporizados. Un periodo con discrepancias no completa el historial.
- Une meses por perfil sin duplicarlos; identifica huecos de cobertura y prorratea intervalos que cruzan el comienzo de una ventana acumulada.
- Separa el resultado de las comprobaciones del servicio y el de los acumulados.

## Validación con los cuatro originales

| Perfil / mes | Servicios | Flight time | Duty time | Crédito acumulable |
| --- | ---: | ---: | ---: | ---: |
| MTR agosto | 13 | 80:34 | 118:06 | 118:06 |
| MTR septiembre | 13 | 61:05 | 112:50 | 112:50 |
| ENJ agosto | 16 | 88:46 | 124:33 | 129:47 |
| ENJ septiembre | 10 | 84:29 | 109:12 | 109:12 |

Los servicios adicionales MTR del 1–3 de septiembre suman 26:15. Los tres standby ENJ de agosto aportan 5:14 de crédito.

Con ambos meses importados, los 23 servicios de septiembre pasan las comprobaciones implementadas. Agosto puede requerir julio para sus ventanas anteriores. Esto no certifica cumplimiento operacional completo: límites anuales, recuperación extendida, condiciones de reserva, aclimatación no inferible y otros supuestos requieren información y comprobaciones adicionales.

Para ENJ, el 8/9 comienza a las 13:30 locales y su máximo básico calculado es 12:45; el 10/9 comienza a las 03:00 y su máximo es 11:00. Mostrar 15:30 y 05:00 respectivamente indica que esas horas todavía no están corregidas.

## Pruebas

Requieren Node y pdfjs-dist para extracción de los PDF originales:

```sh
node tests/ftl-engine.test.js
node tests/import-ftl.test.cjs /ruta/ENJ-SEP.pdf
node tests/history-integration.test.cjs /ruta/carpeta-con-los-cuatro-originales
```

Se prueban extracción real, migración horaria, totales, intervalos, cambio estacional, huecos, aislamiento de perfiles, reimportación, persistencia y HTML generado por la app mediante Node VM. No es una prueba en Safari ni del despliegue publicado.

## Referencias

Corendon Airlines Europe OM-A, capítulo 7, revisión 15 del 15/07/2024: apartados 7.1.11.4, 7.1.13, 7.1.15, 7.1.16 y 7.1.17, además de Tabla 2 y límites acumulados.

- [EASA: crédito de standby fuera del aeropuerto](https://www.easa.europa.eu/en/faq/47641)
- [EASA: reserva y descanso](https://www.easa.europa.eu/en/faq/47645)
