import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type FcmWifConfig = {
  audience: string;
  serviceAccountEmail: string;
  projectId: string;
};

type MessageRow = {
  id: string;
  pair_id: string;
  sender_id: string;
  recipient_id: string;
  message_type: string;
  created_at: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function readNamedKey(environmentName: string, legacyName: string): string | null {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  const raw = Deno.env.get(environmentName);
  if (!raw) return null;
  try {
    const values = JSON.parse(raw);
    const key = values?.default;
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function readWifConfig(): FcmWifConfig | null {
  const audience = Deno.env.get("GOOGLE_WIF_AUDIENCE")?.trim() || "";
  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")?.trim() || "";
  const projectId = Deno.env.get("FCM_PROJECT_ID")?.trim() || "";

  // Accept only a Google workload identity provider resource name, not an arbitrary URL.
  if (!audience.startsWith("//iam.googleapis.com/projects/") ||
      !audience.includes("/locations/global/workloadIdentityPools/") ||
      !audience.includes("/providers/") || /\s/.test(audience)) {
    return null;
  }
  if (!serviceAccountEmail.includes("@") ||
      !serviceAccountEmail.endsWith(".iam.gserviceaccount.com") ||
      serviceAccountEmail.includes(" ") || serviceAccountEmail.includes("\n") ||
      serviceAccountEmail.includes("\t") || serviceAccountEmail.includes("/")) {
    return null;
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) return null;

  return { audience, serviceAccountEmail, projectId };
}

// Exchange the caller's short-lived Supabase JWT for a federated token, then impersonate
// the FCM-only service account. No long-lived Google private key is stored in Supabase.
async function getAccessToken(config: FcmWifConfig, subjectToken: string): Promise<string> {
  const exchangeBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience: config.audience,
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: subjectToken,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  });

  const exchangeResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: exchangeBody,
    signal: AbortSignal.timeout(12000),
  });
  const exchanged = await exchangeResponse.json().catch(() => null) as
    { access_token?: string } | null;
  if (!exchangeResponse.ok || typeof exchanged?.access_token !== "string") {
    throw new Error("wif_exchange_failed");
  }

  const impersonationUrl = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
    encodeURIComponent(config.serviceAccountEmail) + ":generateAccessToken";
  const impersonationResponse = await fetch(impersonationUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + exchanged.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scope: ["https://www.googleapis.com/auth/firebase.messaging"],
      lifetime: "600s",
    }),
    signal: AbortSignal.timeout(12000),
  });
  const impersonated = await impersonationResponse.json().catch(() => null) as
    { accessToken?: string } | null;
  if (!impersonationResponse.ok || typeof impersonated?.accessToken !== "string") {
    throw new Error("service_account_impersonation_failed");
  }
  return impersonated.accessToken;
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function claimDispatch(
  admin: ReturnType<typeof createClient>,
  message: MessageRow,
): Promise<{ claimed: boolean; duplicate: boolean }> {
  const now = new Date().toISOString();
  const { error: insertError } = await admin.from("push_dispatches").insert({
    message_id: message.id,
    sender_id: message.sender_id,
    recipient_id: message.recipient_id,
    status: "sending",
    attempts: 1,
    claimed_at: now,
  });

  if (!insertError) return { claimed: true, duplicate: false };
  if (insertError.code !== "23505") throw new Error("dispatch_claim_failed");

  const { data: old, error: readError } = await admin.from("push_dispatches")
    .select("status,attempts,claimed_at")
    .eq("message_id", message.id)
    .maybeSingle();
  if (readError) throw new Error("dispatch_read_failed");
  if (!old) return { claimed: false, duplicate: true };
  if (old.status === "sent" || old.attempts >= 3) return { claimed: false, duplicate: true };

  const age = Date.now() - Date.parse(old.claimed_at);
  const retryable = old.status === "failed" ||
    (old.status === "sending" && Number.isFinite(age) && age >= 120000);
  if (!retryable) return { claimed: false, duplicate: true };

  const { data: updated, error: updateError } = await admin.from("push_dispatches")
    .update({
      status: "sending",
      attempts: old.attempts + 1,
      claimed_at: now,
      sent_at: null,
    })
    .eq("message_id", message.id)
    .eq("status", old.status)
    .eq("attempts", old.attempts)
    .eq("claimed_at", old.claimed_at)
    .select("message_id")
    .maybeSingle();
  if (updateError) throw new Error("dispatch_retry_claim_failed");
  return { claimed: Boolean(updated), duplicate: !updated };
}

