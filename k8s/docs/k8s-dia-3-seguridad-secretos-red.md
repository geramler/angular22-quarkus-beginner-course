# Kubernetes — Día 3: Secretos, seguridad, red e Ingress

**Objetivo (líder técnico):** entender cómo se protege la información sensible y el tráfico en este despliegue, y evaluar sus riesgos y decisiones.

**Tiempo sugerido:** 3–4 h.

---

## 1. Visión general

```
Internet --HTTPS--> Ingress --HTTP--> policies-web (nginx) --/api--> policies-api --JDBC--> postgres
                      │                                               │
                  Secret TLS                      Secrets: BD, contraseñas, claves JWT
```

- Solo el **Ingress** es visible desde fuera. La API y la base de datos son `ClusterIP`: únicamente accesibles dentro del cluster.
- Los secretos **no están en el repositorio ni en la imagen**; se crean en el cluster y se inyectan al ejecutar.

## 2. Secrets: qué son y qué no son

Archivo guía: [secrets.example.yaml](../secrets.example.yaml)

```bash
kubectl -n policies create secret generic policies-db \
  --from-literal=username=policies --from-literal=password=<clave>
kubectl -n policies create secret generic policies-auth \
  --from-literal=admin-password=<clave> --from-literal=user-password=<clave>
kubectl -n policies create secret generic policies-jwt-keys \
  --from-file=privateKey.pem=<ruta> --from-file=publicKey.pem=<ruta>
```

| Secreto | Contenido | Quién lo usa |
|---|---|---|
| `policies-db` | usuario y contraseña de PostgreSQL | postgres y API |
| `policies-auth` | contraseñas de `admin` y `user` | API |
| `policies-jwt-keys` | clave privada y pública RSA | API |

**Idea clave:** un Secret está codificado en **base64, no cifrado**. Cualquiera con permiso `get secret` lo lee. La protección real viene de:
- RBAC: limitar quién puede leer secretos.
- Cifrado en reposo de etcd (`EncryptionConfiguration`) o del proveedor.
- Gestores externos (Vault, Key Vault, Secrets Manager) con *External Secrets Operator* o *CSI Secrets Store*.
- No guardar manifiestos con valores reales en Git. Aquí solo se versiona la **plantilla** con los comandos.

## 3. Cómo llegan los secretos a la aplicación

Archivo: [api.yaml](../api.yaml)

```yaml
env:
  - name: DB_PASSWORD
    valueFrom: { secretKeyRef: { name: policies-db, key: password } }
volumes:
  - name: jwt-keys
    secret: { secretName: policies-jwt-keys, defaultMode: 0440 }
```

- Contraseñas: como **variables de entorno** (`secretKeyRef`). Quarkus las mapea: `APP_AUTH_ADMIN_PASSWORD` → `app.auth.admin-password`.
- Claves JWT: como **archivos** en `/keys` (montaje de solo lectura). Un archivo es mejor que una variable para una clave PEM multilínea.
- Variables de entorno pueden filtrarse en logs o volcados de procesos; los archivos permiten además **rotar sin reiniciar** si la aplicación vuelve a leerlos.

## 4. Lección aprendida: permisos del volumen y URL de la clave

Al probar el despliegue aparecieron dos fallos reales que conviene entender:

| Síntoma | Causa | Solución en el proyecto |
|---|---|---|
| `MalformedURLException: no protocol: /keys/privateKey.pem` | SmallRye exige una **URL** para rutas fuera del classpath | Usar `file:/keys/privateKey.pem` |
| `Signing key can not be created from the loaded content` | El contenedor corre como `10001` pero el archivo era de otro usuario con modo `0600`; no podía leerlo | `securityContext: runAsUser: 10001, fsGroup: 10001` y `defaultMode: 0440` |

Moraleja: **un contenedor no root necesita que los archivos montados sean legibles por su usuario o grupo**. `fsGroup` hace que Kubernetes asigne ese grupo a los volúmenes, y `0440` da lectura al grupo sin abrir permisos al resto.

## 5. Seguridad del contenedor

- **Usuario no root:** la imagen de la API usa el UID `10001`; nginx usa `nginx-unprivileged` en el puerto 8080 (un usuario no root no puede abrir el puerto 80).
- **Imágenes mínimas:** JRE en lugar de JDK; nginx en Alpine.
- Mejoras pendientes (no aplicadas, buenas para el backlog):

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: ["ALL"] }
```

- Escanear imágenes (Trivy, Grype) en CI y actualizar imágenes base con regularidad.

## 6. Red: Services, Ingress y TLS

Archivo: [web.yaml](../web.yaml)

```yaml
kind: Ingress
spec:
  ingressClassName: nginx
  tls:
    - hosts: [policies.example.com]
      secretName: policies-tls
  rules:
    - host: policies.example.com
      http: { paths: [{ path: /, pathType: Prefix,
        backend: { service: { name: policies-web, port: { number: 80 } } } }] }
