import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { selxTenantGet, type SelxCall } from "@/lib/selx";

export async function GET(req: Request) {
  try {
    const { store } = await requireStore();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 20), 100);

    const cred = await prisma.selxCredential.findUnique({
      where: { storeId: store.id },
    });
    if (!cred?.bearerTokenEnc) {
      return jsonError("No API credentials yet", 404);
    }

    const token = decryptSecret(cred.bearerTokenEnc);
    if (!token) return jsonError("Credentials not ready yet", 409);

    const calls = await selxTenantGet<SelxCall[]>(
      `/v1/calls?limit=${limit}`,
      token,
      cred.selxUserId,
    );

    return jsonOk({ calls });
  } catch (err) {
    return handleRouteError(err);
  }
}
