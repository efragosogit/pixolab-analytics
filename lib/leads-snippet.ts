/**
 * Builds the GTM Custom HTML tag shown on Configuración → Leads, ready to
 * paste (trigger: All Pages). It posts to this client's
 * `/ingest/leads/{slug}` webhook with the payload that route validates
 * (app/ingest/leads/[client]/route.ts).
 *
 * Two ways in, because client sites differ:
 * - Contact Form 7 (WordPress — Lumiservicios' case): CF7 submits over AJAX
 *   and cancels the native submit event, so GTM's generic Form Submission
 *   trigger never fires; the tag listens for CF7's own `wpcf7mailsent`
 *   event instead and maps each CF7 form id to a lead source. The ids are
 *   placeholders the person pasting it fills in.
 * - Anything else: the tag defines `window.pixolabLead(source, fields)` to
 *   call from the site's own submit handler.
 *
 * The secret in it is not a real secret (it ships in the site's public
 * JS) — see the webhook's doc comment. Pure function, no I/O.
 */
export function buildLeadsSnippet(input: {
  endpoint: string;
  secret: string;
  sources: { key: string; label: string }[];
}): string {
  const formsMap = input.sources.length
    ? input.sources
        .map((s, i) => `    "ID_FORMULARIO_${i + 1}": "${s.key}", // ${s.label}`)
        .join("\n")
    : `    "ID_FORMULARIO_1": "form_submitted",`;

  return `<script>
(function () {
  var ENDPOINT = "${input.endpoint}";
  var SECRET = "${input.secret}";

  function send(source, data) {
    data = data || {};
    var body = {
      source: source,
      name: data.name || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      message: data.message || undefined,
      page_path: window.location.pathname,
      form_id: data.form_id
    };
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-secret": SECRET },
      body: JSON.stringify(body),
      keepalive: true
    });
  }

  // Para cualquier formulario: window.pixolabLead("${input.sources[0]?.key ?? "form_submitted"}", { name: "...", email: "...", phone: "...", message: "..." })
  window.pixolabLead = send;

  // Contact Form 7: reemplaza cada ID_FORMULARIO_N por el ID real del formulario en WordPress.
  var CF7_FORMS = {
${formsMap}
  };
  document.addEventListener("wpcf7mailsent", function (event) {
    var source = CF7_FORMS[String(event.detail.contactFormId)];
    if (!source) return;
    var inputs = event.detail.inputs || [];
    function pick(pattern) {
      for (var i = 0; i < inputs.length; i++) {
        if (pattern.test(inputs[i].name)) return inputs[i].value;
      }
      return undefined;
    }
    send(source, {
      name: pick(/name|nombre/i),
      email: pick(/mail|correo/i),
      phone: pick(/tel|phone|telefono|celular/i),
      message: pick(/message|mensaje|comentario/i),
      form_id: event.detail.contactFormId
    });
  });
})();
</script>`;
}