```

- El Ingress es solo una **regla**; necesita un *Ingress Controller* instalado (ingress-nginx, Traefik…). En `kind` hay que instalarlo aparte.
- **TLS** se termina en el Ingress con el secreto `policies-tls` (certificado + clave). Con **cert-manager** se emite y renueva automáticamente con Let's Encrypt.
- **HTTPS es obligatorio:** el JWT viaja en la cabecera `Authorization`; por HTTP plano se puede interceptar.
- El tráfico interno (Ingress → web → API → BD) va sin cifrar. Es habitual; para requisitos estrictos se usa una *service mesh* (mTLS).

### Mismo dominio y CORS

- Frontend y API se sirven bajo el mismo dominio (`/api` → nginx → API), así que el navegador **no hace peticiones entre orígenes**.
- Aun así `CORS_ORIGINS` queda configurado con el dominio real, nunca `*`.
- nginx añade `X-Forwarded-Proto` para que la API conozca el protocolo original.

## 7. NetworkPolicy y RBAC (lo que falta)

| Tema | Estado actual | Recomendación |
|---|---|---|
| NetworkPolicy | **No hay**: cualquier Pod puede hablar con cualquier otro | Denegar todo por defecto y permitir: web → API, API → postgres |
| RBAC | Se usa la cuenta por defecto del namespace | `ServiceAccount` propia por aplicación, sin permisos innecesarios |
| `automountServiceAccountToken` | Activo por defecto | Desactivar en Pods que no hablan con la API de Kubernetes |
| Pod Security Standards | Sin etiquetar el namespace | Aplicar el nivel `restricted` o `baseline` |

Ejemplo de la política que protege la base de datos:

```yaml
kind: NetworkPolicy
spec:
  podSelector: { matchLabels: { app: postgres } }
  ingress:
    - from: [{ podSelector: { matchLabels: { app: policies-api } } }]
      ports: [{ port: 5432 }]
```

Las NetworkPolicy solo funcionan si el plugin de red (CNI) las soporta (Calico, Cilium). `kind` por defecto **no** las aplica.

## 8. Riesgos de la aplicación que Kubernetes no resuelve

| Tema | Pregunta |
|---|---|
| Usuarios fijos | `admin` y `user` están en el código; solo sus contraseñas vienen del Secret. Producción: proveedor de identidad (OIDC) |
| Tokens sin revocación | Un token robado sirve hasta expirar (60 min). ¿Hace falta refresh token? |
| Swagger | Desactivado en el perfil `prod`; verifica que no se exponga |
| Endpoints `/q/health` | Accesibles a través de `/api`? El nginx solo reenvía `/api/`, por lo que **no** se exponen desde fuera |
| Logs | Nunca registrar tokens ni contraseñas |
| Rotación | ¿Cómo se cambia la clave JWT sin cortar a los usuarios? (kid + dos claves públicas) |

## 9. Ejercicios

1. Crea los secretos y lee uno con `kubectl -n policies get secret policies-db -o jsonpath='{.data.password}' | base64 -d`. ¿Qué te dice sobre la seguridad de un Secret?
2. Entra a un Pod de la API (`kubectl -n policies exec -it <pod> -- sh`) y ejecuta `id` y `ls -ln /keys`. ¿Con qué usuario corre y qué permisos tienen las claves?
3. Quita `fsGroup` del manifiesto, aplica y reproduce el error de lectura de la clave. Restáuralo y compáralo.
4. Escribe una NetworkPolicy que permita acceder a postgres solo desde la API.
5. Lista tres riesgos de producción que ves en la configuración actual.

## 10. Autoevaluación

- ¿Por qué un Secret no es realmente "secreto" por sí solo?
- ¿Por qué las claves JWT se montan como archivo y las contraseñas como variable?
- ¿Para qué sirve `fsGroup`?
- ¿Por qué el Ingress es obligatorio para HTTPS pero no para que los Pods se comuniquen?
- ¿Qué impide hoy que un Pod comprometido hable con la base de datos?

## 11. Lo que un líder debe llevarse

- Separar lo que protege Kubernetes (aislamiento, RBAC, red) de lo que protege la aplicación (autenticación, validación).
- Saber preguntar: dónde viven los secretos, quién los puede leer, cómo se rotan y qué pasa si se filtran.
- Exigir HTTPS, usuario no root, NetworkPolicy y un gestor de secretos antes de producción.
