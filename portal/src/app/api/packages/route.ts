import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { priceBdt: "asc" }],
    });
    return jsonOk({ packages });
  } catch (err) {
    return handleRouteError(err);
  }
}
