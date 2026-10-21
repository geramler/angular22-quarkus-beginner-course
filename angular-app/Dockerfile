FROM node:24-alpine AS build
WORKDIR /build
COPY package.json ./
RUN npm install
COPY . .
RUN npx ng build --configuration production

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist/policies-app/browser /usr/share/nginx/html
EXPOSE 8080
