# Kubernetes — Día 2: Imágenes, workloads, configuración y cómo revisar un manifiesto

**Objetivo (líder técnico):** leer un Dockerfile y un manifiesto de Deployment y juzgar rápido si están bien hechos: imagen, réplicas, sondas, recursos y configuración.

**Tiempo sugerido:** 3–4 h.

---

## 1. Imágenes: Dockerfile multi-etapa

Archivo: [quarkus-api/Dockerfile](../../quarkus-api/Dockerfile)

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
...
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
COPY --from=build /build/target/quarkus-app/ ./
USER 10001
ENTRYPOINT ["java", "-jar", "quarkus-run.jar"]
```

Qué mirar al revisar:
- **Multi-etapa:** la imagen final solo trae el JRE y la aplicación, no Maven ni el código fuente. Es más pequeña y expone menos superficie.
- **Usuario no root** (`USER 10001`): si alguien vulnera la aplicación, tiene menos privilegios.
- **Caché de capas:** `pom.xml` se copia antes que `src/` para que las dependencias no se descarguen en cada cambio de código.
- Tag explícito (`0.0.1`), no `latest`: `latest` impide saber qué versión corre y complica el rollback.
- `.dockerignore` evita copiar `target/` y `node_modules/`.

Frontend: [angular-app/Dockerfile](../../angular-app/Dockerfile) compila Angular con Node y copia solo el resultado (`dist/.../browser`) a una imagen `nginx-unprivileged`, que escucha en el puerto 8080 sin ser root.

## 2. Deployment: anatomía

Archivo: [api.yaml](../api.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: policies-api, namespace: policies }
spec:
  replicas: 2
  selector:
    matchLabels: { app: policies-api }
  template:
    metadata:
      labels: { app: policies-api }
    spec:
      containers:
        - name: api
          image: policies-api:0.0.1
```

Qué mirar al revisar:
- `selector.matchLabels` **debe coincidir** con `template.metadata.labels`; si no, el Deployment no encuentra sus Pods.
- `replicas: 2` da disponibilidad: si un Pod falla, el otro atiende. Es posible porque la API es *stateless* (JWT, sin sesión en memoria).
- El Service apunta a las mismas etiquetas (`app: policies-api`).

## 3. Service: el nombre estable

```yaml
kind: Service
metadata: { name: policies-api }
spec:
  selector: { app: policies-api }
  ports: [{ port: 8080, targetPort: 8080 }]
```

- Tipo por defecto `ClusterIP`: solo accesible dentro del cluster. Es lo correcto para la API y la base de datos.
- `nginx.conf` usa `proxy_pass http://policies-api:8080`; ese nombre lo resuelve el DNS del cluster.
- Si el Service no existe cuando nginx arranca, nginx falla al resolver el nombre: despliega la API antes o junto con la web.

## 4. Configuración: ConfigMap y variables de entorno

```yaml
kind: ConfigMap
data:
  DB_URL: jdbc:postgresql://postgres:5432/policies
  CORS_ORIGINS: https://policies.example.com
```

- El Deployment las inyecta con `envFrom`. Quarkus las lee en `application.properties` con `${DB_URL}`.
- Regla: **la misma imagen se usa en todos los entornos**; solo cambia la configuración (ConfigMap/Secret). No se reconstruye la imagen para cambiar una URL.
- Los valores del perfil `%prod.` en [application.properties](../../quarkus-api/src/main/resources/application.properties) definen cuáles son obligatorias: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`.
- Cambiar un ConfigMap **no reinicia** los Pods solos; hay que `kubectl rollout restart`.

## 5. Sondas de salud

```yaml
readinessProbe:
  httpGet: { path: /q/health/ready, port: 8080 }
livenessProbe:
  httpGet: { path: /q/health/live, port: 8080 }
