# Día 1 — Conceptos base, estructura y ciclo de vida de una petición

**Objetivo (líder técnico):** poder explicar cómo está armada una app Angular, dónde mirar al revisar un PR y qué ocurre desde que el usuario hace clic hasta que se pinta la respuesta.

**Tiempo sugerido:** 3–4 h (lectura 1.5 h, recorrido guiado del código 1.5 h, ejercicios 1 h).

---

## 1. Qué es Angular (en una página)

- Framework de frontend **opinionado**: trae routing, formularios, cliente HTTP, inyección de dependencias y pruebas. Menos decisiones de librerías que React; más convenciones.
- Lenguaje: **TypeScript** (JavaScript con tipos). Los tipos atrapan errores en compilación.
- Los **componentes** son la unidad de UI: una clase TypeScript + una plantilla HTML + estilos.
- Los **servicios** contienen lógica y acceso a datos; se reciben por **inyección de dependencias** (DI).
- El **router** asocia URLs con componentes.
- Estilo moderno (Angular 17+, usado en este proyecto): componentes **standalone** (sin NgModules), **signals** para estado reactivo y **control flow** en plantillas (`@if`, `@for`).

## 2. Mapa del proyecto

```
angular-app/
├── angular.json            # configuración de build/serve/test
├── package.json            # dependencias y scripts (start, build, test)
├── tsconfig*.json          # reglas de TypeScript (strict: true)
└── src/
    ├── index.html          # página única (SPA)
    ├── main.ts             # punto de arranque + proveedores globales
    ├── styles.css          # estilos globales
    └── app/
        ├── app.component.ts        # shell: cabecera + <router-outlet>
        ├── app.routes.ts           # tabla de rutas y guards
        ├── api-url.ts              # URL base de la API
        ├── auth.service.ts         # sesión, login/logout, lectura del JWT
        ├── auth.interceptor.ts     # agrega Authorization a cada petición
        ├── auth.guard.ts           # protege rutas (autenticado / admin)
        ├── login.component.ts
        ├── policy.model.ts         # tipos (Policy, PolicyRequest, filtro)
        ├── policy.service.ts       # llamadas HTTP a /api/policies
        ├── policy-list.component.ts
        ├── policy-detail.component.(ts|html)
        ├── policy-form.component.ts  # crear y editar
        └── *.spec.ts               # pruebas (Vitest)

quarkus-api/                # backend Java: JWT, roles, CRUD, H2 en memoria
```

**Cómo leerlo como líder:** empieza siempre por `main.ts` → `app.routes.ts` → el componente de la ruta → el servicio que usa. En 4 archivos entiendes cualquier funcionalidad.

## 3. Arranque de la aplicación

Archivo: [main.ts](../angular-app/src/main.ts)

```ts
bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([authInterceptor])), provideRouter(routes)]
});
```

Qué dice:
1. `AppComponent` es la raíz (`<app-root>` en `index.html`).
2. `provideHttpClient(...)` habilita `HttpClient` y registra el **interceptor** global.
3. `provideRouter(routes)` activa el enrutamiento.

> Pregunta de revisión: ¿dónde se configura algo que afecta a *toda* la app? → en los `providers` de `main.ts`.

## 4. Ciclo de vida de una petición (el flujo más importante)

Ejemplo: el usuario abre `/policies` ya autenticado.

1. **Navegación:** el router recibe `/policies`.
2. **Guard:** `authenticatedGuard` ([auth.guard.ts](../angular-app/src/app/auth.guard.ts)) pregunta a `AuthService` si hay sesión válida (token no expirado). Si no → redirige a `/login?returnUrl=/policies`.
3. **Componente:** se crea `PolicyListComponent`; en `ngOnInit` llama `loadPolicies()`.
4. **Servicio:** `PolicyService.getPolicies()` devuelve un `Observable` de `HttpClient.get(...)`. *No se envía nada hasta que alguien se suscribe.*
5. **Interceptor:** al suscribirse, [auth.interceptor.ts](../angular-app/src/app/auth.interceptor.ts) clona la petición y agrega `Authorization: Bearer <token>` (solo si la URL empieza por la API y no es `/auth/login`).
6. **Backend (Quarkus):** valida la firma y expiración del JWT, revisa los roles (`@RolesAllowed`) y responde JSON.
7. **Respuesta:** el interceptor la deja pasar; si fue `401`, hace logout y redirige a `/login`.
8. **Estado y vista:** el componente guarda el resultado en un `signal` (`policies.set(...)`) y la plantilla se actualiza sola.

```
Clic → Router → Guard → Componente → Servicio → Interceptor → API
                                                      ↓
                       Plantilla ← Signal ← subscribe ← Respuesta
```

### Login (ciclo especial)

`LoginComponent.submit()` → `AuthService.login()` → `POST /api/auth/login` (el interceptor **no** agrega token aquí) → se recibe el JWT → se guarda en `sessionStorage` y en un signal → se navega a `returnUrl` (validado para que solo sea una ruta interna).

## 5. Conceptos mínimos que debes dominar hoy

| Concepto | En una frase | Dónde verlo |
|---|---|---|
| Componente standalone | Clase + plantilla que declara sus propias dependencias en `imports` | `app.component.ts` |
| Plantilla | HTML con `{{ }}`, `[prop]`, `(evento)`, `@if`, `@for` | `policy-list.component.ts` |
| Servicio inyectable | Clase con `@Injectable({providedIn:'root'})`, singleton | `policy.service.ts` |
| `inject()` | Pide una dependencia al contenedor de DI | casi todos los archivos |
| Observable (RxJS) | Flujo asíncrono perezoso; requiere `subscribe` | `PolicyService` |
| Signal | Valor reactivo; se lee como función `x()` | `policies`, `loading`, `error` |
| Router | URL ↔ componente, con guards | `app.routes.ts` |

## 6. Comandos que debes saber ejecutar

```bash
# Frontend (desde angular-app/)
npm install
npm start                 # http://localhost:4200
npm run build             # compila para producción
npm test -- --watch=false # pruebas una vez

# Backend (desde quarkus-api/, requiere JDK 21)
./mvnw quarkus:dev        # http://localhost:8080 (Swagger en /swagger-ui)
```

Cuentas demo: `admin` / `admin123` (todo) y `user` / `user123` (solo lectura).

## 7. Ejercicios del día

1. Levanta backend y frontend. Inicia sesión como `user` y como `admin`; compara qué botones aparecen.
2. En las DevTools del navegador (pestaña **Network**) ubica: la petición de login, y una petición a `/api/policies`. Verifica el encabezado `Authorization`.
3. En **Application → Session Storage** localiza el token. Pégalo en jwt.io (solo con datos de demo) y lee `upn`, `groups`, `exp`.
4. Dibuja con tus palabras el flujo de la sección 4 sin mirar el documento.

## 8. Autoevaluación (responde en voz alta)

- ¿Qué diferencia hay entre un componente y un servicio?
- ¿Por qué una petición `HttpClient` "no hace nada" sin `subscribe`?
- ¿Qué pasa si el token expira mientras el usuario está en la pantalla?
- ¿Por qué el guard no es suficiente para proteger los datos? (Respuesta: lo que protege es el backend; el guard solo mejora la experiencia.)

## 9. Lo que un líder debe llevarse del día

- Poder ubicar cualquier funcionalidad en minutos usando el flujo `main → rutas → componente → servicio`.
- Saber que **la seguridad real vive en el backend**; el frontend solo oculta/redirige.
- Entender el vocabulario para participar en discusiones técnicas y revisiones.
