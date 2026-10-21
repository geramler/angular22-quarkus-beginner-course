# Kubernetes — Día 4: Operación, actualizaciones, escalado, diagnóstico y checklist de producción

**Objetivo (líder técnico):** tomar decisiones y dar feedback de calidad sobre el despliegue: cómo actualizarlo sin cortes, cómo escalarlo, cómo diagnosticar fallos y qué exigir antes de salir a producción.

**Tiempo sugerido:** 3–4 h.

---

## 1. Actualizaciones sin corte (rolling update)

Al cambiar la imagen de un Deployment, Kubernetes la reemplaza **gradualmente**: crea un Pod nuevo, espera a que esté *listo* y retira uno viejo.

```bash
kubectl -n policies set image deploy/policies-api api=policies-api:0.0.2
kubectl -n policies rollout status deploy/policies-api
kubectl -n policies rollout history deploy/policies-api
kubectl -n policies rollout undo deploy/policies-api      # volver atrás
```

Probado en el cluster de práctica: al usar una imagen inexistente, el Pod nuevo quedó en `ImagePullBackOff` y **los dos Pods antiguos siguieron atendiendo**; la aplicación no se cayó. `rollout undo` restauró la revisión anterior.

Por qué funciona: la *readiness probe* impide que un Pod defectuoso reciba tráfico, y la estrategia por defecto (`maxUnavailable: 25%`, `maxSurge: 25%`) no retira Pods viejos hasta que haya nuevos listos.

Reglas de revisión:
- Cada versión nueva lleva un **tag distinto**. Con tags fijos el rollback es trivial.
- La readiness probe debe reflejar la salud real (aquí incluye la BD).
- Si hay cambios de esquema, hacerlos **compatibles hacia atrás**: durante la actualización conviven versiones nuevas y viejas contra la misma base de datos.

## 2. Escalado

| Tipo | Cómo | Cuándo |
|---|---|---|
| Manual | `kubectl -n policies scale deploy/policies-api --replicas=4` | Picos conocidos, pruebas |
| Automático (HPA) | `HorizontalPodAutoscaler` según CPU/memoria | Carga variable |

