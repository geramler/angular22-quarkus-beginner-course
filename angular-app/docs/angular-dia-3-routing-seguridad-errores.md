# Día 3 — Routing, guards, interceptores, seguridad y manejo de errores

**Objetivo (líder técnico):** entender el modelo de autenticación/autorización de punta a punta, y evaluar sus riesgos y decisiones.

**Tiempo sugerido:** 3–4 h.

---

## 1. Routing

Archivo: [app.routes.ts](../angular-app/src/app/app.routes.ts)

| Ruta | Componente | Protección |
|---|---|---|
| `/` | redirige a `/policies` | — |
| `/login` | LoginComponent | pública |
| `/policies` | PolicyListComponent | autenticado |
| `/policies/new` | PolicyFormComponent | autenticado + admin |
| `/policies/:id/edit` | PolicyFormComponent | autenticado + admin |
| `/policies/:id` | PolicyDetailComponent | autenticado |
| `**` | redirige a `/policies` | — |

Puntos a revisar:
- **El orden importa:** `policies/new` va antes de `policies/:id`; si no, "new" se interpretaría como un `id`.
- `:id` llega como texto: los componentes lo validan (`Number.isSafeInteger`) antes de llamar a la API.
- Un mismo componente (`PolicyFormComponent`) sirve a crear y editar según haya `id`.
- Falta (hoy) **lazy loading**: todo se carga en un solo bundle. Con pocas pantallas es aceptable; con muchas, no.

## 2. Guards (control de acceso en la UI)

Archivo: [auth.guard.ts](../angular-app/src/app/auth.guard.ts)

- `authenticatedGuard`: si no hay sesión válida → `UrlTree` hacia `/login?returnUrl=...`.
- `adminGuard`: si no es admin → redirige a `/policies`.
- Devolver un `UrlTree` (en vez de navegar imperativamente) es la forma recomendada.

> **Principio clave:** los guards y el ocultar botones son **experiencia de usuario, no seguridad**. Cualquiera puede modificar el JavaScript del navegador. La autorización real es `@RolesAllowed` en el backend (`PolicyResource`).

## 3. Interceptor HTTP

Archivo: [auth.interceptor.ts](../angular-app/src/app/auth.interceptor.ts)

Hace tres cosas:
1. **Filtra:** solo actúa en URLs de la API (`API_BASE_URL`) y **omite** `/auth/login`. Así el token nunca se envía a terceros.
2. **Adjunta** `Authorization: Bearer <token>` clonando la petición (las peticiones son inmutables).
3. **Reacciona a 401:** cierra sesión y redirige a `/login` conservando la URL de retorno.

Preguntas de revisión:
- ¿Qué pasa con un **403** (autenticado pero sin permiso)? Hoy no se maneja globalmente; cada componente muestra su propio error. Decisión de diseño pendiente: mensaje global o redirección.
- ¿Puede el token filtrarse a otro dominio? No: el prefijo de la URL lo impide.

## 4. Modelo de autenticación del proyecto (JWT)

1. `POST /api/auth/login` con usuario/contraseña.
2. El backend ([AuthResource.java](../quarkus-api/src/main/java/com/example/policies/AuthResource.java)) compara credenciales (en tiempo constante) y firma un **JWT** con clave privada: claims `upn` (usuario), `groups` (rol), `exp` (expiración), `iss`.
3. El frontend guarda el token y lo envía en cada petición.
4. El backend verifica **firma + emisor + expiración** con la clave pública y aplica roles.

El frontend **decodifica** el payload solo para mostrar usuario/rol y programar la expiración. **No verifica la firma** (no puede ni debe): es solo UX.

### Autenticación vs autorización
- **Autenticación:** ¿quién eres? → login + JWT válido (401 si falla).
- **Autorización:** ¿qué puedes hacer? → rol `USER` o `ADMIN` (403 si no alcanza).

| Acción | USER | ADMIN |
|---|---|---|
| Listar / ver | ✅ | ✅ |
| Crear / editar / borrar | ❌ (403) | ✅ |

