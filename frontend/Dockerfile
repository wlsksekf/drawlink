# 1단계: 빌드 환경
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# 2단계: 실행 환경 (순수 Nginx 기본 세팅 활용)
FROM nginx:1.25-alpine

# 빌드된 파일만 Nginx 서빙 루트로 이동
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]