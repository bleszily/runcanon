import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  approveOrgPromotion,
  listOrgPromotions,
  rejectOrgPromotion,
} from "@runcanon/platform";
import { requireAuth, requireCurator } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals, url }) => {
  requireAuth(locals.auth);
  requireCurator(locals.auth);
  const status = url.searchParams.get("status") as "pending" | "approved" | "rejected" | null;
  const promotions = await listOrgPromotions(status ?? undefined);
  return json({ promotions, total: promotions.length });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    action?: "approve" | "reject";
    promotionId?: string;
    certExpiresAt?: string;
    reviewDueAt?: string;
    reason?: string;
  };

  if (!body.promotionId || !body.action) {
    throw error(400, "promotionId and action are required");
  }

  try {
    if (body.action === "approve") {
      const record = await approveOrgPromotion({
        promotionId: body.promotionId,
        reviewer: auth.actor,
        certExpiresAt: body.certExpiresAt,
        reviewDueAt: body.reviewDueAt,
      });
      return json({ success: true, record });
    }

    await rejectOrgPromotion({
      promotionId: body.promotionId,
      reviewer: auth.actor,
      reason: body.reason,
    });
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Promotion action failed");
  }
};
