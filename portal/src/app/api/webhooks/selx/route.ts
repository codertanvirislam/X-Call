import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { verifySelxPartnerWebhook } from "@/lib/selx";
import { encryptSecret } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

/**
 * Partner webhook receiver for selx:
 * - user.created
 * - credentials.regenerated
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    if (!verifySelxPartnerWebhook(rawBody, signature)) {
      return jsonError("Invalid webhook signature", 401);
    }

    const payload = JSON.parse(rawBody) as {
      event: string;
      user_id: number;
      user_slug?: string;
      bearer_token?: string;
      extension?: string;
      extension_password?: string;
      webhook_secret?: string;
      credential_type?: string;
    };

    if (payload.event === "user.created") {
      if (!payload.user_id || !payload.bearer_token) {
        return jsonError("Invalid user.created payload");
      }

      // Match by pending selxUserId placeholder first, else by phone if present later
      const existing = await prisma.selxCredential.findFirst({
        where: { selxUserId: payload.user_id },
      });

      if (!existing) {
        // Could not map — log and accept so selx stops retrying forever after inspect
        await writeAudit({
          action: "SELX_USER_CREATED_UNMAPPED",
          entityType: "SelxCredential",
          meta: { selxUserId: payload.user_id, userSlug: payload.user_slug },
        });
        return jsonOk({ ok: true, mapped: false });
      }

      await prisma.selxCredential.update({
        where: { id: existing.id },
        data: {
          selxUserSlug: payload.user_slug || existing.selxUserSlug,
          bearerTokenEnc: encryptSecret(payload.bearer_token),
          extension: payload.extension || existing.extension,
          extensionPasswordEnc: payload.extension_password
            ? encryptSecret(payload.extension_password)
            : existing.extensionPasswordEnc,
          webhookSecretEnc: payload.webhook_secret
            ? encryptSecret(payload.webhook_secret)
            : existing.webhookSecretEnc,
        },
      });

      await writeAudit({
        actorId: existing.storeId,
        actorType: "STORE_USER",
        action: "SELX_CREDENTIALS_SAVED",
        entityType: "SelxCredential",
        entityId: existing.id,
        meta: { selxUserId: payload.user_id, event: payload.event },
      });

      return jsonOk({ ok: true, mapped: true });
    }

    if (payload.event === "credentials.regenerated") {
      const existing = await prisma.selxCredential.findFirst({
        where: { selxUserId: payload.user_id },
      });
      if (!existing) return jsonOk({ ok: true, mapped: false });

      if (payload.credential_type === "token" && payload.bearer_token) {
        await prisma.selxCredential.update({
          where: { id: existing.id },
          data: { bearerTokenEnc: encryptSecret(payload.bearer_token) },
        });
      }

      if (
        payload.credential_type === "extension_password" &&
        payload.extension_password
      ) {
        await prisma.selxCredential.update({
          where: { id: existing.id },
          data: {
            extensionPasswordEnc: encryptSecret(payload.extension_password),
            extension: payload.extension || existing.extension,
          },
        });
      }

      await writeAudit({
        actorId: existing.storeId,
        actorType: "STORE_USER",
        action: "SELX_CREDENTIALS_REGENERATED",
        entityType: "SelxCredential",
        entityId: existing.id,
        meta: { event: payload.event, credentialType: payload.credential_type },
      });

      return jsonOk({ ok: true, mapped: true });
    }

    return jsonOk({ ok: true, ignored: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
