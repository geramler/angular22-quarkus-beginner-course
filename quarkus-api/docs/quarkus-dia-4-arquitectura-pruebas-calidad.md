# Quarkus — Día 4: Arquitectura, pruebas, rendimiento, buenas prácticas y checklist de code review

**Objetivo (líder técnico):** tomar decisiones y dar feedback de calidad sobre el backend: cómo escalarlo, qué probar, qué vigilar y cómo revisar un PR.

**Tiempo sugerido:** 3–4 h.

---

## 1. Arquitectura: del CRUD actual a un servicio que escala

### Estado actual
Un solo paquete (`com.example.policies`) con 4 clases: recursos, entidad y aplicación. Adecuado para un curso o un CRUD pequeño.

### Estructura recomendada al crecer
```
com.example.policies/
├── api/          # recursos REST + DTOs + mapeo de errores
├── domain/       # entidades y reglas de negocio
├── service/      # casos de uso (transacciones, validaciones de negocio)
├── persistence/  # repositorios (si no usas active record)
└── security/     # emisión/validación de tokens, usuarios
```
Reglas:
- El recurso **no contiene lógica de negocio**: valida, delega al servicio y arma la respuesta.
- Las entidades no se exponen en el contrato; se usan DTOs de salida.
- Dependencias en una sola dirección: `api → service → persistence/domain`.

### Decisiones que deberás liderar
| Tema | Opciones | Criterio simple |
|---|---|---|
| Base de datos | H2 / PostgreSQL / otra | H2 solo para desarrollo y pruebas; PostgreSQL en producción |
| Migraciones | Flyway / Liquibase | Siempre en producción, con esquema versionado |
| Acceso a datos | Panache active record / repository / JPA puro | Active record para CRUD simple; repository si hay dominio rico |
| Identidad | Propia / OIDC (Keycloak, Entra ID) | OIDC en cuanto haya más de una app o usuarios reales |
| Estilo de API | REST / gRPC / mensajería | REST para el frontend; mensajería para integraciones asíncronas |
| Despliegue | JVM / nativo (GraalVM) / contenedor | JVM en contenedor; nativo si importa el arranque y la memoria |
| Contrato | OpenAPI como fuente | Generar el cliente de Angular desde `/openapi` |

## 2. Pruebas

### Qué existe
[PolicyResourceTest.java](../quarkus-api/src/test/java/com/example/policies/PolicyResourceTest.java) con `@QuarkusTest` + REST Assured:

| Cubre | Prueba |
|---|---|
| Datos semilla y orden | `listsSeedPolicies` |
| CRUD completo | `performsPolicyCrudOperations` |
| 401 sin token y con token inválido | `rejectsRequestsWithoutToken`, `rejectsInvalidToken` |
| 403 para rol USER | `forbidsWritesForUserRole` |
| Login fallido | `rejectsWrongCredentials` |
| OpenAPI y Swagger | `exposesOpenApiAndSwaggerUi` |
| CORS | `allowsAngularOrigin` |

Las pruebas obtienen **tokens reales** llamando al login: validan el flujo completo (firma, roles) en lugar de simularlo.

### Huecos para el backlog
- Token **expirado** y de **emisor incorrecto**.
- Validación de entrada (cuerpo vacío, estado inválido, número duplicado → 409).
- `PUT`/`DELETE` sobre un id inexistente (404), `GET` por id inexistente.
- Orden y aislamiento: una prueba crea datos y la BD es compartida; usar datos únicos o limpiar.
- Pruebas unitarias de lógica cuando exista capa de servicio (sin levantar Quarkus).

### Herramientas
- `@QuarkusTest`: arranca la app una vez por clase/suite (rápido y realista).
- `@QuarkusIntegrationTest`: prueba el artefacto empaquetado.
- **Dev Services:** Quarkus levanta contenedores (p. ej. PostgreSQL) automáticamente en pruebas; ideal cuando se pase de H2 a una BD real.
- Cobertura con JaCoCo (`quarkus-jacoco`) como señal, no como meta.

### Qué exigir en un PR
- Todo cambio de comportamiento trae pruebas, incluidos los caminos de error y de seguridad.
- Pruebas deterministas e independientes entre sí.
- La suite corre en CI con **JDK 21**.

> Nota: en este entorno `./mvnw test` falló por usar un JDK que no soporta `release 21`; es un problema de entorno, no del código.

## 3. Rendimiento

Qué vigilar (orden de impacto típico):
1. **Consultas a BD:** índices, evitar N+1, **paginación** (hoy `GET /api/policies` devuelve todo).
2. **Transacciones:** cortas; no abrir `@Transactional` en lecturas sin necesidad.
3. **Pool de conexiones** y límites (`quarkus.datasource.jdbc.max-size`).
4. **Serialización:** no devolver entidades enormes o con relaciones.
5. **Arranque y memoria:** Quarkus ya es eficiente; el modo nativo mejora más, a cambio de builds más lentos y restricciones de reflexión.
6. **Concurrencia:** Quarkus REST puede usar hilos de trabajo o *event loop* (`@RunOnVirtualThread` con Java 21 para código bloqueante).

Medir antes de optimizar: métricas Micrometer, trazas OpenTelemetry, pruebas de carga (k6, Gatling).

## 4. Buenas prácticas (resumen)

