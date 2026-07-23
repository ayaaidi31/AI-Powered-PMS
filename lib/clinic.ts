/**
 * Clinic letterhead details, shared by the printable report and invoice
 * documents. Change these in one place to rebrand the practice everywhere.
 */
export const CLINIC = {
  name: "AI-PMS Clinic",
  line1: "Musterstraße 1 · 10115 Berlin",
  line2: "Tel. 030 123 456 · info@ai-pms.example",
  city: "Berlin",
  bank: "Musterbank · IBAN DE00 0000 0000 0000 0000 00 · BIC ABCDDEFFXXX",
}

/**
 * Knowledge base for the patient-facing FAQ assistant (Feature 16, REQ-FAQ-01).
 * The model answers patient questions strictly from these facts. Edit here to
 * change what the bot knows about the practice.
 */
export const CLINIC_FAQ = `
Clinic name: ${CLINIC.name}
Address: ${CLINIC.line1}
Contact: ${CLINIC.line2}

Opening hours (Sprechzeiten):
- Monday, Tuesday, Thursday: 08:00–12:00 and 14:00–18:00
- Wednesday and Friday: 08:00–12:00
- Saturday, Sunday and public holidays: closed

Appointments (Termine):
- Book by phone or online via this patient portal under "My Appointments".
- Please arrive about 10 minutes early and bring your insurance card (Versichertenkarte).
- To cancel or reschedule, give at least 24 hours notice through the portal or by phone.

Insurance & payment:
- We treat statutory (gesetzlich/GKV) and private (privat/PKV) patients as well as self-payers (Selbstzahler).
- GKV patients: please present your electronic health card once per quarter.
- PKV patients and self-payers receive an invoice (Rechnung) based on the GOÄ fee schedule.

Services (Leistungen):
- General and family medicine (Allgemeinmedizin), preventive check-ups (Vorsorge/Gesundheitscheck),
  vaccinations (Impfungen), ECG (EKG), basic laboratory tests, minor procedures, prescriptions and sick notes.

Prescriptions & sick notes:
- Repeat prescriptions (Folgerezept) can be requested by phone or via the portal and are usually ready within one working day.
- A sick note (Arbeitsunfähigkeitsbescheinigung / AU) requires a consultation.

Parking & directions:
- Limited parking is available directly in front of the building; a public parking garage is nearby.
- Public transport: bus and tram stops are a few minutes' walk away.

Accessibility:
- The practice is wheelchair accessible (barrierefrei).

Emergencies:
- In a medical emergency, call 112 immediately.
- Outside our opening hours, the statutory on-call medical service (ärztlicher Bereitschaftsdienst) is reachable at 116117.
`.trim()
