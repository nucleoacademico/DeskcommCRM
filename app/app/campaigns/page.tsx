import type { Metadata } from "next";

import { requirePageAccess } from "@/lib/navigation/require-page-access";
import { ListaDeCampanhas } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campanhas" };

export default async function CampanhasPage() {
  await requirePageAccess("/app/campaigns");
  return <ListaDeCampanhas />;
}
