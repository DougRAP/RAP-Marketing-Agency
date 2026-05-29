# Block 1 — API/Fulfillment Bridge: post-mortem y guia de decisiones

## 1. El endpoint en el contexto arquitectonico

El flujo end-to-end del bridge es:

```
Browser (thedesignerplan.com)
   |
   v
Netlify Function BFF (Node)  -- HMAC-signs request -->  Spring Boot (designerplan.io)
   |                                                         |
   v                                                         v
JSON al browser                                          DB SQL Server + Stripe
```

`GET /api/v1/seller-account` es uno de los dos endpoints que el BFF Netlify llama server-to-server. El otro hermano es `POST /api/v1/checkout` (ya existia). Los dos viven detras del mismo HMAC filter y comparten el mismo handler de excepciones.

**Por que HMAC y no JWT/OAuth en este canal:** este no es un canal usuario-servicio, es servicio-servicio entre dos sistemas que ya conocemos y operamos. JWT/OAuth resuelve el problema de "tengo un user identity portable y multi-audiencia" — aqui no hay user, hay dos servidores con un secreto compartido. HMAC nos da:

- Sin AuthZ server intermedio (no necesitamos /token endpoint, refresh, JWKS rotation infra).
- Integridad del body gratis (firma cubre `SHA256(body)`).
- Sin estado en el server: cada request se valida por si misma.
- Replay protection por timestamp ±300s.

El trade-off real que aceptamos: rotacion de secretos requiere un deploy coordinado de ambos lados — pero por eso el header `X-RAP-Key-Id` existe (ver seccion 6).

**Rol especifico de seller-account ANTES del checkout:** el BFF lo usa para *gating de la commission split*. Ver `CheckoutApiV1Controller.java:98-103, 105, 109`: si no hay `referralCode` o el designer no esta listo, el checkout crea un `PaymentIntent` plano. Si esta listo, crea uno con `TransferData` al `stripeAccountId` del designer. seller-account permite al BFF pre-chequear ese estado para mostrar UI util (banner "Connect Stripe", o esconder la atribucion) sin esperar a fallar en checkout. Es un endpoint de UX, no de seguridad: el checkout es robusto por si solo y degrada a plain PaymentIntent si Stripe Connect no esta listo.

## 2. Diseno del estado `stripe_status`

Los 4 estados son `not_connected`, `pending`, `restricted`, `ready` (`SellerAccountApiV1Controller.java:44-47`).

**Por que 4 y no un boolean `is_ready`:** el BFF necesita renderizar mensajes distintos para cada caso. Un boolean colapsa tres problemas accionables muy diferentes en uno:

| Estado | Que muestra la UI | Que accion toma el designer |
|---|---|---|
| `not_connected` | "Connect Stripe to earn commissions" | Click → onboarding |
| `pending` | "Stripe is verifying your account" | Esperar |
| `restricted` | "Stripe needs action on your account" | Resolver requirements en Stripe |
| `ready` | (nada — habilita la UI normal) | — |

Si fuera boolean, perdemos la diferencia entre "esperar" y "actuar". Esa diferencia es la unica razon por la que vale la pena llamar a Stripe — si solo necesitaramos `ready/no-ready`, bastaria con leer `stripeAccountId IS NOT NULL` de la DB y ahorrarnos el round-trip.

**Distincion semantica pending vs restricted:** `pending` = Stripe esta verificando, el designer no tiene nada que hacer. `restricted` = Stripe explicitamente bloqueo la cuenta, el designer SI tiene algo que hacer. La distincion la hace `requirements.disabledReason` de Stripe.

Mira `isRestricted` en `SellerAccountApiV1Controller.java:134-138`:

```java
String reason = account.getRequirements().getDisabledReason();
return reason != null && !reason.isBlank();
```

Y el switch principal en lineas 109-116: primero chequeamos si ambas capabilities estan ON → `ready`; si no, miramos si Stripe puso `disabledReason` → `restricted`; cualquier otro caso → `pending`. El orden importa: una cuenta con `chargesEnabled=true, payoutsEnabled=false` y sin disabled reason es `pending` (capability pendiente de habilitar), no `restricted`. Esa nuance es la que el test `chargesOnlyEnabled_returnsPending` (linea 153 del test) protege.

## 3. Defense-in-depth en el lookup del dealer

Tres checks en cascada (`SellerAccountApiV1Controller.java:70-100`):

1. Dealer existe → si no, **404** `not_found`.
2. Dealer es de tipo DESIGNER → si no, **404** `not_found` (mismo error code que el caso anterior — el BFF no necesita distinguirlos).
3. Dealer tiene `stripeAccountId` → si no, **200 con `not_connected`**.

**El trade-off semantico mas importante esta entre (1)/(2) y (3):**

