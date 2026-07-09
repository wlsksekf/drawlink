import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

# .env 파일로부터 환경 변수 로드 (상위 디렉토리를 탐색하며 .env를 찾음)
load_dotenv()

# 데이터베이스 연결 URL 확인 및 빌드
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "postgres")
    
    # 비밀번호에 포함된 특수문자(예: '@') 처리용 URL 인코딩
    safe_password = urllib.parse.quote_plus(db_password)
    DATABASE_URL = f"postgresql+asyncpg://{db_user}:{safe_password}@{db_host}:{db_port}/{db_name}"

# 🔹 고동시성 웹소켓 환경을 위한 연결 풀 및 드라이버 옵션 튜닝
# 윈도우 환경에서 비ASCII(한글 등) 계정명 사용 시 asyncpg의 인증서 파싱 버그 우회 세팅
connect_args = {
    "statement_cache_size": 0  # Supabase PgBouncer와의 트랜잭션 모드 충돌 방지용 캐시 비활성화
}

if "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL:
    # 로컬 DB 접속 시에는 SSL 검증 불필요
    connect_args["ssl"] = False
else:
    # 외부 Supabase 접속 시 한글 계정명 경로 버그 우회용 커스텀 무검증 SSL 컨텍스트 주입
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_context

# 비동기 데이터베이스 엔진 생성
engine = create_async_engine(
    DATABASE_URL,
    pool_size=50,             # 기본 연결 풀 크기 유지
    max_overflow=50,          # 트래픽 피크 시 허용할 최대 오버플로우 연결 수
    pool_timeout=30.0,        # 연결 풀 대기 최대 제한 시간 (30초)
    pool_recycle=1800,        # 끊긴 연결 방지를 위한 30분 주기 연결 재활용
    pool_pre_ping=True,       # 연결을 풀에서 꺼내기 전 유효성 사전 검증(핑 테스트)
    echo=False,               # 프로덕션/부하 테스트 환경용 SQL 로그 비활성화
    connect_args=connect_args # 👈 위에서 조율한 SSL 및 캐시 옵션 딕셔너리를 단일 주입
)

# 비동기 세션 팩토리 생성
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# SQLAlchemy 모델용 기본 베이스 클래스
Base = declarative_base()

# FastAPI 엔드포인트(라우터)에서 사용할 DB 세션 주입용 의존성 함수
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()