```yaml
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef: { kind: Deployment, name: policies-api, apiVersion: apps/v1 }
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

- El HPA calcula el porcentaje respecto a los `requests` de CPU: **sin `requests` no funciona**. Este proyecto los define.
- Requiere *metrics-server* instalado.
- La API escala horizontalmente porque es *stateless*. La **base de datos no**: más réplicas de la API significan más conexiones a PostgreSQL; revisa el tamaño del pool (`quarkus.datasource.jdbc.max-size`).
- Mínimo 2 réplicas para tolerar la caída de un Pod o el mantenimiento de un nodo. Un `PodDisruptionBudget` evita que un mantenimiento retire todas a la vez.

## 3. Diagnóstico: de síntoma a causa

Método: **estado del Pod → eventos → logs → entrar al contenedor**.

```bash
kubectl -n policies get pods
kubectl -n policies describe pod <pod>        # eventos al final
kubectl -n policies logs <pod>                # actual
kubectl -n policies logs <pod> --previous     # contenedor anterior (si reinició)
kubectl -n policies exec -it <pod> -- sh
kubectl -n policies get events --sort-by=.lastTimestamp
```

| Estado | Causa habitual | Dónde mirar |
|---|---|---|
| `Pending` | No hay nodo con recursos suficientes o falta el disco | `describe` → Events |
| `ImagePullBackOff` | Tag inexistente, registro sin credenciales | `describe` → Events |
| `CreateContainerConfigError` | Falta un Secret o ConfigMap referenciado | `describe` |
| `CrashLoopBackOff` | La aplicación termina al arrancar | `logs --previous` |
| `Running` pero `0/1 READY` | Falla la readiness probe | `describe` + endpoint `/q/health/ready` |
| `OOMKilled` | Superó el límite de memoria | `describe` → Last State |
| Service sin respuesta | Selector no coincide con las etiquetas | `kubectl get endpoints <svc>` |

Casos reales de este proyecto:
- **API reiniciada 2 veces al inicio:** PostgreSQL aún no aceptaba conexiones. `logs --previous` lo muestra; se resuelve solo.
- **Login con 500 en el perfil `prod`:** error de lectura de la clave JWT (ver Día 3).
- **Secretos ausentes:** si se aplica `api.yaml` antes de crear los secretos, los Pods quedan en `CreateContainerConfigError`.

## 4. Observabilidad

- **Logs:** Kubernetes solo conserva lo que sale por stdout/stderr del contenedor. Para histórico se centralizan (Loki, Elastic, CloudWatch).
- **Métricas:** `quarkus-micrometer` + Prometheus + Grafana. Alertas sobre errores 5xx, latencia y reinicios.
- **Trazas:** `quarkus-opentelemetry` para seguir una petición entre web, API y BD.
- **Salud:** `/q/health/live` y `/q/health/ready` ya existen; **no** se exponen al exterior porque nginx solo reenvía `/api/`.
- Registrar un **id de correlación** por petición y nunca tokens ni contraseñas.

## 5. Entrega continua (CI/CD)

Flujo recomendado en cada Pull Request:

1. **Instalar y probar:** `./mvnw test` (JDK 21) y `npm test`.
2. **Construir imágenes** con tag único (commit o versión) y **escanearlas** (Trivy).
3. **Publicar** en el registro.
4. **Desplegar** actualizando el tag (`kubectl set image`, Kustomize o Helm).
5. **Verificar:** `rollout status` y una prueba de humo (login + listado).

Enfoques de despliegue:

| Opción | Ventaja | Coste |
|---|---|---|
| `kubectl apply` desde CI | Simple | Credenciales del cluster en CI |
| Kustomize | Variantes por entorno sin duplicar YAML | Aprender `overlays` |
| Helm | Paquetes con parámetros y versiones | Plantillas más complejas |
| GitOps (Argo CD / Flux) | Git es la fuente de verdad; el cluster se sincroniza solo | Infraestructura adicional |

## 6. Decisiones que deberás liderar

| Tema | Opciones | Criterio simple |
|---|---|---|
| Base de datos | StatefulSet propio / servicio gestionado | Gestionado en producción: respaldos y alta disponibilidad incluidos |
| Plantillas | YAML plano / Kustomize / Helm | Kustomize al tener 2+ entornos |
| Secretos | Secrets nativos / External Secrets + gestor | Gestor externo con rotación en producción |
| Ingress | ingress-nginx / Gateway API / balanceador de la nube | Lo que ofrezca tu plataforma |
| Cluster | Gestionado (AKS, EKS, GKE) / propio | Gestionado salvo razones específicas |
| Imágenes de Quarkus | JVM / nativo | JVM por defecto; nativo si importa el arranque y la memoria |
| Entornos | Un cluster con namespaces / un cluster por entorno | Separar producción del resto |

## 7. Hallazgos de la revisión del proyecto (casos de estudio)

| # | Severidad | Hallazgo | Recomendación |
|---|---|---|---|
| 1 | Alta | Sin NetworkPolicy: cualquier Pod llega a la base de datos | Denegar por defecto y permitir solo API → postgres |
| 2 | Alta | Usuarios `admin`/`user` fijos en el código de la API | Proveedor de identidad (OIDC) o usuarios en BD con hash |
| 3 | Alta | Los secretos se crean a mano con `kubectl` | Gestor externo (Vault/Key Vault) + rotación |
| 4 | Media | PostgreSQL en una réplica, sin respaldos | Servicio gestionado o operador con backups |
| 5 | Media | Sin `securityContext` restrictivo (`readOnlyRootFilesystem`, `drop ALL`) | Añadirlo y probar |
| 6 | Media | Sin `PodDisruptionBudget` ni HPA | Definirlos según la carga esperada |
| 7 | Baja | La API reinicia al inicio si la BD no está lista | `startupProbe` o `initContainer` |
| 8 | Baja | Imágenes sin registro completo y sin escaneo | Registro propio y Trivy en CI |

## 8. Checklist de revisión de un PR de infraestructura

- [ ] Las imágenes usan un tag inmutable (no `latest`).
- [ ] Hay `requests` y `limits` de recursos.
- [ ] Las sondas *readiness* y *liveness* están definidas y probadas.
- [ ] No hay secretos ni claves en el repositorio.
- [ ] El contenedor no corre como root.
- [ ] Hay al menos 2 réplicas de lo que debe estar siempre disponible.
- [ ] Los cambios de esquema de BD son compatibles hacia atrás (Flyway `V2`, `V3`…).
- [ ] Se puede hacer `rollout undo` sin pérdida de datos.
- [ ] El servicio no queda expuesto sin necesidad (solo el Ingress es público).
- [ ] La documentación de despliegue está actualizada.

## 9. Ejercicios

1. Reconstruye la imagen de la API como `0.0.2`, cárgala en `kind`, actualiza el Deployment y observa el *rolling update* con `kubectl get pods -w`.
2. Provoca un despliegue fallido con una imagen inexistente. Comprueba que la aplicación sigue respondiendo y recupérala con `rollout undo`.
3. Escala la API a 4 réplicas y de nuevo a 2. ¿Qué ocurre con las conexiones a la base de datos?
4. Borra el Secret `policies-db` y reinicia la API. ¿Qué estado aparece y cómo lo diagnosticas?
5. Escribe una NetworkPolicy y un PodDisruptionBudget para este proyecto.
6. Redacta tres requisitos que exigirías antes de salir a producción.

## 10. Autoevaluación

- ¿Cómo evita Kubernetes cortes durante una actualización?
- ¿Qué diferencia hay entre `CrashLoopBackOff` y `ImagePullBackOff`?
- ¿Por qué el HPA necesita `requests` de CPU?
- ¿Por qué escalar la API puede saturar la base de datos?
- ¿Qué ventajas aporta GitOps frente a ejecutar `kubectl apply` desde CI?
- ¿Por qué las migraciones deben ser compatibles hacia atrás?

## 11. Lo que un líder debe llevarse

- Entender que Kubernetes da **resiliencia y automatización**, pero la seguridad, los datos y la calidad de la aplicación siguen siendo responsabilidad del equipo.
- Poder diagnosticar un fallo con el método estado → eventos → logs.
- Exigir un proceso repetible: pruebas, imágenes versionadas y escaneadas, despliegue verificable y rollback probado.
- Reconocer qué es aceptable en un entorno de práctica y qué debe cambiar antes de producción.
