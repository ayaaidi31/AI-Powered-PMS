import type {
  Patient,
  Doctor,
  Receptionist,
  Appointment,
  MedicalReport,
  Invoice,
  TimeSlot,
  BillingCode,
} from "./types"

// Helper to create dates
const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
const yesterday = new Date(today)
yesterday.setDate(yesterday.getDate() - 1)

// Mock Doctors
export const mockDoctors: Doctor[] = [
  {
    id: "doc-1",
    email: "dr.smith@clinic.com",
    name: "Dr. Sarah Smith",
    role: "doctor",
    phone: "+49 152 1234567",
    specialization: "General Practice",
    licenseNumber: "DE-123456",
    department: "General Medicine",
    createdAt: new Date("2023-01-15"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "doc-2",
    email: "dr.mueller@clinic.com",
    name: "Dr. Hans Müller",
    role: "doctor",
    phone: "+49 152 2345678",
    specialization: "Cardiology",
    licenseNumber: "DE-234567",
    department: "Cardiology",
    createdAt: new Date("2023-03-20"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "doc-3",
    email: "dr.johnson@clinic.com",
    name: "Dr. Emily Johnson",
    role: "doctor",
    phone: "+49 152 3456789",
    specialization: "Dermatology",
    licenseNumber: "DE-345678",
    department: "Dermatology",
    createdAt: new Date("2023-06-10"),
    updatedAt: new Date("2024-01-01"),
  },
]

// Mock Patients
export const mockPatients: Patient[] = [
  {
    id: "pat-1",
    email: "max.mustermann@email.com",
    name: "Max Mustermann",
    role: "patient",
    phone: "+49 152 9876543",
    dateOfBirth: new Date("1985-06-15"),
    insuranceType: "public",
    insuranceNumber: "A123456789",
    address: {
      street: "Hauptstraße 123",
      city: "Berlin",
      postalCode: "10115",
      country: "Germany",
    },
    emergencyContact: {
      name: "Anna Mustermann",
      relationship: "Spouse",
      phone: "+49 152 8765432",
    },
    medicalHistory: {
      allergies: ["Penicillin"],
      chronicConditions: ["Hypertension"],
      currentMedications: [
        {
          name: "Lisinopril",
          dosage: "10mg",
          frequency: "Once daily",
          startDate: new Date("2023-01-01"),
        },
      ],
    },
    createdAt: new Date("2022-01-10"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "pat-2",
    email: "anna.schmidt@email.com",
    name: "Anna Schmidt",
    role: "patient",
    phone: "+49 152 7654321",
    dateOfBirth: new Date("1990-03-22"),
    insuranceType: "private",
    insuranceNumber: "P987654321",
    address: {
      street: "Friedrichstraße 45",
      city: "Berlin",
      postalCode: "10117",
      country: "Germany",
    },
    medicalHistory: {
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
    },
    createdAt: new Date("2022-05-20"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "pat-3",
    email: "thomas.mueller@email.com",
    name: "Thomas Müller",
    role: "patient",
    phone: "+49 152 6543210",
    dateOfBirth: new Date("1978-11-08"),
    insuranceType: "public",
    insuranceNumber: "A987654321",
    address: {
      street: "Alexanderplatz 10",
      city: "Berlin",
      postalCode: "10178",
      country: "Germany",
    },
    medicalHistory: {
      allergies: ["Aspirin", "Ibuprofen"],
      chronicConditions: ["Type 2 Diabetes", "High Cholesterol"],
      currentMedications: [
        {
          name: "Metformin",
          dosage: "500mg",
          frequency: "Twice daily",
          startDate: new Date("2021-06-15"),
        },
        {
          name: "Atorvastatin",
          dosage: "20mg",
          frequency: "Once daily",
          startDate: new Date("2022-03-01"),
        },
      ],
    },
    createdAt: new Date("2021-08-15"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "pat-4",
    email: "lisa.weber@email.com",
    name: "Lisa Weber",
    role: "patient",
    phone: "+49 152 5432109",
    dateOfBirth: new Date("1995-07-30"),
    insuranceType: "self-pay",
    address: {
      street: "Potsdamer Platz 5",
      city: "Berlin",
      postalCode: "10785",
      country: "Germany",
    },
    medicalHistory: {
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
    },
    createdAt: new Date("2023-11-01"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "pat-5",
    email: "peter.fischer@email.com",
    name: "Peter Fischer",
    role: "patient",
    phone: "+49 152 4321098",
    dateOfBirth: new Date("1960-02-14"),
    insuranceType: "public",
    insuranceNumber: "A111222333",
    address: {
      street: "Unter den Linden 77",
      city: "Berlin",
      postalCode: "10117",
      country: "Germany",
    },
    medicalHistory: {
      allergies: ["Sulfa drugs"],
      chronicConditions: ["COPD", "Hypertension"],
      currentMedications: [
        {
          name: "Tiotropium",
          dosage: "18mcg",
          frequency: "Once daily",
          startDate: new Date("2020-01-15"),
        },
        {
          name: "Amlodipine",
          dosage: "5mg",
          frequency: "Once daily",
          startDate: new Date("2019-06-01"),
        },
      ],
    },
    createdAt: new Date("2019-03-10"),
    updatedAt: new Date("2024-01-01"),
  },
]

// Mock Receptionist
export const mockReceptionists: Receptionist[] = [
  {
    id: "rec-1",
    email: "reception@clinic.com",
    name: "Maria Braun",
    role: "receptionist",
    phone: "+49 152 1112223",
    department: "Front Desk",
    createdAt: new Date("2022-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
]

// Mock Appointments
export const mockAppointments: Appointment[] = [
  {
    id: "apt-1",
    patientId: "pat-1",
    patientName: "Max Mustermann",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    dateTime: new Date(today.setHours(9, 0, 0, 0)),
    duration: 30,
    status: "scheduled",
    reason: "General checkup",
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-10"),
  },
  {
    id: "apt-2",
    patientId: "pat-2",
    patientName: "Anna Schmidt",
    doctorId: "doc-2",
    doctorName: "Dr. Hans Müller",
    dateTime: new Date(today.setHours(9, 30, 0, 0)),
    duration: 30,
    status: "waiting",
    reason: "Heart palpitations",
    checkInTime: new Date(today.setHours(9, 15, 0, 0)),
    createdAt: new Date("2024-01-08"),
    updatedAt: new Date("2024-01-15"),
  },
  {
    id: "apt-3",
    patientId: "pat-3",
    patientName: "Thomas Müller",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    dateTime: new Date(today.setHours(8, 30, 0, 0)),
    duration: 30,
    status: "completed",
    reason: "Diabetes follow-up",
    checkInTime: new Date(today.setHours(8, 20, 0, 0)),
    notes: "Blood sugar levels stable. Continue current medication.",
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-01-15"),
  },
  {
    id: "apt-4",
    patientId: "pat-4",
    patientName: "Lisa Weber",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    dateTime: new Date(today.setHours(10, 0, 0, 0)),
    duration: 30,
    status: "scheduled",
    reason: "Skin rash consultation",
    createdAt: new Date("2024-01-12"),
    updatedAt: new Date("2024-01-12"),
  },
  {
    id: "apt-5",
    patientId: "pat-5",
    patientName: "Peter Fischer",
    doctorId: "doc-2",
    doctorName: "Dr. Hans Müller",
    dateTime: new Date(today.setHours(10, 30, 0, 0)),
    duration: 30,
    status: "scheduled",
    reason: "COPD management",
    createdAt: new Date("2024-01-11"),
    updatedAt: new Date("2024-01-11"),
  },
  {
    id: "apt-6",
    patientId: "pat-1",
    patientName: "Max Mustermann",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    dateTime: new Date(today.setHours(11, 0, 0, 0)),
    duration: 30,
    status: "no-show",
    reason: "Blood pressure check",
    createdAt: new Date("2024-01-09"),
    updatedAt: new Date("2024-01-15"),
  },
  // Tomorrow's appointments
  {
    id: "apt-7",
    patientId: "pat-1",
    patientName: "Max Mustermann",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    dateTime: new Date(tomorrow.setHours(14, 0, 0, 0)),
    duration: 30,
    status: "scheduled",
    reason: "General Consultation",
    createdAt: new Date("2024-01-14"),
    updatedAt: new Date("2024-01-14"),
  },
]

// Mock Time Slots (available for booking)
export const mockTimeSlots: TimeSlot[] = [
  { id: "slot-1", startTime: "09:00", endTime: "09:30", isAvailable: false, doctorId: "doc-1", date: today },
  { id: "slot-2", startTime: "09:30", endTime: "10:00", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-3", startTime: "10:00", endTime: "10:30", isAvailable: false, doctorId: "doc-1", date: today },
  { id: "slot-4", startTime: "10:30", endTime: "11:00", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-5", startTime: "11:00", endTime: "11:30", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-6", startTime: "14:00", endTime: "14:30", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-7", startTime: "14:30", endTime: "15:00", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-8", startTime: "15:00", endTime: "15:30", isAvailable: true, doctorId: "doc-1", date: today },
  { id: "slot-9", startTime: "15:30", endTime: "16:00", isAvailable: false, doctorId: "doc-1", date: today },
]

// Mock Billing Codes
export const mockBillingCodes: BillingCode[] = [
  { code: "01100", type: "EBM", description: "Unvorhergesehene Inanspruchnahme I" },
  { code: "01102", type: "EBM", description: "Inanspruchnahme zwischen 19-22 Uhr" },
  { code: "03000", type: "EBM", description: "Versichertenpauschale" },
  { code: "03040", type: "EBM", description: "Hausärztliche Chronikerpauschale" },
  { code: "1", type: "GOÄ", description: "Beratung", amount: 10.72, multiplier: 2.3 },
  { code: "5", type: "GOÄ", description: "Symptombezogene Untersuchung", amount: 10.72, multiplier: 2.3 },
  { code: "7", type: "GOÄ", description: "Vollständige körperliche Untersuchung", amount: 21.45, multiplier: 2.3 },
  { code: "250", type: "GOÄ", description: "Blutentnahme", amount: 4.08, multiplier: 1.8 },
]

// Mock Medical Reports
export const mockMedicalReports: MedicalReport[] = [
  {
    id: "rep-1",
    appointmentId: "apt-3",
    patientId: "pat-3",
    patientName: "Thomas Müller",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    date: today,
    diagnosis: "Type 2 Diabetes Mellitus - Well Controlled",
    symptoms: ["Fatigue", "Increased thirst"],
    treatment: "Continue current medication regimen. Lifestyle modifications recommended.",
    prescription: [
      {
        medication: "Metformin",
        dosage: "500mg",
        frequency: "Twice daily",
        duration: "3 months",
        instructions: "Take with meals",
      },
    ],
    rawNotes: "Patient presents for routine diabetes follow-up. Reports improved energy levels. Blood sugar logs show consistent readings. HbA1c 6.8%.",
    formattedReport: `
# Medical Report - Diabetes Follow-up

**Patient:** Thomas Müller
**Date:** ${today.toLocaleDateString()}
**Physician:** Dr. Sarah Smith

## Chief Complaint
Routine diabetes management follow-up

## Findings
- Blood glucose levels stable
- HbA1c: 6.8% (improved from 7.2%)
- No signs of diabetic complications
- Patient reports improved energy and well-being

## Assessment
Type 2 Diabetes Mellitus - Well controlled on current therapy

## Plan
1. Continue Metformin 500mg BID
2. Maintain current diet and exercise regimen
3. Follow-up in 3 months
4. Annual eye and foot examination scheduled
    `,
    simplifiedReport: `
**Your Health Summary**

Your diabetes is well controlled! Your blood sugar levels have improved since your last visit.

**What This Means:**
Your HbA1c (a measure of blood sugar over time) went from 7.2% to 6.8%, which is great progress.

**What to Do:**
- Keep taking your Metformin as prescribed
- Continue your healthy eating habits
- Stay active with regular exercise
- Come back in 3 months for your next check-up

**Questions?** Please ask our AI assistant or contact the clinic.
    `,
    billingCodes: [
      { code: "03000", type: "EBM", description: "Versichertenpauschale" },
      { code: "03040", type: "EBM", description: "Hausärztliche Chronikerpauschale" },
    ],
    status: "approved",
    createdAt: today,
    updatedAt: today,
  },
  {
    id: "rep-2",
    appointmentId: "apt-old-1",
    patientId: "pat-1",
    patientName: "Max Mustermann",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    date: new Date("2025-10-12"),
    diagnosis: "Routine Bloodwork - Normal Results",
    symptoms: [],
    treatment: "No treatment necessary",
    formattedReport: "Annual health screening bloodwork. All values within normal range.",
    status: "approved",
    createdAt: new Date("2025-10-12"),
    updatedAt: new Date("2025-10-12"),
  },
  {
    id: "rep-3",
    appointmentId: "apt-old-2",
    patientId: "pat-1",
    patientName: "Max Mustermann",
    doctorId: "doc-1",
    doctorName: "Dr. Sarah Smith",
    date: new Date("2025-02-04"),
    diagnosis: "Acute Bronchitis",
    symptoms: ["Cough", "Fever", "Fatigue"],
    treatment: "Rest, fluids, and prescribed antibiotics",
    prescription: [
      {
        medication: "Amoxicillin",
        dosage: "500mg",
        frequency: "Three times daily",
        duration: "7 days",
        instructions: "Take with food",
      },
    ],
    status: "approved",
    createdAt: new Date("2025-02-04"),
    updatedAt: new Date("2025-02-04"),
  },
]

// Mock Invoices
export const mockInvoices: Invoice[] = [
  {
    id: "inv-1",
    appointmentId: "apt-3",
    patientId: "pat-3",
    patientName: "Thomas Müller",
    doctorId: "doc-1",
    insuranceType: "public",
    billingCodes: [
      { code: "03000", type: "EBM", description: "Versichertenpauschale" },
      { code: "03040", type: "EBM", description: "Hausärztliche Chronikerpauschale" },
    ],
    status: "ready-for-kv",
    createdAt: today,
    updatedAt: today,
  },
  {
    id: "inv-2",
    appointmentId: "apt-old-3",
    patientId: "pat-2",
    patientName: "Anna Schmidt",
    doctorId: "doc-2",
    insuranceType: "private",
    billingCodes: [
      { code: "1", type: "GOÄ", description: "Beratung", amount: 10.72, multiplier: 2.3 },
      { code: "7", type: "GOÄ", description: "Vollständige körperliche Untersuchung", amount: 21.45, multiplier: 2.3 },
    ],
    totalAmount: 73.99,
    status: "sent",
    dueDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-10"),
  },
]

// Helper functions for mock data operations
export function getPatientById(id: string): Patient | undefined {
  return mockPatients.find((p) => p.id === id)
}

export function getDoctorById(id: string): Doctor | undefined {
  return mockDoctors.find((d) => d.id === id)
}

export function getAppointmentsByPatientId(patientId: string): Appointment[] {
  return mockAppointments.filter((a) => a.patientId === patientId)
}

export function getAppointmentsByDoctorId(doctorId: string): Appointment[] {
  return mockAppointments.filter((a) => a.doctorId === doctorId)
}

export function getTodayAppointments(): Appointment[] {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  
  return mockAppointments.filter((a) => {
    const aptDate = new Date(a.dateTime)
    return aptDate >= todayStart && aptDate <= todayEnd
  })
}

export function getReportsByPatientId(patientId: string): MedicalReport[] {
  return mockMedicalReports.filter((r) => r.patientId === patientId)
}

export function getAvailableSlots(doctorId: string, date: Date): TimeSlot[] {
  return mockTimeSlots.filter(
    (slot) => 
      slot.doctorId === doctorId && 
      slot.isAvailable &&
      slot.date.toDateString() === date.toDateString()
  )
}

// Current user context (simulated)
export const currentUser = {
  patient: mockPatients[0], // Max Mustermann
  doctor: mockDoctors[0], // Dr. Sarah Smith
  receptionist: mockReceptionists[0], // Maria Braun
}
