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

  const loginUrl = `${base}/auth/login`;
  console.log(`[device-proxy] EC2 login attempt: ${loginUrl}`);

  const res = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  console.log(`[device-proxy] EC2 login response (${res.status}): ${text.substring(0, 200)}`);

  if (!res.ok) {
    throw new Error(`EC2 login failed (${res.status}): ${text.substring(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`EC2 login returned non-JSON (${res.status}): ${text.substring(0, 200)}`);
  }

  ec2Token = data.token;
  ec2TokenExpiry = now + 50 * 60 * 1000;
  return ec2Token!;
}

// Safe JSON fetch helper
async function safeFetch(url: string, opts?: RequestInit): Promise<any> {
  console.log(`[device-proxy] Fetch: ${opts?.method || "GET"} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`EC2 error (${res.status}): ${text.substring(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`EC2 returned non-JSON (${res.status}): ${text.substring(0, 300)}`);
  }
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
      const data = await safeFetch(`${BASE}/vpn/status`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    // ─── Connected VPN Clients ───
    if (action === "vpn_clients") {
      const data = await safeFetch(`${BASE}/vpn/clients`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    // ─── VPN Logs ───
    if (action === "vpn_logs") {
      const { client_name, start_date, end_date, limit } = body;
      const params = new URLSearchParams();
      if (client_name) params.set("client_name", client_name);
      if (start_date) params.set("start_date", start_date);
      if (end_date) params.set("end_date", end_date);
      if (limit) params.set("limit", String(limit));
      const data = await safeFetch(`${BASE}/vpn/logs?${params.toString()}`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    // ─── Certificates ───
    if (action === "list_certificates") {
      const data = await safeFetch(`${BASE}/vpn/certificates`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    if (action === "create_certificate") {
      const { client_name, ip_address, description, expires_in_days } = body;
      const data = await safeFetch(`${BASE}/vpn/certificates`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ client_name, ip_address, description, expires_in_days }),
      });
      return jsonRes(data);
    }

    if (action === "revoke_certificate") {
      const { certificate_id, reason } = body;
      const data = await safeFetch(`${BASE}/vpn/certificates/${certificate_id}`, {
        method: "DELETE",
        headers: ec2Headers(token),
        body: JSON.stringify({ reason }),
      });
      return jsonRes(data);
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
      const data = await safeFetch(`${BASE}/vpn/provision`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ device, vpn }),
      });
      return jsonRes(data);
    }

    if (action === "provision_status") {
      const { device_id } = body;
      const data = await safeFetch(`${BASE}/vpn/provision/${device_id}/status`, {
        headers: ec2Headers(token),
      });
      return jsonRes(data);
    }

    // ─── Device proxy (ControlID via VPN) ───
    if (action === "device_status") {
      const { ip } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint: "/device_status.fcgi" }),
      });
      return jsonRes(data);
    }

    if (action === "device_proxy") {
      const { ip, endpoint, payload } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint, payload }),
      });
      return jsonRes(data);
    }

    if (action === "sync_user") {
      const { ip, registration, name, user_type_id, begin_time, end_time, password } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
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
      return jsonRes(data);
    }

    if (action === "sync_user_photo") {
      const { ip, user_id, image_base64 } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({
          ip,
          endpoint: "/load_user_image.fcgi",
          payload: { user_id, image: image_base64 },
        }),
      });
      return jsonRes(data);
    }

    if (action === "list_device_users") {
      const { ip } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ ip, endpoint: "/load_objects.fcgi", payload: { object: "users" } }),
      });
      return jsonRes(data);
    }

    if (action === "delete_device_user") {
      const { ip, user_ids } = body;
      const data = await safeFetch(`${BASE}/vpn/proxy`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({
          ip,
          endpoint: "/destroy_objects.fcgi",
          payload: { object: "users", values: user_ids },
        }),
      });
      return jsonRes(data);
    }

    // ─── EC2 Backend endpoints ───
    if (action === "list_people") {
      const data = await safeFetch(`${BASE}/people`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    if (action === "list_devices") {
      const data = await safeFetch(`${BASE}/devices`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    if (action === "sync_device") {
      const { device_id } = body;
      const data = await safeFetch(`${BASE}/sync/${device_id}`, {
        method: "POST",
        headers: ec2Headers(token),
      });
      return jsonRes(data);
    }

    // ─── Scan VPN (uses /vpn/clients) ───
    if (action === "scan_vpn") {
      const data = await safeFetch(`${BASE}/vpn/clients`, { headers: ec2Headers(token) });
      return jsonRes(data);
    }

    // ─── Webhooks ───
    if (action === "configure_webhook") {
      const { url, events, secret } = body;
      const data = await safeFetch(`${BASE}/vpn/webhooks`, {
        method: "POST",
        headers: ec2Headers(token),
        body: JSON.stringify({ url, events, secret }),
      });
      return jsonRes(data);
    }

    return jsonRes({ error: `Invalid action: ${action}` }, 400);
  } catch (err) {
    console.error(`[device-proxy] Error:`, err.message);
    return jsonRes({ error: err.message }, 500);
  }
});
