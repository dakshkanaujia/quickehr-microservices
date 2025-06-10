// ai-service/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.AI_PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const EHR_SERVICE_URL = process.env.EHR_SERVICE_URL || 'http://localhost:3002';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quickehr', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Diagnosis Schema
const diagnosisSchema = new mongoose.Schema({
  patient_id: { type: String, required: true },
  doctor_id: { type: String, required: true },
  symptoms: [{ type: String }],
  ai_suggestion: { type: String, required: true },
  confidence: { type: Number, min: 0, max: 1 },
  reasoning: { type: String },
  created_at: { type: Date, default: Date.now }
});

const Diagnosis = mongoose.model('Diagnosis', diagnosisSchema);

// AI Diagnosis Logic (Rule-based)
const generateDiagnosis = (symptoms, medicalHistory = []) => {
  const symptomList = symptoms.map(s => s.toLowerCase());
  
  // Define diagnosis rules
  const diagnosisRules = [
    {
      symptoms: ['fever', 'cough', 'sore throat'],
      diagnosis: 'Viral Upper Respiratory Infection',
      confidence: 0.85,
      reasoning: 'Classic triad of viral infection symptoms'
    },
    {
      symptoms: ['fever', 'cough'],
      diagnosis: 'Possible Viral Infection or Common Cold',
      confidence: 0.75,
      reasoning: 'Common symptoms suggesting viral etiology'
    },
    {
      symptoms: ['headache', 'fever', 'fatigue'],
      diagnosis: 'Possible Flu (Influenza)',
      confidence: 0.80,
      reasoning: 'Systemic symptoms consistent with influenza'
    },
    {
      symptoms: ['chest pain', 'shortness of breath'],
      diagnosis: 'Respiratory Distress - Requires Immediate Evaluation',
      confidence: 0.90,
      reasoning: 'Concerning respiratory symptoms need urgent assessment'
    },
    {
      symptoms: ['abdominal pain', 'nausea', 'vomiting'],
      diagnosis: 'Gastroenteritis or Gastrointestinal Disorder',
      confidence: 0.70,
      reasoning: 'GI symptoms suggesting gastric involvement'
    },
    {
      symptoms: ['fatigue', 'weight loss'],
      diagnosis: 'General Malaise - Further Investigation Needed',
      confidence: 0.60,
      reasoning: 'Non-specific symptoms requiring comprehensive evaluation'
    }
  ];
  
  // Find best matching rule
  let bestMatch = {
    diagnosis: 'Symptoms require further clinical evaluation',
    confidence: 0.40,
    reasoning: 'Symptoms do not match common patterns - recommend comprehensive examination'
  };
  
  for (const rule of diagnosisRules) {
    const matchedSymptoms = rule.symptoms.filter(symptom => 
      symptomList.some(s => s.includes(symptom) || symptom.includes(s))
    );
    
    if (matchedSymptoms.length >= 2) {
      bestMatch = {
        diagnosis: rule.diagnosis,
        confidence: rule.confidence,
        reasoning: rule.reasoning
      };
      break;
    } else if (matchedSymptoms.length === 1 && rule.confidence > bestMatch.confidence) {
      bestMatch = {
        diagnosis: rule.diagnosis,
        confidence: rule.confidence * 0.7, // Reduce confidence for partial match
        reasoning: `Partial match: ${rule.reasoning}`
      };
    }
  }
  
  // Adjust confidence based on medical history
  if (medicalHistory.length > 0) {
    const hasChronicConditions = medicalHistory.some(condition => 
      ['diabetes', 'hypertension', 'heart disease', 'asthma'].some(chronic => 
        condition.toLowerCase().includes(chronic)
      )
    );
    
    if (hasChronicConditions) {
      bestMatch.confidence *= 0.9; // Slightly reduce confidence due to comorbidities
      bestMatch.reasoning += ' (Consider existing medical conditions)';
    }
  }
  
  return bestMatch;
};

// Routes

