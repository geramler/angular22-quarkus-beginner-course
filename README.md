# angular22-quarkus-beginner-course

Curso práctico: Angular 22 + Quarkus para principiantes.

Este ZIP contiene el proyecto inicial del curso. La meta es construir una aplicación sencilla de gestión de pólizas conectando Angular con una API REST de Quarkus.

## Duración total: 12 horas

El curso se trabajará por entregas: solicita cada día cuando estés listo. Cada día está pensado para aproximadamente 2 horas, con explicación, práctica y reto.

1. **Día 1 (2 h):** entorno, estructura del proyecto y ejecución de ambos proyectos.
2. **Día 2 (2 h):** TypeScript y componentes Angular; interpolación y control de flujo.
3. **Día 3 (2 h):** signals, inputs/outputs, servicios e inyección de dependencias.
4. **Día 4 (2 h):** API REST con Quarkus; recursos, DTOs y endpoints CRUD.
5. **Día 5 (2 h):** conectar Angular con Quarkus usando `HttpClient`; errores y formularios.
6. **Día 6 (2 h):** validaciones, pruebas básicas, CORS, integración final y mejoras.

## Requisitos

- Node.js compatible con Angular 22 y npm.
- Angular CLI 22.
- JDK 21.
- Maven Wrapper incluido; descarga y utiliza Maven 3.9.11 automáticamente.
- Un editor como VS Code o IntelliJ IDEA.

Comprueba las versiones:

```bash
node --version
npm --version
java --version
./quarkus-api/mvnw --version
```

## Ejecutar el backend Quarkus

Desde `quarkus-api/`:

```bash
./mvnw quarkus:dev
```

En Windows, usa `mvnw.cmd quarkus:dev`. No necesitas instalar Maven globalmente.
El wrapper no instala Java: configura `JAVA_HOME` para que apunte a un JDK 21 completo (incluido `javac`).

API base: `http://localhost:8080/api/policies`

La API usa una base H2 en memoria y carga cinco pólizas de ejemplo al iniciar. Los datos se reinician al reiniciar la aplicación.

## Autenticación y autorización

La API expone `POST /api/auth/login`. Envía JSON con `username` y `password`; la respuesta incluye un JWT Bearer y el tiempo de expiración. Inicia sesión en la aplicación Angular antes de consultar pólizas. El token se conserva solo en la pestaña/sesión actual y se envía automáticamente a la API.

- `user` (`user123`) puede consultar pólizas.
- `admin` (`admin123`) puede consultar, crear, actualizar y eliminar pólizas.

Las rutas y controles de Angular mejoran la experiencia, pero la API aplica y valida la autorización por rol. Las credenciales configuradas son solo para desarrollo; cámbialas mediante `APP_AUTH_ADMIN_PASSWORD` y `APP_AUTH_USER_PASSWORD` antes de desplegar y protege las claves JWT.

Para ejecutar las pruebas REST del backend:

```bash
./mvnw test
```

## Ejecutar el frontend

Desde `angular-app/`:

```bash
npm install
npm start
```

Abre `http://localhost:4200`.
La interfaz permite listar y consultar pólizas, además de crearlas, editarlas y eliminarlas mediante la API.
Las rutas principales son `/policies` (lista), `/policies/new` (crear), `/policies/:id` (detalle) y `/policies/:id/edit` (editar). La ruta raíz redirige a `/policies`.

> Nota: el `package.json` declara Angular 22. Si Angular 22 aún no estuviera disponible en el registro de npm de tu entorno, consulta la matriz oficial de versiones y usa la versión estable compatible más reciente.

## Endpoints iniciales

- `POST /api/auth/login` — intercambiar credenciales por un token JWT.
- `GET /api/policies` — listar pólizas (roles `USER` y `ADMIN`).
- `GET /api/policies/{id}` — consultar una póliza.
- `POST /api/policies` — crear una póliza (rol `ADMIN`).
- `PUT /api/policies/{id}` — actualizar una póliza (rol `ADMIN`).
- `DELETE /api/policies/{id}` — eliminar una póliza (rol `ADMIN`).

## Material de estudio (enfoque líder técnico, 4 días)

1. [Día 1 — Conceptos base, estructura y ciclo de vida de una petición](docs/dia-1-conceptos-y-estructura.md)
2. [Día 2 — Componentes, signals, servicios y revisión de código](docs/dia-2-componentes-signals-servicios.md)
3. [Día 3 — Routing, guards, interceptores, seguridad y errores](docs/dia-3-routing-seguridad-errores.md)
4. [Día 4 — Arquitectura, pruebas, rendimiento y checklist de code review](docs/dia-4-arquitectura-pruebas-calidad.md)

### Backend Quarkus (4 días)

1. [Día 1 — Conceptos base, estructura y ciclo de vida de una petición](quarkus-api/docs/quarkus-dia-1-conceptos-y-estructura.md)
2. [Día 2 — Recursos REST, persistencia, CDI y revisión de código](quarkus-api/docs/quarkus-dia-2-recursos-persistencia-cdi.md)
3. [Día 3 — Seguridad JWT, roles, CORS y errores](quarkus-api/docs/quarkus-dia-3-seguridad-jwt.md)
4. [Día 4 — Arquitectura, pruebas, rendimiento y checklist de code review](quarkus-api/docs/quarkus-dia-4-arquitectura-pruebas-calidad.md)

## Cómo avanzar

Pídeme: **“Genera el Día 1 del curso Angular 22 + Quarkus”**. Prepararé un documento de estudio independiente para ese día. Después podrás pedir cada día siguiente.
