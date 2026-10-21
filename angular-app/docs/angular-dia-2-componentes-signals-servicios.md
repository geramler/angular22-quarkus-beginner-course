# Día 2 — Componentes, signals, servicios y cómo revisar código Angular

**Objetivo (líder técnico):** leer un componente y juzgar rápido si está bien hecho: responsabilidades, estado, manejo de carga/errores y fugas.

**Tiempo sugerido:** 3–4 h.

---

## 1. Anatomía de un componente

Ejemplo real: [policy-list.component.ts](../angular-app/src/app/policy-list.component.ts)

```ts
@Component({
  selector: 'app-policy-list',
  standalone: true,
  imports: [RouterLink],          // lo que la plantilla necesita
  template: `...`
})
export class PolicyListComponent implements OnInit {
  private readonly policyService = inject(PolicyService);
  readonly auth = inject(AuthService);
  readonly policies = signal<Policy[]>([]);
  ...
}
```

Qué mirar al revisar:
- `imports` solo contiene lo que la plantilla usa (el compilador avisa si sobra algo; ocurrió con `RouterLink` en login).
- Dependencias vía `inject()`; las que usa la plantilla son públicas (`auth`), el resto `private readonly`.
- El componente **orquesta**; la lógica de datos vive en servicios.

## 2. Plantillas: sintaxis esencial

| Necesidad | Sintaxis | Ejemplo en el proyecto |
|---|---|---|
| Mostrar valor | `{{ valor() }}` | `{{ policy.policyNumber }}` |
| Atributo/propiedad | `[disabled]="saving()"` | botón Guardar |
| Evento | `(click)="logout()"` | cerrar sesión |
| Condicional | `@if (...) {} @else {}` | cargando / error / lista |
| Bucle | `@for (p of lista; track p.id) {}` | tabla de pólizas |
| Enlace de ruta | `[routerLink]="['/policies', id]"` | botón Ver |
| Doble vía (formularios) | `[(ngModel)]="form.x"` | `policy-form` y `login` |

**Regla de revisión:** en `@for` siempre debe existir `track` con un identificador estable (aquí `policy.id`). Sin él hay re-render innecesario.

## 3. Signals: el estado reactivo moderno

```ts
readonly loading = signal(true);               // estado escribible
readonly filteredPolicies = computed(() =>     // estado derivado (se recalcula solo)
  this.policyService.filterPolicies(this.policies(), this.filter())
);
this.policies.set(data);                       // reemplazar
this.filter.update(f => ({ ...f, text }));     // actualizar de forma inmutable
```

- Se **leen** con paréntesis: `loading()`.
- `computed` es de solo lectura y memoiza: úsalo en vez de duplicar estado.
- `update` con un objeto nuevo (`{...f}`) → inmutabilidad, evita bugs sutiles.
- En `AuthService`, `session` es un signal y `isAdmin` un `computed`: la cabecera reacciona sola al login/logout.

**Señales de alerta en un PR:** estado duplicado que se puede derivar, mutar objetos dentro de un signal, o variables sueltas (`policyId`, `form` en `policy-form`) mezcladas con signals sin criterio claro.

## 4. Servicios e inyección de dependencias

[policy.service.ts](../angular-app/src/app/policy.service.ts)

- `@Injectable({ providedIn: 'root' })` → una sola instancia en toda la app.
- Encapsula **todas** las URLs y verbos HTTP: los componentes no conocen `HttpClient`.
- Devuelve `Observable<T>` tipados (`Policy[]`, `Policy`).
- `filterPolicies` es lógica pura (sin HTTP) → fácil de probar (ver `policy.service.spec.ts`).

[auth.service.ts](../angular-app/src/app/auth.service.ts) concentra la sesión: login, logout, expiración (timer), decodificación del JWT. Ningún componente toca `sessionStorage` directamente: **un solo dueño del estado de sesión**.

## 5. Observables vs signals (lo que se pregunta en entrevistas y debates)

- **Observable (RxJS):** flujos de eventos y I/O (HTTP, eventos). Necesita `subscribe`.
- **Signal:** valor actual para pintar la UI.
- Patrón del proyecto: `HttpClient` (observable) → `subscribe` → `signal.set(...)`.
- Para peticiones HTTP, Angular completa el observable solo; no hay fuga de memoria por `subscribe` en llamadas HTTP de una sola respuesta. **Sí** hay que desuscribirse (o usar `takeUntilDestroyed`) en flujos que no terminan (eventos, intervals, `valueChanges`).

## 6. Estados de una pantalla: el patrón que debes exigir

Toda pantalla con datos remotos debe contemplar: **cargando → error → vacío → datos**.

`policy-list` lo hace con `loading`, `error`, lista vacía y `actionError` para acciones (borrar). Pregunta de revisión: *¿qué ve el usuario si la API tarda, falla o devuelve vacío?*

## 7. Formularios

- `login` y `policy-form` usan **template-driven forms** (`ngModel`): simples, válidos para formularios pequeños.
- Para formularios complejos (validaciones cruzadas, dinámicos) se recomiendan **Reactive Forms**.
- Validación del cliente = comodidad; la autoridad es el backend (hoy el backend **no** valida campos; ver hallazgo en el Día 4).

## 8. Cómo leer un componente en 5 minutos (método)

1. ¿Qué dependencias inyecta? (¿hace demasiado?)
2. ¿Qué estado tiene (signals/campos)? ¿hay duplicados?
3. ¿Qué dispara llamadas HTTP y dónde se manejan los errores?
4. ¿La plantilla cubre carga/error/vacío?
5. ¿Hay lógica de negocio que debería estar en un servicio?
6. ¿Hay pruebas que cubran este comportamiento?

## 9. Observaciones concretas sobre este proyecto (para practicar el criterio)

| Observación | Dónde | Comentario de revisión |
|---|---|---|
| Mensaje de error genérico "No se pudo conectar con la API" para cualquier fallo | `policy-list` `loadPolicies` | Un 403 o 500 no es un problema de conexión; distinguir por `status`. |
| Borrado sin confirmación | `deletePolicy` | Acción destructiva: pedir confirmación. |
| `form` y `policyId` como campos mutables | `policy-form` | Aceptable con `ngModel`; mezclar con signals sin criterio puede confundir. |
| Estado de filtro en el componente | `policy-list` | Correcto para estado local de UI. |
| Lógica de filtrado en el servicio | `policy.service` | Discutible; podría ser una función utilitaria. Está probada, lo cual es lo importante. |

## 10. Ejercicios

1. Abre `policy-list.component.ts` y aplica el método de la sección 8. Escribe 3 observaciones.
2. Encuentra todos los `signal(` y `computed(` del proyecto; clasifica cuáles son estado base y cuáles derivados.
3. Identifica dos lugares donde un componente **no** debería saber algo (por ejemplo, URLs) y confirma que el proyecto lo respeta.
4. Redacta un comentario de PR (2 líneas) sobre el borrado sin confirmación.

## 11. Autoevaluación

- ¿Por qué `computed` es preferible a guardar la lista filtrada en otro signal?
- ¿Qué diferencia hay entre `set` y `update`?
- ¿Cuándo es necesario desuscribirse manualmente?
- ¿Por qué `track` importa en `@for`?

## 12. Lo que un líder debe llevarse

- Un componente sano: poco estado, dependencias claras, lógica en servicios, estados de carga/error/vacío contemplados.
- Vocabulario para dar feedback preciso en PRs sin escribir el código.
