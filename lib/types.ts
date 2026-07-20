// User & Authentication Types
export type UserRole = "patient" | "doctor" | "receptionist" | "admin"

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  phone?: string
  createdAt: Date
  updatedAt: Date
}

export interface Patient extends User {
  role: "patient"
  dateOfBirth: Date
  insuranceType: "public" | "private" | "self-pay"
  insuranceNumber?: string
  address?: Address
  emergencyContact?: EmergencyContact
  medicalHistory?: MedicalHistory
}

export interface Doctor extends User {
  role: "doctor"
  specialization: string
  licenseNumber: string
  department: string
  availableSlots?: TimeSlot[]
}

export interface Receptionist extends User {
  role: "receptionist"
  department: string
}

// Address
export interface Address {
  street: string
  city: string
  postalCode: string
  country: string
}

// Emergency Contact
export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

// Medical History
export interface MedicalHistory {
  allergies: string[]
  chronicConditions: string[]
  currentMedications: Medication[]
}

export interface Medication {
  name: string
  dosage: string
  frequency: string
  startDate: Date
  endDate?: Date
}

// Appointment Types
export type AppointmentStatus = 
  | "scheduled" 
  | "waiting" 
  | "in-progress" 
  | "completed" 
  | "cancelled" 
  | "no-show"

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  dateTime: Date
  duration: number // in minutes
  status: AppointmentStatus
  reason: string
  notes?: string
  checkInTime?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TimeSlot {
  id: string
  startTime: string // HH:mm format
  endTime: string
  isAvailable: boolean
  doctorId: string
  date: Date
}

// Medical Records Types
export interface MedicalReport {
  id: string
  appointmentId: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  date: Date
  diagnosis: string
  symptoms: string[]
  treatment: string
  prescription?: Prescription[]
  rawNotes?: string
  formattedReport?: string
  simplifiedReport?: string // AI-simplified version for patients
  billingCodes?: BillingCode[]
  status: "draft" | "pending-approval" | "approved" | "sent"
  createdAt: Date
  updatedAt: Date
}

export interface Prescription {
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
}

// Billing Types
export type BillingType = "EBM" | "GOÄ" // German billing codes

export interface BillingCode {
  code: string
  type: BillingType
  description: string
  amount?: number // Only for GOÄ (private)
  multiplier?: number // For GOÄ
}

export type InvoiceStatus = 
  | "pending" 
  | "sent" 
  | "paid" 
  | "overdue" 
  | "ready-for-kv" // For public insurance batch

export interface Invoice {
  id: string
  appointmentId: string
  patientId: string
  patientName: string
  doctorId: string
  insuranceType: "public" | "private" | "self-pay"
  billingCodes: BillingCode[]
  totalAmount?: number // Only for private/self-pay
  status: InvoiceStatus
  dueDate?: Date
  paidDate?: Date
  createdAt: Date
  updatedAt: Date
}

// Dashboard Stats
export interface DoctorDailyStats {
  totalAppointments: number
  completedAppointments: number
  waitingPatients: number
  pendingReports: number
  pendingBillingApprovals: number
}

export interface ReceptionistStats {
  todayAppointments: number
  checkedInPatients: number
  pendingCheckIns: number
  pendingInvoices: number
  noShows: number
}

export interface PatientStats {
  upcomingAppointments: number
  recentReports: number
  pendingInvoices: number
}

// Form Types (for CRUD operations)
export interface CreateAppointmentInput {
  patientId: string
  doctorId: string
  dateTime: Date
  duration: number
  reason: string
}

export interface UpdateAppointmentInput {
  id: string
  dateTime?: Date
  duration?: number
  reason?: string
  status?: AppointmentStatus
  notes?: string
}

export interface CreatePatientInput {
  email: string
  name: string
  phone: string
  dateOfBirth: Date
  insuranceType: "public" | "private" | "self-pay"
  insuranceNumber?: string
  address?: Address
}

export interface CreateMedicalReportInput {
  appointmentId: string
  patientId: string
  doctorId: string
  rawNotes: string
}

// Navigation Types
export interface NavItem {
  label: string
  href: string
  icon?: string
  badge?: number
}

// API Response Types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
