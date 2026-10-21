# Kubernetes — Día 1: Conceptos base, estructura y ciclo de vida de un despliegue

**Objetivo (líder técnico):** explicar qué es Kubernetes, qué piezas componen el despliegue de este proyecto y qué ocurre desde `kubectl apply` hasta que el usuario recibe una respuesta.

**Tiempo sugerido:** 3–4 h (lectura 1.5 h, recorrido guiado 1.5 h, ejercicios 1 h).

---

## 1. Qué es Kubernetes (en una página)

- Es un **orquestador de contenedores**: tú declaras el estado deseado ("quiero 2 réplicas de esta imagen") y Kubernetes trabaja continuamente para que la realidad coincida.
- Modelo **declarativo**: se describe en YAML *qué* quieres, no *cómo* lograrlo. Se aplica con `kubectl apply`.
- **Bucle de reconciliación:** si un contenedor muere, Kubernetes crea otro; si cambias `replicas`, ajusta la cantidad.
- Ofrece: autorecuperación, escalado, actualizaciones sin corte, descubrimiento de servicios por nombre y gestión de configuración y secretos.
- No construye imágenes ni guarda tu código: ejecuta **imágenes ya construidas** (Docker) que están en un registro.

Comparación útil: Docker ejecuta un contenedor; Kubernetes ejecuta y vigila *flotas* de contenedores en varias máquinas.

## 2. Vocabulario mínimo

| Objeto | En una frase | En este proyecto |
|---|---|---|
| Cluster | Conjunto de máquinas (nodos) gestionadas juntas | `kind`, minikube o la nube |
| Namespace | Espacio lógico para aislar recursos | `policies` |
| Pod | Unidad mínima: uno o más contenedores que viven juntos | cada réplica de API, web o BD |
| Deployment | Mantiene N réplicas de un Pod y gestiona actualizaciones | `policies-api`, `policies-web` |
| StatefulSet | Como Deployment, pero con identidad y disco estable | `postgres` |
| Service | Nombre y dirección estable para llegar a un grupo de Pods | `policies-api`, `policies-web`, `postgres` |
| Ingress | Entrada HTTP(S) desde fuera del cluster | `policies` |
| ConfigMap | Configuración no secreta | `policies-api-config` |
| Secret | Datos sensibles (contraseñas, claves) | `policies-db`, `policies-auth`, `policies-jwt-keys` |
| PersistentVolumeClaim | Solicitud de disco persistente | creado por el StatefulSet |

## 3. Mapa del proyecto

```
k8s/
├── README.md               # pasos rápidos de despliegue
├── namespace.yaml          # namespace "policies"
├── secrets.example.yaml    # comandos para crear los secretos (sin valores reales)
├── postgres.yaml           # StatefulSet + Service de la base de datos
├── api.yaml                # ConfigMap + Deployment + Service de Quarkus
├── web.yaml                # Deployment + Service + Ingress de Angular (nginx)
└── docs/                   # esta guía

quarkus-api/Dockerfile      # imagen de la API (JDK 21)
angular-app/Dockerfile      # imagen del frontend (build Angular + nginx)
angular-app/nginx.conf      # sirve la SPA y reenvía /api/ a la API
```

**Cómo leerlo como líder:** Dockerfile (qué se empaqueta) → `api.yaml` (cómo se ejecuta y configura) → `web.yaml` (cómo se expone) → `postgres.yaml` (dónde se guardan los datos) → secretos (qué no debe estar en el repositorio).

## 4. Arquitectura desplegada

```
Usuario → Ingress (policies.example.com, TLS)
            ↓
        Service policies-web → Pods nginx + Angular (x2)
            ↓  /api/*  (nginx proxy_pass)
        Service policies-api → Pods Quarkus (x2)
            ↓  JDBC
        Service postgres → Pod postgres-0 (disco persistente)
```

Decisión clave: el navegador solo habla con **un dominio**. El frontend llama a `/api` (ruta relativa) y nginx lo reenvía a la API. Ventajas: no hay CORS entre frontend y API y la API no se expone directamente.