```

| Sonda | Pregunta | Si falla |
|---|---|---|
| readiness | ¿Puedo recibir tráfico? | El Pod sale del Service (no se reinicia) |
| liveness | ¿Sigo vivo? | Kubernetes reinicia el contenedor |

- Quarkus las expone con la extensión `quarkus-smallrye-health`. La de readiness incluye la comprobación de la base de datos.
- Error típico: `initialDelaySeconds` demasiado bajo para una aplicación Java; el contenedor se reinicia antes de arrancar. Aquí es 10 s (readiness) y 20 s (liveness).
- Ejemplo del cluster de práctica: la API se **reinició 2 veces** al inicio porque PostgreSQL aún no estaba listo; luego se estabilizó. Es el comportamiento esperado del bucle de reconciliación, pero se puede evitar con un `initContainer` o una `startupProbe`.

## 6. Recursos: requests y limits

```yaml
resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits:   { memory: 512Mi }
```

- **requests:** lo que el *scheduler* reserva al decidir el nodo.
- **limits:** el máximo permitido; superar el límite de memoria provoca `OOMKilled`.
- Sin `requests`, el Pod puede caer en un nodo saturado. Sin `limits` de memoria, un Pod puede afectar a sus vecinos.
- Aquí solo se limita la memoria; limitar la CPU puede provocar *throttling* en el arranque de Java.

## 7. StatefulSet y disco persistente

Archivo: [postgres.yaml](../postgres.yaml)

- Un **StatefulSet** da al Pod un nombre estable (`postgres-0`) y un disco propio (`volumeClaimTemplates`, 5 Gi).
- Si el Pod se reinicia o se mueve, **conserva los datos**. Un Deployment con una BD perdería su contenido.
- `PGDATA` apunta a un subdirectorio para evitar el error por la carpeta `lost+found` del volumen.
- `clusterIP: None` (Service *headless*): se llega al Pod por nombre sin balanceo.
- Una réplica es suficiente para práctica. En producción se prefiere una BD gestionada (RDS, Cloud SQL, Azure Database) o un operador (CloudNativePG).

## 8. Migraciones y esquema

- En producción Hibernate está en `validate`: **no crea tablas**; solo comprueba que coincidan.
- Las tablas las crea **Flyway** con [V1__create_policies.sql](../../quarkus-api/src/main/resources/db/migration/V1__create_policies.sql) al arrancar la API.
- Con 2 réplicas arrancando a la vez, Flyway usa un bloqueo en la base de datos: solo una aplica la migración.
- Regla de revisión: nunca editar una migración ya aplicada; se agrega `V2__...`.

## 9. Cómo revisar un manifiesto en 5 minutos (método)

1. ¿La imagen tiene tag fijo y viene de un registro confiable?
2. ¿Los selectores y las etiquetas coinciden entre Deployment y Service?
3. ¿Hay `readinessProbe` y `livenessProbe` razonables?
4. ¿Hay `requests` y `limits`?
5. ¿La configuración sale de ConfigMap/Secret y no de la imagen?
6. ¿Se ejecuta como usuario no root?
7. ¿Hay más de una réplica para lo que debe estar siempre disponible?

## 10. Observaciones del proyecto (casos para practicar criterio)

| Observación | Dónde | Comentario de revisión |
|---|---|---|
| Imágenes sin registro (`policies-api:0.0.1`) | `api.yaml`, `web.yaml` | Válido para `kind`; en un cluster real indicar el registro completo |
| Sin `initContainer` ni `startupProbe` | `api.yaml` | La API reinicia hasta que la BD está lista; funciona, pero es ruidoso |
| Solo límite de memoria, sin CPU | todos | Decisión razonable para evitar *throttling*; revisar con métricas |
| BD de una réplica | `postgres.yaml` | Punto único de fallo; aceptable en práctica |
| `imagePullPolicy` no indicada | `api.yaml` | Con tag fijo es `IfNotPresent`; con `latest` sería `Always` |

## 11. Ejercicios

1. Ejecuta `kubectl -n policies get pods` varias veces tras desplegar. ¿Cuántos reinicios tiene la API? Revisa `kubectl logs --previous` para ver el motivo.
2. Cambia `replicas` a 3 en `api.yaml`, aplica y observa. Vuelve a 2.
3. Modifica `CORS_ORIGINS` en el ConfigMap, aplica y comprueba que los Pods **no** cambian hasta ejecutar `kubectl -n policies rollout restart deploy/policies-api`.
4. Borra `postgres-0` y comprueba que vuelve con los mismos datos (crea antes una póliza desde la aplicación).
5. Escribe un comentario de revisión (2 líneas) sobre la falta de `startupProbe`.

## 12. Autoevaluación

- ¿Qué diferencia hay entre `readinessProbe` y `livenessProbe`?
- ¿Por qué se usa un StatefulSet para PostgreSQL y no un Deployment?
- ¿Qué ocurre si un contenedor supera su `limit` de memoria?
- ¿Por qué la imagen es la misma en todos los entornos?
- ¿Por qué Hibernate está en `validate` y Flyway crea las tablas?

## 13. Lo que un líder debe llevarse

- Evaluar un workload por: imagen, réplicas, sondas, recursos, configuración y usuario.
- Distinguir qué se versiona en la imagen y qué en la configuración.
- Saber que los datos persistentes requieren un diseño específico (StatefulSet, volumen, respaldos).
