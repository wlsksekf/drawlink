# 1단계: Build stage
# Node.js 환경에서 의존성 설치 및 프로덕션 빌드 수행
FROM node:20-alpine AS build-stage

# 작업 디렉터리 설정
WORKDIR /app

# 의존성 설치를 위한 package.json 및 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 소스 코드 복사
COPY . .

# 프로덕션 빌드 실행 (Vite 기본 빌드 결과물은 dist 폴더에 생성됨)
RUN npm run build

# 2단계: Production stage
# Nginx를 기반으로 정적 파일 서빙
FROM nginx:alpine

# 1단계에서 빌드된 정적 파일(dist 폴더 내용물)을 Nginx 기본 제공 경로로 복사
COPY --from=build-stage /app/dist /usr/share/nginx/html

# 작성된 커스텀 Nginx 설정 파일을 컨테이너의 기본 설정 파일 위치에 덮어쓰기
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 80번 포트 개방
EXPOSE 80

# Nginx 포그라운드 실행
CMD ["nginx", "-g", "daemon off;"]