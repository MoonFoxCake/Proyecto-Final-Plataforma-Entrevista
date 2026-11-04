# Fase 9 — Informe de pruebas funcionales y de seguridad

Fecha: 2026-10-13 · Rama: `demo-02` · Base: commit `43be948` (Fases 1–8) más las pruebas de esta fase.

## 1. Resumen

| | Antes del incremento | Ahora |
|---|---|---|
| Pruebas de backend (Jest) | 54 | **186**, 24 suites, todas aprobadas |
| Pruebas de frontend (Vitest) | 10 | **48**, 12 archivos, todos aprobados |
| Build de producción del frontend (Vite) | — | Compila sin errores |

Los 19 puntos del guion de la Fase 9 de [task.md](../task.md) se verificaron con un **escenario de aceptación de
punta a punta** sobre la API HTTP real:
[backend/tests/e2e/onsite-acceptance.test.js](../backend/tests/e2e/onsite-acceptance.test.js). Ese escenario usa la
app Express completa (rutas, validación, permisos y servicios) con repositorios en memoria. Firebase Auth está
simulado (el token Bearer es el uid) y la API de Resend está interceptada, así que no se envía ningún correo. Las
pruebas unitarias y de componentes cubren el detalle de cada parte, y algunos flujos se revisaron en el navegador
(sección 4).

Para ejecutarlas:

```bash
cd backend && npm test
cd frontend && npm test
```

## 2. Resultados por punto del guion

| # | Punto | Resultado | Cómo se verificó |
|---|---|---|---|
| 1 | Crear un evento presencial y configurar sus datos | ✅ | Paso 1 del escenario: `POST /events` con sede, ubicación, horario, indicaciones y módulos; un evento sin sede ni ubicación se rechaza (400). Formulario: `NewEventPage.test.jsx`. |
| 2 | Registrar 20 candidatos de prueba | ✅ | Paso 2: 20 altas por la API y la lista del evento devuelve 20. |
| 3 | Generar sus credenciales en lote | ✅ | Pasos 3 y 4: 20 códigos distintos en orden alfabético, que no quedan guardados en claro ni se vuelven a mostrar. Repetir el lote no genera nada (20 omitidos). |
| 4 | Descargar y comprobar el PDF de tarjetas | ✅ | El PDF llega en la respuesta de emisión (`no-store`): 3 páginas para 20 tarjetas (8 por hoja). Diseño en `PrintableService.test.js` (cada tarjeta dentro de la hoja en carta y A4, nombres largos completos, sin cédula). Revisión visual en el navegador (Fase 5). |
| 5 | Descargar y comprobar la lista de asistencia | ✅ | Paso 5: `attendance.pdf` devuelve `application/pdf`. Contenido sin códigos, encabezado repetido y paginación en `PrintableService.test.js`. Revisión visual (Fase 5). |
| 6 | Verificar que los correos de citación no incluyan credenciales | ✅ | Paso 6: los 20 correos interceptados contienen sede y ubicación, y no contienen `href`, URLs, `token` ni nada con forma de código. No se crea ninguna invitación. El estado de entrega se consulta (20 de 20 "delivered"). |
| 7 | Una credencial generada pero no habilitada no permite entrar | ✅ | Paso 7: responde `NOT_ENABLED`. |
| 8 | Verificar identidad, registrar asistencia y habilitar individualmente | ✅ | Paso 8: el panel muestra la cédula para cotejarla; la asistencia guarda `markedBy`; la habilitación individual funciona. Interfaz: `OnsiteApplicationPage.test.jsx`. |
| 9 | Habilitar varios candidatos verificados en una sola operación | ✅ | Paso 9: con 19 presentes y 1 ausente, se habilitan 18 (uno ya estaba habilitado) y **el ausente no**, con el motivo reportado. |
| 10 | Iniciar evaluaciones simultáneas con distintos códigos | ✅ | Pasos 10 y 15: 18 ingresos simultáneos desde 18 computadoras detrás de la misma IP, y 18 envíos simultáneos. |
| 11 | Comprobar que no se pueda reutilizar un código consumido | ✅ | Paso 11: responde `USED`. Con dos ingresos simultáneos con el mismo código, solo uno entra (`OnsiteAccessService.test.js`). |
| 12 | Probar códigos erróneos y múltiples intentos fallidos | ✅ | Paso 12: 5 intentos erróneos desde un navegador provocan un 429 con `Retry-After`, sin afectar a las computadoras del aula. Límite por IP detrás del proxy en `onsite-access.routes.test.js`. |
| 13 | Probar la revocación y reemisión de credenciales | ✅ | Paso 13: tras reemitir, el código anterior responde `REVOKED` y el nuevo funciona. La auditoría registra emisión, revocación, reemisión, habilitación, asistencia e inicio de sesión, **sin códigos**. |
| 14 | Simular una interrupción de conexión y reanudar la evaluación | ✅ | Pasos 18 y 14: (a) se corta la conexión a mitad del macrocaso y al reconectar vuelven la misma etapa y el borrador; (b) el navegador se cierra, el supervisor recupera el acceso y el candidato continúa en la misma computadora con su respuesta y su borrador. La sesión anterior queda `CANCELLED` y desde otra computadora la respuesta es `OTHER_COMPUTER`. Recarga real en el navegador (Fases 2 y 7). |
| 15 | Comprobar que las respuestas de cada candidato se mantengan aisladas | ✅ | Paso 10: cada uno de los 18 envíos simultáneos guarda exactamente las respuestas de su candidato, y reenviar con un token ya usado no crea otro envío. |
| 16 | Verificar que eventos de distintas organizaciones no compartan credenciales ni información | ✅ | Paso 16: la otra empresa recibe 404 en el evento, los candidatos, las credenciales y el panel, y no puede habilitar. Su propio evento no puede incluir candidatos ajenos (400) ni ve credenciales ajenas. |
| 17 | Confirmar que los evaluadores administrativos no accedan a datos personales | ✅ | Paso 17: la revisión ética (proceso y participante) no contiene nombres, cédulas, correos, asistencia, citaciones, aplicadores ni ids de navegador. Una empresa no puede usar la revisión admin (403). |
| 18 | Probar el Módulo B completo con varias secciones, narración, respuestas y envío final | ✅ | Paso 18: macrocaso de 3 secciones creado en el banco y citación al Módulo B sin enlaces. Se recorre con credencial presencial una narrativa por etapa, que se oculta al pasar a las preguntas, y termina en un único envío con versión `MACROCASE:…:v2` y respuestas por sección. La revisión admin agrupa por sección. Narración y avatar: `MacrocaseEvaluation.test.jsx` y recorrido en el navegador (Fase 2). |
| 19 | Verificar que las funciones previas no sufran regresiones | ✅ | Paso 19: el flujo virtual por enlace sigue funcionando (correo con enlace → acceso → envío). Las 54 pruebas de backend y 10 de frontend previas siguen aprobadas, y las que cambiaron por diseño se actualizaron (ver sección 5). |