async function markDispatch(
  admin: ReturnType<typeof createClient>,
  messageId: string,
  status: "sent" | "failed",
) {
  const values: Record<string, unknown> = { status };
  if (status === "sent") values.sent_at = new Date().toISOString();
  await admin.from("push_dispatches").update(values).eq("message_id", messageId);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!supabaseUrl || !apiKey || !jwt) return jsonResponse({ error: "unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: "Bearer " + jwt } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const wifConfig = readWifConfig();
  const expectedProjectId = typeof body.firebase_project_id === "string"
    ? body.firebase_project_id
    : "";
  const ready = Boolean(wifConfig && serviceKey && expectedProjectId &&
    wifConfig.projectId === expectedProjectId);

  if (body.action === "status") {
    if (!ready || !wifConfig) return jsonResponse({ ready: false });
    try {
      // Confirm Google accepts the federated identity and permits short-lived FCM token issuance.
      await getAccessToken(wifConfig, jwt);
      return jsonResponse({ ready: true });
    } catch {
      return jsonResponse({ ready: false });
    }
  }
  if (!isUuidV4(body.message_id)) return jsonResponse({ error: "invalid_request" }, 400);
  if (!serviceKey || !ready || !wifConfig) {
    return jsonResponse({ error: "push_not_configured" }, 503);
  }

  try {
    const { data: message, error: messageError } = await userClient.from("messages")
      .select("id,pair_id,sender_id,recipient_id,message_type,created_at")
      .eq("id", body.message_id)
      .maybeSingle();
    if (messageError || !message) return jsonResponse({ error: "message_not_found" }, 404);

    const row = message as MessageRow;
    if (row.sender_id !== user.id || row.sender_id === row.recipient_id ||
        (row.message_type !== "text" && row.message_type !== "media")) {
      return jsonResponse({ error: "not_allowed" }, 403);
    }

    const messageAge = Date.now() - Date.parse(row.created_at);
    if (!Number.isFinite(messageAge) || messageAge < -60000 || messageAge > 15 * 60 * 1000) {
      return jsonResponse({ error: "message_expired" }, 410);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: members, error: memberError } = await admin.from("pair_members")
      .select("user_id,member_name")
      .eq("pair_id", row.pair_id);
    if (memberError || !members || members.length !== 2 ||
        !members.some((member) => member.user_id === row.sender_id) ||
        !members.some((member) => member.user_id === row.recipient_id) ||
        members.some((member) => !["hamid", "nur"].includes(member.member_name))) {
      return jsonResponse({ error: "pair_not_allowed" }, 403);
    }

    const { data: recipientKey, error: keyError } = await admin.from("device_keys")
      .select("fingerprint,key_version,algorithm")
      .eq("pair_id", row.pair_id)
      .eq("user_id", row.recipient_id)
      .maybeSingle();
    const { data: verification, error: verificationError } = await admin.from("key_verifications")
      .select("verified_fingerprint,key_version")
      .eq("pair_id", row.pair_id)
      .eq("verifier_user_id", row.sender_id)
      .eq("target_user_id", row.recipient_id)
      .maybeSingle();
    if (keyError || verificationError || !recipientKey || !verification ||
        recipientKey.algorithm !== "ECDH-P256" ||
        verification.verified_fingerprint !== recipientKey.fingerprint ||
        verification.key_version !== recipientKey.key_version) {
      return jsonResponse({ error: "peer_not_verified" }, 403);
    }

    const { data: registration, error: registrationError } = await admin.from("device_push_tokens")
      .select("token")
      .eq("user_id", row.recipient_id)
      .eq("pair_id", row.pair_id)
      .maybeSingle();
    if (registrationError) return jsonResponse({ error: "registration_lookup_failed" }, 503);
    if (!registration?.token) return jsonResponse({ ok: true, skipped: "recipient_not_registered" });

    const claim = await claimDispatch(admin, row);
    if (claim.duplicate) return jsonResponse({ ok: true, skipped: "duplicate_suppressed" });
    if (!claim.claimed) return jsonResponse({ ok: true, skipped: "already_processing" });

    const fcmPayload = {
      message: {
        token: registration.token,
        notification: {
          title: "Our Space",
          body: "Ada pesan baru menunggu.",
        },
        data: { type: "new_message" },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "our-space-messages",
            visibility: "PRIVATE",
            sound: "default",
          },
        },
      },
    };

    try {
      const accessToken = await getAccessToken(wifConfig, jwt);
      const fcmResponse = await fetch(
        "https://fcm.googleapis.com/v1/projects/" + wifConfig.projectId + "/messages:send",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fcmPayload),
          signal: AbortSignal.timeout(12000),
        },
      );

      if (!fcmResponse.ok) {
        const failure = await fcmResponse.json().catch(() => null);
        const details = Array.isArray(failure?.error?.details) ? failure.error.details : [];
        const unregistered = fcmResponse.status === 404 ||
          details.some((entry) => entry?.errorCode === "UNREGISTERED");
        if (unregistered) {
          await admin.from("device_push_tokens").delete().eq("user_id", row.recipient_id);
        }
        await markDispatch(admin, row.id, "failed");
        return jsonResponse({ error: "push_send_failed" }, 502);
      }

      await markDispatch(admin, row.id, "sent");
      return jsonResponse({ ok: true });
    } catch {
      await markDispatch(admin, row.id, "failed");
      return jsonResponse({ error: "push_send_failed" }, 502);
    }
  } catch {
    return jsonResponse({ error: "push_dispatch_failed" }, 500);
  }
});
