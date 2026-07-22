import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { selxTenantGet, type SelxBalance } from "@/lib/selx";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ storeId: string }> },
) {
  try {
    await requireAdmin();
    const { storeId } = await ctx.params;

    const cred = await prisma.selxCredential.findUnique({ where: { storeId } });
    if (!cred?.bearerTokenEnc) {
      return jsonError("Store has no selx credentials yet", 404);
    }

    const token = decryptSecret(cred.bearerTokenEnc);
    if (!token) return jsonError("Token not ready yet", 409);

    const balance = await selxTenantGet<SelxBalance>(
      "/v1/balance",
      token,
      cred.selxUserId,
    );

    return jsonOk({ balance, selxUserId: cred.selxUserId });
  } catch (err) {
    return handleRouteError(err);
  }
}
