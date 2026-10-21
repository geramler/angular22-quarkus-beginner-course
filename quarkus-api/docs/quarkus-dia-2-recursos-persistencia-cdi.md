# Quarkus — Día 2: Recursos REST, persistencia, CDI y cómo revisar código

**Objetivo (líder técnico):** leer un recurso REST y su persistencia y juzgar rápido si está bien diseñado: contrato, transacciones, validación y manejo de errores.

**Tiempo sugerido:** 3–4 h.

---

## 1. Recursos REST (JAX-RS)

Archivo: [PolicyResource.java](../quarkus-api/src/main/java/com/example/policies/PolicyResource.java)

```java
@Path("/api/policies")
@RolesAllowed({"USER", "ADMIN"})
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class PolicyResource { ... }
```

| Anotación | Significado |
|---|---|
| `@Path` | Ruta base (en clase) y subruta (en método) |
| `@GET/@POST/@PUT/@DELETE` | Verbo HTTP |
| `@PathParam("id")` | Valor tomado de la URL |
| `@Consumes/@Produces` | Formato de entrada/salida (JSON) |
| `@RolesAllowed` | Quién puede invocar (a nivel clase y sobreescrito por método) |
| `@Transactional` | Abre/cierra una transacción alrededor del método |

Tabla del API:

| Verbo y ruta | Rol | Respuesta |
|---|---|---|
| `GET /api/policies` | USER, ADMIN | 200 lista ordenada por `id` |
| `GET /api/policies/{id}` | USER, ADMIN | 200 o 404 |
| `POST /api/policies` | ADMIN | 201 con la póliza creada |
| `PUT /api/policies/{id}` | ADMIN | 200 o 404 |
| `DELETE /api/policies/{id}` | ADMIN | 204 o 404 |
| `POST /api/auth/login` | público | 200 con token / 401 |

Detalles para revisar:
- `@RolesAllowed("ADMIN")` en el método **sobreescribe** el de la clase: así lectura es para ambos roles y escritura solo para ADMIN.
- `create` responde **201** usando `Response`; `delete` responde **204** sin cuerpo. Códigos coherentes con REST.
- `NotFoundException` se traduce automáticamente a **404**.

## 2. Entidad y persistencia con Panache

Archivo: [Policy.java](../quarkus-api/src/main/java/com/example/policies/Policy.java)

```java
@Entity @Table(name = "policies")
public class Policy extends PanacheEntityBase {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "policy_number", nullable = false, unique = true) public String policyNumber;
    ...
}
```

- **Active record:** la entidad tiene métodos estáticos (`Policy.listAll`, `Policy.findById`, `Policy.deleteById`) y de instancia (`persist`). Menos código que repositorios; alternativa: patrón *repository*.
- Campos públicos son una convención de Panache (Quarkus genera los accesores).
- Restricciones a nivel BD: `nullable = false` y `unique` en `policy_number`.

### Configuración de datos
Archivo: [application.properties](../quarkus-api/src/main/resources/application.properties)

- `quarkus.datasource.db-kind=h2` y URL **en memoria** → los datos se pierden al reiniciar.
- `quarkus.hibernate-orm.schema-management.strategy=drop-and-create` → recrea el esquema en cada arranque. **Solo desarrollo.**
- `quarkus.hibernate-orm.sql-load-script=import.sql` → carga 5 pólizas semilla.

Producción: BD real (PostgreSQL, etc.), migraciones con **Flyway/Liquibase** y estrategia `none`/`validate`.

## 3. Transacciones

- `@Transactional` en `create`, `update`, `delete`.
- En `update`, la entidad se obtiene dentro de la transacción y se modifican sus campos: Hibernate detecta el cambio y hace el `UPDATE` al finalizar (*dirty checking*); por eso no hay un `persist` explícito.
- Las lecturas (`GET`) no necesitan transacción.

Pregunta de revisión: *¿está cada escritura dentro de una transacción?* Aquí sí.

## 4. Records como cuerpos de petición (DTOs)

```java
public record PolicyRequest(String policyNumber, String customerName, String status) {}
```

