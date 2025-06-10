// ehr-service/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.EHR_PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

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

// Patient Schema
const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  phone: { type: String },
  email: { type: String },
  address: { type: String },
  symptoms: [{ type: String }],
  medical_history: [{ type: String }],
  current_medications: [{ type: String }],
  allergies: [{ type: String }],
  created_by: { type: String, required: true }, // doctor ID
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const Patient = mongoose.model('Patient', patientSchema);

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
  patient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor_id: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  reason: { type: String },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  notes: { type: String },
  created_at: { type: Date, default: Date.now }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// Routes

// Get all patients
app.get('/patients', authenticateToken, async (req, res) => {
  try {
    const patients = await Patient.find({ created_by: req.user.userId })
      .sort({ created_at: -1 });
    
    res.json({
      patients,
      total: patients.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single patient
app.get('/patients/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOne({ 
      _id: req.params.id, 
      created_by: req.user.userId 
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Get patient's appointments
    const appointments = await Appointment.find({ patient_id: req.params.id })
      .sort({ date: -1 });
    
    res.json({
      patient,
      appointments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new patient
app.post('/patients', authenticateToken, async (req, res) => {
  try {
    const patientData = {
      ...req.body,
      created_by: req.user.userId,
      updated_at: new Date()
    };
    
    const patient = new Patient(patientData);
    await patient.save();
    
    res.status(201).json({
      message: 'Patient created successfully',
      patient
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update patient
app.put('/patients/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, created_by: req.user.userId },
      { ...req.body, updated_at: new Date() },
      { new: true }
    );
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    res.json({
      message: 'Patient updated successfully',
      patient
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete patient
app.delete('/patients/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      created_by: req.user.userId
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Delete related appointments
    await Appointment.deleteMany({ patient_id: req.params.id });
    
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all appointments
app.get('/appointments', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({ doctor_id: req.user.userId })
      .populate('patient_id', 'name age phone')
      .sort({ date: 1 });
    
    res.json({
      appointments,
      total: appointments.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create appointment
app.post('/appointments', authenticateToken, async (req, res) => {
  try {
    const appointmentData = {
      ...req.body,
      doctor_id: req.user.userId
    };
    
    const appointment = new Appointment(appointmentData);
    await appointment.save();
    
    // Populate patient data for response
    await appointment.populate('patient_id', 'name age phone');
    
    res.status(201).json({
      message: 'Appointment scheduled successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update appointment status
app.put('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctor_id: req.user.userId },
      req.body,
      { new: true }
    ).populate('patient_id', 'name age phone');
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'EHR Service is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🏥 EHR Service running on port ${PORT}`);
});

module.exports = app;