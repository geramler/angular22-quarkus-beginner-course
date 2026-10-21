# Quarkus — Día 3: Seguridad con JWT, roles, CORS y manejo de errores

**Objetivo (líder técnico):** entender cómo se autentica y autoriza en el backend, y evaluar riesgos y decisiones.

**Tiempo sugerido:** 3–4 h.

---

## 1. Visión general

```
Cliente --(usuario/clave)--> POST /api/auth/login --> JWT firmado (clave privada)
Cliente --(Authorization: Bearer JWT)--> /api/policies
Servidor: verifica firma (clave pública) + emisor + expiración + roles
```

- **Autenticación:** ¿quién eres? Se demuestra con el JWT.
- **Autorización:** ¿qué puedes hacer? Rol `USER` o `ADMIN` (claim `groups`).
- Es **sin estado** (*stateless*): el servidor no guarda sesiones; todo viaja en el token.

## 2. Qué contiene el token

Emitido en [AuthResource.java](../quarkus-api/src/main/java/com/example/policies/AuthResource.java):

```java
Jwt.issuer("policies-api").upn(username).groups(Set.of(role))
   .expiresIn(Duration.ofMinutes(tokenMinutes)).sign();
```

| Claim | Significado |
|---|---|
| `iss` | Emisor; el servidor exige `policies-api` |
| `upn` | Usuario |
| `groups` | Roles (los que lee `@RolesAllowed`) |
| `iat/exp` | Emisión y expiración (60 min por configuración) |

El JWT es **firmado, no cifrado**: cualquiera puede leer su contenido; nadie puede alterarlo sin invalidar la firma. Nunca pongas secretos en él.

## 3. Configuración de seguridad

En [application.properties](../quarkus-api/src/main/resources/application.properties):

| Propiedad | Función |
|---|---|
| `smallrye.jwt.sign.key.location=privateKey.pem` | Clave **privada** para firmar |
| `mp.jwt.verify.publickey.location=publicKey.pem` | Clave **pública** para verificar |
| `mp.jwt.verify.issuer=policies-api` | Emisor exigido |
| `app.auth.*` | Contraseñas demo y minutos de vigencia |
| `quarkus.http.cors.*` | Origen, métodos y cabeceras permitidos |

Criptografía asimétrica (RSA): quien verifica solo necesita la clave pública. Esto permite que otros servicios validen tokens sin poder emitirlos.

## 4. Autorización declarativa

Archivo: [PolicyResource.java](../quarkus-api/src/main/java/com/example/policies/PolicyResource.java)

- Clase: `@RolesAllowed({"USER","ADMIN"})` → todo requiere autenticación.
- Métodos de escritura: `@RolesAllowed("ADMIN")` → sobreescribe.
- Login: `@PermitAll` → público.

Resultado verificado por las pruebas (`PolicyResourceTest`):

| Caso | Esperado |
|---|---|
| Sin token | 401 |
| Token inválido | 401 |
| `USER` hace `POST`/`DELETE` | 403 |
| `ADMIN` hace CRUD | 200/201/204 |
| Credenciales incorrectas | 401 |

**Principio:** la autorización se aplica **en el servidor, antes de ejecutar tu método**. Los guards de Angular son solo UX.

## 5. Revisión del login

Puntos buenos:
- Compara contraseñas con `MessageDigest.isEqual` (**tiempo constante**, evita ataques por temporización).
- Responde 401 genérico: no revela si falló el usuario o la contraseña.
- Token con expiración.

Puntos débiles (aceptables en demo, bloqueantes en producción):
- **Usuarios y contraseñas fijos** en un `Map` y en `application.properties`. Producción: proveedor de identidad (Keycloak/OIDC, Entra ID, Auth0) o base de usuarios con contraseñas **hash** (bcrypt/argon2).
- **Contraseñas en claro** en configuración con valores por defecto conocidos.
- **Sin límite de intentos** (fuerza bruta) ni bloqueo/retardo.
- **Sin refresh token ni revocación:** un token robado sirve hasta que expira (60 min).
- **Clave privada dentro de `src/main/resources`:** queda empaquetada en el artefacto.

