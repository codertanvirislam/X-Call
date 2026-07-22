import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { selxTenantGet, type SelxCall } from "@/lib/selx";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ storeId: string }> },
) {
  try {
    await requireAdmin();
    const { storeId } = await ctx.params;
    const limit = Math.min(
      Number(new URL(req.url).searchParams.get("limit") || 30),
      100,
    );

    const cred = await prisma.selxCredential.findUnique({ where: { storeId } });
    if (!cred?.bearerTokenEnc) {
      return jsonError("Store has no selx credentials yet", 404);
    }

    const token = decryptSecret(cred.bearerTokenEnc);
    if (!token) return jsonError("Token not ready yet", 409);

    const calls = await selxTenantGet<SelxCall[]>(
      `/v1/calls?limit=${limit}`,
      token,
      cred.selxUserId,
    );

    return jsonOk({ calls, selxUserId: cred.selxUserId });
  } catch (err) {
    return handleRouteError(err);
  }
}
