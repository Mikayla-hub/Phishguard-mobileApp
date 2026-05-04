#!/usr/bin/env node

/**
 * PhishGuard ML System Setup & Health Check
 * Verifies all components and guides through setup
 * 
 * Usage: node setup-ml.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

const BASE_DIR = __dirname;
const MODELS_DIR = path.join(BASE_DIR, 'models');
const DATASETS_DIR = path.join(BASE_DIR, 'data', 'datasets');

class MLSetupHelper {
  constructor() {
    this.checks = {
      python: false,
      models: false,
      datasets: false,
      flask: false,
      nodejs: false
    };
  }

  log(level, message) {
    const icons = {
      info: 'ℹ️ ',
      success: '✅',
      warning: '⚠️ ',
      error: '❌',
      info2: '📋',
      tool: '🔧',
      python: '🐍',
      models: '🧠',
      rocket: '🚀'
    };
    const icon = icons[level] || '  ';
    console.log(`${icon} ${message}`);
  }

  async checkPython() {
    this.log('python', 'Checking Python installation...');
    try {
      const version = execSync('python --version').toString().trim();
      this.log('success', `Python found: ${version}`);
      this.checks.python = true;
      return true;
    } catch (e) {
      this.log('error', 'Python not found. Install Python 3.8+ from https://python.org');
      return false;
    }
  }

  checkDatasets() {
    this.log('info2', 'Checking dataset files...');
    const datasets = [
      'Phishing_Email.csv',
      'PhiUSIIL_Phishing_URL_Dataset.csv',
      'zimbabwe_phishing_dataset.csv'
    ];

    let found = 0;
    datasets.forEach(ds => {
      const dsPath = path.join(DATASETS_DIR, ds);
      if (fs.existsSync(dsPath)) {
        const sizeKB = (fs.statSync(dsPath).size / 1024).toFixed(1);
        this.log('success', `${ds} (${sizeKB} KB)`);
        found++;
      } else {
        this.log('warning', `${ds} not found`);
      }
    });

    this.checks.datasets = found > 0;
    return found > 0;
  }

  checkModels() {
    this.log('models', 'Checking trained models...');
    const models = [
      'email_ensemble.joblib',
      'email_vectorizer.joblib',
      'url_ensemble.joblib',
      'url_vectorizer.joblib'
    ];

    let found = 0;
    models.forEach(model => {
      const modelPath = path.join(MODELS_DIR, model);
      if (fs.existsSync(modelPath)) {
        const sizeMB = (fs.statSync(modelPath).size / 1024 / 1024).toFixed(1);
        this.log('success', `${model} (${sizeMB} MB)`);
        found++;
      } else {
        this.log('warning', `${model} not found`);
      }
    });

    this.checks.models = found === 4;

    if (!this.checks.models) {
      this.log('error', 'Models not trained yet. Run: python ml_train_ensemble.py');
    }
    return this.checks.models;
  }

  async checkFlaskServer() {
    this.log('rocket', 'Checking Flask ML server on port 5000...');
    try {
      const response = await axios.get('http://localhost:5000/api/health', {
        timeout: 2000
      });
      if (response.status === 200) {
        this.log('success', 'Flask ML server is running and responsive');
        this.checks.flask = true;
        return true;
      }
    } catch (e) {
      this.log('warning', 'Flask ML server not found. Start with: python ml_server_enhanced.py');
    }
    return false;
  }

  checkNodeJS() {
    this.log('info', 'Checking Node.js backend...');
    try {
      const pkgJsonPath = path.join(BASE_DIR, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        this.log('success', `Node.js project: ${pkgJson.name || 'PhishGuard Backend'}`);
        
        const nodeModulesPath = path.join(BASE_DIR, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
          this.log('success', 'Dependencies installed (node_modules found)');
          this.checks.nodejs = true;
        } else {
          this.log('warning', 'Dependencies not installed. Run: npm install');
        }
      }
    } catch (e) {
      this.log('error', 'Error checking Node.js setup');
    }
    return this.checks.nodejs;
  }

  async runFullCheck() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  PhishGuard ML System - Setup & Health Check               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await this.checkPython();
    console.log('');
    
    this.checkDatasets();
    console.log('');
    
    this.checkModels();
    console.log('');
    
    this.checkNodeJS();
    console.log('');
    
    await this.checkFlaskServer();
    console.log('');
    
    this.printSummary();
  }

  printSummary() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  SETUP STATUS                                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const checkmark = (ok) => ok ? '✅' : '❌';

    console.log(`${checkmark(this.checks.python)}  Python 3.8+`);
    console.log(`${checkmark(this.checks.datasets)}  Dataset files (CSV)`);
    console.log(`${checkmark(this.checks.models)}  Trained models (joblib)`);
    console.log(`${checkmark(this.checks.nodejs)}  Node.js dependencies`);
    console.log(`${checkmark(this.checks.flask)}  Flask ML server running\n`);

    const allReady = Object.values(this.checks).every(v => v);

    if (allReady) {
      console.log('🎉 All systems ready! Start with:');
      console.log('   Terminal 1: python ml_server_enhanced.py');
      console.log('   Terminal 2: npm run dev\n');
    } else {
      console.log('⚙️  Setup Steps:\n');
      
      if (!this.checks.python) {
        console.log('1️⃣  Install Python 3.8+ from https://python.org');
      }

      if (!this.checks.models) {
        console.log(`${this.checks.python ? '1' : '2'}️⃣  Install ML dependencies:\n   pip install -r ml_requirements.txt\n`);
        console.log(`${this.checks.python ? '2' : '3'}️⃣  Train ensemble models:\n   python ml_train_ensemble.py\n`);
      }

      if (!this.checks.nodejs) {
        console.log(`${!this.checks.python && !this.checks.models ? '1' : this.checks.python && this.checks.models ? '2' : '3'}️⃣  Install Node.js dependencies:\n   npm install\n`);
      }

      if (!this.checks.flask) {
        console.log(`${!this.checks.python && !this.checks.models && !this.checks.nodejs ? '1' : '4'}️⃣  Start ML server:\n   python ml_server_enhanced.py\n`);
      }
    }

    console.log('📖 Full guide: ML_SETUP_GUIDE.md');
    console.log('');
  }
}

// Run checks
async function main() {
  const helper = new MLSetupHelper();
  await helper.runFullCheck();
}

main().catch(console.error);
