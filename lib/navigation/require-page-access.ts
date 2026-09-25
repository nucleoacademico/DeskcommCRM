import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { NAV_CATALOG, type NavDestinationId } from "@/lib/navigation/catalogo";
import { canSee } from "@/lib/navigation/interface";

/**
 * Gate de página derivado do mesmo catálogo que desenha menu, hubs e ⌘K.
 *
 * A API continua sendo a fronteira de segurança. Este gate impede a casca
 * enganosa: um papel abaixo do mínimo não monta o client para só então gerar
 * requests 403. O mínimo não é repetido aqui nem na página; vem de
 * `NAV_CATALOG`, a mesma fonte usada para esconder o link.
 */
export async function requirePageAccess(href: NavDestinationId) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const destination = NAV_CATALOG.find((item) => item.href === href);
  if (!destination) throw new Error(`Destino não registrado no catálogo: ${href}`);
  if (!canSee(destination, user.is_platform_admin, activeOrg.role)) redirect("/403");

  return { user, activeOrg };
}