## 3. Otras comprobaciones de seguridad

- **Códigos:** se generan con `crypto.randomInt` (10 caracteres, alfabeto sin ambiguos, unos 49 bits) y se guardan
  solo como HMAC-SHA256 con `ACCESS_CODE_PEPPER`. Una prueba confirma que el hash no coincide con un SHA-256 simple
  y que sin el secreto no se emite nada.
- **Sin códigos fuera de la respuesta de emisión:** no aparecen en el resumen, en la base de datos ni en la
  auditoría. Las respuestas que los contienen llevan `Cache-Control: no-store`.
- **Token de sesión:** son 32 bytes aleatorios que se guardan como hash. Nunca viaja en la URL de la pantalla
  presencial y se descarta tras el envío.
- **Permisos en el backend:** todas las rutas nuevas exigen el rol persistido `company` y la propiedad del evento.
  Otra organización recibe 404, un admin 403 y una llamada sin sesión 401.
- **Asistencia y habilitación:** solo se registran el día de la cita, y un ausente nunca se habilita.
- **Uso único y concurrencia:** consumo atómico del código y una sola sesión activa por evaluación; reemitir o
  revocar cierra la anterior.
- **Enlaces y eventos presenciales:** un enlace por correo nunca abre una evaluación presencial, y un código
  presencial nunca abre una virtual.

## 4. Verificaciones en el navegador

Hechas con el backend real en memoria y datos de prueba, sin tocar Firestore:

- **Módulo B por secciones (Fase 2):** recorrido completo, recarga a mitad de pregunta (borrador y temporizador
  conservados), envío y acceso cerrado. Vista de móvil sin desplazamiento horizontal.
- **PDF (Fase 5):** tarjetas en carta y A4, y lista de asistencia de 40 filas.
- **Acceso presencial (Fase 7):** código sin habilitar, incorrecto y válido; recarga; cuestionario; envío; pantalla
  neutra y regreso automático; reutilización rechazada. Sin errores de consola.

## 5. Errores encontrados y corregidos durante el incremento

