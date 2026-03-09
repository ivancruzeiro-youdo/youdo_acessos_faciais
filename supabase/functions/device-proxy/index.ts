import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
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

  const EC2_API_URL = Deno.env.get("EC2_API_URL");
  if (!EC2_API_URL) {
    return new Response(
      JSON.stringify({ error: "EC2_API_URL not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { action } = body;

    // ─── VPN Server Status ───
    if (action === "vpn_status") {
      const res = await fetch(`${EC2_API_URL}/api/vpn/status`);
      return jsonRes(await res.json());
    }

    // ─── Connected VPN Clients ───
    if (action === "vpn_clients") {
      const res = await fetch(`${EC2_API_URL}/api/vpn/clients`);
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
      const res = await fetch(
        `${EC2_API_URL}/api/vpn/logs?${params.toString()}`
      );
      return jsonRes(await res.json());
    }

    // ─── Certificates ───
    if (action === "list_certificates") {
      const res = await fetch(`${EC2_API_URL}/api/vpn/certificates`);
      return jsonRes(await res.json());
    }

    if (action === "create_certificate") {
      const { client_name, ip_address, description, expires_in_days } = body;
      const res = await fetch(`${EC2_API_URL}/api/vpn/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name,
          ip_address,
          description,
          expires_in_days,
        }),
      });
      return jsonRes(await res.json());
    }

    if (action === "revoke_certificate") {
      const { certificate_id, reason } = body;
      const res = await fetch(
        `${EC2_API_URL}/api/vpn/certificates/${certificate_id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      return jsonRes(await res.json());
    }

    if (action === "download_certificate") {
      const { certificate_id } = body;
      const res = await fetch(
        `${EC2_API_URL}/api/vpn/certificates/${certificate_id}/download`
      );
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
      const res = await fetch(`${EC2_API_URL}/api/vpn/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, vpn }),
      });
      return jsonRes(await res.json());
    }

    if (action === "provision_status") {
      const { device_id } = body;
      const res = await fetch(
        `${EC2_API_URL}/api/vpn/provision/${device_id}/status`
      );
      return jsonRes(await res.json());
    }

    // ─── Device proxy (ControlID via VPN) ───
    if (action === "device_status") {
      const { ip } = body;
      // Try documented proxy first, fallback to direct
      try {
        const res = await fetch(`${EC2_API_URL}/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip, endpoint: "/device_status.fcgi" }),
        });
        return jsonRes(await res.json());
      } catch {
        // Fallback: try direct API endpoint
        const res = await fetch(`${EC2_API_URL}/api/vpn/device/${ip}/status`);
        return jsonRes(await res.json());
      }
    }

    if (action === "sync_user") {
      const { ip, registration, name, user_type_id, begin_time, end_time } =
        body;
      const res = await fetch(`${EC2_API_URL}/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip,
          endpoint: "/create_objects.fcgi",
          payload: {
            object: "users",
            values: [
              {
                registration,
                name,
                user_type_id: user_type_id || 1,
                begin_time: begin_time || 0,
                end_time: end_time || 1439,
              },
            ],
          },
        }),
      });
      return jsonRes(await res.json());
    }

    if (action === "sync_user_photo") {
      const { ip, user_id, image_base64 } = body;
      const res = await fetch(`${EC2_API_URL}/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip,
          endpoint: "/load_user_image.fcgi",
          payload: { user_id, image: image_base64 },
        }),
      });
      return jsonRes(await res.json());
    }

    // ─── Scan VPN subnet (uses /api/vpn/clients) ───
    if (action === "scan_vpn") {
      const res = await fetch(`${EC2_API_URL}/api/vpn/clients`);
      return jsonRes(await res.json());
    }

    // ─── Webhooks ───
    if (action === "configure_webhook") {
      const { url, events, secret } = body;
      const res = await fetch(`${EC2_API_URL}/api/vpn/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events, secret }),
      });
      return jsonRes(await res.json());
    }

    return jsonRes({ error: "Invalid action" }, 400);
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
});