- Casos 1 y 2: "no existe un designer con ese referral code" → 404. El recurso no es enumerable.
- Caso 3: "el designer existe pero no completo Stripe Connect" → 200, status `not_connected`. El recurso existe; su estado es vacio.

Esa diferencia importa para el BFF: con 404 muestra "Invalid link" o redirige; con 200 muestra "Connect Stripe to start earning". Devolver 404 en el caso 3 forzaria al BFF a re-interpretar el codigo HTTP, que es exactamente la clase de acoplamiento semantico que un buen contrato evita.

**Consistencia con CheckoutApiV1Controller:** el patron de tres checks es identico al de `CheckoutApiV1Controller.lookupReferralDesigner` (lineas 151-168). En el checkout, los tres fallos colapsan a `return null` (porque el checkout sigue funcionando sin commission). En seller-account separamos los tres porque el BFF necesita la informacion. Misma logica, output diferente segun el caller — esa es la razon por la que no se extrajo a un helper compartido: la decision de que hacer en cada rama es del controller, no del lookup.

## 4. `ApiV1ExceptionHandler` — el handler que agregamos

El cambio minimo en este bloque fue agregar `handleMissingServletRequestParameterException` (`ApiV1ExceptionHandler.java:68-79`). Antes de Block 1, no teniamos ningun endpoint GET con `@RequestParam` requerido en `/api/v1/**` — checkout es POST con `@Valid @RequestBody`, asi que `MethodArgumentNotValidException` cubria todo. seller-account introduce el primer `@RequestParam` obligatorio, y Spring lanza `MissingServletRequestParameterException` cuando falta — no `MethodArgumentNotValidException`. Sin el handler nuevo, el fallback generico de 500 se hubiera disparado.

**Path-scoping con `isApiV1Request` (linea 40-43):** el advice esta `@RestControllerAdvice(basePackages = "com.raptns.designers.controllers")`, que captura TODO controller en ese paquete — incluyendo `PlanRegistrationController` y los demas legacy que devuelven HTML/JSON viejo. El guard `if (!isApiV1Request(request)) return null;` hace que el handler delegue (Spring busca el siguiente handler) cuando la URL no es `/api/v1/`. Esto nos permite tener un advice nuevo sin tocar la respuesta de error de ningun controller existente. Retornar `null` del handler es la senal documentada de "no manejado, continua buscando".

**El patron `"code:message"` en `ResponseStatusException`:** ver linea 122-138 del handler. Cuando el controller throw `new ResponseStatusException(HttpStatus.NOT_FOUND, "not_found:No designer found...")`, el handler parsea el reason en code + message. Si no hay `:`, cae al default por status. Esto es convencion local — `ResponseStatusException.reason` es un campo libre, lo cooptamos como envelope. La alternativa hubiera sido una excepcion custom por tipo, pero eso multiplica clases para un payload que es siempre `{code, message}`. El precio: cualquier nuevo `ResponseStatusException` en este controller tiene que usar el formato — los tests `unknownReferralCode_returns404NotFound` y `dealerExistsButNotDesigner_returns404` (lineas 192-209) cubren ese contrato.

**StripeException → 502 automatico:** `ApiV1ExceptionHandler.java:149-162`. El controller declara `throws StripeException`, Stripe SDK la lanza si no puede contactar la API o si la API responde error, y el advice la mapea a 502 con code `stripe_unavailable`. El controller queda completamente limpio de try/catch para errores de red — la responsabilidad esta donde debe estar. El test `stripeApiFailure_returns502` (lineas 226-237 del unit test) lo verifica.

## 5. Estrategia de testing — 3 niveles

### Nivel 1 — Unit (`SellerAccountApiV1ControllerTest`)

MockMvc en `standaloneSetup` con el advice montado a mano (lineas 47-51). `DealerServices` mockeado con Mockito normal. Stripe mockeado con **`MockedStatic<Account>`**.

**Cuando MockedStatic es necesario vs `@Mock` normal:** `Account.retrieve(...)` es un metodo estatico de `com.stripe.model.Account`. No hay instancia que inyectar. Sin MockedStatic tendrias dos opciones:

1. Wrappear Stripe en una interfaz inyectable (`StripeAccountClient`), que MockedStatic obvia.
2. Hacer la llamada real (con un fake API key) — frecuentemente lo que la gente termina haciendo y luego se rompe en CI.

MockedStatic es la opcion correcta aqui porque (a) el codigo de produccion es honesto sobre que esta llamando a un static, (b) no necesitamos abstraer un wrapper de una sola llamada, (c) el scope `try-with-resources` garantiza que el mock no se filtra entre tests. Para todo lo que es instancia inyectable (`DealerServices`), `@Mock` normal alcanza y es mas barato.