// Get AI Diagnosis Suggestion
app.post('/diagnose', authenticateToken, async (req, res) => {
  try {
    const { patient_id, symptoms, medical_history = [] } = req.body;
    
    if (!symptoms || symptoms.length === 0) {
      return res.status(400).json({ error: 'Symptoms are required' });
    }
    
    // Generate AI diagnosis
    const aiResult = generateDiagnosis(symptoms, medical_history);
    
    // Save diagnosis to database
    const diagnosis = new Diagnosis({
      patient_id,
      doctor_id: req.user.userId,
      symptoms,
      ai_suggestion: aiResult.diagnosis,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning
    });
    
    await diagnosis.save();
    
    res.json({
      diagnosis: aiResult.diagnosis,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      recommendations: [
        'Monitor patient closely',
        'Consider symptomatic treatment',
        'Follow up in 3-5 days if symptoms persist',
        'Seek immediate care if symptoms worsen'
      ],
      diagnosis_id: diagnosis._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Patient Diagnosis History
app.get('/diagnoses/:patient_id', authenticateToken, async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find({ 
      patient_id: req.params.patient_id,
      doctor_id: req.user.userId 
    }).sort({ created_at: -1 });
    
    res.json({ diagnoses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Analytics Dashboard Data
app.get('/analytics', authenticateToken, async (req, res) => {
  try {
    // Get patient data from EHR service
    const ehrResponse = await axios.get(`${EHR_SERVICE_URL}/patients`, {
      headers: { Authorization: req.headers.authorization }
    });
    
    const patients = ehrResponse.data.patients || [];
    
    // Get diagnosis data
    const diagnoses = await Diagnosis.find({ doctor_id: req.user.userId });
    
    // Calculate analytics
    const analytics = {
      summary: {
        total_patients: patients.length,
        total_diagnoses: diagnoses.length,
        avg_confidence: diagnoses.length > 0 
          ? (diagnoses.reduce((sum, d) => sum + d.confidence, 0) / diagnoses.length).toFixed(2)
          : 0
      },
      patient_demographics: {
        age_groups: {
          '0-18': patients.filter(p => p.age <= 18).length,
          '19-35': patients.filter(p => p.age > 18 && p.age <= 35).length,
          '36-50': patients.filter(p => p.age > 35 && p.age <= 50).length,
          '51-65': patients.filter(p => p.age > 50 && p.age <= 65).length,
          '65+': patients.filter(p => p.age > 65).length
        },
        gender: {
          male: patients.filter(p => p.gender === 'male').length,
          female: patients.filter(p => p.gender === 'female').length,
          other: patients.filter(p => p.gender === 'other').length
        }
      },
      common_diagnoses: diagnoses.reduce((acc, d) => {
        acc[d.ai_suggestion] = (acc[d.ai_suggestion] || 0) + 1;
        return acc;
      }, {}),
      monthly_activity: {
        patients_registered: patients.filter(p => {
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return new Date(p.created_at) > monthAgo;
        }).length,
        diagnoses_made: diagnoses.filter(d => {
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return new Date(d.created_at) > monthAgo;
        }).length
      }
    };
    
    res.json({ analytics });
  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

// Get AI Insights
app.get('/insights', authenticateToken, async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find({ doctor_id: req.user.userId })
      .sort({ created_at: -1 })
      .limit(50);
    
    const insights = {
      recent_trends: [
        'Increase in respiratory symptoms this week',
        'Higher confidence in viral infection diagnoses',
        'Recommend flu vaccination for at-risk patients'
      ],
      accuracy_metrics: {
        average_confidence: diagnoses.length > 0 
          ? (diagnoses.reduce((sum, d) => sum + d.confidence, 0) / diagnoses.length).toFixed(2)
          : 0,
        high_confidence_diagnoses: diagnoses.filter(d => d.confidence > 0.8).length,
        total_diagnoses: diagnoses.length
      },
      recommendations: [
        'Consider seasonal patterns in diagnosis',
        'Monitor patient outcomes for feedback',
        'Update symptom assessment protocols'
      ]
    };
    
    res.json({ insights });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'AI Service is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🤖 AI Service running on port ${PORT}`);
});

module.exports = app;