## 6. Modelo recomendado para producción

1. Delegar autenticación a un **proveedor OIDC** (`quarkus-oidc`): el backend solo valida tokens (modo *service/bearer*).
2. Tokens de acceso de vida corta + *refresh tokens*.
3. Claves y secretos en gestor de secretos (Vault, Key Vault, Kubernetes Secrets); rotación periódica; `kid` para rotar sin cortar el servicio.
4. HTTPS obligatorio (el JWT por HTTP plano se puede interceptar).
5. Roles y permisos definidos en el proveedor, no en código.

## 7. CORS

```
quarkus.http.cors.origins=http://localhost:4200
quarkus.http.cors.methods=GET,POST,PUT,DELETE,OPTIONS
quarkus.http.cors.headers=Content-Type,Authorization
```

- CORS es una protección **del navegador**; no impide llamadas desde `curl` u otros servidores. No sustituye a la autenticación.
- Producción: el origen real (HTTPS); nunca `*` junto con credenciales/cookies.
- Una petición con cabecera `Authorization` genera un *preflight* `OPTIONS`; por eso `Authorization` y `OPTIONS` están permitidos.

## 8. Otros riesgos a vigilar (lista de líder)

| Tema | Pregunta |
|---|---|
| Swagger UI | `quarkus.swagger-ui.always-include=true` lo deja disponible también en producción. ¿Debe estar expuesto? |
| Endpoints de salud/métricas | ¿Se expondrán `/q/health`, `/q/metrics`? ¿Con qué protección? |
| Registro (logs) | Nunca registrar tokens ni contraseñas |
| Validación de entrada | Evita datos inválidos y abusos (ver Día 4) |
| Dependencias | Revisar CVEs (`mvn dependency-check`/Dependabot) y actualizar Quarkus (LTS) |
| Inyección SQL | Panache usa parámetros; evita concatenar texto en consultas |

## 9. Manejo de errores y trazabilidad

- Códigos: 401 (no autenticado), 403 (sin permiso), 404 (no existe), 409 (conflicto), 400/422 (entrada inválida).
- Recomendado: un `ExceptionMapper` para respuestas de error consistentes (código, mensaje, id de correlación) sin filtrar detalles internos.
- Registro: `quarkus.log.*`; logs estructurados (JSON) en producción; id de correlación por petición.
- Observabilidad: `quarkus-micrometer`, `quarkus-opentelemetry`, `quarkus-smallrye-health`.

## 10. Ejercicios

1. En Swagger, haz login como `user`; decodifica el token (solo datos demo) y comprueba `groups`, `iss` y `exp`.
2. Con el token de `user`, prueba `DELETE /api/policies/1`: debe ser 403. Con `admin`: 204.
3. Cambia mentalmente `app.auth.token-minutes` a 1. ¿Qué verá el frontend a los 61 s? (401 → vuelve al login).
4. Escribe tres requisitos de seguridad que exigirías antes de salir a producción.
5. Lee `PolicyResourceTest` y confirma qué casos de seguridad están cubiertos y cuáles no (p. ej., token expirado, emisor incorrecto).

## 11. Autoevaluación

- ¿Por qué se usa clave privada para firmar y pública para verificar?
- ¿Qué pasa si alguien modifica el claim `groups` de un token?
- ¿Por qué CORS no protege la API?
- ¿Cuál es el riesgo de un token de 60 min sin revocación y cómo se mitiga?
- ¿Por qué no es buena idea tener usuarios en un `Map` en el código?

## 12. Lo que un líder debe llevarse

- Separar lo declarativo (anotaciones/configuración) de lo que debe resolverse con infraestructura (identidad, secretos, HTTPS).
- Poder enumerar con rapidez los riesgos del esquema actual y la ruta de endurecimiento.
- Exigir que la seguridad esté cubierta por pruebas automatizadas.