### Nivel 2 — Integration (`SellerAccountIntegrationTest`)

Mismo MockMvc standalone, pero ademas montamos el `HmacAuthFilter` real en el chain via `.addFilters(filter)` (linea 60), con un `HmacKeyStore` poblado de `HmacTestUtils.TEST_SECRET`.

**Que bug atrapa esto que el unit no:** unit tests bypassan el filter — meten requests directamente al controller. Si tuvieras un bug donde:

- El filter espera un body hash pero el controller declaro un endpoint que recibe form-urlencoded.
- La query string que el filter ve no coincide con la que el firmante uso (encoding, orden de parametros).
- El controller fuera mapeado fuera de `/api/v1/**` por error.

...el unit test pasaria y el integration test fallaria con 401. El test `unsignedRequest_rejectedAt401` (linea 98) verifica el path de rechazo. `readyDesigner_passesFilterAndReturnsAccountInfo` verifica el path feliz a traves de la cadena completa.

El detalle interesante esta en `signedSellerGet` (lineas 69-74): el `pathAndQuery` se construye manualmente como `"/api/v1/seller-account?referral_code=" + referralCode` porque tiene que coincidir EXACTAMENTE con lo que el filter ve via `request.getRequestURI() + "?" + request.getQueryString()` (filter linea 129-132). Si MockMvc te codifica el query distinto, el signature falla. **Este es el lugar donde el Node.js BFF mas facilmente la va a embarrar — anota mentalmente.**

### Nivel 3 — Smoke en vivo

Spring Boot real en `localhost:8080`, DB SQL Server real, Stripe API real, PowerShell que firma HMAC. Los 5 paths que validamos: ready, pending, restricted, not_connected, dealer-not-found.

**Por que deliberadamente NO usamos `@SpringBootTest`:** `@SpringBootTest` levanta el context Spring entero (200+ beans en este proyecto entre repos, servicios, configs Stripe, etc.). Tiempo de arranque: 15-30s. No nos da nada que los otros dos niveles no cubran ya:

- Unit: behavior del controller.
- Integration: filter + advice + controller integration.
- Smoke: el wiring real con DB + Stripe + Spring + Tomcat (que es lo unico que `@SpringBootTest` agrega — y lo agrega peor, porque mockea Tomcat).

`@SpringBootTest` ocuparia el peor lugar de los tres: mas lento que unit/integration, menos real que smoke. El skip es consciente.

## 6. El modelo de trust HMAC (refresco)

**Shared secret estatico vs JWT vs rotating keys:** estamos en una integracion 1-a-1 entre dos sistemas que operamos. La complejidad operacional de JWT (issuer/audience claims, JWKS endpoint, refresh tokens) o de rotating keys con KMS no compra nada que un secret bien guardado en variables de entorno no de. El operativo es: un secret en `HmacKeyStore` del lado Spring, mismo secret en `process.env` del lado Netlify, ambos via secrets manager. Simple.

**`X-RAP-Key-Id` permite rotacion sin downtime:** el `HmacKeyStore` mapea `keyId → secret` (filter linea 102). Para rotar:

1. Agregar `key-v2` al keystore manteniendo `key-v1` activo (deploy del Spring side).
2. Cambiar el BFF Netlify para firmar con `key-v2`.
3. Despues de N horas, remover `key-v1` del Spring.

Sin `keyId` el filter no sabria cual secret usar y la rotacion requeriria downtime coordinado al milisegundo.

**Por que METHOD + PATH_AND_QUERY + TIMESTAMP + SHA256(BODY) (filter linea 134-139, helper lineas 98-102):**

- METHOD: previene re-jugar un POST como GET o viceversa.
- PATH_AND_QUERY: ata la firma a la ruta. Sin esto, un signature valido para `/api/v1/seller-account?referral_code=ME` se podria reusar contra `/api/v1/checkout` si alguien lo intercepta.
- TIMESTAMP: ancla temporal — solo valida ±300s del clock del server.
- SHA256(BODY): integridad del payload. Cambiar un byte del body invalida la firma.

**±300s tolerance:** 5 minutos es el sweet spot estandar. Mas estrecho rompe con NTP skew normal entre Netlify edge y nuestra VM. Mas amplio agranda la ventana de replay sin proteccion adicional. Combinado con HTTPS (que ya previene replay en transito), 300s es defensa contra atacantes con acceso a logs vencidos.

**Por que el body se hashea y no se incluye plano:** el signing string es una sola linea conceptual. Un body JSON de 4KB con saltos de linea reales rompe el `String.join("\n", ...)` de la linea 134 del filter. Hashear da longitud fija (64 hex chars) y handling consistente. Y mas importante, el filter hashea el body que efectivamente llego al server (via `CachedBodyHttpServletRequest`, linea 122) — eso garantiza que cualquier mangling intermedio (proxy que reescribe, charset cambiado) invalida la firma en vez de pasar silenciosamente.

