# Quarkus — Día 1: Conceptos base, estructura y ciclo de vida de una petición

**Objetivo (líder técnico):** explicar qué es Quarkus, cómo está armado el backend del proyecto y qué ocurre desde que llega una petición HTTP hasta que se responde JSON.

**Tiempo sugerido:** 3–4 h.

---

## 1. Qué es Quarkus

- Framework Java para APIs y microservicios, orientado a **arranque rápido, poco consumo de memoria** y buena experiencia de desarrollo (*dev mode* con recarga en caliente).
- Usa estándares: **Jakarta EE** (JAX-RS/REST, CDI, JPA, transacciones) y **MicroProfile** (config, OpenAPI, JWT).
- Hace mucho trabajo en **tiempo de compilación** (construcción del grafo de inyección, etc.), por eso arranca rápido y permite compilar a binario nativo (GraalVM).
- Se compone de **extensiones**: cada capacidad se agrega como dependencia (`quarkus-rest-jackson`, `quarkus-hibernate-orm-panache`, …).

Comparación útil: es el equivalente a Spring Boot en su rol; cambia el modelo (CDI en vez de Spring DI) y la filosofía (más trabajo en build).

## 2. Mapa del proyecto

```
quarkus-api/
├── pom.xml                              # dependencias (extensiones) y plugins
├── mvnw / mvnw.cmd                      # Maven Wrapper (no requiere Maven instalado)
└── src/
    ├── main/
    │   ├── java/com/example/policies/
    │   │   ├── ApiApplication.java      # raíz JAX-RS + metadatos OpenAPI/seguridad
    │   │   ├── AuthResource.java        # POST /api/auth/login (emite el JWT)
    │   │   ├── PolicyResource.java      # CRUD /api/policies (protegido por roles)
    │   │   └── Policy.java              # entidad JPA (Panache)
    │   └── resources/
    │       ├── application.properties   # configuración
    │       ├── import.sql               # datos semilla (5 pólizas)
    │       ├── privateKey.pem           # firma de JWT (solo demo)
    │       └── publicKey.pem            # verificación de JWT
    └── test/java/.../PolicyResourceTest.java   # pruebas REST con JWT reales
```

**Cómo leerlo:** `pom.xml` (qué capacidades tiene) → `application.properties` (cómo está configurado) → recursos REST (qué expone) → entidad (qué guarda) → pruebas (qué garantiza).

## 3. Extensiones (dependencias) y para qué sirven

Archivo: [pom.xml](../quarkus-api/pom.xml)

| Extensión | Qué aporta | Dónde se nota |
|---|---|---|
| `quarkus-rest-jackson` | API REST + JSON | `@Path`, `@GET`, records como cuerpo |
| `quarkus-hibernate-orm-panache` | JPA simplificado (active record) | `Policy.listAll()`, `persist()` |
| `quarkus-jdbc-h2` | Base H2 | BD en memoria |
| `quarkus-smallrye-openapi` | Documentación `/openapi` y `/swagger-ui` | etiquetas `@Tag`, `@Operation` |
| `quarkus-smallrye-jwt` | **Verificar** JWT y aplicar roles | `@RolesAllowed` |
| `quarkus-smallrye-jwt-build` | **Emitir** JWT | `Jwt.issuer(...).sign()` |
| `quarkus-junit` + `rest-assured` | Pruebas | `PolicyResourceTest` |

**Observación de líder:** no existe `quarkus-hibernate-validator`; por eso el backend no valida campos (ver Día 4).

El *BOM* (`quarkus-bom 3.40.1`) fija versiones compatibles; no pongas versión a cada extensión.

## 4. Arranque y comandos

```bash
cd quarkus-api
./mvnw quarkus:dev      # dev mode: recarga en caliente, http://localhost:8080
./mvnw test             # pruebas (requiere JDK 21)
./mvnw package          # genera target/quarkus-app/quarkus-run.jar
java -jar target/quarkus-app/quarkus-run.jar
```

- Requiere **JDK 21** completo (con `javac`); el proyecto compila con `release 21`. Con un JDK distinto falla con `release version 21 not supported`.
- URLs útiles: `/swagger-ui`, `/openapi`, `/q/dev` (consola de dev, solo en dev mode).

## 5. Ciclo de vida de una petición

Ejemplo: `GET /api/policies` con token de `user`.

1. **Servidor HTTP** (Vert.x, integrado) recibe la petición. Aplica **CORS** (`quarkus.http.cors.*`): solo permite el origen `http://localhost:4200`.
2. **Autenticación (smallrye-jwt):** lee `Authorization: Bearer <token>`, valida **firma** (clave pública), **emisor** (`mp.jwt.verify.issuer=policies-api`) y **expiración**.
   - Token ausente/inválido en un endpoint protegido → **401**.
3. **Autorización:** compara los `groups` del token con `@RolesAllowed`. Sin rol suficiente → **403**.
4. **Enrutamiento JAX-RS:** `@Path("/api/policies")` + `@GET` → `PolicyResource.findAll()`.
5. **Lógica:** `Policy.listAll(Sort.by("id"))` consulta H2 vía Hibernate/Panache.
6. **Serialización:** Jackson convierte la lista de `Policy` a JSON.
7. **Respuesta:** `200 OK` + JSON. Excepciones (`NotFoundException`) se convierten en 404.

```
Cliente → CORS → Autenticación JWT → @RolesAllowed → Resource → Panache/H2
                                                         ↓
                 JSON ← Jackson ← entidad/DTO ← resultado
```

### Ciclo del login
`POST /api/auth/login` (`@PermitAll`) → compara usuario/contraseña → firma JWT con la clave privada (claims: `upn`, `groups`, `exp`, `iss`) → responde `{token, tokenType, expiresInSeconds}`.

## 6. Conceptos mínimos de hoy

| Concepto | En una frase | Ejemplo |
|---|---|---|
| Resource (JAX-RS) | Clase que expone endpoints HTTP | `PolicyResource` |
| CDI | Inyección de dependencias estándar de Jakarta | `@ConfigProperty` en `AuthResource` |
| Entidad JPA | Clase mapeada a una tabla | `Policy` → tabla `policies` |
| Panache | Atajos para consultas y persistencia | `Policy.findById`, `persist()` |
| Record | Clase inmutable concisa; usada como cuerpo JSON | `PolicyRequest`, `LoginRequest` |
| `application.properties` | Configuración (se puede sobreescribir con variables de entorno) | puerto, CORS, JWT |
| Dev mode | Recarga en caliente, consola de desarrollo | `./mvnw quarkus:dev` |

## 7. Ejercicios

1. Levanta el backend en dev mode y abre `/swagger-ui`. Haz login desde Swagger y autoriza con el token (botón **Authorize**).
2. Llama `GET /api/policies` sin token → 401; con token de `user` → 200; `POST` con `user` → 403.
3. En `application.properties` identifica: puerto, CORS, claves JWT, BD, script de carga.
4. Dibuja el flujo de la sección 5 sin mirar el documento.

## 8. Autoevaluación

- ¿Qué diferencia hay entre 401 y 403 y quién las produce?
- ¿Qué hace Quarkus distinto de un framework que trabaja todo en tiempo de ejecución?
- ¿Para qué sirve el BOM?
- ¿Por qué hay dos extensiones JWT?

## 9. Lo que un líder debe llevarse

- Ubicar cualquier funcionalidad con: recurso → entidad → configuración → prueba.
- Entender que la seguridad se declara con anotaciones y configuración, y la aplica el framework antes de llegar a tu código.
- Saber los requisitos de entorno (JDK 21, Maven Wrapper) para evitar fallos de build.
