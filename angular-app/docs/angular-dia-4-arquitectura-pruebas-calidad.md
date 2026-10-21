# Día 4 — Arquitectura, pruebas, rendimiento, buenas prácticas y checklist de code review

**Objetivo (líder técnico):** tomar decisiones y dar feedback de calidad: cómo escalar el proyecto, qué probar, qué vigilar y cómo revisar un PR.

**Tiempo sugerido:** 3–4 h.

---

## 1. Arquitectura: del proyecto actual a uno que escala

### Estado actual
Todo está en una carpeta plana `src/app/` (≈15 archivos). Es adecuado para un curso o una app pequeña.

### Estructura recomendada al crecer: por *feature*
```
src/app/
├── core/               # singleton de la app: auth, interceptores, guards, config
├── shared/             # componentes/pipes reutilizables sin lógica de negocio
└── features/
    ├── policies/       # lista, detalle, formulario, servicio, modelos, rutas
    └── auth/           # login
```
Reglas:
- Una feature no importa de otra feature; comparten vía `core`/`shared`.
- Cada feature expone sus rutas y se carga con **lazy loading** (`loadChildren` / `loadComponent`).
- Evitar dependencias circulares y "carpetas cajón" (`utils` gigantes).

### Decisiones que deberás liderar
| Tema | Opciones | Criterio simple |
|---|---|---|
| Estado | Signals + servicios / NgRx SignalStore / NgRx | Empieza con signals; sube de nivel solo si hay estado compartido complejo, múltiples fuentes o necesidad de trazabilidad |
| Formularios | Template-driven / Reactive | Reactive para validación compleja o dinámica |
| Librería UI | Angular Material / PrimeNG / propia | Accesibilidad, mantenimiento, diseño corporativo |
| Render | SPA / SSR (+hidratación) | SSR si importa SEO o tiempo de primera carga |
| Monorepo | Nx / repos separados | Si hay varias apps/librerías compartidas |
| Contrato API | OpenAPI → cliente tipado generado | Evita desfases entre frontend y backend (el backend ya expone `/openapi`) |

## 2. Pruebas

### Pirámide
- **Unitarias (muchas, rápidas):** servicios y lógica pura. Ejemplo: `policy.service.spec.ts` (filtros, verbos y URLs HTTP).
- **De integración de componentes (algunas):** componente + router + HTTP simulado. Ejemplo: `app.component.spec.ts` (redirección sin sesión, token en la cabecera, rutas de admin).
- **End-to-end (pocas, críticas):** flujo real en navegador (Playwright/Cypress): login → listar → crear.
- **Backend:** `PolicyResourceTest` cubre 401, 403, CRUD, login y CORS con JWT reales.

### Herramientas del proyecto
Vitest + jsdom, `TestBed`, `HttpTestingController` (simula HTTP sin red; `httpTesting.verify()` garantiza que no queden peticiones sin atender).

### Qué exigir en un PR
- Cada cambio de comportamiento trae prueba nueva o actualizada.
- Se prueban **caminos de error** (401, 403, API caída), no solo el camino feliz.
- Pruebas deterministas: sin dependencia de reloj real o red.
- Cobertura como señal, no como meta: 100% de líneas con pruebas sin aserciones no sirve.

### Cobertura actual y huecos (para planear)
| Cubierto | Pendiente |
|---|---|
| Servicio de pólizas, rutas con sesión/rol, token en cabecera | `AuthService` (expiración, JWT inválido), interceptor 401, guards aislados, `policy-form`, `policy-detail`, borrado, login con error |
| Backend: auth, roles, CRUD, CORS, OpenAPI | Validación de entrada (aún no existe) |

## 3. Rendimiento

Qué vigilar (en orden de impacto típico):
1. **Tamaño del bundle:** `npm run build` muestra ~1.7 MB iniciales en desarrollo; revisa el build de producción y el *budget* en `angular.json`.
2. **Lazy loading** de features y de componentes pesados (`@defer`).
3. **Detección de cambios:** usar `ChangeDetectionStrategy.OnPush` + signals reduce trabajo. Este proyecto usa `zone.js` (modelo clásico); la tendencia es *zoneless*.
4. **`track` en `@for`** y evitar funciones costosas en plantillas (usar `computed`).
5. **Peticiones HTTP:** evitar duplicadas, paginar listas grandes (hoy el listado trae todo), cachear lo estable.
6. **Imágenes y fuentes** (`NgOptimizedImage`).

Medir antes de optimizar: Lighthouse, Angular DevTools (profiler) y pestaña Performance.

## 4. Buenas prácticas (resumen)

- TypeScript `strict` (ya activo): no usar `any` salvo casos justificados (hoy se usa `$any($event.target)` en la lista; mejorable).
- Componentes pequeños y con una sola responsabilidad.
- Estado mínimo; derivar con `computed`.
- Servicios para acceso a datos; componentes sin `HttpClient`.
- Inmutabilidad al actualizar estado.
- Accesibilidad: etiquetas en inputs, `role="alert"` en errores (ya presente), navegación por teclado, contraste.
- Nombres consistentes: `*.component.ts`, `*.service.ts`, `*.guard.ts`.
- Configuración por entorno; nada de URLs ni secretos en código.
- Linter + formateador automáticos en CI (hoy el proyecto **no** tiene linter configurado: es una brecha a proponer).
- CI/CD: instalar → lint → test → build en cada PR.
- Actualizaciones periódicas de Angular (liberación mayor cada ~6 meses; usar `ng update`).

