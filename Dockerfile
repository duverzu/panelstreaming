# ==================================================================
#  Dockerfile — Panel Radio (backend Node + frontend React)
#  Imagen única y portátil: compila el frontend y sirve todo con Node.
# ==================================================================

# ---- Etapa 1: compilar el frontend React (Vite) ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Etapa 2: backend + frontend ya compilado ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Dependencias del backend
COPY package*.json ./
RUN npm install --omit=dev

# Código del backend + el dist del frontend de la etapa 1
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist

RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
