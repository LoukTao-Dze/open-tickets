## ---- build: install deps and produce the production Angular bundle ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

## ---- serve: static files behind nginx ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist/app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
