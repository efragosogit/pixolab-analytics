/**
 * Transactional auth emails (invite + password reset) via Resend — the
 * only email this dashboard sends today, so this lives under lib/auth/
 * rather than a top-level lib/email.ts; promote it if a second use case
 * shows up.
 *
 * Multi-tenant: an invite grants access to one specific client, so that
 * email names it explicitly. A password reset is global (one account, not
 * tied to any one client), so that email stays generic — never claims to
 * be "for" a particular client's dashboard.
 *
 * Server-only. Never import from a Client Component.
 */
import { Resend } from "resend";

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM;

function assertConfigured() {
  if (!API_KEY || !FROM) {
    throw new Error(
      "Missing RESEND_API_KEY / EMAIL_FROM — copy .env.local.example to .env.local and fill them in (resend.com → API Keys, with pixolab.com.mx verified as a sending domain under Domains).",
    );
  }
}

let client: Resend | null = null;

function getClient(): Resend {
  assertConfigured();
  client ??= new Resend(API_KEY!);
  return client;
}

function wrapperHtml(
  eyebrow: string,
  heading: string,
  bodyHtml: string,
  ctaLabel: string,
  ctaUrl: string,
): string {
  // Plain, email-client-safe inline styles — no external CSS, no images.
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <p style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin: 0 0 8px;">${eyebrow}</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${heading}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #333;">${bodyHtml}</p>
      <a href="${ctaUrl}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">${ctaLabel}</a>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">Si el botón no funciona, copia y pega este enlace: <br />${ctaUrl}</p>
    </div>
  `;
}

export async function sendInviteEmail(
  to: string,
  inviteUrl: string,
  invitedBy: string,
  clientDisplayName: string,
): Promise<void> {
  await getClient().emails.send({
    from: FROM!,
    to,
    subject: `Te invitaron al dashboard de ${clientDisplayName}`,
    html: wrapperHtml(
      `${clientDisplayName} · Dashboard`,
      "Tienes acceso al dashboard",
      `${invitedBy} te dio acceso al dashboard de analytics de ${clientDisplayName}. Crea tu contraseña para entrar — este enlace expira en 7 días.`,
      "Crear mi cuenta",
      inviteUrl,
    ),
  });
}

export async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  await getClient().emails.send({
    from: FROM!,
    to,
    subject: "Restablece tu contraseña — Pixolab Analytics",
    html: wrapperHtml(
      "Pixolab Analytics",
      "Restablecer contraseña",
      "Pediste restablecer tu contraseña de Pixolab Analytics. Este enlace expira en 1 hora. Si no fuiste tú, ignora este correo.",
      "Restablecer contraseña",
      resetUrl,
    ),
  });
}