- Los records son inmutables y concisos; Jackson los deserializa.
- Buena práctica ya aplicada: **el cuerpo de entrada es distinto de la entidad** (`PolicyRequest` vs `Policy`), así el cliente no controla el `id`.
- Mejora pendiente: la **respuesta** sí devuelve la entidad directamente; en APIs mayores se prefiere un DTO de salida para no acoplar el contrato a la tabla.

## 5. CDI y configuración

Archivo: [AuthResource.java](../quarkus-api/src/main/java/com/example/policies/AuthResource.java)

```java
@ConfigProperty(name = "app.auth.admin-password") String adminPassword;
@ConfigProperty(name = "app.auth.token-minutes")  long tokenMinutes;
```

- `@ConfigProperty` inyecta valores de `application.properties`, variables de entorno o propiedades del sistema (las variables de entorno tienen prioridad: `APP_AUTH_ADMIN_PASSWORD`).
- Los recursos son beans CDI (por defecto de alcance *singleton* en Quarkus REST): **no guardes estado por petición en campos**.

## 6. Documentación automática (OpenAPI)

- [ApiApplication.java](../quarkus-api/src/main/java/com/example/policies/ApiApplication.java) define `@OpenAPIDefinition` y el esquema de seguridad `bearerAuth`.
- `@SecurityRequirement(name = "bearerAuth")` marca los endpoints protegidos.
- Resultado: `/openapi` (contrato) y `/swagger-ui` (probar a mano). El contrato puede alimentar un cliente tipado para Angular.

## 7. Manejo de errores hoy

| Situación | Resultado actual | Comentario |
|---|---|---|
| ID inexistente | 404 | Correcto |
| Sin token / token inválido | 401 | Correcto |
| Rol insuficiente | 403 | Correcto |
| Cuerpo JSON ausente o inválido | 400 o error del servidor | Sin validación explícita; `request.policyNumber()` con cuerpo nulo puede fallar |
| Número de póliza duplicado | Error de restricción única → 500 | Debería ser 409 Conflict |
| Estado distinto de ACTIVE/INACTIVE | Se guarda tal cual | Falta validar |

## 8. Cómo revisar un recurso en 5 minutos (método)

1. ¿Rutas y verbos siguen REST? ¿Códigos de respuesta correctos?
2. ¿Cada endpoint declara su regla de acceso (roles)?
3. ¿Las escrituras están en `@Transactional`?
4. ¿La entrada está validada y es un DTO (no la entidad)?
5. ¿Errores mapeados a códigos HTTP adecuados?
6. ¿Hay lógica de negocio dentro del recurso que debería estar en un servicio?
7. ¿Existe prueba para el camino feliz y los de error?

## 9. Observaciones del proyecto (casos para practicar criterio)

| Observación | Comentario |
|---|---|
| La lógica vive directamente en el recurso | Aceptable en un CRUD simple; al crecer, extraer una capa de servicio |
| Estado como `String` | Mejor un `enum` con validación |
| Duplicación al copiar campos en `create` y `update` | Extraer un método de mapeo |
| `Policy.deleteById` devuelve booleano usado para el 404 | Correcto y simple |
| Usuarios definidos en un `Map` en el código | Solo demo; ver Día 3 |

## 10. Ejercicios

1. Usando Swagger, crea una póliza con `policyNumber` repetido. ¿Qué código HTTP recibes? ¿Cuál debería ser?
2. Envía un `POST` con cuerpo vacío. Registra la respuesta.
3. Cambia `update` mentalmente para devolver 404 con mensaje útil si el número ya existe en otra póliza.
4. Lista dos cambios que harías para que la API sea apta para paginación (`GET /api/policies?page=0&size=20`).

## 11. Autoevaluación

- ¿Qué es Panache y qué ventajas/riesgos tiene el active record?
- ¿Por qué no se llama `persist` en `update`?
- ¿Qué diferencia hay entre DTO de entrada y entidad?
- ¿Qué significa `drop-and-create` y por qué no va a producción?

## 12. Lo que un líder debe llevarse

- Evaluar un endpoint por: contrato, seguridad, transacción, validación y errores.
- Reconocer qué es aceptable en un demo y qué debe cambiar antes de producción (BD real, migraciones, validación, DTOs de salida).