| Fase | Error | Corrección |
|---|---|---|
| 2 | Al recargar el Módulo B se perdían las respuestas y el caso volvía a mostrarse. | Progreso guardado en el servidor y entrega de una etapa a la vez. |
| 3 | El serializador de Firestore podía dejar claves `undefined` anidadas, que Firestore rechaza al reescribir. | Solo se convierten las fechas presentes. |
| 4 | El repositorio de credenciales en memoria devolvía el objeto ya modificado, a diferencia de Firestore, y la reemisión no auditaba la revocación. | Paridad con Firestore, y la auditoría se decide a partir de la decisión tomada en la transacción. |
| 4 | El repositorio de usuarios en memoria ignoraba el `uid` como id. | Alineado con Firestore. |
| 5 | En la tarjeta, los nombres largos se cortaban con "…" y en A4 la sede quedaba recortada. | Nombre en dos líneas; fecha y lugar en líneas separadas. |
| 5 | En la lista de asistencia, un nombre largo se montaba sobre la fila siguiente. | Dos líneas dentro de la fila. |
| 5 | La tarjeta mostraba "p. m.." con doble punto. | Corregido. |
| 7 | `InvitationService` usaba el reloj del sistema, lo que impedía probar con fechas fijas. | Reloj inyectable. |
| 8 | Revocar un código en uso no cerraba su sesión. | El estado se calcula antes de actualizar. |
| 8 | Si la credencial reemplazada y la nueva compartían marca de tiempo, podía tomarse la vieja como vigente. | La vigente es la no reemplazada. |

**Pruebas modificadas por diseño (no son regresiones):** la prueba de la Fase 4 que exigía no reemitir un código
usado se reemplazó, porque la Fase 8 permite recuperar mientras la evaluación siga abierta. Las pruebas del Módulo B
de envío en bloque se reemplazaron por el flujo por etapas.

## 6. Limitaciones y lo que no se probó

- **Firestore real:** los repositorios Firestore (incluidas las transacciones) no se ejecutaron contra Firestore ni
  contra el emulador. La lógica se probó con los repositorios en memoria, que imitan el mismo contrato. Se
  recomienda una pasada con el emulador de Firebase antes de producción.
- **Resend y Azure:** ningún correo se envió de verdad y la consulta de estado se simuló. Tampoco se generó voz con
  Azure.
- **Pantallas de empresa y administración:** no se abrieron en el navegador, porque requieren iniciar sesión con
  Firebase. Se cubrieron con pruebas de componentes y con el escenario HTTP.
- **Impresión física:** los PDF se revisaron en pantalla, no impresos ni recortados.
- **Audio:** la narración se probó por su lógica (reproducir, detener, repetir, fallos y voz del navegador), no
  escuchándola. El navegador de pruebas no tenía voz en español.
- **Límite de intentos:** vive en memoria; con más de una instancia del backend haría falta un almacén compartido.
- **Módulo A:** el cuestionario demo no guarda respuestas parciales. Al recuperar una sesión se reinicia, sin envío
  duplicado.
- **Zona horaria:** las citas se interpretan en hora de Guatemala (UTC−6 fijo).
- **Misma computadora (D7):** se identifica con un id guardado en el navegador; borrar los datos del navegador lo
  bloquearía incluso en la misma computadora.

## 7. Decisiones y supuestos que conviene confirmar con la cliente

| Tema | Estado |
|---|---|
| D1–D10, D12 | Decididos (ver el [informe de la Fase 1](fase-1-informe-impacto.md)). |
| D11 · Módulos en citas separadas | **Supuesto implementado:** el Módulo B presencial se cita a una sesión propia, porque requiere el Módulo A revisado y publicado. Es reversible. |
| Asistencia y habilitación solo el día de la cita | **Regla añadida** para que un código no se habilite con días de anticipación. Es fácil de quitar. |
| Texto de la citación | Incluye "lleva un documento de identidad" y "el acceso se entrega en la sede". |

## 8. Antes de desplegar

1. Configurar `ACCESS_CODE_PEPPER` (32 o más caracteres aleatorios) en `backend/.env` y en Render. No debe cambiarse
   una vez emitidos códigos.
2. Desplegar backend y frontend juntos: cambió el contrato del envío final del Módulo B.
3. No hacen falta índices compuestos nuevos en Firestore: las consultas nuevas son de igualdad sobre un solo campo
   (`eventId`, `codeHash`, `candidateId`).
4. Hacer una pasada manual con cuentas reales: crear un evento presencial de hoy, citar, preparar accesos,
   imprimir una hoja, habilitar e ingresar desde `/presencial`.
