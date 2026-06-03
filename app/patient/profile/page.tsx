"use client"

import { useState } from "react"
import { User, Mail, Phone, MapPin, Shield, AlertTriangle, Save, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { currentUser } from "@/lib/mock-data"
import { toast } from "sonner"

export default function PatientProfilePage() {
  const patient = currentUser.patient
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: patient.name,
    email: patient.email,
    phone: patient.phone || "",
    street: patient.address?.street || "",
    city: patient.address?.city || "",
    postalCode: patient.address?.postalCode || "",
    emergencyName: patient.emergencyContact?.name || "",
    emergencyPhone: patient.emergencyContact?.phone || "",
    emergencyRelationship: patient.emergencyContact?.relationship || "",
  })

  const handleSave = async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    toast.success("Profile updated successfully")
    setIsEditing(false)
  }

  const insuranceLabel = {
    public: "Public Insurance (GKV)",
    private: "Private Insurance (PKV)",
    "self-pay": "Self-Pay",
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information</p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Your basic profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  ) : (
                    <p className="text-foreground py-2">{patient.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <p className="text-foreground py-2">
                    {new Date(patient.dateOfBirth).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.email}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.phone || "Not provided"}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Address
              </CardTitle>
              <CardDescription>
                Your residential address
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="street">Street Address</Label>
                    <Input
                      id="street"
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input
                        id="postalCode"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : patient.address ? (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-foreground">{patient.address.street}</p>
                    <p className="text-foreground">
                      {patient.address.postalCode} {patient.address.city}
                    </p>
                    <p className="text-muted-foreground">{patient.address.country}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No address provided</p>
              )}
            </CardContent>
          </Card>

          {/* Insurance Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Insurance Information
              </CardTitle>
              <CardDescription>
                Your health insurance details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Insurance Type</Label>
                  <div className="py-2">
                    <Badge variant="secondary" className="text-sm">
                      {insuranceLabel[patient.insuranceType]}
                    </Badge>
                  </div>
                </div>
                {patient.insuranceNumber && (
                  <div className="space-y-2">
                    <Label>Insurance Number</Label>
                    <p className="text-foreground py-2">{patient.insuranceNumber}</p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                To update your insurance information, please contact the clinic reception.
              </p>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-primary" />
                Emergency Contact
              </CardTitle>
              <CardDescription>
                Person to contact in case of emergency
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyName">Contact Name</Label>
                      <Input
                        id="emergencyName"
                        value={formData.emergencyName}
                        onChange={(e) => setFormData({ ...formData, emergencyName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyRelationship">Relationship</Label>
                      <Input
                        id="emergencyRelationship"
                        value={formData.emergencyRelationship}
                        onChange={(e) => setFormData({ ...formData, emergencyRelationship: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Phone Number</Label>
                    <Input
                      id="emergencyPhone"
                      type="tel"
                      value={formData.emergencyPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                    />
                  </div>
                </div>
              ) : patient.emergencyContact ? (
                <div className="space-y-2">
                  <p className="text-foreground font-medium">{patient.emergencyContact.name}</p>
                  <p className="text-muted-foreground">{patient.emergencyContact.relationship}</p>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{patient.emergencyContact.phone}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No emergency contact provided</p>
              )}
            </CardContent>
          </Card>

          {/* Medical History Preview */}
          {patient.medicalHistory && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Medical Alerts
                </CardTitle>
                <CardDescription>
                  Important medical information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {patient.medicalHistory.allergies.length > 0 && (
                  <div>
                    <Label className="text-destructive">Allergies</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {patient.medicalHistory.allergies.map((allergy, i) => (
                        <Badge key={i} variant="destructive">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {patient.medicalHistory.chronicConditions.length > 0 && (
                  <div>
                    <Label>Chronic Conditions</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {patient.medicalHistory.chronicConditions.map((condition, i) => (
                        <Badge key={i} variant="secondary">
                          {condition}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {patient.medicalHistory.currentMedications.length > 0 && (
                  <div>
                    <Label>Current Medications</Label>
                    <div className="mt-2 space-y-2">
                      {patient.medicalHistory.currentMedications.map((med, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-foreground">{med.name}</span>
                          <span className="text-muted-foreground"> - {med.dosage}, {med.frequency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