## 5. Hallazgos de la revisión del proyecto (úsalos como casos de estudio)

| # | Severidad | Hallazgo | Recomendación |
|---|---|---|---|
| 1 | Alta | Clave privada JWT dentro de `src/main/resources` | Gestor de secretos / volumen externo; fuera del artefacto |
| 2 | Alta | Contraseñas demo por defecto en `application.properties` | Exigirlas por variable de entorno en producción, sin valor por defecto |
| 3 | Media | El backend no valida los campos de `PolicyRequest` (vacíos, estado arbitrario) | Bean Validation (`@NotBlank`, enum de estado) y respuestas 400 |
| 4 | Media | Mensaje "no se pudo conectar" para cualquier error al listar | Diferenciar por `status` |
| 5 | Baja | Borrado sin confirmación | Diálogo de confirmación |
| 6 | Baja | `API_BASE_URL` fija | Configuración por entorno |
| 7 | Baja | Sin linter, sin lazy loading, sin pruebas de `AuthService`/interceptor 401 | Añadir en el backlog técnico |
| 8 | Info | Backend usa H2 en memoria (se pierde al reiniciar) | Correcto para el curso; base real en producción |

## 6. Checklist de code review para Angular

### Funcionalidad y UX
- [ ] ¿Cubre carga, error, vacío y éxito?
- [ ] ¿Los botones de acción se deshabilitan mientras se procesa?
- [ ] ¿Las acciones destructivas piden confirmación?
- [ ] ¿Los mensajes son claros y sin detalles técnicos?

### Arquitectura
- [ ] ¿La lógica de datos está en servicios y no en el componente?
- [ ] ¿Cada archivo tiene una sola responsabilidad?
- [ ] ¿Respeta la estructura por features y no crea dependencias cruzadas?
- [ ] ¿Las rutas nuevas usan lazy loading si corresponde?

### Estado y RxJS
- [ ] ¿El estado derivado usa `computed` en vez de duplicarse?
- [ ] ¿Se actualiza el estado de forma inmutable?
- [ ] ¿Hay suscripciones sin cierre (eventos, intervals)? ¿Se usa `takeUntilDestroyed`/`async`?
- [ ] ¿No hay `subscribe` anidados (usar `switchMap`, etc.)?

### Plantillas
- [ ] ¿`@for` incluye `track` estable?
- [ ] ¿No hay lógica pesada en la plantilla?
- [ ] ¿`imports` del componente sin elementos sobrantes?
- [ ] ¿Sin `innerHTML`/`bypassSecurityTrust*` injustificado?

### Seguridad
- [ ] ¿El control de acceso depende del backend (no solo de guards)?
- [ ] ¿El token solo viaja a la API propia?
- [ ] ¿Sin secretos, URLs de entorno ni datos sensibles en el código?
- [ ] ¿Las redirecciones (`returnUrl`) están validadas?

### Calidad
- [ ] ¿Hay pruebas del comportamiento nuevo, incluidos los errores?
- [ ] ¿Sin `any` innecesarios ni código muerto?
- [ ] ¿Compila (`npm run build`) y pasan las pruebas en CI?
- [ ] ¿Accesibilidad básica (labels, roles, teclado)?
- [ ] ¿Cambios en dependencias justificados y auditados?

### Rendimiento
- [ ] ¿Sube mucho el tamaño del bundle?
- [ ] ¿Listas grandes paginadas o virtualizadas?
- [ ] ¿Peticiones duplicadas evitadas?

## 7. Cómo dar feedback como líder (plantilla)

> **Observación:** `policy-list` muestra "No se pudo conectar" ante cualquier error.
> **Impacto:** un 403 o 500 confunde al usuario y oculta el problema real.
> **Sugerencia:** distinguir por `error.status` (0 → red; 403 → sin permiso; otros → error del servidor).
> **Prioridad:** media, no bloquea el merge si se crea una tarea.

Mantén tres niveles: **bloqueante** (seguridad, bugs), **importante** (mantenibilidad), **sugerencia** (estilo).

## 8. Ejercicios

1. Propón la estructura por features para este proyecto y qué iría en `core`, `shared` y `features/policies`.
2. Elige 3 pruebas pendientes de la tabla de huecos y ordénalas por riesgo.
3. Redacta el comentario de PR para los hallazgos 1 y 3.
4. Define tu *Definition of Done* para un cambio en el frontend (5 puntos).

## 9. Preguntas que un líder debería poder responder

- ¿Cuándo introducirías NgRx? ¿Y cuándo no?
- ¿Cómo reducirías el tiempo de carga inicial?
- ¿Qué pruebas son obligatorias antes de desplegar?
- ¿Dónde se guardan los secretos y quién rota las claves?
- ¿Cómo evitas que frontend y backend se desalineen?

## 10. Plan posterior a los 4 días

1. Levantar el proyecto y revisar un cambio real (aunque sea pequeño) usando el checklist.
2. Proponer al equipo: linter + CI + pruebas faltantes + configuración por entorno.
3. Profundizar en: RxJS operadores básicos, Reactive Forms, lazy loading, SSR y NgRx SignalStore.
4. Recursos oficiales: angular.dev (guías y tutoriales), Angular DevTools, documentación de Quarkus Security.
