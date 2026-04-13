import { AdminBilling } from "@/components/admin-billing";
import { AdminBillingHealth } from "@/components/admin-billing-health";

export default function AdminBillingPage() {
  return (
    <div className="space-y-12">
      <AdminBilling />
      <hr className="border-border" />
      <AdminBillingHealth />
    </div>
  );
}