## 5. Seguridad en el frontend: lo que debes saber evaluar

### Dónde guardar el token
| Opción | Ventaja | Riesgo |
|---|---|---|
| `sessionStorage` (actual) | Se borra al cerrar la pestaña; simple | Un XSS puede leerlo |
| `localStorage` | Persiste entre sesiones | Un XSS puede leerlo; vive más tiempo |
| Cookie `HttpOnly` + `SameSite` | JavaScript no puede leerla | Requiere considerar CSRF y mismo sitio/CORS |

Una decisión de arquitectura habitual en producción: **cookie HttpOnly + refresh token** (token de acceso de vida corta). El proyecto usa token de 60 min sin refresh: correcto para aprendizaje, a revisar para producción.

### XSS
Angular **escapa por defecto** todo lo que va en `{{ }}`. El peligro aparece al usar `innerHTML`, `bypassSecurityTrust*` o librerías de terceros. Regla de revisión: cualquier `bypassSecurityTrust*` requiere justificación.

### CORS
Configurado en el backend (`quarkus.http.cors.origins=http://localhost:4200`). Solo permite el origen del frontend. En producción debe ser el dominio real, nunca `*` con credenciales.

### Secretos y configuración
- La clave privada JWT y las contraseñas demo están en `src/main/resources` → **aceptable solo para el curso**.
- Producción: secretos en variables de entorno/gestor de secretos; claves fuera del repositorio.
- `API_BASE_URL` está fija en el código ([api-url.ts](../angular-app/src/app/api-url.ts)); en proyectos reales va por **entorno** (dev/staging/prod).

### Dependencias
Ejecutar `npm audit` y mantener actualizado Angular. Una librería nueva es una decisión de riesgo (mantenimiento, licencia, tamaño).

## 6. Manejo de errores

Capas, de local a global:

1. **Componente:** `subscribe({ next, error })` → mensaje claro al usuario y se libera el estado de "cargando/guardando".
2. **Interceptor:** errores transversales (401 → logout).
3. **Backend:** códigos HTTP coherentes (401, 403, 404, 400/422 cuando exista validación).
4. **Global (pendiente):** `ErrorHandler` de Angular + telemetría (Sentry, App Insights) para errores no controlados.

Buenas prácticas:
- No mostrar mensajes técnicos al usuario; sí registrarlos.
- Diferenciar errores por `status`: 0 (sin red), 401, 403, 404, 5xx.
- Evitar estados bloqueados: toda ruta de error debe poner `loading/saving` en `false` (el proyecto lo hace).
- El mensaje de login distingue "credenciales incorrectas" (401) de "no se pudo conectar" (otros): ejemplo correcto de tratamiento por `status`.

## 7. Ejercicios

1. Con `user` abre manualmente `/policies/new`. ¿Qué pasa? ¿Por qué? Luego, con DevTools, intenta un `POST` a la API con el token de `user` (usa Swagger en `/swagger-ui` → **Authorize**). Confirma el 403: el backend protege aunque la UI se salte.
2. Borra el token de Session Storage y recarga. ¿A dónde te lleva y con qué `returnUrl`?
3. Modifica mentalmente el interceptor para manejar 403. ¿Redirigirías, mostrarías un aviso, o ambos? Justifica.
4. Lista tres riesgos de producción que ves en la configuración actual (pista: claves, contraseñas, URL fija).

## 8. Autoevaluación

- ¿Por qué un guard no protege datos?
- ¿Qué verifica el backend en cada petición?
- ¿Cuál es el riesgo principal de guardar el JWT en el navegador y cómo se mitiga?
- ¿Cuál es la diferencia entre 401 y 403?
- ¿Por qué el interceptor excluye `/auth/login`?

## 9. Lo que un líder debe llevarse

- Separar con claridad **UX de acceso (frontend)** y **seguridad real (backend)**.
- Saber preguntar: dónde está el token, cuánto dura, qué pasa si se filtra, quién configura los secretos.
- Exigir manejo de errores por capas y mensajes útiles para el usuario.