## 7. El hallazgo sobre B.8 (Supabase writeback) — la sorpresa

**El plan original** asumio: "en el handler de `payment_intent.succeeded` webhook, despues de hacer todo el flow del plan, escribimos `plan_number` a la fila correspondiente en Supabase."

**La realidad descubierta leyendo el codigo:** `plan_number` no es algo que el handler del webhook produce. Es `SoarSales.warrantyNumber`, y se setea en `PlanRegistrationController.java:537`. Ese controller es el flow OLD de registracion de planes — corre en un contexto diferente al webhook nuevo. En el momento en que `payment_intent.succeeded` se dispara, el `plan_number` simplemente no existe todavia en el dominio: la fila de plan se crea mas tarde por una ruta de codigo distinta.

**Por que importa:** la arquitectura del Wave B asumio que el webhook era el unico punto donde el dato relevante esta disponible. Pero la creacion del plan_number es asincrona respecto del webhook. Si escribimos a Supabase desde el webhook, escribimos `null`. Si esperamos en el webhook a que aparezca, bloqueamos un handler que Stripe quiere ver responder en <10s.

**Las 3 opciones:**

(a) **Hook en `PlanRegistrationController`** — escribir a Supabase desde el lugar donde `plan_number` efectivamente se materializa. Mas correcto semanticamente, pero acopla un controller legacy al nuevo sistema y requiere agregar HMAC/Supabase client a un area que no lo necesitaba.

(b) **Write-then-update** — el webhook escribe la fila Supabase con `plan_number = null` (estado `paid_pending_plan_number`), y un job/segundo hook completa el campo cuando aparece. Mas robusto contra fallas, mas piezas moviles.

(c) **Defer** — no escribimos plan_number a Supabase en Block 1. El BFF/UI no lo necesita aun, lo agregamos en una iteracion siguiente cuando la fuente real este clara. Menos trabajo ahora, deuda explicita.

**La leccion general** (y la unica que vale conservar a nivel de habito): los planes de arquitectura son hipotesis sobre el codigo. El codigo es la fuente de verdad. La hipotesis que B.8 hizo sobre "donde vive el dato `plan_number`" se rompio en el primer encuentro con `PlanRegistrationController.java:537`. Esto va a pasar de nuevo en los Waves siguientes — todos los planes que asumen "X dato esta disponible en Y momento" merecen ser validados leyendo el codigo antes de implementar. Y los planes que escribimos deberian apuntar a las lineas concretas donde el dato se produce, no al concepto abstracto del dato.

## 8. Key takeaway final

Block 1 termino dejando el shape del bridge fijado en Spring: HMAC filter con keyId rotacion-ready, advice unificado con codes `"code:message"`, dos endpoints (`POST /checkout`, `GET /seller-account`) consistentes en defense-in-depth y en mapeo de errores. Los BFFs Node de Wave C ahora tienen un target con contrato claro: firmar con HmacTestUtils-equivalent, esperar 4 estados de seller-account, esperar el envelope `{code, message}` en errores. Lo que construimos del lado Spring **dicta la forma de los BFFs** — el helper de firma Node es una traduccion 1-a-1 de `HmacTestUtils.computeSignature`, el manejo de `not_connected` vs `restricted` en el dashboard es directo del enum de status, y los retry policies del BFF deben asumir que 502 = Stripe (reintentable) vs 422 = business rule (no reintentable). En otras palabras: el Spring side es el contrato; el Node side lo consume.

---

**Archivos relevantes citados:**
- `C:\SourceCode\RAP\Designers\src\main\java\com\raptns\designers\controllers\SellerAccountApiV1Controller.java`
- `C:\SourceCode\RAP\Designers\src\main\java\com\raptns\designers\dtos\SellerAccountResponseDto.java`
- `C:\SourceCode\RAP\Designers\src\main\java\com\raptns\designers\controllers\advice\ApiV1ExceptionHandler.java`
- `C:\SourceCode\RAP\Designers\src\test\java\com\raptns\designers\controllers\SellerAccountApiV1ControllerTest.java`
- `C:\SourceCode\RAP\Designers\src\test\java\com\raptns\designers\integration\bridge\SellerAccountIntegrationTest.java`
- `C:\SourceCode\RAP\Designers\src\main\java\com\raptns\designers\filter\HmacAuthFilter.java`
- `C:\SourceCode\RAP\Designers\src\test\java\com\raptns\designers\filter\HmacTestUtils.java`
- `C:\SourceCode\RAP\Designers\src\main\java\com\raptns\designers\controllers\CheckoutApiV1Controller.java`
