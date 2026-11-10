import { VehicleForm } from "@/components/vehicle-forms";
import { createVehicle } from "../actions";

export default function NewVehicle() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/garage" className="btn-quiet -ml-3">Wróć do garażu</a>
      <h1 className="text-2xl font-semibold tracking-tight">Dodaj pojazd</h1>
      <p className="text-sm text-muted">Wymagane są tylko marka i model. Resztę możesz uzupełnić później.</p>
      <VehicleForm action={createVehicle} submitLabel="Dodaj pojazd" />
    </div>
  );
}
