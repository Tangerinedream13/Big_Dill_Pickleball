# Production Deployment & Networking Configuration

## Overview
This update finalized the production deployment of Big Dill Pickleball.

### Infrastructure Changes
- Split frontend and backend into separate Railway services
- Configured backend Dockerfile deployment
- Set healthcheck to `/health`
- Fixed Railway port binding (using process.env.PORT)

### DNS + Domain
- Connected custom domain via Cloudflare
- Added:
  - big-dill-pickleball.com (frontend)
  - api.big-dill-pickleball.com (backend)
- Configured CNAME records
- Completed Railway domain verification

### CORS Fixes
- Allowed:
  - Railway frontend domain
  - Custom root domain
  - www subdomain
- Prevented CORS crashes by returning (null, false)

### Client Configuration
- Added VITE_API_BASE_URL
- Updated API_BASE logic
- Ensured all API calls use absolute base

### Verification
- curl tests confirmed:
  - /health returns 200
  - /api/tournaments returns JSON
- Verified no HTML fallback on API routes