- Validar toda entrada en la frontera (`quarkus-hibernate-validator`: `@NotBlank`, `@Size`, enum para estado).
- DTOs de entrada **y** salida; no exponer entidades.
- Códigos HTTP coherentes y errores con formato uniforme (`ExceptionMapper`).
- Configuración por perfil (`%dev`, `%test`, `%prod`) y secretos por variables de entorno.
- Migraciones de esquema versionadas; `drop-and-create` jamás en producción.
- Logs estructurados, id de correlación, `health`/`metrics` habilitados.
- Dependencias al día (versión LTS de Quarkus) y análisis de vulnerabilidades en CI.
- Contenedor con usuario no root y imagen mínima.
- Versionado del API (`/api/v1/...`) cuando haya consumidores externos.
- CI: compilar → pruebas → análisis estático → empaquetar → escanear.

## 5. Hallazgos de la revisión del proyecto (casos de estudio)

| # | Severidad | Hallazgo | Recomendación |
|---|---|---|---|
| 1 | Alta | Clave privada JWT en `src/main/resources` (se empaqueta) | Gestor de secretos o volumen externo |
| 2 | Alta | Contraseñas demo por defecto en `application.properties` y usuarios fijos en código | Variables de entorno obligatorias, o proveedor de identidad; hash de contraseñas |
| 3 | Media | Sin validación de `PolicyRequest`; cuerpo nulo o estado arbitrario | Bean Validation + enum + 400 |
| 4 | Media | Número de póliza duplicado produce error de BD (500) | Controlar y responder 409 |
| 5 | Media | Sin límite de intentos de login | Rate limiting / bloqueo temporal |
| 6 | Baja | `swagger-ui.always-include=true` | Restringir o desactivar en producción |
| 7 | Baja | Listado sin paginación | Parámetros `page/size` |
| 8 | Baja | Entidad devuelta directamente | DTO de salida |
| 9 | Info | H2 en memoria y `drop-and-create` | Correcto para el curso; BD real + Flyway en producción |
| 10 | Info | Sin validación de token expirado/emisor en pruebas | Añadir casos |

## 6. Checklist de code review para Quarkus

### API y contrato
- [ ] ¿Rutas, verbos y códigos HTTP siguen REST (201, 204, 404, 409, 400)?
- [ ] ¿Cuerpos de entrada son DTOs validados (no entidades)?
- [ ] ¿La respuesta no expone campos internos?
- [ ] ¿OpenAPI refleja el cambio (`@Operation`, `@Tag`, seguridad)?

### Seguridad
- [ ] ¿Cada endpoint declara explícitamente su acceso (`@RolesAllowed`/`@PermitAll`)?
- [ ] ¿Sin secretos, claves ni contraseñas en el código o en el repositorio?
- [ ] ¿Sin datos sensibles en logs o mensajes de error?
- [ ] ¿CORS restringido a orígenes conocidos?
- [ ] ¿Las nuevas rutas públicas están justificadas?

### Datos y transacciones
- [ ] ¿Las escrituras están en `@Transactional`?
- [ ] ¿Consultas parametrizadas, con índices y sin N+1?
- [ ] ¿Listas grandes paginadas?
- [ ] ¿Cambios de esquema vienen con migración?

### Errores y observabilidad
- [ ] ¿Excepciones mapeadas a códigos HTTP con formato uniforme?
- [ ] ¿Logs útiles y sin ruido; id de correlación?
- [ ] ¿Salud y métricas cubren el cambio?

### Diseño
- [ ] ¿El recurso solo orquesta; la lógica está en un servicio?
- [ ] ¿Sin estado mutable por petición en campos de beans singleton?
- [ ] ¿Sin duplicación entre `create` y `update`?
- [ ] ¿Configuración por perfil y variable de entorno?

### Calidad
- [ ] ¿Pruebas de camino feliz, errores y seguridad (401/403)?
- [ ] ¿Pruebas independientes y deterministas?
- [ ] ¿Compila y pasa la suite en CI con JDK 21?
- [ ] ¿Dependencias nuevas justificadas y auditadas?

## 7. Cómo dar feedback como líder (plantilla)

> **Observación:** `create` no valida `policyNumber`; un cuerpo vacío o duplicado produce un 500.
> **Impacto:** errores confusos para el cliente y posible inconsistencia de datos.
> **Sugerencia:** añadir `@Valid` + `@NotBlank`, enum para estado, y responder 400/409.
> **Prioridad:** media; crear tarea si no entra en este PR.

Mantén tres niveles: **bloqueante** (seguridad, pérdida de datos), **importante** (mantenibilidad), **sugerencia** (estilo).

## 8. Ejercicios

1. Propón la estructura por capas para este backend y asigna cada clase actual.
2. Elige tres pruebas pendientes y ordénalas por riesgo.
3. Redacta el comentario de PR para los hallazgos 1 y 4.
4. Define un *Definition of Done* para un cambio en el backend (5 puntos).
5. Decide: ¿cuándo pasarías a Keycloak/OIDC y qué cambiaría en el código? (pista: `AuthResource` desaparece; quedaría `quarkus-oidc` validando tokens).

## 9. Preguntas que un líder debería poder responder

- ¿Qué cambia entre ejecutar en JVM y en modo nativo?
- ¿Cómo evitas que frontend y backend se desalineen? (OpenAPI → cliente generado + pruebas de contrato)
- ¿Cómo gestionas cambios de esquema sin perder datos?
- ¿Qué pruebas son obligatorias antes de desplegar?
- ¿Dónde se guardan y rotan los secretos?

## 10. Plan posterior a los 4 días

1. Levantar el backend, ejecutar las pruebas con JDK 21 y revisar un cambio real con el checklist.
2. Proponer al equipo: validación, 409/400 consistentes, paginación, migraciones y secretos externos.
3. Profundizar en: Panache avanzado, Bean Validation, Flyway, `quarkus-oidc`, Micrometer/OpenTelemetry y modo nativo.
4. Recursos oficiales: quarkus.io/guides (Getting Started, REST, Hibernate ORM with Panache, Security JWT/OIDC).
