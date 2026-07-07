import os
import jwt
from typing import Optional
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Read Supabase JWT Secret from environment variables
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

security = HTTPBearer(auto_error=False)

def verify_token(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> dict:
    """
    HTTP dependency to verify the Supabase JWT.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing",
        )
    
    token = credentials.credentials
    try:
        # Supabase default algorithm is HS256 using the JWT Secret
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

def verify_ws_token(token: str) -> Optional[dict]:
    """
    WebSocket auth verification. Returns decoded payload if valid, else None.
    """
    if not token or not SUPABASE_JWT_SECRET:
        # If no JWT secret is configured, bypass verification for local testing,
        # but in production requiring it is necessary.
        if not SUPABASE_JWT_SECRET:
            return {"sub": "anonymous-test-user"}
        return None
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        return payload
    except Exception:
        return None
