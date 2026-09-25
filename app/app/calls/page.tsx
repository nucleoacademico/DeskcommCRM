import { requirePageAccess } from "@/lib/navigation/require-page-access";
import { CallsClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  await requirePageAccess("/app/calls");
  return <CallsClient />;
}
