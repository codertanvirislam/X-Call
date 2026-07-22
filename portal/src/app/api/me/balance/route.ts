import { requireStore } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { getStoreCallBalance } from "@/lib/calling";

export async function GET() {
  try {
    const { store } = await requireStore();
    const balance = await getStoreCallBalance(store.id);
    return jsonOk({ balance });
  } catch (err) {
    return handleRouteError(err);
  }
}
