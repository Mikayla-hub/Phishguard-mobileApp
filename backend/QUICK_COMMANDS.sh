#!/bin/bash
# PhishGuard ML System - Quick Commands Reference

# ============================================================================
# INSTALLATION & SETUP
# ============================================================================

# 1. Install Python ML dependencies
pip install -r ml_requirements.txt

# 2. Verify setup status
node setup-ml.js

# ============================================================================
# MODEL TRAINING
# ============================================================================

# 3. Train ensemble models (one-time, ~2-5 minutes)
python ml_train_ensemble.py

# 4. Check trained model files
ls -lh models/

# ============================================================================
# RUNNING THE SYSTEM
# ============================================================================

# 5. Start ML Server (Terminal 1)
python ml_server_enhanced.py

# 6. Start Node.js Backend (Terminal 2)
npm run dev

# 7. (Optional) Development with ML and Node.js in parallel
npm run dev:all

# ============================================================================
# TESTING & DEBUGGING
# ============================================================================

# 8. Test ML server health
curl http://localhost:5000/api/health | json_pp

# 9. Test Node.js backend health
curl http://localhost:3001/api/health | json_pp

# 10. Analyze email via Python ML server
curl -X POST http://localhost:5000/api/analyze/email \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Click here to verify your account",
    "sender": "admin@suspicious.com",
    "subject": "Urgent: Verify"
  }' | json_pp

# 11. Analyze URL via Python ML server
curl -X POST http://localhost:5000/api/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "http://192.168.1.1/login"}' | json_pp

# 12. Get model statistics
curl http://localhost:5000/api/models/stats | json_pp

# 13. Test Node.js endpoint (requires JWT token)
# First get a token from /api/auth/login, then:
curl -X POST http://localhost:3001/api/phishing/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "content": "Phishing test",
    "sender": "test@example.com"
  }' | json_pp

# ============================================================================
# MONITORING
# ============================================================================

# 14. Watch ML server logs (Linux/Mac)
tail -f /var/log/ml_server.log

# 15. Watch Node.js logs
npm run dev 2>&1 | tee backend.log

# 16. Check running processes
ps aux | grep python  # ML server
ps aux | grep node    # Node backend

# ============================================================================
# MAINTENANCE & RETRAINING
# ============================================================================

# 17. Update training data
# - Add new phishing examples to CSV files in data/datasets/
# - Then retrain:
python ml_train_ensemble.py

# 18. Clear model cache (if needed)
rm -f models/*.joblib
python ml_train_ensemble.py  # Retrain

# 19. Backup current models
cp -r models/ models.backup/

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

# 20. Check if port 5000 is in use
lsof -i :5000

# 21. Kill process on port 5000
kill -9 $(lsof -t -i :5000)

# 22. Check if port 3001 is in use
lsof -i :3001

# 23. Verify Python version
python --version

# 24. Verify pip has all required packages
pip list | grep -E "scikit-learn|flask|xgboost|joblib"

# 25. Full system diagnostics
node setup-ml.js
python --version
npm --version
curl http://localhost:5000/api/health
curl http://localhost:3001/api/health

# ============================================================================
# DEPLOYMENT & DOCKER (Optional)
# ============================================================================

# 26. Build Docker image (if Dockerfile exists)
docker build -t phishguard-ml .

# 27. Run in Docker
docker-compose up

# 28. Deploy to production
# - Update .env with production values
# - Set NODE_ENV=production
# - Use process manager (PM2, Supervisor)
pm2 start ecosystem.config.js

# ============================================================================
# PERFORMANCE TUNING
# ============================================================================

# 29. Profile ML server
python -m cProfile ml_server_enhanced.py

# 30. Monitor system resources during inference
watch -n 1 'ps aux | grep python'

# ============================================================================
# DOCUMENTATION
# ============================================================================

# View full setup guide
cat ML_SETUP_GUIDE.md

# View implementation summary
cat IMPLEMENTATION_SUMMARY.md

# View feature extraction code
cat ml_feature_extractor.py

# ============================================================================
# USEFUL ALIASES (Add to ~/.bashrc or ~/.zshrc)
# ============================================================================

# alias ml-train='python ml_train_ensemble.py'
# alias ml-server='python ml_server_enhanced.py'
# alias ml-test='curl http://localhost:5000/api/health'
# alias backend-start='npm run dev'
# alias phishguard-dev='tmux new-session -d -s phishguard "python ml_server_enhanced.py" ; tmux new-window -t phishguard "npm run dev"'

# ============================================================================
# API ENDPOINT REFERENCE
# ============================================================================

# ML Server (Python)
# POST   /api/analyze/email      - Analyze email
# POST   /api/analyze/url        - Analyze URL
# POST   /api/analyze/text       - Generic text
# POST   /api/batch/analyze      - Batch analysis
# GET    /api/models/stats       - Model statistics
# GET    /api/health             - Health check

# Node.js Backend
# POST   /api/phishing/analyze   - Unified phishing analysis
# GET    /api/health             - Backend health
# POST   /api/auth/login         - Authentication
# GET    /api/learning/modules   - Learning content
# POST   /api/incidents/report   - Report incident

# ============================================================================
# COMMON ISSUES & FIXES
# ============================================================================

# Issue: "Connection refused: localhost:5000"
# Fix: Start ML server first: python ml_server_enhanced.py

# Issue: "Models not found"
# Fix: Train models: python ml_train_ensemble.py

# Issue: "Port already in use"
# Fix: Kill process: kill -9 $(lsof -t -i :5000)

# Issue: "Low accuracy on new data"
# Fix: Retrain models with new data: python ml_train_ensemble.py

# Issue: "Slow inference"
# Fix: Check cache is working, increase Redis if using remote cache

# ============================================================================
