# Despliegue en Kubernetes

Arquitectura: `Ingress` → `policies-web` (nginx + Angular) → `/api/` → `policies-api` (Quarkus) → `postgres`.
El frontend usa `/api` (mismo dominio), por lo que no se necesita CORS entre ambos.

## 1. Construir y publicar las imágenes

```bash
docker build -t <registro>/policies-api:0.0.1 quarkus-api
docker build -t <registro>/policies-web:1.0.0 angular-app
docker push <registro>/policies-api:0.0.1
docker push <registro>/policies-web:1.0.0
```

Ajusta `image:` en `api.yaml` y `web.yaml` con tu registro.

## 2. Configurar

- Dominio: reemplaza `policies.example.com` en `web.yaml` (Ingress) y `CORS_ORIGINS` en `api.yaml`.
- TLS: crea el secreto `policies-tls` (o usa cert-manager).
- Secretos: sigue los comandos de `secrets.example.yaml`. Genera un par de claves JWT nuevo; no uses el del repositorio.

## 3. Aplicar

```bash
kubectl apply -f k8s/namespace.yaml
# crear los secretos (ver secrets.example.yaml)
kubectl apply -f k8s/postgres.yaml -f k8s/api.yaml -f k8s/web.yaml
kubectl -n policies get pods
```

## Notas

- El perfil `prod` de Quarkus usa PostgreSQL, ejecuta las migraciones Flyway (`db/migration`) y no carga datos demo ni Swagger.
- Sondas de salud: `/q/health/live` y `/q/health/ready`.
- La BD es un `StatefulSet` simple de una réplica; en producción usa un servicio gestionado.
- No hay usuarios en base de datos: las credenciales `admin`/`user` vienen de los secretos (limitación de la app demo).
- Las pruebas Maven requieren JDK 21 (`JAVA_HOME`).
