# 🚀 QuickEHR – AI-Powered Electronic Health Record System

QuickEHR is a minimal, microservices-based EHR (Electronic Health Record) platform designed for rapid simplification of complex hospital data architecture. It enables doctors to manage patient records, receive AI-based diagnosis suggestions, and book appointments — all while following modern software architecture practices.

---

## 🧩 Microservices Overview

| Service Name                      | Description                                             | Live URL                                                        |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| 🛡️ **Auth Service**              | Handles doctor login and JWT-based authentication.      | [https://quickehr-auth.onrender.com/](https://quickehr-auth.onrender.com/)       |
| 🏥 **EHR Service**                | Manages patient records and appointment scheduling.     | [https://quickehr-ehr.onrender.com/](https://quickehr-ehr.onrender.com/)         |
| 🧠 **AI & Analytics Service**     | Provides AI diagnosis (mock logic) and analytics.       | [https://quickehr-ai.onrender.com/](https://quickehr-ai.onrender.com/)           |
| 🌐 **Gateway Service** | Routes external API requests to the right microservice. | [https://quickehr-gateway.onrender.com/](https://quickehr-gateway.onrender.com/) |

---

## ⚙️ Frontend Deployed LINK
As the backend APIs are deployed on Render Free Service, it'll take time to load initially, as the free tier service goes off after every 15 minutes of non-usage
[https://quickehr-api-tester.vercel.app/login](https://quickehr-api-tester.vercel.app)

---

## ⚙️ Features

* ✅ Doctor Login with JWT
* 📝 Patient Record CRUD
* 🤖 AI Diagnosis Suggestion (Rule-based)
* 📅 Appointment Booking
* 📊 Dummy Analytics Dashboard

---

## 📦 Folder Structure

```
/QuickEHR/
├── auth-service/       → JWT-based login
├── ehr-service/        → Patient records & appointments
├── ai-service/         → Diagnosis suggestions & trends
├── gateway-service/    → Optional unified API access point
├── postman_collection.json
└── README.md
```

---

## 📬 API Access (Postman Collection)

Import the provided `postman_collection.json` to test:

* Login (POST /auth/login)
* Create Patient (POST /patients)
* Get All Patients (GET /patients)
* Get Diagnosis (GET /ai/diagnose/\:patientId)
* Book Appointment (POST /appointments)

---

## 🔗 Live Demo Flow

1. Login as doctor via [Auth Service](https://quickehr-auth.onrender.com/)
2. Use token to access [EHR Service](https://quickehr-ehr.onrender.com/) for patient management
3. Fetch diagnosis from [AI Service](https://quickehr-ai.onrender.com/)
4. Access all routes via [Gateway (optional)](https://quickehr-gateway.onrender.com/)

---

## 🛠️ Tech Stack

* **Backend**: Node.js (Express)
* **Database**: MongoDB Atlas
* **Auth**: JWT
* **Deployment**: Render
* **Testing**: Postman
* **Design**: Figma

---

## 🤝 Contributions

Daksh Kanaujia
Kumar Kartikay

---

## 📄 License

MIT – feel free to reuse and adapt with credit.

