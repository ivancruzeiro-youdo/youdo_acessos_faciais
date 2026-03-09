import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache EC2 token to avoid login on every request
let ec2Token: string | null = null;
let ec2TokenExpiry = 0;

async function getEc2Token(base: string): Promise<string> {
  const now = Date.now();
  if (ec2Token && now < ec2TokenExpiry) return ec2Token;

  const email = Deno.env.get("EC2_AUTH_EMAIL");
  const password = Deno.env.get("EC2_AUTH_PASSWORD");
  if (!email || !password) throw new Error("EC2 auth credentials not configured");

  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EC2 login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  ec2Token = data.token;
  // Cache for 50 minutes (assuming 1h expiry)
  ec2TokenExpiry = now + 50 * 60 * 1000;
  return ec2Token!;
}

function ec2Headers(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Supabase auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BASE = (Deno.env.get("EC2_API_URL") || "").trim().replace(/\/+$/, "");
  if (!BASE) {
    return jsonRes({ error: "EC2_API_URL not configured" }, 500);
  }

  function jsonRes(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Get EC2 auth token
    let token: string;
    try {
      token = await getEc2Token(BASE);
    } catch (e) {
      return jsonRes({ error: `EC2 auth failed: ${e.message}` }, 502);
    }

    // ─── VPN Server Status ───
    if (action === "vpn_status") {
      const res = await fetch(`${BASE}/vpn/status`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    // ─── Connected VPN Clients ───
    if (action === "vpn_clients") {
      const res = await fetch(`${BASE}/vpn/clients`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    // ─── VPN Logs ───
    if (action === "vpn_logs") {
      const { client_name, start_date, end_date, limit } = body;
      const params = new URLSearchParams();
      if (client_name) params.set("client_name", client_name);
      if (start_date) params.set("start_date", start_date);
      if (end_date) params.set("end_date", end_date);
      if (limit) params.set("limit", String(limit));
      const res = await fetch(`${BASE}/vpn/logs?${params.toString()}`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    // ─── Certificates ───
    if (action === "list_certificates") {
      const res = await fetch(`${BASE}/vpn/certificates`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    if (action === "create_certificate") {
      const { client_name, ip_address, description, expires_in_days } = body;
      const res = await fetch(`${BASE}/vpn/certificates`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ client_name, ip_address, description, expires_in_days }),
      });
      return jsonRes(await res.json());
    }

    if (action === "revoke_certificate") {
      const { certificate_id, reason } = body;
      const res = await fetch(`${BASE}/vpn/certificates/${certificate_id}`, {
        method: "DELETE",
        headers: ec2Headers(token),
        body: JSON.stringify({ reason }),
      });
      return jsonRes(await res.json());
    }

    if (action === "download_certificate") {
      const { certificate_id } = body;
      const res = await fetch(`${BASE}/vpn/certificates/${certificate_id}/download`, {
        headers: ec2Headers(token),
      });
      const text = await res.text();
      return new Response(text, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/x-openvpn-profile",
          "Content-Disposition": `attachment; filename="${certificate_id}.ovpn"`,
        },
      });
    }

    // ─── Provisioning ───
    if (action === "provision_device") {
      const { device, vpn } = body;
      const res = await fetch(`${BASE}/vpn/provision`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ device, vpn }),
      });
      return jsonRes(await res.json());
    }

    if (action === "provision_status") {
      const { device_id } = body;
      const res = await fetch(`${BASE}/vpn/provision/${device_id}/status`, {
        headers: ec2Headers(token),
      });
      return jsonRes(await res.json());
    }

    // ─── Device proxy (ControlID via VPN) ───
    if (action === "device_status") {
      const { ip } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint: "/device_status.fcgi" }),
      });
      return jsonRes(await res.json());
    }

    if (action === "device_proxy") {
      // Generic proxy — pass any ControlID endpoint
      const { ip, endpoint, payload } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint, payload }),
      });
      return jsonRes(await res.json());
    }

    if (action === "sync_user") {
      const { ip, registration, name, user_type_id, begin_time, end_time, password } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({
          ip,
          endpoint: "/create_objects.fcgi",
          payload: {
            object: "users",
            values: [{
              registration,
              name,
              user_type_id: user_type_id || 1,
              begin_time: begin_time || 0,
              end_time: end_time || 1439,
              password: password || "1234",
            }],
          },
        }),
      });
      return jsonRes(await res.json());
    }

    if (action === "sync_user_photo") {
      const { ip, user_id, image_base64 } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({
          ip,
          endpoint: "/load_user_image.fcgi",
          payload: { user_id, image: image_base64 },
        }),
      });
      return jsonRes(await res.json());
    }

    if (action === "list_device_users") {
      const { ip } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint: "/load_objects.fcgi", payload: { object: "users" } }),
      });
      return jsonRes(await res.json());
    }

    if (action === "delete_device_user") {
      const { ip, user_ids } = body;
      const res = await fetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({
          ip,
          endpoint: "/destroy_objects.fcgi",
          payload: { object: "users", values: user_ids },
        }),
      });
      return jsonRes(await res.json());
    }

    // ─── EC2 Backend endpoints ───
    if (action === "list_people") {
      const res = await fetch(`${BASE}/people`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    if (action === "list_devices") {
      const res = await fetch(`${BASE}/devices`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    if (action === "sync_device") {
      const { device_id } = body;
      const res = await fetch(`${BASE}/sync/${device_id}`, {
        method: "POST",
        headers: ec2Headers(token),
      });
      return jsonRes(await res.json());
    }

    // ─── Scan VPN (uses /vpn/clients) ───
    if (action === "scan_vpn") {
      const res = await fetch(`${BASE}/vpn/clients`, { headers: ec2Headers(token) });
      return jsonRes(await res.json());
    }

    // ─── Webhooks ───
    if (action === "configure_webhook") {
      const { url, events, secret } = body;
      const res = await fetch(`${BASE}/vpn/webhooks`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ url, events, secret }),
      });
      return jsonRes(await res.json());
    }

    return jsonRes({ error: `Invalid action: ${action}` }, 400);
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
});
