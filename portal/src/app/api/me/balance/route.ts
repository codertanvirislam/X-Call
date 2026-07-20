import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { selxTenantGet, type SelxBalance } from "@/lib/selx";

export async function GET() {
  try {
    const { user } = await requireUser();
    const cred = await prisma.selxCredential.findUnique({
      where: { userId: user.id },
    });

    if (!cred?.bearerTokenEnc) {
      return jsonError("No API credentials yet. Buy a package first.", 404);
    }

    let token: string;
    try {
      token = decryptSecret(cred.bearerTokenEnc);
    } catch {
      return jsonError("Credentials not ready yet. Wait for provisioning webhook.", 409);
    }

    if (!token) {
      return jsonError("Credentials not ready yet.", 409);
    }

    const balance = await selxTenantGet<SelxBalance>(
      "/v1/balance",
      token,
      cred.selxUserId,
    );

    return jsonOk({ balance });
  } catch (err) {
    return handleRouteError(err);
  }
}
