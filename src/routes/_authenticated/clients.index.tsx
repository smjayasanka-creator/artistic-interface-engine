import { createFileRoute, redirect } from "@tanstack/react-router";
import { getClients } from "@/lib/mzizi.functions";

export const Route = createFileRoute("/_authenticated/clients/")({
  beforeLoad: async () => {
    const clients = await getClients({ data: { filter: "all" } });
    if (clients && clients.length > 0) {
      throw redirect({ to: "/clients/$id", params: { id: clients[0].id } });
    }
    throw redirect({ to: "/clients/new" });
  },
});
