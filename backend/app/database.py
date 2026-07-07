import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

# Load environmental variables from .env (resolves parent directory upwards)
load_dotenv()

import urllib.parse

# Resolve or build database connection URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "postgres")
    
    # URL encode password to handle special characters (e.g. '@' in passwords)
    safe_password = urllib.parse.quote_plus(db_password)
    DATABASE_URL = f"postgresql+asyncpg://{db_user}:{safe_password}@{db_host}:{db_port}/{db_name}"

# Tuning connection pool parameters for high WebSocket concurrency
# Bypass asyncpg's user home directory certificate parsing bug on Windows (non-ASCII usernames)
connect_args = {}
if "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL:
    connect_args["ssl"] = False
else:
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_context

engine = create_async_engine(
    DATABASE_URL,
    pool_size=50,            # Standard connection pool size
    max_overflow=50,         # Maximum overflow connections under peak load
    pool_timeout=30.0,       # Wait up to 30 seconds for a connection to become available
    pool_recycle=1800,       # Recycle connections every 30 minutes to prevent stales
    pool_pre_ping=True,      # Verify connection validity before dispensing it
    echo=False,              # Set to True for SQL logging, disable in production/load tests
    connect_args=connect_args
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

# Dependency to get db session in FastAPI routes
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