## 5. Ciclo de vida de un despliegue

1. **Construcción:** `docker build` genera las imágenes `policies-api` y `policies-web`; se publican en un registro.
2. **Declaración:** `kubectl apply -f k8s/...` envía el YAML al *API server* del cluster.
3. **Almacenamiento:** el estado deseado se guarda en etcd.
4. **Controlador:** el controlador del Deployment crea un *ReplicaSet*, que crea los Pods.
5. **Planificación:** el *scheduler* elige un nodo con recursos suficientes (según `requests`).
6. **Ejecución:** el nodo descarga la imagen y arranca el contenedor.
7. **Sondas:** *readiness* decide cuándo el Pod recibe tráfico; *liveness* decide cuándo reiniciarlo.
8. **Tráfico:** el Service reparte peticiones solo entre Pods *listos*.

### Ciclo de una petición

`GET /api/policies` → Ingress → Service `policies-web` → nginx → `proxy_pass http://policies-api:8080` (el nombre se resuelve por DNS interno) → un Pod de Quarkus → valida JWT → consulta `postgres:5432` → JSON de vuelta por el mismo camino.

## 6. Comandos que debes saber ejecutar

```bash
# Cluster local de práctica (requiere Docker y kind)
kind create cluster --name policies-lab
kind load docker-image policies-api:0.0.1 policies-web:1.0.0 --name policies-lab

# Desplegar
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml -f k8s/api.yaml -f k8s/web.yaml

# Observar
kubectl -n policies get pods
kubectl -n policies get all
kubectl -n policies describe pod <nombre>
kubectl -n policies logs deploy/policies-api

# Probar sin Ingress
kubectl -n policies port-forward svc/policies-web 8090:80   # http://localhost:8090
```

Los pasos para crear los secretos antes de aplicar `postgres.yaml` y `api.yaml` están en [secrets.example.yaml](../secrets.example.yaml). Sin ellos los Pods quedan en `CreateContainerConfigError`.

## 7. Conceptos mínimos que debes dominar hoy

| Concepto | En una frase | Dónde verlo |
|---|---|---|
| Estado deseado vs actual | Tú declaras; el cluster se ajusta | `replicas: 2` |
| Labels y selectores | Así un Service o Deployment encuentra sus Pods | `app: policies-api` |
| DNS interno | Un Service es accesible por su nombre | `postgres`, `policies-api` |
| Imagen vs Pod | La imagen es la plantilla; el Pod es la instancia | `image: policies-api:0.0.1` |
| Namespace | Aislamiento lógico | `-n policies` en cada comando |
| Declarativo | `apply` es repetible (idempotente) | volver a aplicar no duplica nada |

## 8. Ejercicios del día

1. Crea un cluster `kind`, carga las imágenes y despliega siguiendo la sección 6. Comprueba que los 5 Pods llegan a `Running`.
2. Con `kubectl get pods -o wide` identifica en qué nodo corre cada Pod.
3. Borra un Pod de la API (`kubectl -n policies delete pod <nombre>`) y observa cómo se crea otro automáticamente.
4. Usa `port-forward` hacia `policies-web`, abre la aplicación y entra con los usuarios cuyas contraseñas definiste en `policies-auth`.
5. Dibuja con tus palabras el flujo de la sección 5 sin mirar el documento.

## 9. Autoevaluación (responde en voz alta)

- ¿Qué diferencia hay entre un Pod y un Deployment?
- ¿Por qué un Service es necesario si los Pods ya tienen IP?
- ¿Qué significa que Kubernetes sea declarativo?
- ¿Por qué el frontend llama a `/api` y no a la URL de la API?
- ¿Qué pasa si borras un Pod gestionado por un Deployment?

## 10. Lo que un líder debe llevarse del día

- Entender el despliegue como un conjunto de objetos pequeños con una responsabilidad cada uno.
- Saber ubicar cualquier pieza siguiendo: imagen → Deployment → Service → Ingress.
- Reconocer que Kubernetes **vigila y repara**, pero no arregla una aplicación mal configurada.
